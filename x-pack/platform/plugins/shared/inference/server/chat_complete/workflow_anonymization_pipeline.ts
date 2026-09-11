/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { performance } from 'perf_hooks';
import type { KibanaRequest } from '@kbn/core-http-server';
import {
  ChatCompletionEventType,
  type ChatCompletionEvent,
  type ChatCompletionChunkEvent,
  type ChatCompletionMessageEvent,
  type Message,
} from '@kbn/inference-common';
import type { Logger } from '@kbn/logging';
import type { Observable } from 'rxjs';
import { catchError, defer, finalize, merge, of, Subject, switchMap, throwError } from 'rxjs';
import { createPiiDetectionContext } from '../workflow_anonymization/create_pii_detection_context';
import { createPiiTokenizationContext } from '../workflow_anonymization/create_pii_tokenization_context';
import type { PiiRegexWorkerService } from '../workflow_anonymization/detection/regex_worker_service';
import type { WorkflowAnonymizationOptions } from '../inference_client/workflow_anonymization_options';
import type {
  InferenceProceedInput,
  InferenceTokenMapEntry,
} from '../workflow_anonymization_capabilities';
import {
  createStreamingContentRestorer,
  restoreTokenizedString,
  restoreTokenizedValue,
} from './workflow_anonymization_restoration';
import {
  pipelineFirstChunkDurationHistogram,
  pipelineRequestsCounter,
} from './workflow_anonymization_metrics';

const buildAnonymizationInstruction = (
  tokenMap: Readonly<Record<string, InferenceTokenMapEntry>>
): string => {
  const tokenLines = Object.entries(tokenMap).map(
    ([token, entry]) => `- ${token}: ${entry.entityClass}`
  );
  return [
    '[Anonymization context]',
    'Some values in this conversation have been replaced with privacy tokens to protect sensitive information.',
    'Token registry (treat each token as a real value of its entity type):',
    ...tokenLines,
    'Rules:',
    '- Use these tokens exactly as given; do not modify, expand, or remove them.',
    '- Do not guess, infer, or reveal the original values behind any token.',
    '- When writing tool call arguments, preserve token strings verbatim.',
  ].join('\n');
};

export interface WorkflowInvocationState {
  connectorInvoked: boolean;
}

interface CreateWorkflowAnonymizationPipelineOptions {
  readonly request: KibanaRequest;
  readonly namespace: string;
  readonly system?: string;
  readonly messages: readonly Message[];
  readonly sessionId?: string;
  readonly agentId?: string;
  readonly abortSignal?: AbortSignal;
  readonly regexWorker: PiiRegexWorkerService;
  readonly logger: Logger;
  readonly workflowAnonymization: WorkflowAnonymizationOptions;
  readonly invocationState: WorkflowInvocationState;
  readonly invokeConnector: (input: {
    system?: string;
    messages: readonly Message[];
    abortSignal?: AbortSignal;
  }) => Observable<ChatCompletionEvent>;
}

const restoreTerminalMessage = (
  event: ChatCompletionMessageEvent,
  tokenMap: Readonly<Record<string, InferenceTokenMapEntry>>,
  restoreContent = true,
  restoreToolCallArgs = true
): ChatCompletionMessageEvent => ({
  ...event,
  content: restoreContent ? restoreTokenizedString(event.content, tokenMap) : event.content,
  toolCalls: event.toolCalls.map((toolCall) => {
    if (!restoreToolCallArgs) {
      return toolCall;
    }
    const restoredArguments = restoreTokenizedValue(toolCall.function.arguments, tokenMap);
    if (
      !restoredArguments ||
      typeof restoredArguments !== 'object' ||
      Array.isArray(restoredArguments)
    ) {
      throw new Error('Workflow token restoration produced invalid tool-call arguments');
    }
    return {
      ...toolCall,
      function: { ...toolCall.function, arguments: restoredArguments },
    };
  }),
});

const createRestoredToolCallChunk = (
  event: ChatCompletionMessageEvent
): ChatCompletionChunkEvent | undefined => {
  if (event.toolCalls.length === 0) {
    return undefined;
  }
  return {
    type: ChatCompletionEventType.ChatCompletionChunk,
    content: '',
    tool_calls: event.toolCalls.map((toolCall, index) => ({
      index,
      toolCallId: toolCall.toolCallId,
      function: {
        name: toolCall.function.name,
        arguments: JSON.stringify(toolCall.function.arguments),
      },
    })),
  };
};

export const createWorkflowAnonymizationPipeline = ({
  request,
  namespace,
  system,
  messages,
  sessionId,
  agentId,
  abortSignal,
  regexWorker,
  logger,
  workflowAnonymization,
  invocationState,
  invokeConnector,
}: CreateWorkflowAnonymizationPipelineOptions): Observable<ChatCompletionEvent> => {
  const relay$ = new Subject<ChatCompletionEvent>();
  let restoredTerminalMessage: ChatCompletionMessageEvent | undefined;
  let proceedInvoked = false;
  let preLLMTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const clearPreLLMTimer = () => {
    if (preLLMTimer !== undefined) {
      clearTimeout(preLLMTimer);
      preLLMTimer = undefined;
    }
  };

  const proceed = {
    invoke: async (input: InferenceProceedInput): Promise<{ rawContent: string }> => {
      clearPreLLMTimer();
      if (proceedInvoked) {
        throw new Error('The workflow inference proceed capability may only be invoked once');
      }
      proceedInvoked = true;
      invocationState.connectorInvoked = true;
      const tokenMap = input.tokenMap ?? {};
      const contentRestorer = createStreamingContentRestorer(tokenMap);

      const tokenCount = Object.keys(tokenMap).length;
      const augmentedSystem =
        tokenCount > 0
          ? [input.system, buildAnonymizationInstruction(tokenMap)].filter(Boolean).join('\n\n')
          : input.system;

      if (input.dryRun) {
        logger.debug(
          `Dry run: returning anonymized payload without calling inference connector (${tokenCount} tokens, ${input.messages.length} messages)`
        );
        const dryRunPayload = JSON.stringify(
          { system: augmentedSystem, messages: input.messages },
          null,
          2
        );
        relay$.next({
          type: ChatCompletionEventType.ChatCompletionChunk,
          content: dryRunPayload,
          tool_calls: [],
        });
        restoredTerminalMessage = {
          type: ChatCompletionEventType.ChatCompletionMessage,
          content: dryRunPayload,
          toolCalls: [],
        };
        return { rawContent: dryRunPayload };
      }

      logger.debug(
        `Sending anonymized request to inference connector (${tokenCount} tokens, ${input.messages.length} messages)`
      );

      return new Promise<{ rawContent: string }>((resolve, reject) => {
        let rawContent: string | undefined;
        const connectorStartTime = performance.now();
        let firstChunkRecorded = false;
        invokeConnector({
          system: augmentedSystem,
          messages: input.messages,
          abortSignal: input.abortSignal ?? abortSignal,
        }).subscribe({
          next: (event) => {
            const restoreStreaming = input.restoreStreamingContent !== false;
            const restoreToolCallArgs = input.restoreToolCallArguments !== false;
            if (event.type === ChatCompletionEventType.ChatCompletionChunk) {
              if (restoreStreaming) {
                const restoredContent = contentRestorer.push(event.content);
                if (restoredContent) {
                  if (!firstChunkRecorded) {
                    firstChunkRecorded = true;
                    pipelineFirstChunkDurationHistogram.record(
                      performance.now() - connectorStartTime
                    );
                  }
                  relay$.next({
                    ...event,
                    content: restoredContent,
                    // Tool-call arguments can be split at arbitrary JSON boundaries. Suppress their
                    // deltas until the assembled terminal message can be restored structurally.
                    tool_calls: [],
                  });
                }
              } else {
                if (event.content) {
                  if (!firstChunkRecorded) {
                    firstChunkRecorded = true;
                    pipelineFirstChunkDurationHistogram.record(
                      performance.now() - connectorStartTime
                    );
                  }
                  relay$.next({ ...event, tool_calls: [] });
                }
              }
              return;
            }
            if (event.type === ChatCompletionEventType.ChatCompletionMessage) {
              if (restoreStreaming) {
                const remainingContent = contentRestorer.flush();
                if (remainingContent) {
                  relay$.next({
                    type: ChatCompletionEventType.ChatCompletionChunk,
                    content: remainingContent,
                    tool_calls: [],
                  });
                }
              }
              rawContent = event.content;
              restoredTerminalMessage = restoreTerminalMessage(
                event,
                tokenMap,
                restoreStreaming,
                restoreToolCallArgs
              );
              return;
            }
            relay$.next(event);
          },
          error: (error) => {
            // Reject through the workflow so it unwinds before the merged stream terminates.
            // connectorInvoked is already true, so allow_unsafe can never retry this call.
            reject(error);
          },
          complete: () => {
            if (rawContent === undefined || !restoredTerminalMessage) {
              reject(new Error('Inference connector completed without a terminal message'));
              return;
            }
            resolve({ rawContent });
          },
        });
      });
    },
  };

  const around$ = defer(async () => {
    const serverSalt = workflowAnonymization.encryptionKey;

    let effectiveAbortSignal = abortSignal;
    if (workflowAnonymization.preLLMTimeoutMs > 0) {
      const preLLMController = new AbortController();
      preLLMTimer = setTimeout(() => {
        timedOut = true;
        preLLMController.abort(
          new Error(
            `Pre-LLM anonymization timed out after ${workflowAnonymization.preLLMTimeoutMs}ms`
          )
        );
      }, workflowAnonymization.preLLMTimeoutMs);
      effectiveAbortSignal = abortSignal
        ? AbortSignal.any([preLLMController.signal, abortSignal])
        : preLLMController.signal;
    }

    return workflowAnonymization.provider.execute({
      event: { system, messages, sessionId, agentId },
      namespace,
      request,
      pii: createPiiTokenizationContext({
        detectionContext: createPiiDetectionContext({ regexWorker }),
        serverSalt,
        sessionId,
      }),
      proceed,
      abortSignal: effectiveAbortSignal,
    });
  }).pipe(
    switchMap((result) => {
      if (!result.matched) {
        // Close the unused relay before subscribing to the direct stream. merge() keeps the
        // around branch active, so no relay events can interleave with the unmatched response.
        relay$.complete();
        clearPreLLMTimer();
        invocationState.connectorInvoked = true;
        pipelineRequestsCounter.add(1, { outcome: 'unmatched' });
        return invokeConnector({ system, messages, abortSignal });
      }
      if (!restoredTerminalMessage) {
        relay$.complete();
        pipelineRequestsCounter.add(1, { outcome: 'error' });
        return throwError(
          () => new Error('Workflow completed without invoking the inference connector')
        );
      }
      // All relayed connector events precede the workflow-authoritative terminal output.
      relay$.complete();
      pipelineRequestsCounter.add(1, { outcome: 'matched' });
      const restoredToolCallChunk = createRestoredToolCallChunk(restoredTerminalMessage);
      const terminalMessage = { ...restoredTerminalMessage, content: result.content };
      return restoredToolCallChunk
        ? of(restoredToolCallChunk, terminalMessage)
        : of(terminalMessage);
    }),
    catchError((error) => {
      clearPreLLMTimer();
      relay$.complete();
      if (
        workflowAnonymization.failureMode === 'allow_unsafe' &&
        !invocationState.connectorInvoked
      ) {
        logger.warn(
          'Workflow-driven anonymization failed before connector invocation; using the direct inference path because allow_unsafe is configured'
        );
        invocationState.connectorInvoked = true;
        pipelineRequestsCounter.add(1, { outcome: timedOut ? 'fallback_timeout' : 'fallback' });
        return invokeConnector({ system, messages, abortSignal });
      }
      pipelineRequestsCounter.add(1, { outcome: 'error' });
      return throwError(() => error);
    }),
    finalize(() => clearPreLLMTimer())
  );

  // Subscribe the relay first so synchronous connector emissions cannot be lost.
  return merge(relay$, around$);
};
