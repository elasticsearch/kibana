/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
// Evals run in Node; SHA-256 is needed for stable trajectory provenance.
// eslint-disable-next-line import/no-nodejs-modules
import { createHash } from 'crypto';
// Eval-harness capture side-channel: writes the verbatim model answer to a
// local gitignored JSONL for offline report rendering.
// eslint-disable-next-line @kbn/eslint/require_kbn_fs, import/no-nodejs-modules
import { appendFileSync } from 'fs';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import { withRetry } from '@kbn/evals';

interface ConverseStep {
  type?: string;
  tool_id?: string;
  tool_call_id?: string;
  params?: Record<string, unknown>;
  results?: unknown[];
  [k: string]: unknown;
}

/**
 * Standard task-output shape consumed by the shared `@kbn/evals` evaluators
 * (`correctness`, `groundedness`): `messages[last].message` is the real
 * converse answer, and `errors` is always present (even if empty) so the
 * eval report has a stable column to read. Mirrors `ConverseResponse` in
 * `kbn-evals-suite-alerts-rag/src/chat_client.ts`.
 */
export interface ConverseResponse {
  messages: Array<{ message: string }>;
  steps: ConverseStep[];
  errors: Array<{ error: { message: string; stack?: string }; type: 'error' }>;
  conversationId?: string;
  traceId?: string | null;
  /**
   * Where `messages[last].message` came from. 'last_assistant_step' means the
   * converse response carried no final message and the last non-empty
   * assistant reasoning/output step was used verbatim instead — surfaced so
   * reports can label the fallback instead of presenting it as a true answer.
   */
  messageSource: 'response' | 'last_assistant_step';
  /** Reproducibility metadata persisted in task.output on every score doc. */
  sampling: {
    connectorId: string;
    temperature: number | null;
    topP: number | null;
    seed: number | null;
  };
  /** sha256 of the ordered tool_id + params sequence (provider ids excluded). */
  trajectoryFingerprint: string;
}

interface ConverseApiResponse {
  conversation_id?: string;
  trace_id?: string;
  steps?: ConverseStep[];
  response?: { message?: string };
}

export class PersonaMatrixChatClient {
  constructor(
    private readonly fetch: HttpHandler,
    private readonly log: ToolingLog,
    private readonly connectorId: string
  ) {}

  async query(input: string, attachment?: string): Promise<ConverseResponse> {
    const call = async (): Promise<ConverseResponse> => {
      const body: Record<string, unknown> = {
        agent_id: agentBuilderDefaultAgentId,
        connector_id: this.connectorId,
        input,
        // Run inline so the eval worker's W3C traceparent propagates
        // to the agent's server-side gen_ai spans.
        _execution_mode: 'local',
      };

      if (attachment) {
        body.attachments = [{ type: 'text', data: { content: attachment } }];
      }

      const resp = await this.fetch<ConverseApiResponse>({
        path: '/api/agent_builder/converse',
        method: 'POST',
        version: '2023-10-31',
        body: JSON.stringify(body),
      });

      const steps = resp.steps ?? [];
      // Final-answer fallback: some models end on a tool call (no closing
      // assistant turn), so response.message is "". Downstream, a blank final
      // message renders "No final answer message captured" and the answer-
      // based LLM judges see an empty answer. Use the LAST non-empty assistant
      // reasoning/output step verbatim — never synthesized — and mark it as a
      // fallback so the trace card can label it honestly.
      let message = resp.response?.message ?? '';
      let messageSource: 'response' | 'last_assistant_step' = 'response';
      if (!message.trim()) {
        const lastAssistant = [...steps].reverse().find((step) => {
          const text =
            step.type === 'reasoning' ? step.reasoning : step.type === 'output' ? step.output : '';
          return typeof text === 'string' && text.trim().length > 0;
        });
        if (lastAssistant) {
          const text =
            lastAssistant.type === 'reasoning' ? lastAssistant.reasoning : lastAssistant.output;
          message = typeof text === 'string' ? text : '';
          messageSource = message.trim() ? 'last_assistant_step' : 'response';
        }
      }
      const trajectoryFingerprint = createHash('sha256')
        .update(
          JSON.stringify(
            steps
              .filter((step) => step.type === 'tool_call' && step.tool_id)
              .map((step) => ({ tool_id: step.tool_id, params: step.params ?? null }))
          )
        )
        .digest('hex');

      const result: ConverseResponse = {
        messages: [{ message }],
        steps,
        errors: [],
        messageSource,
        conversationId: resp.conversation_id,
        traceId: resp.trace_id ?? null,
        sampling: {
          connectorId: this.connectorId,
          // The converse API exposes no sampling controls. Persist null rather
          // than inventing provider defaults; absence is itself evidence.
          temperature: null,
          topP: null,
          seed: null,
        },
        trajectoryFingerprint,
      };

      // Capture the verbatim answer when PERSONA_MATRIX_CAPTURE is set.
      const capturePath = process.env.PERSONA_MATRIX_CAPTURE;
      if (capturePath) {
        try {
          appendFileSync(
            capturePath,
            `${JSON.stringify({
              connector_id: this.connectorId,
              input,
              response_message: message,
              steps: result.steps,
              trace_id: result.traceId,
              conversation_id: result.conversationId,
              captured_at: new Date().toISOString(),
            })}\n`
          );
        } catch (err) {
          this.log.warning(`[persona-matrix] capture write failed: ${String(err)}`);
        }
      }

      return result;
    };

    return withRetry(call, {
      maxAttempts: 3,
      onRetry: ({ attempt, error }) => {
        this.log.warning(`[persona-matrix] converse retry (attempt ${attempt}): ${String(error)}`);
      },
    });
  }
}
