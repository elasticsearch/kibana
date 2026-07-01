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

// Drive the default Agent Builder agent (`elastic-ai-agent`) explicitly. The
// entity-analytics skills/tools are registered globally, so the default agent
// can route to them. An explicit `agent_id` (rather than relying on the server
// default) keeps the suite stable if the server-side default ever changes, and
// allows a deliberate custom-agent override via `AGENT_BUILDER_AGENT_ID`.
const ENTITY_ANALYTICS_AGENT_ID = process.env.AGENT_BUILDER_AGENT_ID ?? agentBuilderDefaultAgentId;

export type Messages = { message: string }[];

export interface ErrorResponse {
  error: {
    message: string;
    stack?: string;
  };
  type: string;
}

export interface Step {
  [key: string]: unknown;
}

/**
 * Conversation-level attachment record as returned by
 * `GET /api/agent_builder/conversations/{id}/attachments`. Mirrors the shape
 * of `VersionedAttachment` in `@kbn/agent-builder-common/attachments` but kept
 * local here so the evals suite does not pull in that package for a single
 * structural type.
 */
export interface AttachmentRecord {
  id: string;
  type: string;
  current_version: number;
  versions: Array<{
    version: number;
    data: unknown;
    created_at?: string;
    content_hash?: string;
  }>;
  description?: string;
  active?: boolean;
  hidden?: boolean;
  origin?: string;
}

interface ConverseFunctionParams {
  messages: Messages;
  conversationId?: string;
}

type ConverseFunction = (params: ConverseFunctionParams) => Promise<{
  conversationId?: string;
  messages: Messages;
  errors: ErrorResponse[];
  steps?: Step[];
  traceId?: string;
  modelUsage?: ModelUsageStats;
  attachments?: AttachmentRecord[];
}>;

interface ModelUsageStats {
  input_tokens?: number;
  output_tokens?: number;
  llm_calls?: number;
  model?: string;
  connector_id?: string;
}

interface CallConverseApiResults {
  conversationId?: string;
  errors: ErrorResponse[];
  messages: { message: string }[];
  modelUsage?: ModelUsageStats;
  steps?: Step[];
  traceId?: string;
  attachments?: AttachmentRecord[];
}

export class EvaluationChatClient {
  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    private readonly connectorId: string
  ) {}

  converse: ConverseFunction = async ({ messages, conversationId }) => {
    const callConverseApi = async (): Promise<CallConverseApiResults> => {
      // Use the Agent Builder API endpoint
      const response: {
        conversation_id: string;
        trace_id?: string;
        steps: Step[];
        response: { message: string };
        model_usage?: ModelUsageStats;
      } = await this.fetch('/api/agent_builder/converse', {
        method: 'POST',
        version: '2023-10-31',
        body: JSON.stringify({
          agent_id: ENTITY_ANALYTICS_AGENT_ID,
          connector_id: this.connectorId,
          conversation_id: conversationId,
          input: messages[messages.length - 1].message,
        }),
      });

      const {
        conversation_id: conversationIdFromResponse,
        response: latestResponse,
        steps,
        trace_id: traceId,
        model_usage: modelUsage,
      } = response;

      const attachments = await this.fetchAttachments(conversationIdFromResponse);

      return {
        conversationId: conversationIdFromResponse,
        messages: [...messages, latestResponse],
        steps,
        traceId,
        modelUsage,
        attachments,
        errors: [],
      };
    };

    try {
      return await pRetry(callConverseApi, {
        retries: 2,
        minTimeout: 2000,
        onFailedAttempt: (error) => {
          const isLastAttempt = error.attemptNumber === error.retriesLeft + error.attemptNumber;

          if (isLastAttempt) {
            this.log.error(
              new Error(`Failed to call converse API after ${error.attemptNumber} attempts`, {
                cause: error,
              })
            );
            throw error;
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
          ...messages,
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
  };

  /**
   * Fetches conversation-level attachments created as a side effect of the
   * latest converse call (e.g. `security.get_entity` persisting a
   * `security.entity` attachment). Returns an empty array on any error so
   * attachment assertions in specs report "no attachments found" with tool-call
   * context instead of the test failing at fetch time.
   */
  private fetchAttachments = async (conversationId: string): Promise<AttachmentRecord[]> => {
    if (!conversationId) {
      return [];
    }
    try {
      const response: { results?: AttachmentRecord[] } = await this.fetch(
        `/api/agent_builder/conversations/${encodeURIComponent(conversationId)}/attachments`,
        {
          method: 'GET',
          version: '2023-10-31',
        }
      );
      return response.results ?? [];
    } catch (error) {
      this.log.warning(
        new Error(`Failed to fetch attachments for conversation "${conversationId}"`, {
          cause: error instanceof Error ? error : undefined,
        })
      );
      return [];
    }
  };
}
