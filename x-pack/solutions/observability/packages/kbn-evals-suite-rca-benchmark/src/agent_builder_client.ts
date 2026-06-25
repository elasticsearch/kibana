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

export interface ConverseAttachment {
  id?: string;
  type: string;
  data?: Record<string, unknown>;
  hidden?: boolean;
}

export interface ConverseUsage {
  input_tokens: number;
  output_tokens: number;
  llm_calls: number;
}

export interface ConverseResponse {
  conversationId?: string;
  traceId?: string;
  messages: Array<{ content: string }>;
  steps?: any[];
  errors: unknown[];
  usage?: ConverseUsage;
}

export class AgentBuilderClient {
  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    private readonly connectorId: string,
    private readonly agentId: string | undefined
  ) {}

  async converse(params: {
    messages: string;
    conversationId?: string;
    attachments?: ConverseAttachment[];
  }): Promise<ConverseResponse> {
    const { messages, conversationId, attachments } = params;
    this.log.info('Calling Agent Builder converse API');

    const call = async () => {
      const response = (await this.fetch('/api/agent_builder/converse', {
        method: 'POST',
        version: '2023-10-31',
        body: JSON.stringify({
          agent_id: this.agentId ?? agentBuilderDefaultAgentId,
          connector_id: this.connectorId,
          conversation_id: conversationId,
          input: messages,
          ...(attachments?.length ? { attachments } : {}),
        }),
      })) as {
        conversation_id: string;
        trace_id?: string;
        steps: any[];
        response: { message: string };
      };

      return {
        conversationId: response.conversation_id,
        traceId: response.trace_id,
        messages: [{ content: messages }, { content: response.response.message }],
        steps: response.steps,
        errors: [],
      };
    };

    try {
      return await pRetry(call, {
        retries: 4,
        minTimeout: 10_000,
        factor: 1.5,
        onFailedAttempt: (err) => {
          this.log.warning(
            `Converse API attempt ${err.attemptNumber} failed (${err.retriesLeft} left); retrying…`
          );
        },
      });
    } catch (err) {
      this.log.error('Converse API failed after retries');
      return {
        conversationId,
        messages: [
          { content: messages },
          { content: 'Internal error — could not complete investigation.' },
        ],
        steps: [],
        errors: [err],
      };
    }
  }
}
