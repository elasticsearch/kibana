/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v5 } from 'uuid';
import pRetry from 'p-retry';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import { getStatusCode } from './retry_utils';
import type { EvalConnector, StackConnectorDefinition } from './eval_connector';

export function getConnectorIdAsUuid(connectorId: string): string {
  return v5(connectorId, v5.DNS);
}

export function resolveConnectorId(connectorId: string): string {
  return process.env.KBN_EVALS_SKIP_CONNECTOR_SETUP
    ? connectorId
    : getConnectorIdAsUuid(connectorId);
}

export async function createStackConnectorFixture({
  predefinedConnector,
  fetch,
  log,
  use,
}: {
  predefinedConnector: StackConnectorDefinition;
  fetch: HttpHandler;
  log: ToolingLog;
  use: (connector: EvalConnector) => Promise<void>;
}): Promise<void> {
  interface ConnectorGetResponse {
    is_preconfigured?: boolean;
  }

  const retries = process.env.KBN_EVALS_AWAIT_CCM_CONNECTORS ? 3 : 0;

  const isPreconfigured = await pRetry(
    async () => {
      try {
        const res = (await fetch({
          path: `/api/actions/connector/${encodeURIComponent(predefinedConnector.id)}`,
          method: 'GET',
        })) as ConnectorGetResponse;
        return res?.is_preconfigured === true;
      } catch (error) {
        if (getStatusCode(error) === 404) throw error;
        throw new pRetry.AbortError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    { retries, minTimeout: 3000, factor: 1 }
  ).catch((error) => {
    if (getStatusCode(error) === 404) return false;
    throw error;
  });

  if (isPreconfigured) {
    log.info(`Reusing preconfigured connector: ${predefinedConnector.id}`);
    await use(predefinedConnector);
    return;
  }

  const connectorIdAsUuid = getConnectorIdAsUuid(predefinedConnector.id);
  const connectorWithUuid = { ...predefinedConnector, id: connectorIdAsUuid };

  log.info(`Creating connector: ${predefinedConnector.id} as ${connectorIdAsUuid}`);

  try {
    await fetch({
      path: `/api/actions/connector/${connectorWithUuid.id}`,
      method: 'POST',
      body: JSON.stringify({
        config: connectorWithUuid.config,
        connector_type_id: connectorWithUuid.actionTypeId,
        name: connectorWithUuid.name,
        secrets: connectorWithUuid.secrets,
      }),
    });
  } catch (error) {
    // 409: another parallel worker already created the connector with the same deterministic UUID.
    if (getStatusCode(error) === 409) {
      log.info(`Connector already exists, reusing: ${connectorIdAsUuid}`);
    } else {
      throw error;
    }
  }

  await use(connectorWithUuid);
}
