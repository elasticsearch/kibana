/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { HttpHandler } from '@kbn/core/public';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import pRetry from 'p-retry';

const RETRIES = 2;
const MIN_TIMEOUT = 2000;

export interface ConverseParams {
  message: string;
  conversationId?: string;
}

export interface ConverseResponse {
  conversationId?: string;
  messages: Array<{ message: string }>;
  steps?: unknown[];
  errors: unknown[];
  traceId?: string;
}

/**
 * Thin wrapper around the Agent Builder `converse` endpoint. Mirrors the Endpoint suite
 * (see @kbn/evals-suite-endpoint) so SIEM Readiness evals produce comparable traces and metrics.
 */
export class SiemReadinessEvalChatClient {
  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    private readonly connectorId: string
  ) {}

  async converse({ message, conversationId }: ConverseParams): Promise<ConverseResponse> {
    // Read per-call so env-var overrides (e.g. AGENT_BUILDER_AGENT_ID) are honoured between tests.
    const agentId = process.env.AGENT_BUILDER_AGENT_ID ?? agentBuilderDefaultAgentId;

    this.log.info('Calling converse');

    const callConverseApi = async (): Promise<ConverseResponse> => {
      const response = await this.fetch('/api/agent_builder/converse', {
        method: 'POST',
        version: '2023-10-31',
        body: JSON.stringify({
          agent_id: agentId,
          connector_id: this.connectorId,
          conversation_id: conversationId,
          input: message,
        }),
      });

      const chatResponse = response as {
        conversation_id: string;
        trace_id?: string;
        steps: unknown[];
        response: { message: string };
      };

      const {
        conversation_id: conversationIdFromResponse,
        response: latestResponse,
        steps,
        trace_id: traceId,
      } = chatResponse;

      return {
        conversationId: conversationIdFromResponse,
        messages: [{ message }, latestResponse],
        steps,
        errors: [],
        traceId,
      };
    };

    try {
      return await pRetry(callConverseApi, {
        retries: RETRIES,
        minTimeout: MIN_TIMEOUT,
        onFailedAttempt: (error) => {
          const isLastAttempt = error.retriesLeft === 0;
          if (isLastAttempt) {
            this.log.error(
              new Error(`Failed to call converse API after ${error.attemptNumber} attempts`, {
                cause: error,
              })
            );
          } else {
            this.log.warning(
              new Error(`Converse API call failed on attempt ${error.attemptNumber}; retrying...`, {
                cause: error,
              })
            );
          }
        },
      });
    } catch (error) {
      this.log.error('Error occurred while calling converse API');
      return {
        conversationId,
        steps: [],
        messages: [
          { message },
          {
            message:
              'This question could not be answered as an internal error occurred. Please try again.',
          },
        ],
        errors: [
          {
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
            },
            type: 'error',
          },
        ],
      };
    }
  }
}
