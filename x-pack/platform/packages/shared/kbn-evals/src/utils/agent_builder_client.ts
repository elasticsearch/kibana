/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import pRetry from 'p-retry';

export interface ConverseStep {
  type?: string;
  tool_id?: string;
  tool_call_id?: string;
  params?: Record<string, unknown>;
  results?: unknown[];
  // Additional Agent Builder step fields are passed through opaquely so the
  // trace-based evaluators / ES|QL extractor can introspect them without us
  // having to model the full Agent Builder step union here.
  [k: string]: unknown;
}

export interface AgentBuilderConverseParams {
  /** Agent Builder agent id to invoke. */
  agentId: string;
  /** The user message sent to the agent. */
  input: string;
  /** Continue an existing conversation. */
  conversationId?: string;
}

export interface AgentBuilderClientResponse {
  /** The agent's final assistant message text. */
  message: string;
  /** Per-round trace of tool calls / results. */
  steps: ConverseStep[];
  /** Populated only when the agent ran with a schema; otherwise undefined on the public converse API. */
  structuredOutput?: unknown;
  conversationId?: string;
  traceId?: string;
}

interface AgentBuilderConverseApiResponse {
  conversation_id?: string;
  trace_id?: string;
  steps?: ConverseStep[];
  response?: { message?: string; structured_output?: unknown };
}

const RETRIES = 2;
const MIN_TIMEOUT_MS = 2000;

export interface AgentBuilderClient {
  converse(params: AgentBuilderConverseParams): Promise<AgentBuilderClientResponse>;
}

export function createAgentBuilderClient({
  fetch,
  log,
  connectorId,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
  connectorId: string;
}): AgentBuilderClient {
  const converse = ({
    agentId,
    input,
    conversationId,
  }: AgentBuilderConverseParams): Promise<AgentBuilderClientResponse> => {
    const call = async (): Promise<AgentBuilderClientResponse> => {
      const response = await fetch<AgentBuilderConverseApiResponse>('/api/agent_builder/converse', {
        method: 'POST',
        version: '2023-10-31',
        body: JSON.stringify({
          agent_id: agentId,
          connector_id: connectorId,
          input,
          // Run the agent inline rather than via Task Manager (the server's auto-detect default).
          // Inline execution runs inside this HTTP request, so the eval worker's W3C `traceparent`
          // propagates and the agent's server-side gen_ai spans nest under the eval's trace — the
          // same id `getCurrentTraceId()` returns. That keeps trace-based metrics correlatable
          // against the default cluster with no `TRACING_ES_URL` (matching the inferenceClient path).
          _execution_mode: 'local',
          ...(conversationId ? { conversation_id: conversationId } : {}),
        }),
      });

      return {
        message: response.response?.message ?? '',
        steps: response.steps ?? [],
        structuredOutput: response.response?.structured_output,
        conversationId: response.conversation_id,
        traceId: response.trace_id,
      };
    };

    return pRetry(call, {
      retries: RETRIES,
      minTimeout: MIN_TIMEOUT_MS,
      onFailedAttempt: (error) => {
        if (error.retriesLeft === 0) {
          log.error(
            `[AgentBuilderClient] converse(${agentId}) failed after ${error.attemptNumber} attempts: ${error.message}`
          );
        } else {
          log.warning(
            `[AgentBuilderClient] converse(${agentId}) failed on attempt ${error.attemptNumber}; retrying... (${error.message})`
          );
        }
      },
    });
  };

  return { converse };
}
