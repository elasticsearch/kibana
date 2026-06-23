/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { merge, of, filter, tap, catchError, throwError, EMPTY } from 'rxjs';
import type { Observable } from 'rxjs';
import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { RunAgentFn } from '@kbn/agent-builder-server';
import type { ChatEvent, ConversationAction } from '@kbn/agent-builder-common';
import {
  agentBuilderDefaultAgentId,
  isRoundCompleteEvent,
  isAgentBuilderError,
  AgentBuilderErrorCode,
  AgentExecutionMode,
  createInternalError,
} from '@kbn/agent-builder-common';
import { getConnectorProvider } from '@kbn/inference-common';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { SerializedExecutionError } from '@kbn/agent-builder-common';
import type {
  AgentExecution,
  ConversationAgentExecution,
  StandaloneAgentExecution,
} from '@kbn/agent-builder-server/execution';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import type { ConversationService, ConversationClient } from '../conversation';
import type { AgentsServiceStart } from '../agents';
import {
  generateTitle,
  handleCancellation,
  executeAgent$,
  getConversation,
  updateConversation$,
  createConversation$,
  resolveServices,
  convertErrors,
  type ConversationWithOperation,
} from './utils';
import { createConversationIdSetEvent } from './utils/events';
import type { AnalyticsService, TrackingService } from '../../telemetry';
import { withConverseSpan } from '../../tracing';
import { getCurrentSpaceId } from '../../utils/spaces';
import type { MeteringService } from '../metering';
import type { AgentExecutionClient } from './persistence';

import { EVENT_BATCH_INTERVAL_MS } from './constants';

/**
 * Dependencies needed to build and run an agent event stream.
 * Shared between the Task Manager handler and the local execution path.
 */
export interface AgentExecutionDeps {
  logger: Logger;
  inference: InferenceServerStart;
  conversationService: ConversationService;
  agentService: AgentsServiceStart;
  runAgent: RunAgentFn;
  uiSettings: UiSettingsServiceStart;
  savedObjects: SavedObjectsServiceStart;
  spaces?: SpacesPluginStart;
  meteringService: MeteringService;
  trackingService?: TrackingService;
  analyticsService?: AnalyticsService;
  searchInferenceEndpoints: SearchInferenceEndpointsPluginStart;
}

/**
 * Unified entry point for agent execution. Dispatches to the appropriate handler
 * based on the execution mode.
 */
export const handleAgentExecution = async ({
  execution,
  deps,
  request,
  abortSignal,
}: {
  execution: AgentExecution;
  deps: AgentExecutionDeps;
  request: KibanaRequest;
  abortSignal: AbortSignal;
}): Promise<Observable<ChatEvent>> => {
  if (execution.executionMode === AgentExecutionMode.standalone) {
    return handleStandaloneExecution({ execution, deps, request, abortSignal });
  }
  return handleConversationExecution({ execution, deps, request, abortSignal });
};

/**
 * Handles conversation-mode execution — resolves/creates conversation, generates title,
 * persists round, reports metering and telemetry.
 */
const handleConversationExecution = async ({
  execution,
  deps,
  request,
  abortSignal,
}: {
  execution: ConversationAgentExecution;
  deps: AgentExecutionDeps;
  request: KibanaRequest;
  abortSignal: AbortSignal;
}): Promise<Observable<ChatEvent>> => {
  const {
    agentId = agentBuilderDefaultAgentId,
    connectorId,
    conversationId,
    capabilities,
    structuredOutput,
    outputSchema,
    storeConversation = true,
    autoCreateConversationWithId = false,
    nextInput,
    browserApiTools,
    configurationOverrides,
    action,
    telemetryMetadata,
  } = execution.agentParams;

  const { logger, runAgent, trackingService, analyticsService, meteringService, agentService } =
    deps;

  // Resolve scoped services
  const { conversationClient, modelProvider, selectedConnectorId } = await resolveServices({
    agentId,
    connectorId,
    telemetryMetadata,
    request,
    ...deps,
  });

  // Get conversation
  const conversation = await getConversation({
    agentId,
    conversationId,
    autoCreateConversationWithId,
    conversationClient,
  });

  // Emit conversation ID for new conversations (only when persisting)
  const conversationIdEvent$ =
    storeConversation && conversation.operation === 'CREATE'
      ? of(createConversationIdSetEvent(conversation.id))
      : EMPTY;

  // Execute agent
  const agentEvents$ = executeAgent$({
    agentId,
    executionId: execution.executionId,
    request,
    nextInput,
    capabilities,
    structuredOutput,
    outputSchema,
    abortSignal,
    conversation,
    defaultConnectorId: selectedConnectorId,
    telemetryMetadata,
    runAgent,
    browserApiTools,
    configurationOverrides,
    action,
  });

  // Generate title (for CREATE) or use existing title (for UPDATE)
  const title$ =
    conversation.operation === 'CREATE'
      ? generateTitle({
          chatModel: (await modelProvider.selectModel({ effortLevel: 'low' })).chatModel,
          conversation,
          nextInput,
        })
      : of(conversation.title);

  // Persist conversation (optional)
  const persistenceEvents$ = storeConversation
    ? buildPersistenceEvents({
        agentId,
        conversation,
        conversationClient,
        conversationId,
        title$,
        agentEvents$,
        action,
      })
    : EMPTY;

  // Merge all event streams
  const effectiveConversationId =
    conversation.operation === 'CREATE' ? conversation.id : conversationId;

  const chatModel = (await modelProvider.getDefaultModel()).chatModel;
  const connectorProvider = getConnectorProvider(chatModel.getConnector());

  const agentRegistry = await agentService.getRegistry({ request });
  const { name: agentName } = await agentRegistry.get(agentId);

  const { headers } = request;
  const opikTraceId = headers.opik_trace_id as string | undefined;
  const opikParentSpanId = headers.opik_parent_span_id as string | undefined;
  const opikHeaders =
    opikTraceId && opikParentSpanId
      ? { opik_trace_id: opikTraceId, opik_parent_span_id: opikParentSpanId }
      : undefined;

  const spaceId = getCurrentSpaceId({ request, spaces: deps.spaces });

  return withConverseSpan(
    {
      agentId,
      agentName,
      providerName: connectorProvider,
      conversationId: effectiveConversationId,
      spaceId,
      opikHeaders,
    },
    () =>
      merge(conversationIdEvent$, agentEvents$, persistenceEvents$).pipe(
        handleCancellation(abortSignal),
        tap((event) => {
          try {
            if (isRoundCompleteEvent(event)) {
              const isReplacingRound = action === 'regenerate' || event.data?.resumed === true;
              const currentRoundCount = isReplacingRound
                ? conversation.rounds.length
                : (conversation.rounds?.length ?? 0) + 1;

              // metering
              meteringService
                .reportExecution({
                  conversationId: effectiveConversationId,
                  executionId: execution.executionId,
                  roundCount: currentRoundCount,
                  agentId,
                  round: event.data.round,
                  modelProvider: connectorProvider,
                })
                .catch((err) => {
                  logger.warn(`Failed to report execution metering: ${err}`);
                });

              // snapshot telemetry tracking
              if (effectiveConversationId) {
                trackingService?.trackConversationRound(effectiveConversationId, currentRoundCount);
              }

              // EBT tracking
              analyticsService?.reportRoundComplete({
                conversationId: effectiveConversationId,
                executionId: execution.executionId,
                roundCount: currentRoundCount,
                agentId,
                round: event.data.round,
                modelProvider: connectorProvider,
              });
            }
          } catch (error) {
            logger.error(`Failed to report round complete telemetry: ${error}`);
          }
        }),
        convertErrors({
          agentId,
          logger,
          analyticsService,
          trackingService,
          modelProvider: connectorProvider,
          conversationId: effectiveConversationId,
          executionId: execution.executionId,
        })
      )
  );
};

/**
 * Subscribe to the event stream and append events to the execution document with 200ms batching.
 * Returns a promise that resolves when the observable completes and all events are flushed.
 */
export const collectAndWriteEvents = ({
  events$,
  execution,
  executionClient,
  logger,
}: {
  events$: Observable<ChatEvent>;
  execution: AgentExecution;
  executionClient: AgentExecutionClient;
  logger: Logger;
}): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    let pendingEvents: ChatEvent[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let flushInProgress: Promise<void> | undefined;

    const flush = async () => {
      if (pendingEvents.length === 0) {
        return;
      }
      const batch = pendingEvents;
      pendingEvents = [];
      await executionClient.appendEvents(execution.executionId, batch);
    };

    const scheduleFlush = () => {
      if (flushTimer === undefined) {
        flushTimer = setTimeout(() => {
          flushTimer = undefined;
          flushInProgress = flush().catch((err) => {
            logger.error(
              `Failed to flush events for execution ${execution.executionId}: ${err.message}`
            );
          });
        }, EVENT_BATCH_INTERVAL_MS);
      }
    };

    const cleanup = () => {
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
    };

    events$.subscribe({
      next: (event) => {
        pendingEvents.push(event);
        scheduleFlush();
      },
      error: (err) => {
        cleanup();
        reject(err);
      },
      complete: () => {
        cleanup();
        const finalFlush = async () => {
          if (flushInProgress) {
            await flushInProgress;
          }
          await flush();
        };
        finalFlush().then(resolve, reject);
      },
    });
  });
};

/**
 * Converts an unknown error to a {@link SerializedExecutionError} for persistence.
 * - If the error is already an AgentBuilderError, serializes it using toJSON().
 * - Otherwise, wraps it as an internalError, preserving the HTTP status from
 *   Boom-style errors (or any error carrying a numeric `statusCode`) in
 *   `meta.statusCode` so the route layer can return the correct code.
 */
export const serializeExecutionError = (error: unknown): SerializedExecutionError => {
  if (isAgentBuilderError(error)) {
    return { code: error.code as AgentBuilderErrorCode, message: error.message, meta: error.meta };
  }
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = getHttpStatusFromError(error);
  return {
    code: AgentBuilderErrorCode.internalError,
    message,
    ...(statusCode !== undefined ? { meta: { statusCode } } : {}),
  };
};

const getHttpStatusFromError = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const { output, statusCode } = error as {
    output?: { statusCode?: unknown };
    statusCode?: unknown;
  };
  const candidate =
    typeof output?.statusCode === 'number'
      ? output.statusCode
      : typeof statusCode === 'number'
      ? statusCode
      : undefined;
  return typeof candidate === 'number' && candidate >= 400 && candidate < 600
    ? candidate
    : undefined;
};

const buildPersistenceEvents = ({
  agentId,
  conversation,
  conversationClient,
  conversationId,
  title$,
  agentEvents$,
  action,
}: {
  agentId: string;
  conversation: ConversationWithOperation;
  conversationClient: ConversationClient;
  conversationId?: string;
  title$: Observable<string>;
  agentEvents$: Observable<ChatEvent>;
  action?: ConversationAction;
}): Observable<ChatEvent> => {
  const roundCompletedEvents$ = agentEvents$.pipe(filter(isRoundCompleteEvent));

  if (conversation.operation === 'CREATE') {
    return createConversation$({
      agentId,
      conversationClient,
      conversationId: conversationId || conversation.id,
      title$,
      roundCompletedEvents$,
    });
  }

  return updateConversation$({
    conversationClient,
    conversation,
    title$,
    roundCompletedEvents$,
    action,
  });
};

/**
 * Handles a standalone agent execution — no conversation resolution, no title generation,
 * no persistence events, and no metering/telemetry.
 */
const handleStandaloneExecution = async ({
  execution,
  deps,
  request,
  abortSignal,
}: {
  execution: StandaloneAgentExecution;
  deps: AgentExecutionDeps;
  request: KibanaRequest;
  abortSignal: AbortSignal;
}): Promise<Observable<ChatEvent>> => {
  const agentId = execution.agentId;
  const { logger, runAgent } = deps;
  const { telemetryMetadata } = execution.agentParams;

  const { selectedConnectorId } = await resolveServices({
    agentId,
    connectorId: execution.agentParams.connectorId,
    telemetryMetadata,
    request,
    ...deps,
  });

  const agentEvents$ = executeAgent$({
    agentId,
    executionId: execution.executionId,
    request,
    nextInput: execution.agentParams.nextInput,
    capabilities: execution.agentParams.capabilities,
    abortSignal,
    conversation: undefined,
    defaultConnectorId: selectedConnectorId,
    telemetryMetadata,
    runAgent,
    executionMode: AgentExecutionMode.standalone,
  });

  return agentEvents$.pipe(
    handleCancellation(abortSignal),
    catchError((err) => {
      logger.error(`Error executing standalone agent: ${err.stack ?? err.message}`);
      return throwError(() => {
        if (isAgentBuilderError(err)) {
          return err;
        }
        return createInternalError(`Error executing standalone agent: ${err.message}`, {
          statusCode: 500,
        });
      });
    })
  );
};
