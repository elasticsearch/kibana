/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PublicMethodsOf } from '@kbn/utility-types';
import type { AnalyticsServiceStart, KibanaRequest, Logger } from '@kbn/core/server';
import {
  type AuthenticatedUser,
  type SecurityServiceStart,
  SavedObjectsErrorHelpers,
} from '@kbn/core/server';
import { cloneDeep, startsWith } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import { addSpanLabels, withSpan } from '@kbn/apm-utils';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import { SAVED_OBJECT_REL_PRIMARY } from '@kbn/event-log-plugin/server';
import { createTaskRunError, TaskErrorSource } from '@kbn/task-manager-plugin/server';
import { getErrorSource as getTaskManagerErrorSource } from '@kbn/task-manager-plugin/server/task_running';
import { isConnectorAuthorizationError } from '@kbn/connector-specs';
import { GEN_AI_TOKEN_COUNT_EVENT } from './event_based_telemetry';
import { ConnectorUsageCollector } from '../usage/connector_usage_collector';
import {
  getGenAiTokenTracking,
  shouldTrackGenAiToken,
} from './token_tracking/gen_ai_token_tracking';
import {
  validateConfig,
  validateConnector,
  validateParams,
  validateSecrets,
} from './validate_with_schema';
import type {
  ActionType,
  ActionTypeConfig,
  ActionTypeExecutorRawResult,
  ActionTypeExecutorResult,
  ActionTypeRegistryContract,
  ActionTypeSecrets,
  ConnectorTokenClientContract,
  GetServicesFunction,
  GetUnsecuredServicesFunction,
  InMemoryConnector,
  RawAction,
  Services,
  UnsecuredServices,
  ValidatorServices,
} from '../types';
import { UNALLOWED_FOR_UNSECURE_EXECUTION_CONNECTOR_TYPE_IDS } from '../types';
import { EVENT_LOG_ACTIONS } from '../constants/event_log';
import type { ActionExecutionSource, ActionExecutionSourceType } from './action_execution_source';
import type { RelatedSavedObjects } from './related_saved_objects';
import { createActionEventLogRecordObject } from './create_action_event_log_record_object';
import { ActionExecutionError, ActionExecutionErrorReason } from './errors/action_execution_error';
import type { ActionsAuthorization } from '../authorization/actions_authorization';
import type { ConnectorRateLimiter } from './connector_rate_limiter';

// 1,000,000 nanoseconds in 1 millisecond
const Millis2Nanos = 1000 * 1000;

export interface ActionExecutorContext {
  logger: Logger;
  spaces?: SpacesServiceStart;
  security: SecurityServiceStart;
  getServices: GetServicesFunction;
  getUnsecuredServices: GetUnsecuredServicesFunction;
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  actionTypeRegistry: ActionTypeRegistryContract;
  analyticsService: AnalyticsServiceStart;
  eventLogger: IEventLogger;
  inMemoryConnectors: InMemoryConnector[];
  getActionsAuthorizationWithRequest: (request: KibanaRequest) => ActionsAuthorization;
  getCurrentUserProfileIdFromAPIKey: (request: KibanaRequest) => Promise<string | undefined>;
}

export interface TaskInfo {
  scheduled: Date;
  attempts: number;
}

export interface ExecuteOptions<Source = unknown> {
  actionExecutionId: string;
  actionId: string;
  consumer?: string;
  executionId?: string;
  params: Record<string, unknown>;
  relatedSavedObjects?: RelatedSavedObjects;
  request: KibanaRequest;
  /**
   * Optional space override. When provided, Action execution will be scoped to this spaceId.
   */
  spaceId?: string;
  source?: ActionExecutionSource<Source>;
  taskInfo?: TaskInfo;
  connectorTokenClient?: ConnectorTokenClientContract;
  signal?: AbortSignal;
}

type ExecuteHelperOptions<Source = unknown> = Omit<ExecuteOptions<Source>, 'request'> & {
  currentUser?: AuthenticatedUser | null;
  connectorTokenClient?: ConnectorTokenClientContract;
  checkCanExecuteFn?: (connectorTypeId: string) => Promise<void>;
  executeLabel: string;
  namespace: { namespace?: string };
  request?: KibanaRequest;
  services: Services | UnsecuredServices;
  spaceId?: string;
};

type UnsecuredExecuteOptions<Source = unknown> = Pick<
  ExecuteOptions<Source>,
  'actionExecutionId' | 'actionId' | 'params' | 'relatedSavedObjects' | 'source'
> & {
  spaceId: string;
};

export type ActionExecutorContract = PublicMethodsOf<ActionExecutor>;

export class ActionExecutor {
  private isInitialized = false;
  private actionExecutorContext?: ActionExecutorContext;
  private readonly isESOCanEncrypt: boolean;
  private connectorRateLimiter: ConnectorRateLimiter;
  private actionInfo: ActionInfo | undefined;

  constructor({
    isESOCanEncrypt,
    connectorRateLimiter,
  }: {
    isESOCanEncrypt: boolean;
    connectorRateLimiter: ConnectorRateLimiter;
  }) {
    this.isESOCanEncrypt = isESOCanEncrypt;
    this.connectorRateLimiter = connectorRateLimiter;
  }

  public initialize(actionExecutorContext: ActionExecutorContext) {
    if (this.isInitialized) {
      throw new Error('ActionExecutor already initialized');
    }
    this.isInitialized = true;
    this.actionExecutorContext = actionExecutorContext;
  }

  public async execute({
    actionExecutionId,
    actionId,
    connectorTokenClient,
    consumer,
    executionId,
    request,
    params,
    relatedSavedObjects,
    spaceId: spaceIdOverride,
    source,
    taskInfo,
    signal,
  }: ExecuteOptions): Promise<ActionTypeExecutorResult<unknown>> {
    const {
      actionTypeRegistry,
      getActionsAuthorizationWithRequest,
      getServices,
      security,
      spaces,
    } = this.actionExecutorContext!;

    const services = getServices(request);
    const spaceId = spaceIdOverride ?? (spaces && spaces.getSpaceId(request));
    const namespace = spaceId && spaceId !== 'default' ? { namespace: spaceId } : {};
    const authorization = getActionsAuthorizationWithRequest(request);
    const currentUser = security?.authc.getCurrentUser(request);

    return await this.executeHelper({
      actionExecutionId,
      actionId,
      connectorTokenClient,
      consumer,
      currentUser,
      checkCanExecuteFn: async (connectorTypeId: string) => {
        /**
         * Ensures correct permissions for execution and
         * performs authorization checks for system actions.
         * It will thrown an error in case of failure.
         */
        await ensureAuthorizedToExecute({
          params,
          actionId,
          actionTypeId: connectorTypeId,
          actionTypeRegistry,
          authorization,
          source: source?.type,
        });
      },
      executeLabel: `execute_action`,
      executionId,
      namespace,
      params,
      relatedSavedObjects,
      request,
      services,
      source,
      spaceId,
      taskInfo,
      signal,
    });
  }

  public async executeUnsecured({
    actionExecutionId,
    actionId,
    params,
    relatedSavedObjects,
    spaceId,
    source,
  }: UnsecuredExecuteOptions): Promise<ActionTypeExecutorResult<unknown>> {
    const { actionTypeRegistry, getUnsecuredServices } = this.actionExecutorContext!;

    const services = getUnsecuredServices();
    const namespace = spaceId && spaceId !== 'default' ? { namespace: spaceId } : {};

    return await this.executeHelper({
      actionExecutionId,
      actionId,
      checkCanExecuteFn: async (connectorTypeId: string) => {
        let errorMessage: string | null = null;
        if (UNALLOWED_FOR_UNSECURE_EXECUTION_CONNECTOR_TYPE_IDS.includes(connectorTypeId)) {
          errorMessage = `Cannot execute unsecured "${connectorTypeId}" action - execution of this type is not allowed`;
        }

        // We don't allow execute system actions in unsecured manner because they require a request
        if (actionTypeRegistry.isSystemActionType(connectorTypeId)) {
          errorMessage = `Cannot execute unsecured system action`;
        }

        if (errorMessage) {
          throw new ActionExecutionError(errorMessage, ActionExecutionErrorReason.Authorization, {
            actionId,
            status: 'error',
            message: errorMessage,
            retry: false,
            errorSource: TaskErrorSource.USER,
          });
        }
      },
      executeLabel: `execute_unsecured_action`,
      namespace,
      params,
      relatedSavedObjects,
      services,
      source,
      spaceId,
    });
  }

  public async logCancellation<Source = unknown>({
    actionId,
    request,
    relatedSavedObjects,
    source,
    executionId,
    taskInfo,
    consumer,
    actionExecutionId,
    spaceId: spaceIdOverride,
  }: {
    actionId: string;
    actionExecutionId: string;
    request: KibanaRequest;
    taskInfo?: TaskInfo;
    executionId?: string;
    relatedSavedObjects: RelatedSavedObjects;
    source?: ActionExecutionSource<Source>;
    consumer?: string;
    spaceId?: string;
  }) {
    const { spaces, eventLogger } = this.actionExecutorContext!;

    const spaceId = spaceIdOverride ?? (spaces && spaces.getSpaceId(request));
    const namespace = spaceId && spaceId !== 'default' ? { namespace: spaceId } : {};

    if (!this.actionInfo || this.actionInfo.actionId !== actionId) {
      this.actionInfo = await this.getActionInfoInternal(actionId, namespace.namespace);
    }

    const task = taskInfo
      ? {
          task: {
            scheduled: taskInfo.scheduled.toISOString(),
            scheduleDelay: Millis2Nanos * (Date.now() - taskInfo.scheduled.getTime()),
          },
        }
      : {};
    // Write event log entry
    const event = createActionEventLogRecordObject({
      actionId,
      consumer,
      action: EVENT_LOG_ACTIONS.executeTimeout,
      message: `action: ${this.actionInfo.actionTypeId}:${actionId}: '${
        this.actionInfo.name ?? ''
      }' execution cancelled due to timeout - exceeded default timeout of "5m"`,
      ...namespace,
      ...task,
      executionId,
      spaceId,
      savedObjects: [
        {
          type: 'action',
          id: actionId,
          typeId: this.actionInfo.actionTypeId,
          relation: SAVED_OBJECT_REL_PRIMARY,
        },
      ],
      relatedSavedObjects,
      actionExecutionId,
      isInMemory: this.actionInfo.isInMemory,
      ...(source ? { source } : {}),
      actionTypeId: this.actionInfo.actionTypeId,
    });

    eventLogger.logEvent(event);
  }

  private async getActionInfoInternal(
    actionId: string,
    namespace: string | undefined
  ): Promise<ActionInfo> {
    const { encryptedSavedObjectsClient, inMemoryConnectors } = this.actionExecutorContext!;

    // check to see if it's in memory connector first
    const inMemoryAction = inMemoryConnectors.find(
      (inMemoryConnector) => inMemoryConnector.id === actionId
    );
    if (inMemoryAction) {
      return {
        actionTypeId: inMemoryAction.actionTypeId,
        name: inMemoryAction.name,
        config: inMemoryAction.config,
        secrets: inMemoryAction.secrets,
        actionId,
        isInMemory: true,
        rawAction: { ...inMemoryAction, isMissingSecrets: false },
      };
    }

    if (!this.isESOCanEncrypt) {
      throw createTaskRunError(
        new Error(
          `Unable to execute action because the Encrypted Saved Objects plugin is missing encryption key. Please set xpack.encryptedSavedObjects.encryptionKey in the kibana.yml or use the bin/kibana-encryption-keys command.`
        ),
        TaskErrorSource.FRAMEWORK
      );
    }

    try {
      const rawAction = await encryptedSavedObjectsClient.getDecryptedAsInternalUser<RawAction>(
        'action',
        actionId,
        {
          namespace: namespace === 'default' ? undefined : namespace,
        }
      );
      const {
        attributes: { secrets, actionTypeId, config, name },
      } = rawAction;

      return {
        actionTypeId,
        name,
        config,
        secrets,
        actionId,
        rawAction: rawAction.attributes,
      };
    } catch (e) {
      if (SavedObjectsErrorHelpers.isNotFoundError(e)) {
        throw createTaskRunError(e, TaskErrorSource.USER);
      }
      throw createTaskRunError(e, TaskErrorSource.FRAMEWORK);
    }
  }

  private async executeHelper({
    actionExecutionId,
    actionId,
    connectorTokenClient,
    consumer,
    currentUser,
    checkCanExecuteFn,
    executeLabel,
    executionId,
    namespace,
    params,
    relatedSavedObjects,
    request,
    services,
    source,
    spaceId,
    taskInfo,
    signal,
  }: ExecuteHelperOptions): Promise<ActionTypeExecutorResult<unknown>> {
    if (!this.isInitialized) {
      throw new Error('ActionExecutor not initialized');
    }

    const providedProfileUid = request
      ? await this.actionExecutorContext!.getCurrentUserProfileIdFromAPIKey(request)
      : undefined;

    return withSpan(
      {
        name: executeLabel,
        type: 'actions',
        labels: {
          actions_connector_id: actionId,
        },
      },
      async (span) => {
        const { actionTypeRegistry, analyticsService, eventLogger } = this.actionExecutorContext!;

        const actionInfo = await this.getActionInfoInternal(actionId, namespace.namespace);

        const { actionTypeId, name, config, secrets, rawAction } = actionInfo;
        const authMode = rawAction.authMode;
        const profileUid = providedProfileUid || currentUser?.profile_uid;
        const loggerId = actionTypeId.startsWith('.') ? actionTypeId.substring(1) : actionTypeId;
        const logger = this.actionExecutorContext!.logger.get(loggerId);

        const connectorUsageCollector = new ConnectorUsageCollector({
          logger,
          connectorId: actionId,
        });

        if (!this.actionInfo || this.actionInfo.actionId !== actionId) {
          this.actionInfo = actionInfo;
        }

        if (this.connectorRateLimiter.isRateLimited(actionTypeId)) {
          return {
            actionId,
            status: 'error',
            message: `Action execution rate limit exceeded for connector: ${actionTypeId}`,
            retry: true,
            errorSource: TaskErrorSource.USER,
          };
        }

        if (
          !actionTypeRegistry.isActionExecutable(actionId, actionTypeId, {
            notifyUsage: true,
          })
        ) {
          try {
            actionTypeRegistry.ensureActionTypeEnabled(actionTypeId);
          } catch (e) {
            throw createTaskRunError(e, TaskErrorSource.FRAMEWORK);
          }
        }
        const actionType = actionTypeRegistry.get(actionTypeId);
        const configurationUtilities = actionTypeRegistry.getUtils();

        if (!actionType.executor) {
          throw new Error(
            `Connector type "${actionTypeId}" does not have an execute function and cannot be executed.`
          );
        }

        if (!actionType.validate.params) {
          throw new Error(
            `Connector type "${actionTypeId}" does not have a params validator and cannot be executed.`
          );
        }

        if (span) {
          span.name = `${executeLabel} ${actionTypeId}`;
          addSpanLabels({
            actions_connector_type_id: actionTypeId,
          });
        }

        const actionLabel = `${actionTypeId}:${actionId}: ${name}`;
        logger.debug(`executing action ${actionLabel}`);

        const task = taskInfo
          ? {
              task: {
                scheduled: taskInfo.scheduled.toISOString(),
                scheduleDelay: Millis2Nanos * (Date.now() - taskInfo.scheduled.getTime()),
              },
            }
          : {};

        const event = createActionEventLogRecordObject({
          actionId,
          action: EVENT_LOG_ACTIONS.execute,
          consumer,
          ...namespace,
          ...task,
          executionId,
          spaceId,
          savedObjects: [
            {
              type: 'action',
              id: actionId,
              typeId: actionTypeId,
              relation: SAVED_OBJECT_REL_PRIMARY,
            },
          ],
          relatedSavedObjects,
          name,
          actionExecutionId,
          isInMemory: this.actionInfo.isInMemory,
          ...(source ? { source } : {}),
          actionTypeId,
        });

        eventLogger.startTiming(event);

        const startEvent = cloneDeep({
          ...event,
          event: {
            ...event.event,
            action: EVENT_LOG_ACTIONS.executeStart,
          },
          message: `action started: ${actionLabel}`,
        });

        eventLogger.logEvent(startEvent);

        let validatedParams: Record<string, unknown>;
        let validatedConfig;
        let validatedSecrets;
        try {
          const validationResult = validateAction(
            {
              actionId,
              actionType,
              params,
              config,
              secrets,
              taskInfo,
            },
            { configurationUtilities }
          );
          validatedParams = validationResult.validatedParams;
          validatedConfig = validationResult.validatedConfig;
          validatedSecrets = validationResult.validatedSecrets;
        } catch (err) {
          eventLogger.stopTiming(event);
          span?.setOutcome('failure');
          event.event!.outcome = 'failure';
          event.message = `action execution failure: ${actionLabel}`;
          event.error = { message: err.message };
          logger.warn(`action execution failure: ${actionLabel}: ${err.message}`);
          eventLogger.logEvent(event);
          return err.result;
        }

        let rawResult: ActionTypeExecutorRawResult<unknown>;
        try {
          if (checkCanExecuteFn) {
            await checkCanExecuteFn(actionTypeId);
          }

          rawResult = await actionType.executor({
            actionId,
            services,
            params: validatedParams,
            config: validatedConfig,
            secrets: validatedSecrets,
            taskInfo,
            globalAuthHeaders: actionType.globalAuthHeaders,
            configurationUtilities,
            logger,
            source,
            ...(actionType.isSystemActionType ? { request } : {}),
            connectorUsageCollector,
            connectorTokenClient,
            signal,
            authMode,
            profileUid,
          });

          if (rawResult && rawResult.status === 'error') {
            rawResult.errorSource = TaskErrorSource.USER;
          }
        } catch (err) {
          const errorSource = getErrorSource(err) || TaskErrorSource.FRAMEWORK;
          if (err.reason === ActionExecutionErrorReason.Authorization) {
            rawResult = err.result;
          } else if (isConnectorAuthorizationError(err)) {
            rawResult = {
              actionId,
              status: 'error',
              message: 'an error occurred while running the action',
              serviceMessage: err.message,
              errorName: 'ConnectorAuthorizationError',
              errorMeta: {
                connectorName: name,
                authMethod: err.authMethod,
                reason: err.reason,
              },
              error: err,
              retry: false,
              errorSource: TaskErrorSource.USER,
            };
          } else {
            rawResult = {
              actionId,
              status: 'error',
              message: 'an error occurred while running the action',
              serviceMessage: err.message,
              error: err,
              retry: true,
              errorSource,
            };
          }
        }

        this.connectorRateLimiter.log(actionTypeId);

        // allow null-ish return to indicate success
        const result = rawResult || {
          actionId,
          status: 'ok',
        };

        event.event = event.event || {};

        const { error, ...resultWithoutError } = result;

        function completeEventLogging() {
          eventLogger.stopTiming(event);

          event.user = event.user || {};
          event.user.name = currentUser?.username;
          event.user.id = currentUser?.profile_uid;
          if (currentUser?.api_key) {
            event.kibana!.user_api_key = {
              name: currentUser.api_key?.name,
              id: currentUser.api_key?.id,
            };
          }

          set(
            event,
            'kibana.action.execution.usage.request_body_bytes',
            connectorUsageCollector.getRequestBodyByte()
          );

          if (result.status === 'ok') {
            span?.setOutcome('success');
            event.event!.outcome = 'success';
            event.message = `action executed: ${actionLabel}`;
          } else if (result.status === 'error') {
            span?.setOutcome('failure');
            event.event!.outcome = 'failure';
            event.message = `action execution failure: ${actionLabel}`;
            event.error = event.error || {};
            event.error.message = actionErrorToMessage(result);
            if (result.error) {
              logger.error(result.error, {
                tags: [actionTypeId, actionId, 'action-run-failed', `${result.errorSource}-error`],
                error: { stack_trace: result.error.stack },
              });
            }
            logger.warn(`action execution failure: ${actionLabel}: ${event.error.message}`);
          } else {
            span?.setOutcome('failure');
            event.event!.outcome = 'failure';
            event.message = `action execution returned unexpected result: ${actionLabel}: "${result.status}"`;
            event.error = event.error || {};
            event.error.message = 'action execution returned unexpected result';
            logger.warn(
              `action execution failure: ${actionLabel}: returned unexpected result "${result.status}"`
            );
          }

          eventLogger.logEvent(event);
        }

        // start genai extension
        if (
          result.status === 'ok' &&
          shouldTrackGenAiToken(actionTypeId, `${validatedParams.subAction}`)
        ) {
          getGenAiTokenTracking({
            actionTypeId,
            logger,
            result,
            validatedParams,
          })
            .then((tokenTracking) => {
              if (tokenTracking != null) {
                set(event, 'kibana.action.execution.gen_ai.usage', {
                  total_tokens: tokenTracking.total_tokens ?? 0,
                  prompt_tokens: tokenTracking.prompt_tokens ?? 0,
                  completion_tokens: tokenTracking.completion_tokens ?? 0,
                });

                analyticsService.reportEvent(GEN_AI_TOKEN_COUNT_EVENT.eventType, {
                  actionTypeId,
                  total_tokens: tokenTracking.total_tokens ?? 0,
                  prompt_tokens: tokenTracking.prompt_tokens ?? 0,
                  completion_tokens: tokenTracking.completion_tokens ?? 0,
                  aggregateBy: tokenTracking?.telemetry_metadata?.aggregateBy,
                  pluginId: tokenTracking?.telemetry_metadata?.pluginId,
                  ...(actionTypeId === '.gen-ai' && config?.apiProvider != null
                    ? { provider: config?.apiProvider }
                    : {}),
                  ...(config?.defaultModel != null ? { model: config?.defaultModel } : {}),
                });
              }
            })
            .catch((err) => {
              logger.error('Failed to calculate tokens from streaming response');
              logger.error(err);
            })
            .finally(() => {
              completeEventLogging();
            });
          return resultWithoutError;
        }
        // end genai extension

        completeEventLogging();

        return resultWithoutError;
      }
    );
  }
}

export interface ActionInfo {
  actionTypeId: string;
  name: string;
  config: ActionTypeConfig;
  secrets: ActionTypeSecrets;
  actionId: string;
  isInMemory?: boolean;
  rawAction: RawAction;
}

function getErrorSource(error: Error): TaskErrorSource | undefined {
  const SOCKET_DISCONNECTED_ERROR_MESSAGE = 'Client network socket disconnected';

  if (startsWith(error.message, SOCKET_DISCONNECTED_ERROR_MESSAGE)) {
    return TaskErrorSource.USER;
  }

  return getTaskManagerErrorSource(error);
}

function actionErrorToMessage(result: ActionTypeExecutorRawResult<unknown>): string {
  let message = result.message || 'unknown error running action';

  if (result.serviceMessage) {
    message = `${message}: ${result.serviceMessage}`;
  }

  if (result.retry instanceof Date) {
    message = `${message}; retry at ${result.retry.toISOString()}`;
  } else if (result.retry) {
    message = `${message}; retry: ${JSON.stringify(result.retry)}`;
  }

  return message;
}

interface ValidateActionOpts {
  actionId: string;
  actionType: ActionType;
  params: Record<string, unknown>;
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
  taskInfo?: TaskInfo;
}

function validateAction(
  { actionId, actionType, params, config, secrets, taskInfo }: ValidateActionOpts,
  validatorServices: ValidatorServices
) {
  let validatedParams: Record<string, unknown>;
  let validatedConfig: Record<string, unknown>;
  let validatedSecrets: Record<string, unknown>;

  try {
    // Params validator is guaranteed to exist at this point (validated in execute method)
    validatedParams = validateParams(actionType, params, validatorServices);
  } catch (err) {
    throw new ActionExecutionError(err.message, ActionExecutionErrorReason.Validation, {
      actionId,
      status: 'error',
      message: err.message,
      retry: !!taskInfo,
      errorSource: TaskErrorSource.USER,
    });
  }

  try {
    validatedConfig = validateConfig(actionType, config, validatorServices);
    validatedSecrets = validateSecrets(actionType, secrets, validatorServices);
    if (actionType.validate?.connector) {
      validateConnector(actionType, {
        config,
        secrets,
      });
    }

    return { validatedParams, validatedConfig, validatedSecrets };
  } catch (err) {
    throw new ActionExecutionError(err.message, ActionExecutionErrorReason.Validation, {
      actionId,
      status: 'error',
      message: err.message,
      retry: !!taskInfo,
      errorSource: TaskErrorSource.FRAMEWORK,
    });
  }
}

interface EnsureAuthorizedToExecuteOpts {
  actionId: string;
  actionTypeId: string;
  params: Record<string, unknown>;
  actionTypeRegistry: ActionTypeRegistryContract;
  authorization: ActionsAuthorization;
  source?: ActionExecutionSourceType;
}

const ensureAuthorizedToExecute = async ({
  actionId,
  actionTypeId,
  params,
  actionTypeRegistry,
  authorization,
  source,
}: EnsureAuthorizedToExecuteOpts) => {
  try {
    if (
      actionTypeRegistry.isSystemActionType(actionTypeId) ||
      actionTypeRegistry.hasSubFeature(actionTypeId)
    ) {
      const additionalPrivileges = actionTypeRegistry.getActionKibanaPrivileges(
        actionTypeId,
        params,
        source
      );

      await authorization.ensureAuthorized({
        operation: 'execute',
        additionalPrivileges,
        actionTypeId,
      });
    }
  } catch (error) {
    throw new ActionExecutionError(error.message, ActionExecutionErrorReason.Authorization, {
      actionId,
      status: 'error',
      message: error.message,
      retry: false,
      errorSource: TaskErrorSource.USER,
    });
  }
};
