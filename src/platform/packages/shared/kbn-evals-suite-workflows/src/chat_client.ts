/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { HttpHandler } from '@kbn/core/public';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import pRetry from 'p-retry';

interface Attachment {
  id?: string;
  type: string;
  data: Record<string, unknown>;
  hidden?: boolean;
}

interface ConverseParams {
  messages: Array<{ message: string }>;
  conversationId?: string;
  agentId?: string;
  attachments?: Attachment[];
}

interface ConverseResponse {
  conversationId?: string;
  messages: Array<{ message: string }>;
  errors: unknown[];
  steps?: Array<{
    type?: string;
    tool_id?: string;
    params?: Record<string, unknown>;
    results?: unknown[];
  }>;
  traceId?: string;
}

interface MultiTurnConverseParams {
  turns: Array<{ message: string; attachments?: Attachment[] }>;
  agentId?: string;
}

export interface MultiTurnConverseResponse extends ConverseResponse {
  /** Per-turn breakdown so specs can score tool-call budgets and recovery turns. */
  turnResponses: ConverseResponse[];
}

interface VersionedAttachmentData {
  id: string;
  type: string;
  current_version: number;
  versions: Array<{
    version: number;
    data: Record<string, unknown>;
  }>;
}

export class WorkflowsEvalsChatClient {
  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    private readonly connectorId: string
  ) {}

  getConversationAttachments = async (
    conversationId: string
  ): Promise<VersionedAttachmentData[]> => {
    try {
      const response = await this.fetch(`/api/agent_builder/conversations/${conversationId}`, {
        method: 'GET',
        version: '2023-10-31',
      });

      const conversation = response as { attachments?: VersionedAttachmentData[] };
      return conversation.attachments ?? [];
    } catch (error) {
      this.log.warning(`Failed to fetch conversation attachments: ${error}`);
      return [];
    }
  };

  converse = async ({
    messages,
    conversationId,
    agentId = agentBuilderDefaultAgentId,
    attachments,
  }: ConverseParams): Promise<ConverseResponse> => {
    if (messages.length === 0) {
      throw new Error('messages array cannot be empty');
    }

    this.log.info('Calling converse for workflow eval');

    const callApi = async (): Promise<ConverseResponse> => {
      const response = await this.fetch('/api/agent_builder/converse', {
        method: 'POST',
        version: '2023-10-31',
        body: JSON.stringify({
          agent_id: agentId,
          connector_id: this.connectorId,
          conversation_id: conversationId,
          input: messages[messages.length - 1].message,
          ...(attachments ? { attachments } : {}),
        }),
      });

      const chatResponse = response as {
        conversation_id: string;
        trace_id?: string;
        steps: Array<{
          type?: string;
          tool_id?: string;
          params?: Record<string, unknown>;
          results?: unknown[];
        }>;
        response: { message: string };
      };

      return {
        conversationId: chatResponse.conversation_id,
        messages: [...messages, chatResponse.response],
        steps: chatResponse.steps,
        traceId: chatResponse.trace_id,
        errors: [],
      };
    };

    try {
      return await pRetry(callApi, {
        retries: 2,
        minTimeout: 2000,
        onFailedAttempt: (error) => {
          this.log.warning(
            `Converse API call failed on attempt ${error.attemptNumber}; retrying...`
          );
        },
      });
    } catch (error) {
      this.log.error('Error occurred while calling converse API for workflow eval');
      return {
        conversationId,
        steps: [],
        messages: [...messages, { message: 'Internal error occurred during workflow eval.' }],
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
  };

  /**
   * Run a sequence of user turns inside one conversation, threading the
   * server-side conversationId between calls.  Each turn is one converse call;
   * the API stores history server-side, so we only send the new user message
   * (plus optional new attachments) on each turn.
   *
   * Returns an aggregated response (full message history, accumulated steps,
   * accumulated errors) plus a per-turn breakdown for fine-grained scoring.
   */
  converseMultiTurn = async ({
    turns,
    agentId,
  }: MultiTurnConverseParams): Promise<MultiTurnConverseResponse> => {
    if (turns.length === 0) {
      throw new Error('turns array cannot be empty');
    }

    const turnResponses: ConverseResponse[] = [];
    const allMessages: Array<{ message: string }> = [];
    const allSteps: ConverseResponse['steps'] = [];
    const allErrors: unknown[] = [];
    let conversationId: string | undefined;

    for (const turn of turns) {
      const resp = await this.converse({
        messages: [{ message: turn.message }],
        conversationId,
        agentId,
        attachments: turn.attachments,
      });

      conversationId = resp.conversationId ?? conversationId;
      turnResponses.push(resp);

      allMessages.push({ message: turn.message });
      const assistantResponse = resp.messages[resp.messages.length - 1];
      if (assistantResponse) {
        allMessages.push(assistantResponse);
      }
      if (resp.steps) allSteps.push(...resp.steps);
      if (resp.errors.length) allErrors.push(...resp.errors);

      // Stop early on infra errors — there's nothing useful to be learned
      // from continuing to fire turns at a broken backend.
      if (resp.errors.length > 0) {
        break;
      }
    }

    return {
      conversationId,
      messages: allMessages,
      steps: allSteps,
      errors: allErrors,
      turnResponses,
    };
  };
}
