/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Readable } from 'stream';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { ChatCompleteMetadata } from '@kbn/inference-common';

export interface InferenceEndpointInvokeOptions {
  body: Record<string, unknown>;
  signal?: AbortSignal;
  metadata?: ChatCompleteMetadata;
  timeout?: number;
}

export interface InferenceEndpointExecutor {
  invoke(options: InferenceEndpointInvokeOptions): Promise<Readable>;
}

/**
 * Default per-request timeout for an inference endpoint call.
 *
 * Agent Builder eval runs drive much longer single turns than product traffic
 * (multi-step skills against large alert sets), where the 180s default aborts
 * a turn mid-flight and the example is scored as a failure of the model rather
 * than of the harness. The eval VMs raise it via AGENT_BUILDER_INFERENCE_TIMEOUT_MS;
 * unset, the product default is unchanged.
 */
const AGENT_BUILDER_INFERENCE_TIMEOUT_MS = Number(
  process.env.AGENT_BUILDER_INFERENCE_TIMEOUT_MS ?? 180_000
);

export const createInferenceEndpointExecutor = ({
  inferenceId,
  esClient,
}: {
  inferenceId: string;
  esClient: ElasticsearchClient;
}): InferenceEndpointExecutor => {
  return {
    async invoke({
      body,
      signal,
      metadata,
      timeout = AGENT_BUILDER_INFERENCE_TIMEOUT_MS,
    }): Promise<Readable> {
      const response = await esClient.transport.request(
        {
          method: 'POST',
          path: `/_inference/chat_completion/${encodeURIComponent(inferenceId)}/_stream`,
          querystring: {
            // timeout for the inference call performed by the endpoint
            timeout: `${Math.ceil(timeout / 60000)}m`,
          },
          body,
        },
        {
          asStream: true,
          requestTimeout: timeout,
          headers: {
            // always send a value for EIS
            'X-Elastic-Product-Use-Case': metadata?.connectorTelemetry?.pluginId ?? 'inference',
          },
          ...(signal ? { signal } : {}),
        }
      );
      return response as unknown as Readable;
    },
  };
};
