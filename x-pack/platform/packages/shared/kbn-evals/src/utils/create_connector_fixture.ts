/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pRetry from 'p-retry';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  INFERENCE_ENDPOINT_INTERNAL_API_VERSION,
  type InferenceEndpointRequestBody,
} from '@kbn/inference-common';
import { getStatusCode } from './retry_utils';
import { createStackConnectorFixture } from './create_stack_connector_fixture';
import type { InferenceEndpointDefinition } from './inference_endpoint_definition';
import { isInferenceEndpointDefinition, type EvalConnector } from './eval_connector';

/**
 * Inference connectors may return 400 (not 409) when the backing inference endpoint
 * was created by another parallel worker — treat as success and reuse.
 */
function isAlreadyExistsEndpointError(error: unknown): boolean {
  const status = getStatusCode(error);
  if (status === 409) {
    return true;
  }
  if (status !== 400) {
    return false;
  }
  const data = (error as any)?.response?.data ?? (error as any)?.data;
  const message =
    typeof data === 'object' && data !== null && 'message' in data
      ? String((data as { message: unknown }).message)
      : error instanceof Error
      ? error.message
      : '';
  return /already exists/i.test(message);
}

/**
 * Routes to the appropriate provisioning strategy based on the connector definition shape:
 *
 * - `KBN_EVALS_SKIP_CONNECTOR_SETUP` → use predefinedConnector as-is (no-op)
 * - `InferenceEndpointDefinition` with `provider === 'elastic'` (EIS) → wait for the
 *   pre-provisioned endpoint; bind to it without touching the Actions API
 * - `InferenceEndpointDefinition` with other provider (OpenRouter) → create the inference
 *   endpoint if missing; bind to it without touching the Actions API
 * - everything else → delegate to `createStackConnectorFixture` (generic Actions API path)
 */
export async function createConnectorFixture({
  predefinedConnector,
  fetch,
  log,
  use,
}: {
  predefinedConnector: EvalConnector;
  fetch: HttpHandler;
  log: ToolingLog;
  use: (connector: EvalConnector) => Promise<void>;
}) {
  async function inferenceEndpointExists(inferenceId: string): Promise<boolean> {
    const res = (await fetch({
      path: `/internal/_inference/_exists/${encodeURIComponent(inferenceId)}`,
      method: 'GET',
      // versioned internal route: requests without this header are rejected
      headers: { 'elastic-api-version': INFERENCE_ENDPOINT_INTERNAL_API_VERSION },
    })) as { isEndpointExists?: boolean };

    return res?.isEndpointExists === true;
  }

  async function waitForInferenceEndpoint(
    inferenceId: string,
    connectorDisplayId: string
  ): Promise<void> {
    const retries = process.env.KBN_EVALS_AWAIT_CCM_CONNECTORS ? 3 : 0;

    await pRetry(
      async () => {
        let exists: boolean;
        try {
          exists = await inferenceEndpointExists(inferenceId);
        } catch (error) {
          const status = getStatusCode(error);
          // Abort immediately on permanent client errors.
          if (status === 400 || status === 401 || status === 403) {
            throw new pRetry.AbortError(error instanceof Error ? error : new Error(String(error)));
          }
          throw error;
        }
        if (!exists) {
          throw new Error(`Inference endpoint [${inferenceId}] does not exist`);
        }
      },
      { retries, minTimeout: 3000, factor: 1 }
    ).catch((error) => {
      throw new Error(
        `Inference endpoint [${inferenceId}] for EIS connector [${connectorDisplayId}] is not available. ` +
          `EIS connectors bind directly to inference endpoints and are never created as stack connectors, ` +
          `so make sure the EIS/CCM setup has created the endpoint before running evals. ` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }

  async function createInferenceEndpointIfMissing(
    inferenceId: string,
    body: InferenceEndpointRequestBody
  ) {
    if (await inferenceEndpointExists(inferenceId)) {
      return;
    }
    log.info(`Creating inference endpoint ${inferenceId}`);
    try {
      await fetch({
        path: '/internal/_inference/_add',
        method: 'POST',
        headers: { 'elastic-api-version': INFERENCE_ENDPOINT_INTERNAL_API_VERSION },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (isAlreadyExistsEndpointError(error)) {
        log.info(`Inference endpoint already exists, reusing: ${inferenceId}`);
      } else {
        throw error;
      }
    }
  }

  // Eval clients address an inference endpoint by its inference ID, so that becomes the `id`
  // downstream consumers read as `connectorId`.
  function bindToEndpoint(endpoint: InferenceEndpointDefinition) {
    return use({ ...endpoint, id: endpoint.inferenceId });
  }

  if (process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP) {
    const displayId = isInferenceEndpointDefinition(predefinedConnector)
      ? predefinedConnector.inferenceId
      : predefinedConnector.id;
    log.info(
      `Skipping connector setup/teardown for: ${displayId} (KBN_EVALS_SKIP_CONNECTOR_SETUP is set)`
    );
    if (isInferenceEndpointDefinition(predefinedConnector)) {
      await bindToEndpoint(predefinedConnector);
    } else {
      await use(predefinedConnector);
    }
    return;
  }

  // InferenceEndpointDefinition: reference an ES inference endpoint directly.
  // We bind to the endpoint without creating a stack connector wrapper.
  if (isInferenceEndpointDefinition(predefinedConnector)) {
    const endpoint = predefinedConnector;
    const inferenceId = endpoint.inferenceId;

    if (endpoint.provider === 'elastic') {
      // EIS endpoints are pre-provisioned by EIS/CCM setup and are never created here.
      await waitForInferenceEndpoint(inferenceId, endpoint.id);
      log.info(`Binding EIS connector ${endpoint.id} to inference endpoint ${inferenceId}`);
      await bindToEndpoint(endpoint);
      return;
    }

    // Non-EIS (e.g. OpenRouter): create the inference endpoint when missing.
    await createInferenceEndpointIfMissing(inferenceId, {
      config: {
        inferenceId: endpoint.inferenceId,
        provider: endpoint.provider,
        taskType: endpoint.taskType,
        providerConfig: endpoint.providerConfig ?? {},
        ...(endpoint.taskTypeConfig ? { taskTypeConfig: endpoint.taskTypeConfig } : {}),
        ...(endpoint.headers ? { headers: endpoint.headers } : {}),
      },
      secrets: { providerSecrets: endpoint.secrets?.providerSecrets ?? {} },
    });

    log.info(`Binding connector ${endpoint.id} to inference endpoint ${inferenceId}`);
    await bindToEndpoint(endpoint);
    return;
  }

  // Non-LLM connectors (e.g. `.email`, `.slack`, `.gen-ai`) go through the generic Actions API.
  await createStackConnectorFixture({ predefinedConnector, fetch, log, use });
}
