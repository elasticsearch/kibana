/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  merge,
  of,
  filter,
  map,
  tap,
  catchError,
  throwError,
  EMPTY,
  shareReplay,
  ignoreElements,
  concatMap,
  take,
} from 'rxjs';
import type { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { RunAgentFn } from '@kbn/agent-builder-server';
import type {
  ChatEvent,
  ConversationAction,
  ConverseInput,
  ConversationRoundAuthor,
} from '@kbn/agent-builder-common';
import {
  agentBuilderDefaultAgentId,
  isRoundCompleteEvent,
  isRoundStartedEvent,
  isConversationCreatedEvent,
  isAgentBuilderError,
  AgentBuilderErrorCode,
  AgentExecutionMode,
  ConversationRoundStatus,
  createInternalError,
  normalizeInteractive,
  DEFAULT_CONVERSATION_TITLE,
  isEventsNativeVersion,
} from '@kbn/agent-builder-common';
import type { InteractivityConfig } from '@kbn/agent-builder-common';
import { getConnectorProvider } from '@kbn/inference-common';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { SerializedExecutionError } from '@kbn/agent-builder-common';
import type {
  AgentExecution,
  ConversationAgentExecution,
  StandaloneAgentExecution,
} from '@kbn/agent-builder-server/execution';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import { ElasticGenAIAttributes, UserAttributes } from '@kbn/inference-tracing';
import type { Span } from '@opentelemetry/api';
import type { ConversationService, ConversationClient } from '../conversation';
import type { AgentsServiceStart } from '../agents';
import {
  generateTitle,
  handleCancellation,
  executeAgent$,
  getConversation,
  updateConversation$,
  createConversation$,
  persistRoundInput,
  appendRoundTerminated$,
  appendResumeExecution$,
  resolveServices,
  convertErrors,
  type ConversationWithOperation,
} from './utils';
import { reportRoundTelemetry } from './utils/report_round_telemetry';
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

export const setUserAttributes = (
  span: Span | undefined,
  user: { id?: string; username?: string }
): void => {
  if (!span) {
    return;
  }
  if (user.id) {
    span.setAttribute(UserAttributes.UserId, user.id);
  }
  if (user.username) {
    span.setAttribute(UserAttributes.UserName, user.username);
  }
};
/**
 * Unified entry point for agent execution. Dispatches to the appropriate handler
 * based on the execution mode.
 */
export const handleAgentExecution = async ({
  execution,
  deps,
  request,
  abortSignal,
  interactivity,
}: {
  execution: AgentExecution;
  deps: AgentExecutionDeps;
  request: KibanaRequest;
  abortSignal: AbortSignal;
  interactivity?: InteractivityConfig;
}): Promise<Observable<ChatEvent>> => {
  const resolvedInteractivity: InteractivityConfig =
    interactivity ??
    execution.interactivity ??
    normalizeInteractive(undefined, execution.executionMode);
  if (execution.executionMode === AgentExecutionMode.standalone) {
    return handleStandaloneExecution({
      execution,
      deps,
      request,
      abortSignal,
      interactivity: resolvedInteractivity,
    });
  }
  return handleConversationExecution({
    execution,
    deps,
    request,
    abortSignal,
    interactivity: resolvedInteractivity,
  });
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
  interactivity,
}: {
  execution: ConversationAgentExecution;
  deps: AgentExecutionDeps;
  request: KibanaRequest;
  abortSignal: AbortSignal;
  interactivity: InteractivityConfig;
}): Promise<Observable<ChatEvent>> => {
  const {
    agentId = agentBuilderDefaultAgentId,
    connectorId,
    conversationId,
    structuredOutput,
    outputSchema,
    storeConversation = true,
    autoCreateConversationWithId = false,
    origin,
    nextInput,
    browserApiTools,
    configurationOverrides,
    action,
    telemetryMetadata,
    maxContentLength,
    reasoningLevel,
    accessControl,
    subagentCreation,
    readOnly,
    projectRouting,
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

  // Get conversation — only the conversation-level part of the origin is persisted on it
  const conversation = await getConversation({
    agentId,
    conversationId,
    autoCreateConversationWithId,
    conversationClient,
    accessControl,
    readOnly,
    origin: origin ? { external_conversation_id: origin.external_conversation_id } : undefined,
    subagentCreation,
  });

  const author = await deps.conversationService.getConversationRoundAuthor({
    request,
    origin,
  });

  const roundId = uuidv4();
  const receivedAt = new Date();

  const useTwoPhase = action !== 'regenerate' && !isPendingResumeConversation(conversation);
  if (storeConversation && useTwoPhase) {
    await persistRoundInput({
      conversation,
      conversationClient,
      roundId,
      receivedAt,
      input: nextInput,
      author,
      origin: origin ? { type: origin.type } : undefined,
    });
  }

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
    origin,
    author,
    structuredOutput,
    outputSchema,
    abortSignal,
    conversation,
    defaultConnectorId: selectedConnectorId,
    telemetryMetadata,
    maxContentLength,
    reasoningLevel,
    runAgent,
    browserApiTools,
    configurationOverrides,
    action,
    interactivity,
    parentExecutionId: execution.parentExecutionId,
    projectRouting,
    roundId,
  });

  // Generate title when creating a new conversation
  // OR when the conversation still carries the default placeholder title
  const needsTitle =
    (conversation.operation === 'CREATE' || conversationNeedsTitle(conversation)) &&
    !subagentCreation;
  const title$ = (
    needsTitle
      ? generateTitle({
          chatModel: (await modelProvider.selectModel({ effortLevel: 'low' })).chatModel,
          conversation,
          nextInput,
        })
      : of(conversation.title)
  ).pipe(shareReplay(1));

  // Persist conversation (optional)
  const persistenceEvents$ = storeConversation
    ? buildPersistenceEvents({
        conversation,
        conversationClient,
        title$,
        agentEvents$,
        action,
        nextInput,
        author,
      })
    : EMPTY;

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
      conversationId: conversation.id,
      spaceId,
      opikHeaders,
    },
    (span) => {
      if (author || conversation.operation !== 'CREATE') {
        setUserAttributes(span, {
          id: author?.id ?? conversation.user.id,
          username: author?.username ?? conversation.user.username,
        });
      }

      const titleAttr$ = storeConversation
        ? title$.pipe(
            tap((title) => {
              span?.setAttribute(ElasticGenAIAttributes.ConversationTitle, title);
            }),
            ignoreElements()
          )
        : EMPTY;

      return merge(conversationIdEvent$, agentEvents$, persistenceEvents$, titleAttr$).pipe(
        filter((event) => !isRoundStartedEvent(event)),
        handleCancellation(abortSignal),
        tap((event) => {
          if (isConversationCreatedEvent(event) && !author) {
            setUserAttributes(span, {
              id: event.data.user.id,
              username: event.data.user.username,
            });
          }

          if (isRoundCompleteEvent(event)) {
            reportRoundTelemetry({
              event,
              conversation,
              nextInput,
              action,
              agentId,
              executionId: execution.executionId,
              modelProvider: connectorProvider,
              meteringService,
              trackingService,
              analyticsService,
              logger,
            });
          }
        }),
        // Must stay below the telemetry tap: `resume_execution` carries the unmerged per-execution
        // round that telemetry needs, and is only stripped so it doesn't reach the client.
        map(stripResumeExecution),
        convertErrors({
          agentId,
          logger,
          analyticsService,
          trackingService,
          modelProvider: connectorProvider,
          conversationId: conversation.id,
          executionId: execution.executionId,
        })
      );
    }
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

const conversationNeedsTitle = (conversation: { title?: string }): boolean =>
  !conversation.title || conversation.title === DEFAULT_CONVERSATION_TITLE;

const stripResumeExecution = (event: ChatEvent): ChatEvent => {
  if (!isRoundCompleteEvent(event) || !event.data.resume_execution) {
    return event;
  }
  const { resume_execution: _resumeExecution, ...data } = event.data;
  return { ...event, data };
};

const isPendingResumeConversation = (conversation: ConversationWithOperation): boolean => {
  const lastRound = conversation.rounds[conversation.rounds.length - 1];
  return lastRound?.status === ConversationRoundStatus.awaitingPrompt;
};

const buildPersistenceEvents = ({
  conversation,
  conversationClient,
  title$,
  agentEvents$,
  action,
  nextInput,
  author,
}: {
  conversation: ConversationWithOperation;
  conversationClient: ConversationClient;
  title$: Observable<string>;
  agentEvents$: Observable<ChatEvent>;
  action?: ConversationAction;
  nextInput: ConverseInput;
  author?: ConversationRoundAuthor;
}): Observable<ChatEvent> => {
  const roundCompletedEvents$ = agentEvents$.pipe(filter(isRoundCompleteEvent));

  const isRegenerate = action === 'regenerate';
  const isResume = isPendingResumeConversation(conversation);
  const useTwoPhase = !isRegenerate && !isResume;

  if (useTwoPhase) {
    const roundStartedEvents$ = agentEvents$.pipe(filter(isRoundStartedEvent));
    const endTitle$ =
      conversation.operation === 'CREATE' || conversationNeedsTitle(conversation)
        ? title$
        : undefined;

    return roundStartedEvents$.pipe(
      concatMap((startEvent) =>
        appendRoundTerminated$({
          conversation,
          conversationClient,
          roundCompletedEvents$: roundCompletedEvents$.pipe(
            filter((event) => event.data.round.id === startEvent.data.round_id),
            take(1)
          ),
          title$: endTitle$,
        })
      )
    );
  }

  // A resume of an events-native conversation appends a new execution (append-only); the pause is
  // never rewritten. Legacy (non-events-native) resumes and regenerate keep the rounds-path write.
  if (isResume && !isRegenerate && isEventsNativeVersion(conversation.schema_version)) {
    return appendResumeExecution$({
      conversation,
      conversationClient,
      roundCompletedEvents$,
      input: nextInput,
      author,
      title$: conversationNeedsTitle(conversation) ? title$ : undefined,
    });
  }

  return conversation.operation === 'CREATE'
    ? createConversation$({
        conversation,
        conversationClient,
        title$,
        roundCompletedEvents$,
      })
    : updateConversation$({
        conversationClient,
        conversation,
        roundCompletedEvents$,
        action,
        title$: conversationNeedsTitle(conversation) ? title$ : undefined,
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
  interactivity,
}: {
  execution: StandaloneAgentExecution;
  deps: AgentExecutionDeps;
  request: KibanaRequest;
  abortSignal: AbortSignal;
  interactivity: InteractivityConfig;
}): Promise<Observable<ChatEvent>> => {
  const agentId = execution.agentId;
  const { logger, runAgent } = deps;
  const { telemetryMetadata, maxContentLength, reasoningLevel, projectRouting } =
    execution.agentParams;

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
    abortSignal,
    conversation: undefined,
    defaultConnectorId: selectedConnectorId,
    telemetryMetadata,
    maxContentLength,
    reasoningLevel,
    runAgent,
    projectRouting,
    executionMode: AgentExecutionMode.standalone,
    interactivity,
    parentExecutionId: execution.parentExecutionId,
  });

  return agentEvents$.pipe(
    filter((event) => !isRoundStartedEvent(event)),
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
