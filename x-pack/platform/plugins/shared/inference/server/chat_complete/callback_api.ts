/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { ChatCompleteOptions, AnonymizationRule, Model } from '@kbn/inference-common';
import {
  createInferenceInternalError,
  createInferenceRequestError,
  InferenceTaskErrorCode,
  getConnectorFamily,
  getConnectorProvider,
  getConnectorPlatform,
  getConnectorDefaultModel,
  type ChatCompleteCompositeResponse,
  type ChatCompletionEvent,
  MessageRole,
} from '@kbn/inference-common';
import type { Logger } from '@kbn/logging';
import type { Observable } from 'rxjs';
import { catchError, defer, from, identity, share, switchMap, tap, throwError } from 'rxjs';
import { withChatCompleteSpan } from '@kbn/inference-tracing';
import type { ElasticsearchClient } from '@kbn/core/server';
import { omit } from 'lodash';
import type { ActionsClientProvider } from '../types';
import type {
  InferenceAdapterChatCompleteOptions,
  InferenceConnectorAdapterChatCompleteEvent,
} from './types';
import { getInferenceAdapter } from './adapters';
import { inferenceEndpointAdapter } from './adapters/inference_endpoint';
import {
  chunksIntoMessage,
  getInferenceExecutor,
  createInferenceEndpointExecutor,
  resolveInferenceEndpoint,
  handleCancellation,
  handleLifecycleCallbacks,
  retryHoldingTokenCountEvents,
  streamToResponse,
} from './utils';
import { retryWithExponentialBackoff } from '../../common/utils/retry_with_exponential_backoff';
import type { InferenceCallbackManager } from '../inference_client/callback_manager';
import { getRetryFilter } from '../../common/utils/error_retry_filter';
import { deanonymizeMessage } from './anonymization/deanonymize_message';
import { addAnonymizationInstruction } from './anonymization/add_anonymization_instruction';
import type { RegexWorkerService } from './anonymization/regex_worker_service';
import type { InferenceAnonymizationOptions } from '../inference_client/anonymization_options';
import type { InferenceEndpointIdCache } from '../util/inference_endpoint_id_cache';
import { prepareAnonymization } from './prepare_anonymization';
import type { TokenUsageLogger } from '../token_usage';
import { handleTokenUsageLogging, buildTokenUsageContext } from '../token_usage';
import type { WorkflowAnonymizationOptions } from '../inference_client/workflow_anonymization_options';
import {
  createWorkflowAnonymizationPipeline,
  type WorkflowInvocationState,
} from './workflow_anonymization_pipeline';

interface CreateChatCompleteApiOptions {
  request: KibanaRequest;
  namespace: string;
  actions: ActionsClientProvider;
  logger: Logger;
  anonymizationRulesPromise: Promise<AnonymizationRule[]>;
  regexWorker: RegexWorkerService;
  esClient: ElasticsearchClient;
  anonymization?: InferenceAnonymizationOptions;
  workflowAnonymization?: WorkflowAnonymizationOptions;
  endpointIdCache: InferenceEndpointIdCache;
  callbackManager?: InferenceCallbackManager;
  tokenUsageLogger?: TokenUsageLogger;
  isTokenUsageTrackingEnabled?: () => Promise<boolean>;
  isDefaultConnectorOnly?: () => Promise<boolean>;
  getDefaultConnectorId?: () => Promise<string | undefined>;
}

type CreateChatCompleteApiOptionsKey =
  | 'abortSignal'
  | 'stream'
  | 'retryConfiguration'
  | 'maxRetries';

type ChatCompleteApiWithCallbackInitOptions = Pick<
  ChatCompleteOptions,
  CreateChatCompleteApiOptionsKey
> & { connectorId: string };

export interface ChatCompleteCallbackContext {
  model?: Partial<Model>;
}

export type ChatCompleteApiWithCallbackCallback = (
  context: ChatCompleteCallbackContext
) => Omit<ChatCompleteOptions, CreateChatCompleteApiOptionsKey | 'connectorId'>;

export type ChatCompleteApiWithCallback = (
  options: ChatCompleteApiWithCallbackInitOptions,
  callback: ChatCompleteApiWithCallbackCallback
) => ChatCompleteCompositeResponse;

type ChatCompletePipelineAdapterOptions = Omit<InferenceAdapterChatCompleteOptions, 'executor'>;

type SpanModel = Parameters<typeof withChatCompleteSpan>[0]['model'];

interface ResolvedPipelineContext {
  callbackContext: ChatCompleteCallbackContext;
  getSpanModel: (modelName?: string) => SpanModel | undefined;
  chatComplete: (
    options: ChatCompletePipelineAdapterOptions
  ) => Observable<InferenceConnectorAdapterChatCompleteEvent>;
}

export function createChatCompleteCallbackApi(
  options: CreateChatCompleteApiOptions
): ChatCompleteApiWithCallback;

export function createChatCompleteCallbackApi({
  request,
  namespace,
  actions,
  logger,
  anonymizationRulesPromise,
  regexWorker,
  esClient,
  anonymization,
  workflowAnonymization,
  endpointIdCache,
  callbackManager,
  tokenUsageLogger,
  isTokenUsageTrackingEnabled,
  isDefaultConnectorOnly,
  getDefaultConnectorId,
}: CreateChatCompleteApiOptions) {
  return (
    {
      connectorId,
      abortSignal,
      stream,
      maxRetries = 3,
      retryConfiguration = {},
    }: ChatCompleteApiWithCallbackInitOptions,
    callback: ChatCompleteApiWithCallbackCallback
  ) => {
    const workflowInvocationState: WorkflowInvocationState = { connectorInvoked: false };
    const retryFilter = getRetryFilter(retryConfiguration.retryOn);
    const inference$ = defer(() =>
      resolveAndCreatePipeline({
        connectorId,
        endpointIdCache,
        request,
        actions,
        esClient,
        logger,
        anonymizationRulesPromise,
        regexWorker,
        callback,
        abortSignal,
        stream,
        namespace,
        anonymization,
        workflowAnonymization,
        workflowInvocationState,
        connectorRetry: {
          maxRetries,
          backoffMultiplier: retryConfiguration.backoffMultiplier,
          initialDelay: retryConfiguration.initialDelay,
          retryFilter,
        },
        tokenUsageLogger,
        isTokenUsageTrackingEnabled,
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      })
    ).pipe(
      retryHoldingTokenCountEvents({
        maxRetry: maxRetries,
        backoffMultiplier: retryConfiguration.backoffMultiplier,
        initialDelay: retryConfiguration.initialDelay,
        errorFilter: (error) => !workflowInvocationState.connectorInvoked && retryFilter(error),
      }),
      callbackManager ? handleLifecycleCallbacks({ callbackManager }) : identity,
      abortSignal ? handleCancellation(abortSignal) : identity
    );

    if (stream) {
      return inference$.pipe(share());
    } else {
      return streamToResponse(inference$);
    }
  };
}

function createChatCompletePipeline({
  resolve,
  request,
  esClient,
  logger,
  anonymizationRulesPromise,
  regexWorker,
  callback,
  abortSignal,
  stream,
  namespace,
  anonymization,
  workflowAnonymization,
  workflowInvocationState,
  connectorRetry,
  connectorId,
  tokenUsageLogger,
  isTokenUsageTrackingEnabled,
}: {
  resolve: () => Promise<ResolvedPipelineContext>;
  request: KibanaRequest;
  esClient: ElasticsearchClient;
  logger: Logger;
  anonymizationRulesPromise: Promise<AnonymizationRule[]>;
  regexWorker: RegexWorkerService;
  callback: ChatCompleteApiWithCallbackCallback;
  abortSignal?: AbortSignal;
  stream?: boolean;
  namespace: string;
  anonymization?: InferenceAnonymizationOptions;
  workflowAnonymization?: WorkflowAnonymizationOptions;
  workflowInvocationState: WorkflowInvocationState;
  connectorRetry: {
    maxRetries: number;
    backoffMultiplier?: number;
    initialDelay?: number;
    retryFilter: (error: Error) => boolean;
  };
  connectorId: string;
  tokenUsageLogger?: TokenUsageLogger;
  isTokenUsageTrackingEnabled?: () => Promise<boolean>;
}) {
  return from(resolve()).pipe(
    switchMap((context) => {
      const { callbackContext, getSpanModel, chatComplete } = context;

      const {
        system,
        messages: givenMessages,
        functionCalling,
        metadata,
        modelName,
        temperature,
        reasoning,
        toolChoice,
        tools,
        timeout,
        maxContentLength,
        cacheControl,
        sessionId,
      } = callback(callbackContext);

      const messages = sanitizeMessages(givenMessages);

      const invokeConnector = ({
        system: connectorSystem,
        messages: connectorMessages,
        abortSignal: connectorAbortSignal,
      }: {
        system?: string;
        messages: readonly (typeof messages)[number][];
        abortSignal?: AbortSignal;
      }): Observable<ChatCompletionEvent> => {
        const spanModel = getSpanModel(modelName);
        let emittedEvent = false;
        return withChatCompleteSpan(
          {
            system: connectorSystem,
            messages: [...connectorMessages],
            tools,
            toolChoice,
            ...(spanModel ? { model: spanModel } : {}),
            ...metadata?.attributes,
          },
          () =>
            chatComplete({
              system: connectorSystem,
              messages: [...connectorMessages],
              toolChoice,
              tools,
              temperature,
              reasoning,
              logger,
              functionCalling,
              modelName,
              abortSignal: connectorAbortSignal,
              metadata,
              timeout,
              maxContentLength,
              cacheControl,
              sessionId,
              stream,
            }).pipe(chunksIntoMessage({ toolOptions: { toolChoice, tools }, logger }))
        ).pipe(
          tap(() => {
            emittedEvent = true;
          }),
          workflowAnonymization
            ? retryWithExponentialBackoff({
                maxRetry: connectorRetry.maxRetries,
                backoffMultiplier: connectorRetry.backoffMultiplier,
                initialDelay: connectorRetry.initialDelay,
                errorFilter: (error: Error) => !emittedEvent && connectorRetry.retryFilter(error),
              })
            : identity
        );
      };

      const tokenUsageOperator = tokenUsageLogger
        ? handleTokenUsageLogging({
            tokenUsageLogger,
            getContext: () =>
              buildTokenUsageContext({
                connectorId,
                model: callbackContext.model,
                modelName,
                featureId: metadata?.connectorTelemetry?.pluginId,
                parentFeatureId: metadata?.connectorTelemetry?.aggregateBy,
              }),
            logger,
            isEnabled: isTokenUsageTrackingEnabled,
          })
        : identity;

      if (workflowAnonymization) {
        return createWorkflowAnonymizationPipeline({
          request,
          namespace,
          system,
          messages,
          sessionId,
          agentId: metadata?.agentId,
          abortSignal,
          regexWorker: workflowAnonymization.piiRegexWorker,
          logger,
          workflowAnonymization,
          invocationState: workflowInvocationState,
          invokeConnector,
        }).pipe(tokenUsageOperator);
      }

      return from(anonymizationRulesPromise).pipe(
        switchMap((anonymizationRules) =>
          from(
            prepareAnonymization({
              namespace,
              logger,
              anonymizationRules,
              regexWorker,
              esClient,
              replacementsEsClient: anonymization?.replacements?.esClient,
              replacementsEncryptionKeyPromise: anonymization?.replacements?.encryptionKeyPromise,
              usePersistentReplacements: anonymization?.replacements?.usePersistentReplacements,
              requireReplacementsEncryptionKey: anonymization?.replacements?.requireEncryptionKey,
              saltPromise: anonymization?.saltPromise,
              resolveEffectivePolicy: anonymization?.resolveEffectivePolicy,
              metadata,
              system,
              messages,
            })
          ).pipe(
            switchMap(
              ({ anonymization: preparedAnonymization, replacementsId, effectivePolicy }) => {
                const systemWithAnonymizationInstructions = preparedAnonymization.system
                  ? addAnonymizationInstruction(
                      preparedAnonymization.system,
                      anonymizationRules,
                      effectivePolicy
                    )
                  : system;

                return invokeConnector({
                  system: systemWithAnonymizationInstructions,
                  messages: preparedAnonymization.messages,
                  abortSignal,
                }).pipe(deanonymizeMessage({ ...preparedAnonymization, replacementsId }));
              }
            )
          )
        ),
        tokenUsageOperator
      );
    })
  );
}

function resolveAndCreatePipeline({
  connectorId,
  endpointIdCache,
  request,
  actions,
  esClient,
  logger,
  anonymizationRulesPromise,
  regexWorker,
  callback,
  abortSignal,
  stream,
  namespace,
  anonymization,
  workflowAnonymization,
  workflowInvocationState,
  connectorRetry,
  tokenUsageLogger,
  isTokenUsageTrackingEnabled,
  isDefaultConnectorOnly,
  getDefaultConnectorId,
}: {
  connectorId: string;
  endpointIdCache: InferenceEndpointIdCache;
  request: KibanaRequest;
  actions: ActionsClientProvider;
  esClient: ElasticsearchClient;
  logger: Logger;
  anonymizationRulesPromise: Promise<AnonymizationRule[]>;
  regexWorker: RegexWorkerService;
  callback: ChatCompleteApiWithCallbackCallback;
  abortSignal?: AbortSignal;
  stream?: boolean;
  namespace: string;
  anonymization?: InferenceAnonymizationOptions;
  workflowAnonymization?: WorkflowAnonymizationOptions;
  workflowInvocationState: WorkflowInvocationState;
  connectorRetry: {
    maxRetries: number;
    backoffMultiplier?: number;
    initialDelay?: number;
    retryFilter: (error: Error) => boolean;
  };
  tokenUsageLogger?: TokenUsageLogger;
  isTokenUsageTrackingEnabled?: () => Promise<boolean>;
  isDefaultConnectorOnly?: () => Promise<boolean>;
  getDefaultConnectorId?: () => Promise<string | undefined>;
}) {
  return from(
    throwIfConnectorNotAllowed({
      connectorId,
      isDefaultConnectorOnly,
      getDefaultConnectorId,
      logger,
    }).then(() => endpointIdCache.has(connectorId))
  ).pipe(
    switchMap((isInferenceEndpoint) => {
      let resolvedAsInferenceEndpoint = isInferenceEndpoint;

      const resolve: () => Promise<ResolvedPipelineContext> = isInferenceEndpoint
        ? async () => {
            const endpointMeta = await resolveInferenceEndpoint({
              inferenceId: connectorId,
              esClient,
            });
            const executor = createInferenceEndpointExecutor({
              inferenceId: connectorId,
              esClient,
            });

            return {
              callbackContext: {
                model: endpointMeta.modelId ? { id: endpointMeta.modelId } : undefined,
              },
              getSpanModel: (modelName) =>
                endpointMeta.provider
                  ? ({
                      id: modelName ?? endpointMeta.modelId,
                      provider: endpointMeta.provider,
                    } as SpanModel)
                  : undefined,
              chatComplete: (options) =>
                inferenceEndpointAdapter.chatComplete({
                  ...options,
                  executor,
                  endpointModelId: endpointMeta.modelId,
                  provider: endpointMeta.provider,
                }),
            };
          }
        : async () => {
            const executor = await getInferenceExecutor({
              connectorId,
              request,
              actions,
              esClient,
              logger,
            });
            const connector = executor.getConnector();

            if (connector.isInferenceEndpoint) {
              resolvedAsInferenceEndpoint = true;
              const inferenceId = connector.connectorId;
              const endpointMeta = await resolveInferenceEndpoint({
                inferenceId,
                esClient,
              });
              const endpointExecutor = createInferenceEndpointExecutor({
                inferenceId,
                esClient,
              });

              return {
                callbackContext: {
                  model: endpointMeta.modelId ? { id: endpointMeta.modelId } : undefined,
                },
                getSpanModel: (modelName) =>
                  endpointMeta.provider
                    ? ({
                        id: modelName ?? endpointMeta.modelId,
                        provider: endpointMeta.provider,
                      } as SpanModel)
                    : undefined,
                chatComplete: (options) =>
                  inferenceEndpointAdapter.chatComplete({
                    ...options,
                    executor: endpointExecutor,
                    endpointModelId: endpointMeta.modelId,
                    provider: endpointMeta.provider,
                  }),
              };
            }

            const connectorType = connector.type;
            const inferenceAdapter = getInferenceAdapter(connectorType);

            if (!inferenceAdapter) {
              throw createInferenceRequestError(
                `Adapter for type ${connectorType} not implemented`,
                400
              );
            }

            return {
              callbackContext: {
                model: {
                  family: getConnectorFamily(connector),
                  provider: getConnectorProvider(connector),
                  id: getConnectorDefaultModel(connector),
                  platform: getConnectorPlatform(connector),
                },
              },
              getSpanModel: (modelName) => ({
                id: modelName ?? getConnectorDefaultModel(connector),
                family: getConnectorFamily(connector),
                provider: getConnectorProvider(connector),
              }),
              chatComplete: (options) => inferenceAdapter.chatComplete({ ...options, executor }),
            };
          };

      return createChatCompletePipeline({
        resolve,
        request,
        esClient,
        logger,
        anonymizationRulesPromise,
        regexWorker,
        callback,
        abortSignal,
        stream,
        namespace,
        anonymization,
        workflowAnonymization,
        workflowInvocationState,
        connectorRetry,
        connectorId,
        tokenUsageLogger,
        isTokenUsageTrackingEnabled,
      }).pipe(
        catchError((error) => {
          const is404 = error?.meta?.status === 404 || error?.statusCode === 404;
          const isUpstreamProviderError = error?.code === InferenceTaskErrorCode.providerError;
          if (is404 && !isUpstreamProviderError) {
            if (resolvedAsInferenceEndpoint) {
              endpointIdCache.invalidate();
              return throwError(() => error);
            }
            return throwError(() =>
              createInferenceRequestError(
                `No connector or inference endpoint found for ID '${connectorId}'`,
                400
              )
            );
          }
          return throwError(() => error);
        })
      );
    })
  );
}

async function throwIfConnectorNotAllowed({
  connectorId,
  isDefaultConnectorOnly,
  getDefaultConnectorId,
  logger,
}: {
  connectorId: string;
  isDefaultConnectorOnly?: () => Promise<boolean>;
  getDefaultConnectorId?: () => Promise<string | undefined>;
  logger: Logger;
}): Promise<void> {
  if (!isDefaultConnectorOnly || !getDefaultConnectorId) {
    return;
  }
  let defaultConnectorId: string | undefined;
  try {
    if (!(await isDefaultConnectorOnly())) {
      return;
    }
    defaultConnectorId = await getDefaultConnectorId();
  } catch (error) {
    // fail closed: block the call when the restriction cannot be verified
    logger.error(`Failed to verify the default AI connector restriction: ${error.message}`);
    throw createInferenceInternalError('Failed to verify the default AI connector restriction');
  }
  if (connectorId === defaultConnectorId) {
    return;
  }
  throw createInferenceRequestError(
    `Connector "${connectorId}" is not allowed: Kibana is configured to only allow the default AI connector${
      defaultConnectorId ? ` "${defaultConnectorId}"` : ''
    }`,
    400
  );
}

function sanitizeMessages(messages: ChatCompleteOptions['messages']) {
  return messages.map((message) => {
    if (
      message.role === MessageRole.Assistant &&
      message.toolCalls !== undefined &&
      message.toolCalls.length === 0
    ) {
      return omit(message, 'toolCalls');
    }
    return message;
  });
}
