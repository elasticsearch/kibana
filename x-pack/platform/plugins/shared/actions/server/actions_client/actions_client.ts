/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import url from 'url';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { i18n } from '@kbn/i18n';
import { uniq } from 'lodash';
import type {
  IScopedClusterClient,
  SavedObjectsClientContract,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { AuditLogger } from '@kbn/security-plugin/server';
import type { IEventLogClient } from '@kbn/event-log-plugin/server';
import type { KueryNode } from '@kbn/es-query';
import type { AxiosInstance } from 'axios';
import type { SpacesServiceSetup } from '@kbn/spaces-plugin/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-shared';
import type { AuthMode } from '@kbn/connector-specs';
import type { Connector, ConnectorWithExtraFindData } from '../application/connector/types';
import type { ConnectorType } from '../application/connector/types';
import { get } from '../application/connector/methods/get';
import { getAll, getAllSystemConnectors } from '../application/connector/methods/get_all';
import { getAuthStatus } from '../application/connector/methods/get_auth_status';
import { getConnectorSpecAsJsonSchema } from '../application/connector/methods/get_connector_spec';
import type { GetAuthStatusResult } from '../application/connector/methods/get_auth_status/types';
import { update } from '../application/connector/methods/update';
import { listTypes } from '../application/connector/methods/list_types';
import { create } from '../application/connector/methods/create';
import { execute } from '../application/connector/methods/execute';
import type {
  GetGlobalExecutionKPIParams,
  GetGlobalExecutionLogParams,
  IExecutionLogResult,
} from '../../common';
import type { ActionTypeRegistry } from '../action_type_registry';
import type { AuthTypeRegistry } from '../auth_types/auth_type_registry';
import type { ActionExecutorContract } from '../lib';
import { parseDate } from '../lib';
import type {
  ActionResult,
  RawAction,
  InMemoryConnector,
  ActionTypeExecutorResult,
  ConnectorTokenClientContract,
  HookServices,
  ActionType,
  ConnectorLifecycleListener,
} from '../types';
import { invokePostDeleteListeners } from '../lib/invoke_lifecycle_listeners';
import { PreconfiguredActionDisabledModificationError } from '../lib/errors/preconfigured_action_disabled_modification';
import type {
  ExecuteOptions as EnqueueExecutionOptions,
  BulkExecutionEnqueuer,
  ExecutionResponse,
} from '../create_execute_function';
import type { ActionsAuthorization } from '../authorization/actions_authorization';
import { connectorAuditEvent, ConnectorAuditAction } from '../lib/audit_events';
import type { ActionsConfigurationUtilities } from '../actions_config';
import type {
  OAuthAuthorizationCodeParams,
  OAuthClientCredentialsParams,
  OAuthJwtParams,
  OAuthParams,
} from '../routes/get_oauth_access_token';
import type { GetOAuthJwtConfig, GetOAuthJwtSecrets } from '../lib/get_oauth_jwt_access_token';
import { getOAuthJwtAccessToken } from '../lib/get_oauth_jwt_access_token';
import { getOAuthClientCredentialsAccessToken } from '../lib/get_oauth_client_credentials_access_token';
import {
  getOAuthAuthorizationCodeAccessToken,
  type GetOAuthAuthorizationCodeConfig,
  type GetOAuthAuthorizationCodeSecrets,
} from '../lib/get_oauth_authorization_code_access_token';
import {
  ACTION_FILTER,
  formatExecutionKPIResult,
  formatExecutionLogResult,
  getExecutionKPIAggregation,
  getExecutionLogAggregation,
} from '../lib/get_execution_log_aggregation';
import { connectorFromSavedObject, isConnectorDeprecated } from '../application/connector/lib';
import type { ListTypesParams } from '../application/connector/methods/list_types/types';
import type { ConnectorUpdateParams } from '../application/connector/methods/update/types';
import type { ConnectorCreateParams } from '../application/connector/methods/create/types';
import { isPreconfigured } from '../lib/is_preconfigured';
import { isSystemAction } from '../lib/is_system_action';
import type { ConnectorExecuteParams } from '../application/connector/methods/execute/types';
import { connectorFromInMemoryConnector } from '../application/connector/lib/connector_from_in_memory_connector';
import { getAxiosInstance } from '../application/connector/methods/get_axios_instance';
import type { GetAxiosInstanceWithAuthFnOpts } from '../lib/get_axios_instance';

export interface ConstructorOptions {
  logger: Logger;
  kibanaIndices: string[];
  scopedClusterClient: IScopedClusterClient;
  actionTypeRegistry: ActionTypeRegistry;
  authTypeRegistry: AuthTypeRegistry;
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  unsecuredSavedObjectsClient: SavedObjectsClientContract;
  inMemoryConnectors: InMemoryConnector[];
  actionExecutor: ActionExecutorContract;
  bulkExecutionEnqueuer: BulkExecutionEnqueuer<ExecutionResponse>;
  request: KibanaRequest;
  /**
   * Optional space override. When set, connector operations and executions will be scoped to this spaceId
   */
  spaceId?: string;
  authorization: ActionsAuthorization;
  auditLogger?: AuditLogger;
  usageCounter?: UsageCounter;
  connectorTokenClient: ConnectorTokenClientContract;
  getEventLogClient: () => Promise<IEventLogClient>;
  getAxiosInstanceWithAuth: (
    getAxiosParams: GetAxiosInstanceWithAuthFnOpts
  ) => Promise<AxiosInstance>;
  spaces?: SpacesServiceSetup;
  isESOCanEncrypt: boolean;
  connectorLifecycleListeners?: ConnectorLifecycleListener[];
  getCurrentUserProfileId?: (request: KibanaRequest) => Promise<string | undefined>;
}

export interface ActionsClientContext {
  logger: Logger;
  kibanaIndices: string[];
  scopedClusterClient: IScopedClusterClient;
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  unsecuredSavedObjectsClient: SavedObjectsClientContract;
  actionTypeRegistry: ActionTypeRegistry;
  authTypeRegistry: AuthTypeRegistry;
  inMemoryConnectors: InMemoryConnector[];
  actionExecutor: ActionExecutorContract;
  request: KibanaRequest;
  spaceId?: string;
  authorization: ActionsAuthorization;
  bulkExecutionEnqueuer: BulkExecutionEnqueuer<ExecutionResponse>;
  auditLogger?: AuditLogger;
  usageCounter?: UsageCounter;
  connectorTokenClient: ConnectorTokenClientContract;
  getEventLogClient: () => Promise<IEventLogClient>;
  getAxiosInstanceWithAuth: (
    getAxiosParams: GetAxiosInstanceWithAuthFnOpts
  ) => Promise<AxiosInstance>;
  spaces?: SpacesServiceSetup;
  isESOCanEncrypt: boolean;
  connectorLifecycleListeners?: ConnectorLifecycleListener[];
  getCurrentUserProfileId?: (request: KibanaRequest) => Promise<string | undefined>;
}

const noop = async (_request: KibanaRequest): Promise<string | undefined> => undefined;

export class ActionsClient {
  private readonly context: ActionsClientContext;

  constructor({
    logger,
    actionTypeRegistry,
    authTypeRegistry,
    kibanaIndices,
    scopedClusterClient,
    encryptedSavedObjectsClient,
    unsecuredSavedObjectsClient,
    inMemoryConnectors,
    actionExecutor,
    bulkExecutionEnqueuer,
    request,
    spaceId,
    authorization,
    auditLogger,
    usageCounter,
    connectorTokenClient,
    getEventLogClient,
    getAxiosInstanceWithAuth,
    spaces,
    isESOCanEncrypt,
    connectorLifecycleListeners,
    getCurrentUserProfileId,
  }: ConstructorOptions) {
    this.context = {
      logger,
      actionTypeRegistry,
      authTypeRegistry,
      encryptedSavedObjectsClient,
      unsecuredSavedObjectsClient,
      scopedClusterClient,
      kibanaIndices,
      inMemoryConnectors,
      actionExecutor,
      bulkExecutionEnqueuer,
      request,
      spaceId,
      authorization,
      auditLogger,
      usageCounter,
      connectorTokenClient,
      getEventLogClient,
      getAxiosInstanceWithAuth,
      spaces,
      isESOCanEncrypt,
      connectorLifecycleListeners,
      getCurrentUserProfileId: getCurrentUserProfileId ?? noop,
    };
  }

  /**
   * Create an action
   */
  public async create({
    action,
    options,
  }: Omit<ConnectorCreateParams, 'context'>): Promise<ActionResult> {
    return create({ context: this.context, action, options });
  }

  /**
   * Update connector
   */
  public async update({
    id,
    action,
  }: Pick<ConnectorUpdateParams, 'id' | 'action'>): Promise<Connector> {
    return update({ context: this.context, id, action });
  }

  /**
   * Get a connector
   */
  public async get({
    id,
    throwIfSystemAction = true,
  }: {
    id: string;
    throwIfSystemAction?: boolean;
  }): Promise<ActionResult> {
    return get({ context: this.context, id, throwIfSystemAction });
  }

  /**
   * Get all connectors with in-memory connectors
   */
  public async getAll({ includeSystemActions = false } = {}): Promise<
    ConnectorWithExtraFindData[]
  > {
    return getAll({ context: this.context, includeSystemActions });
  }

  /**
   * Get all system connectors
   */
  public async getAllSystemConnectors(): Promise<ConnectorWithExtraFindData[]> {
    return getAllSystemConnectors({ context: this.context });
  }

  /**
   * Auth status for all connectors visible in the current space (persisted + in-memory).
   */
  public async getAuthStatus(): Promise<GetAuthStatusResult> {
    return getAuthStatus({ context: this.context });
  }

  public async getConnectorSpec({
    id,
    configurationUtilities,
  }: {
    id: string;
    configurationUtilities: ActionsConfigurationUtilities;
  }) {
    return getConnectorSpecAsJsonSchema({
      context: this.context,
      id,
      configurationUtilities,
    });
  }

  /**
   * Get bulk actions with in-memory list
   */
  public async getBulk({
    ids,
    throwIfSystemAction = true,
  }: {
    ids: string[];
    throwIfSystemAction?: boolean;
  }): Promise<(ActionResult | InMemoryConnector)[]> {
    try {
      await this.context.authorization.ensureAuthorized({ operation: 'get' });
    } catch (error) {
      ids.forEach((id) =>
        this.context.auditLogger?.log(
          connectorAuditEvent({
            action: ConnectorAuditAction.GET,
            savedObject: { type: 'action', id },
            error,
          })
        )
      );
      throw error;
    }

    const actionResults = new Array<ActionResult>();

    for (const connectorId of ids) {
      const inMemoryConnector = this.context.inMemoryConnectors.find(
        (connector) => connector.id === connectorId
      );

      if (inMemoryConnector !== undefined) {
        const connector = connectorFromInMemoryConnector({
          inMemoryConnector,
          id: connectorId,
          actionTypeRegistry: this.context.actionTypeRegistry,
        });

        /**
         * Getting system connector is not allowed
         * if throwIfSystemAction is set to true.
         * Default behavior is to throw
         */
        if (connector.isSystemAction && throwIfSystemAction) {
          throw Boom.notFound(`Connector ${connector.id} not found`);
        }

        actionResults.push(connector);
      }
    }

    // Fetch action objects in bulk
    // Excluding in-memory actions to avoid an not found error, which is already added
    const actionSavedObjectsIds = [
      ...new Set(
        ids.filter(
          (actionId) => !actionResults.find((actionResult) => actionResult.id === actionId)
        )
      ),
    ];

    const bulkGetOpts = actionSavedObjectsIds.map((id) => ({ id, type: 'action' }));
    const bulkGetResult = await this.context.unsecuredSavedObjectsClient.bulkGet<RawAction>(
      bulkGetOpts
    );

    bulkGetResult.saved_objects.forEach((so) => {
      if (!isSavedObjectErrorResult(so) && this.context.auditLogger) {
        this.context.auditLogger.log(
          connectorAuditEvent({
            action: ConnectorAuditAction.GET,
            savedObject: { type: 'action', id: so.id },
          })
        );
      }
    });

    for (const action of bulkGetResult.saved_objects) {
      if (isSavedObjectErrorResult(action)) {
        throw Boom.badRequest(
          `Failed to load action ${action.id} (${action.error.statusCode}): ${action.error.message}`
        );
      }
      actionResults.push(
        connectorFromSavedObject(
          action,
          isConnectorDeprecated(action.attributes),
          this.context.actionTypeRegistry.isDeprecated(action.attributes.actionTypeId)
        )
      );
    }

    return actionResults;
  }

  public async getOAuthAccessToken(
    { type, options }: OAuthParams,
    configurationUtilities: ActionsConfigurationUtilities
  ) {
    // Verify that user has edit access
    await this.context.authorization.ensureAuthorized({ operation: 'update' });

    // Verify that token url is allowed by allowed hosts config
    try {
      configurationUtilities.ensureUriAllowed(options.tokenUrl);
    } catch (err) {
      throw Boom.badRequest(err.message);
    }

    // Verify that token url contains a hostname and uses https
    const parsedUrl = url.parse(
      options.tokenUrl,
      false /* parseQueryString */,
      true /* slashesDenoteHost */
    );

    if (!parsedUrl.hostname) {
      throw Boom.badRequest(`Token URL must contain hostname`);
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw Boom.badRequest(`Token URL must use http or https`);
    }

    let accessToken: string | null = null;
    if (type === 'jwt') {
      const tokenOpts = options as OAuthJwtParams;

      try {
        accessToken = await getOAuthJwtAccessToken({
          logger: this.context.logger,
          configurationUtilities,
          credentials: {
            config: tokenOpts.config as GetOAuthJwtConfig,
            secrets: tokenOpts.secrets as GetOAuthJwtSecrets,
          },
          tokenUrl: tokenOpts.tokenUrl,
        });

        this.context.logger.debug(
          () =>
            `Successfully retrieved access token using JWT OAuth with tokenUrl ${
              tokenOpts.tokenUrl
            } and config ${JSON.stringify(tokenOpts.config)}`
        );
      } catch (err) {
        this.context.logger.debug(
          () =>
            `Failed to retrieve access token using JWT OAuth with tokenUrl ${
              tokenOpts.tokenUrl
            } and config ${JSON.stringify(tokenOpts.config)} - ${err.message}`
        );
        throw Boom.badRequest(`Failed to retrieve access token`);
      }
    } else if (type === 'client') {
      const tokenOpts = options as OAuthClientCredentialsParams;
      try {
        accessToken = await getOAuthClientCredentialsAccessToken({
          logger: this.context.logger,
          configurationUtilities,
          credentials: {
            type: 'client_secret',
            config: { clientId: tokenOpts.config.clientId },
            secrets: { clientSecret: tokenOpts.secrets.clientSecret },
          },
          tokenUrl: tokenOpts.tokenUrl,
          oAuthScope: tokenOpts.scope,
        });

        this.context.logger.debug(
          () =>
            `Successfully retrieved access token using Client Credentials OAuth with tokenUrl ${
              tokenOpts.tokenUrl
            }, scope ${tokenOpts.scope} and config ${JSON.stringify(tokenOpts.config)}`
        );
      } catch (err) {
        this.context.logger.debug(
          () =>
            `Failed to retrieved access token using Client Credentials OAuth with tokenUrl ${
              tokenOpts.tokenUrl
            }, scope ${tokenOpts.scope} and config ${JSON.stringify(tokenOpts.config)} - ${
              err.message
            }`
        );
        throw Boom.badRequest(`Failed to retrieve access token`);
      }
    } else if (type === 'authorization_code') {
      const tokenOpts = options as OAuthAuthorizationCodeParams;
      try {
        let authMode: AuthMode | undefined;
        try {
          const rawConnector = await this.context.unsecuredSavedObjectsClient.get<RawAction>(
            'action',
            tokenOpts.connectorId
          );
          authMode = rawConnector.attributes.authMode;
        } catch (err) {
          this.context.logger.debug(
            `Failed to read authMode for connector ${tokenOpts.connectorId}: ${err.message}`
          );
        }

        const profileUid = await this.context.getCurrentUserProfileId?.(this.context.request);

        accessToken = await getOAuthAuthorizationCodeAccessToken({
          connectorId: tokenOpts.connectorId,
          logger: this.context.logger,
          configurationUtilities,
          credentials: {
            config: tokenOpts.config as GetOAuthAuthorizationCodeConfig,
            secrets: tokenOpts.secrets as GetOAuthAuthorizationCodeSecrets,
          },
          connectorTokenClient: this.context.connectorTokenClient,
          scope: tokenOpts.scope,
          authMode,
          profileUid,
        });

        this.context.logger.debug(
          () =>
            `Successfully retrieved access token using Authorization Code OAuth for connector ${tokenOpts.connectorId} with tokenUrl ${tokenOpts.tokenUrl}`
        );
      } catch (err) {
        this.context.logger.debug(
          () =>
            `Failed to retrieve access token using Authorization Code OAuth for connector ${tokenOpts.connectorId} with tokenUrl ${tokenOpts.tokenUrl} - ${err.message}`
        );
        throw Boom.badRequest(`Failed to retrieve access token`);
      }
    }

    return { accessToken };
  }

  /**
   * Delete action
   */
  public async delete({ id }: { id: string }) {
    const foundInMemoryConnector = this.context.inMemoryConnectors.find(
      (connector) => connector.id === id
    );

    try {
      await this.context.authorization.ensureAuthorized({ operation: 'delete' });

      if (foundInMemoryConnector?.isSystemAction) {
        throw Boom.badRequest(
          i18n.translate('xpack.actions.serverSideErrors.systemActionDeletionForbidden', {
            defaultMessage: 'System action {id} is not allowed to delete.',
            values: {
              id,
            },
          })
        );
      }
    } catch (error) {
      this.context.auditLogger?.log(
        connectorAuditEvent({
          action: ConnectorAuditAction.DELETE,
          savedObject: { type: 'action', id },
          error,
        })
      );
      throw error;
    }

    this.context.auditLogger?.log(
      connectorAuditEvent({
        action: ConnectorAuditAction.DELETE,
        outcome: 'unknown',
        savedObject: { type: 'action', id },
      })
    );

    let rawAction;
    try {
      rawAction = await this.context.unsecuredSavedObjectsClient.get<RawAction>('action', id);
    } catch (e) {
      if (foundInMemoryConnector?.isPreconfigured) {
        throw new PreconfiguredActionDisabledModificationError(
          i18n.translate('xpack.actions.serverSideErrors.predefinedActionDeleteDisabled', {
            defaultMessage: 'Preconfigured action {id} is not allowed to delete.',
            values: {
              id,
            },
          }),
          'delete'
        );
      }
      throw e;
    }
    const {
      attributes: { actionTypeId, config, authMode },
    } = rawAction;

    let actionType: ActionType | undefined;
    try {
      actionType = this.context.actionTypeRegistry.get(actionTypeId);
    } catch (e) {
      this.context.logger.error(
        `Failed fetching action type from registry: ${e.message} - deletion will proceed.`
      );
    }

    const result = await this.context.unsecuredSavedObjectsClient.delete('action', id);

    const hookServices: HookServices = {
      scopedClusterClient: this.context.scopedClusterClient,
    };

    if (actionType && actionType.postDeleteHook) {
      try {
        await actionType.postDeleteHook({
          connectorId: id,
          config,
          logger: this.context.logger,
          request: this.context.request,
          services: hookServices,
        });
      } catch (error) {
        const tags = ['post-delete-hook', id];
        this.context.logger.error(
          `The post delete hook failed for for connector "${id}": ${error.message}`,
          { tags }
        );
      }
    }

    // Invoke cross-plugin lifecycle listeners (fire-and-forget to avoid blocking the API response)
    void invokePostDeleteListeners(
      this.context.connectorLifecycleListeners,
      actionTypeId,
      {
        connectorId: id,
        config,
        logger: this.context.logger,
        request: this.context.request,
        services: hookServices,
      },
      this.context.logger
    );

    try {
      await this.context.connectorTokenClient.deleteConnectorTokens({
        connectorId: id,
        authMode,
      });
    } catch (e) {
      this.context.logger.error(
        `Failed to delete auth tokens for connector "${id}" after delete: ${e.message}`
      );
    }

    return result;
  }

  public async execute(
    connectorExecuteParams: ConnectorExecuteParams
  ): Promise<ActionTypeExecutorResult<unknown>> {
    return execute(this.context, connectorExecuteParams);
  }

  public async getAxiosInstance(actionId: string): Promise<AxiosInstance> {
    return getAxiosInstance(this.context, actionId);
  }

  public async bulkEnqueueExecution(
    options: EnqueueExecutionOptions[]
  ): Promise<ExecutionResponse> {
    /**
     * For scheduled executions the additional authorization check
     * for system actions (kibana privileges) will be performed
     * inside the ActionExecutor at execution time
     */
    await this.context.authorization.ensureAuthorized({ operation: 'execute' });
    await Promise.all(
      uniq(options.map((o) => o.actionTypeId)).map((actionTypeId) =>
        this.context.authorization.ensureAuthorized({ operation: 'execute', actionTypeId })
      )
    );
    return this.context.bulkExecutionEnqueuer(this.context.unsecuredSavedObjectsClient, options);
  }

  public async listTypes({
    featureId,
    includeSystemActionTypes = false,
  }: ListTypesParams = {}): Promise<ConnectorType[]> {
    return listTypes(this.context, { featureId, includeSystemActionTypes });
  }

  public isActionTypeEnabled(
    actionTypeId: string,
    options: { notifyUsage: boolean } = { notifyUsage: false }
  ) {
    return this.context.actionTypeRegistry.isActionTypeEnabled(actionTypeId, options);
  }

  public isPreconfigured(connectorId: string): boolean {
    return isPreconfigured(this.context, connectorId);
  }

  public isSystemAction(connectorId: string): boolean {
    return isSystemAction(this.context, connectorId);
  }

  public async getGlobalExecutionLogWithAuth({
    dateStart,
    dateEnd,
    filter,
    page,
    perPage,
    sort,
    namespaces,
  }: GetGlobalExecutionLogParams): Promise<IExecutionLogResult> {
    this.context.logger.debug(`getGlobalExecutionLogWithAuth(): getting global execution log`);

    const authorizationTuple = {} as KueryNode;
    try {
      await this.context.authorization.ensureAuthorized({ operation: 'get' });
    } catch (error) {
      this.context.auditLogger?.log(
        connectorAuditEvent({
          action: ConnectorAuditAction.GET_GLOBAL_EXECUTION_LOG,
          error,
        })
      );
      throw error;
    }

    this.context.auditLogger?.log(
      connectorAuditEvent({
        action: ConnectorAuditAction.GET_GLOBAL_EXECUTION_LOG,
      })
    );

    const dateNow = new Date();
    const parsedDateStart = parseDate(dateStart, 'dateStart', dateNow);
    const parsedDateEnd = parseDate(dateEnd, 'dateEnd', dateNow);

    const eventLogClient = await this.context.getEventLogClient();

    try {
      const aggResult = await eventLogClient.aggregateEventsWithAuthFilter(
        'action',
        authorizationTuple,
        {
          start: parsedDateStart.toISOString(),
          end: parsedDateEnd.toISOString(),
          aggs: getExecutionLogAggregation({
            filter: filter ? `${filter} AND (${ACTION_FILTER})` : ACTION_FILTER,
            page,
            perPage,
            sort,
          }),
        },
        namespaces,
        true
      );

      return formatExecutionLogResult(aggResult);
    } catch (err) {
      this.context.logger.debug(
        `actionsClient.getGlobalExecutionLogWithAuth(): error searching global event log: ${err.message}`
      );
      throw err;
    }
  }

  public async getGlobalExecutionKpiWithAuth({
    dateStart,
    dateEnd,
    filter,
    namespaces,
  }: GetGlobalExecutionKPIParams) {
    this.context.logger.debug(`getGlobalExecutionKpiWithAuth(): getting global execution KPI`);

    const authorizationTuple = {} as KueryNode;
    try {
      await this.context.authorization.ensureAuthorized({ operation: 'get' });
    } catch (error) {
      this.context.auditLogger?.log(
        connectorAuditEvent({
          action: ConnectorAuditAction.GET_GLOBAL_EXECUTION_KPI,
          error,
        })
      );
      throw error;
    }

    this.context.auditLogger?.log(
      connectorAuditEvent({
        action: ConnectorAuditAction.GET_GLOBAL_EXECUTION_KPI,
      })
    );

    const dateNow = new Date();
    const parsedDateStart = parseDate(dateStart, 'dateStart', dateNow);
    const parsedDateEnd = parseDate(dateEnd, 'dateEnd', dateNow);

    const eventLogClient = await this.context.getEventLogClient();

    try {
      const aggResult = await eventLogClient.aggregateEventsWithAuthFilter(
        'action',
        authorizationTuple,
        {
          start: parsedDateStart.toISOString(),
          end: parsedDateEnd.toISOString(),
          aggs: getExecutionKPIAggregation(
            filter ? `${filter} AND (${ACTION_FILTER})` : ACTION_FILTER
          ),
        },
        namespaces,
        true
      );

      return formatExecutionKPIResult(aggResult);
    } catch (err) {
      this.context.logger.debug(
        `actionsClient.getGlobalExecutionKpiWithAuth(): error searching global execution KPI: ${err.message}`
      );
      throw err;
    }
  }
}
