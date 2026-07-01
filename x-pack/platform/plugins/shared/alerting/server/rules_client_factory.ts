/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  KibanaRequest,
  Logger,
  SavedObjectsServiceStart,
  PluginInitializerContext,
  ISavedObjectsRepository,
  CoreStart,
} from '@kbn/core/server';
import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type {
  GrantAPIKeyResult,
  SecurityPluginSetup,
  SecurityPluginStart,
} from '@kbn/security-plugin/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { IEventLogClientService, IEventLogger } from '@kbn/event-log-plugin/server';
import { SECURITY_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import {
  HTTPAuthorizationHeader,
  decodeApiKeyId,
  isUiamCredential,
} from '@kbn/core-security-server';
import type { InvalidateAPIKeyResult } from '@kbn/core-security-server';
import type { FakeRawRequest } from '@kbn/core-http-server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import type { RuleTypeRegistry, SpaceIdToNamespaceFunction } from './types';
import { RulesClient } from './rules_client';
import type { AlertingAuthorizationClientFactory } from './alerting_authorization_client_factory';
import type { AlertingRulesConfig } from './config';
import type { GetAlertIndicesAlias } from './lib';
import type { AlertsService } from './alerts_service/alerts_service';
import type { BackfillClient } from './backfill_client/backfill_client';
import {
  AD_HOC_RUN_SAVED_OBJECT_TYPE,
  API_KEY_PENDING_INVALIDATION_TYPE,
  GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
  RULE_SAVED_OBJECT_TYPE,
  RULE_TEMPLATE_SAVED_OBJECT_TYPE,
} from './saved_objects';
import type { ConnectorAdapterRegistry } from './connector_adapters/connector_adapter_registry';
import { type IChangeTrackingService } from './rules_client/lib/change_tracking';
import {
  UIAM_LOGS_CREDENTIALS_TAGS,
  UIAM_LOGS_GRANT_TAGS,
  UIAM_LOGS_INVALIDATE_TAGS,
} from './constants';

export interface RulesClientCreateOptions {
  /**
   * When true, clone the request's API key for each newly created rule.
   * The cloned key is independent, non-expiring, and managed by alerting
   * (invalidated on rule delete/update). Only applies to rule creation.
   */
  cloneApiKeysOnCreate?: boolean;
}

export interface RulesClientFactoryOpts {
  logger: Logger;
  taskManager: TaskManagerStartContract;
  ruleTypeRegistry: RuleTypeRegistry;
  securityPluginSetup?: SecurityPluginSetup;
  securityPluginStart?: SecurityPluginStart;
  getSpaceId: (request: KibanaRequest) => string;
  spaceIdToNamespace: SpaceIdToNamespaceFunction;
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  internalSavedObjectsRepository: ISavedObjectsRepository;
  actions: ActionsPluginStartContract;
  eventLog: IEventLogClientService;
  changeTrackingService?: IChangeTrackingService;
  kibanaVersion: PluginInitializerContext['env']['packageInfo']['version'];
  authorization: AlertingAuthorizationClientFactory;
  eventLogger?: IEventLogger;
  minimumScheduleInterval: AlertingRulesConfig['minimumScheduleInterval'];
  maxScheduledPerMinute: AlertingRulesConfig['maxScheduledPerMinute'];
  getAlertIndicesAlias: GetAlertIndicesAlias;
  alertsService: AlertsService | null;
  backfillClient: BackfillClient;
  connectorAdapterRegistry: ConnectorAdapterRegistry;
  uiSettings: CoreStart['uiSettings'];
  securityService: CoreStart['security'];
  shouldGrantUiam: boolean;
  isServerless: boolean;
  featureFlags: CoreStart['featureFlags'];
}

export class RulesClientFactory {
  private isInitialized = false;
  private logger!: Logger;
  private taskManager!: TaskManagerStartContract;
  private ruleTypeRegistry!: RuleTypeRegistry;
  private securityPluginSetup?: SecurityPluginSetup;
  private securityPluginStart?: SecurityPluginStart;
  private getSpaceId!: (request: KibanaRequest) => string;
  private spaceIdToNamespace!: SpaceIdToNamespaceFunction;
  private encryptedSavedObjectsClient!: EncryptedSavedObjectsClient;
  private internalSavedObjectsRepository!: ISavedObjectsRepository;
  private actions!: ActionsPluginStartContract;
  private eventLog!: IEventLogClientService;
  private changeTrackingService?: IChangeTrackingService;
  private kibanaVersion!: PluginInitializerContext['env']['packageInfo']['version'];
  private authorization!: AlertingAuthorizationClientFactory;
  private eventLogger?: IEventLogger;
  private minimumScheduleInterval!: AlertingRulesConfig['minimumScheduleInterval'];
  private maxScheduledPerMinute!: AlertingRulesConfig['maxScheduledPerMinute'];
  private getAlertIndicesAlias!: GetAlertIndicesAlias;
  private alertsService!: AlertsService | null;
  private backfillClient!: BackfillClient;
  private connectorAdapterRegistry!: ConnectorAdapterRegistry;
  private uiSettings!: CoreStart['uiSettings'];
  private securityService!: CoreStart['security'];
  private shouldGrantUiam: boolean = false;
  private isServerless: boolean = false;
  private featureFlags!: CoreStart['featureFlags'];

  public initialize(options: RulesClientFactoryOpts) {
    if (this.isInitialized) {
      throw new Error('RulesClientFactory already initialized');
    }
    this.isInitialized = true;
    this.logger = options.logger;
    this.getSpaceId = options.getSpaceId;
    this.taskManager = options.taskManager;
    this.ruleTypeRegistry = options.ruleTypeRegistry;
    this.securityPluginSetup = options.securityPluginSetup;
    this.securityPluginStart = options.securityPluginStart;
    this.spaceIdToNamespace = options.spaceIdToNamespace;
    this.encryptedSavedObjectsClient = options.encryptedSavedObjectsClient;
    this.internalSavedObjectsRepository = options.internalSavedObjectsRepository;
    this.actions = options.actions;
    this.eventLog = options.eventLog;
    this.changeTrackingService = options.changeTrackingService;
    this.kibanaVersion = options.kibanaVersion;
    this.authorization = options.authorization;
    this.eventLogger = options.eventLogger;
    this.minimumScheduleInterval = options.minimumScheduleInterval;
    this.maxScheduledPerMinute = options.maxScheduledPerMinute;
    this.getAlertIndicesAlias = options.getAlertIndicesAlias;
    this.alertsService = options.alertsService;
    this.backfillClient = options.backfillClient;
    this.connectorAdapterRegistry = options.connectorAdapterRegistry;
    this.uiSettings = options.uiSettings;
    this.securityService = options.securityService;
    this.shouldGrantUiam = options.shouldGrantUiam;
    this.isServerless = options.isServerless;
    this.featureFlags = options.featureFlags;
  }

  /**
   * Creates a RulesClient bound to the space derived from the provided request (default behavior).
   */
  public async create(
    request: KibanaRequest,
    savedObjects: SavedObjectsServiceStart,
    options?: RulesClientCreateOptions
  ): Promise<RulesClient> {
    return await this.createInternal({
      request,
      savedObjects,
      spaceId: this.getSpaceId(request),
      isExplicitSpaceOverride: false,
      options,
    });
  }

  /**
   * Creates a RulesClient bound to an explicit spaceId while preserving the original request
   * (and its auth context). This avoids forging fake requests, which can break auth under UIAM.
   */
  public async createWithSpaceId(
    request: KibanaRequest,
    savedObjects: SavedObjectsServiceStart,
    spaceId: string,
    options?: RulesClientCreateOptions
  ): Promise<RulesClient> {
    return await this.createInternal({
      request,
      savedObjects,
      spaceId,
      isExplicitSpaceOverride: true,
      options,
    });
  }

  /**
   * Attempts to create a UIAM API key when shouldGrantUiam is true and the request has UIAM credentials.
   * Logs errors and returns undefined if grant fails or credentials are missing/invalid.
   */
  private async createUiamApiKey(
    request: KibanaRequest,
    name: string
  ): Promise<GrantAPIKeyResult | undefined> {
    if (!this.shouldGrantUiam) {
      return;
    }
    const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
    if (!authorizationHeader || !isUiamCredential(authorizationHeader)) {
      this.logger.error(
        `Failed to create UIAM API key for alerting rule : ${name}: Invalid or missing UIAM credentials`,
        {
          tags: UIAM_LOGS_CREDENTIALS_TAGS,
        }
      );
      return;
    }
    try {
      const result = await this.securityService.authc.apiKeys.uiam?.grant(request, {
        name: `uiam-${name}`,
      });
      if (!result) {
        this.logger.error(`Failed to create UIAM API key for alerting rule : ${name}`, {
          tags: UIAM_LOGS_GRANT_TAGS,
        });
        return;
      }
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to create UIAM API key for alerting rule : ${name}: ${errorMessage}`,
        {
          tags: UIAM_LOGS_GRANT_TAGS,
          error: { stack_trace: err.stack },
        }
      );
      return;
    }
  }

  /**
   * Invalidates a UIAM API key by id. Logs an error if invalidation fails.
   */
  private async invalidateUiamApiKey(
    request: KibanaRequest,
    ruleName: string,
    id: string
  ): Promise<void> {
    const result = await this.securityService.authc.apiKeys.uiam?.invalidate(request, { id });
    if (result && result.error_count > 0) {
      this.logger.error(
        `Failed to invalidate UIAM API key for alerting rule : ${ruleName}: ${result.error_details
          ?.map((error) => error.reason)
          .join(', ')}  `,
        {
          tags: UIAM_LOGS_INVALIDATE_TAGS,
        }
      );
    }
  }

  /**
   * Synchronously invalidates the rule's ES and/or UIAM API keys, bypassing the pending
   * invalidation queue. Errors are logged but never rethrown so that this cannot break
   * the surrounding rule delete operation.
   *
   * Authentication for both branches is derived from server-side state rather than the
   * caller's request, so the sync path works regardless of how the delete was authenticated:
   * - ES keys are invalidated as the Kibana internal user (matches the queued task path).
   * - UIAM keys are invalidated by forging a request that carries the rule's own UIAM
   *   credential (mirrors {@link invalidateUiamAPIKeys} in @kbn/task-manager-plugin).
   *
   * Mirrors the decode logic of {@link bulkMarkApiKeysForInvalidation}: each input is
   * `base64(id:value)`; for UIAM keys the value is a UIAM credential, for ES keys we
   * only need the id.
   */
  private async invalidateApiKeyNow({
    ruleName,
    apiKey,
    uiamApiKey,
  }: {
    ruleName: string;
    apiKey?: string | null;
    uiamApiKey?: string | null;
  }): Promise<void> {
    const esApiKeyId = apiKey ? decodeApiKeyId(apiKey) : undefined;

    const tasks: Array<Promise<unknown>> = [];

    if (uiamApiKey) {
      const [uiamApiKeyId, uiamApiKeyValue] = Buffer.from(uiamApiKey, 'base64')
        .toString()
        .split(':');

      if (uiamApiKeyId && uiamApiKeyValue && isUiamCredential(uiamApiKeyValue)) {
        tasks.push(
          (async () => {
            try {
              // `uiam.invalidate` requires the request to carry a UIAM credential. Forge
              // one from the rule's own stored UIAM key so this works regardless of how
              // the caller authenticated — mirrors the queued invalidation path in
              // @kbn/task-manager-plugin.
              const fakeRawRequest: FakeRawRequest = {
                headers: { authorization: `ApiKey ${uiamApiKeyValue}` },
                path: '/',
              };
              const fakeRequest = kibanaRequestFactory(fakeRawRequest);
              await this.invalidateUiamApiKey(fakeRequest, ruleName, uiamApiKeyId);
            } catch (err) {
              this.logger.error(
                `Failed to synchronously invalidate UIAM API key for alerting rule : ${ruleName}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                {
                  tags: UIAM_LOGS_INVALIDATE_TAGS,
                  error: { stack_trace: err instanceof Error ? err.stack : undefined },
                }
              );
            }
          })()
        );
      } else {
        this.logger.error(
          `Failed to synchronously invalidate UIAM API key for alerting rule : ${ruleName}: stored credential is not a UIAM API key`,
          { tags: UIAM_LOGS_INVALIDATE_TAGS }
        );
      }
    }

    if (esApiKeyId) {
      tasks.push(
        (async () => {
          try {
            // Use the Kibana internal user so invalidation does not depend on the caller
            // having `manage_api_key` for the rule's API key. Matches the queued task path
            // (`alerts_invalidate_api_keys`), Fleet, entity manager, synthetics, etc.
            const result: InvalidateAPIKeyResult | null =
              await this.securityService.authc.apiKeys.invalidateAsInternalUser({
                ids: [esApiKeyId],
              });
            if (result && result.error_count > 0) {
              this.logger.error(
                `Failed to synchronously invalidate ES API key for alerting rule : ${ruleName}: ${result.error_details
                  ?.map((error) => error.reason)
                  .join(', ')}`
              );
            }
          } catch (err) {
            this.logger.error(
              `Failed to synchronously invalidate ES API key for alerting rule : ${ruleName}: ${
                err instanceof Error ? err.message : String(err)
              }`,
              { error: { stack_trace: err instanceof Error ? err.stack : undefined } }
            );
          }
        })()
      );
    }

    await Promise.all(tasks);
  }

  private async createInternal({
    request,
    savedObjects,
    spaceId,
    isExplicitSpaceOverride,
    options,
  }: {
    request: KibanaRequest;
    savedObjects: SavedObjectsServiceStart;
    spaceId: string;
    isExplicitSpaceOverride: boolean;
    options?: RulesClientCreateOptions;
  }): Promise<RulesClient> {
    const { securityPluginSetup, securityService, securityPluginStart, actions, eventLog } = this;
    const factory = this;

    if (!this.authorization) {
      throw new Error('AlertingAuthorizationClientFactory is not defined');
    }

    const authorization = await this.authorization.createForSpace(request, spaceId);

    const unsecuredSavedObjectsClient = savedObjects
      .getScopedClient(request, {
        excludedExtensions: [SECURITY_EXTENSION_ID],
        includedHiddenTypes: [
          RULE_SAVED_OBJECT_TYPE,
          RULE_TEMPLATE_SAVED_OBJECT_TYPE,
          API_KEY_PENDING_INVALIDATION_TYPE,
          AD_HOC_RUN_SAVED_OBJECT_TYPE,
          GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
        ],
      })
      .asScopedToNamespace(spaceId);

    return new RulesClient({
      spaceId,
      kibanaVersion: this.kibanaVersion,
      logger: this.logger,
      taskManager: this.taskManager,
      ruleTypeRegistry: this.ruleTypeRegistry,
      minimumScheduleInterval: this.minimumScheduleInterval,
      maxScheduledPerMinute: this.maxScheduledPerMinute,
      unsecuredSavedObjectsClient,
      authorization,
      actionsAuthorization: actions.getActionsAuthorizationWithRequest(request),
      namespace: this.spaceIdToNamespace(spaceId),
      internalSavedObjectsRepository: this.internalSavedObjectsRepository,
      encryptedSavedObjectsClient: this.encryptedSavedObjectsClient,
      auditLogger: securityPluginSetup?.audit.asScoped(request),
      changeTrackingService: this.changeTrackingService?.asScoped(request),
      getAlertIndicesAlias: this.getAlertIndicesAlias,
      alertsService: this.alertsService,
      backfillClient: this.backfillClient,
      connectorAdapterRegistry: this.connectorAdapterRegistry,
      uiSettings: this.uiSettings,
      shouldGrantUiam: this.shouldGrantUiam,
      isServerless: this.isServerless,
      featureFlags: this.featureFlags,

      async getUserName() {
        const user = securityService.authc.getCurrentUser(request);
        return user?.username ?? null;
      },
      async createAPIKey(name: string) {
        if (!securityPluginStart) {
          return { apiKeysEnabled: false };
        }
        // Create an API key using the new grant API - in this case the Kibana system user is creating the
        // API key for the user, instead of having the user create it themselves, which requires api_key
        // privileges
        const createUiamApiKeyResult = await factory.createUiamApiKey(request, name);

        let createEsAPIKeyResult;
        try {
          createEsAPIKeyResult = await securityService.authc.apiKeys.grantAsInternalUser(request, {
            name,
            role_descriptors: {},
            metadata: { managed: true, kibana: { type: 'alerting_rule' } },
          });
        } catch (err) {
          // if the ES API key creation failed, we need to invalidate the UIAM API key
          if (createUiamApiKeyResult?.id) {
            await factory.invalidateUiamApiKey(request, name, createUiamApiKeyResult.id);
          }
          // rethrow the error to be handled by the caller
          throw err;
        }

        // if we created a UIAM API key but the ES API key creation failed, we need to invalidate the UIAM API key
        if (!createEsAPIKeyResult) {
          if (createUiamApiKeyResult?.id) {
            await factory.invalidateUiamApiKey(request, name, createUiamApiKeyResult.id);
          }
          return { apiKeysEnabled: false };
        }

        return {
          apiKeysEnabled: true,
          result: createEsAPIKeyResult,
          ...(createUiamApiKeyResult ? { uiamResult: createUiamApiKeyResult } : {}),
        };
      },
      async getActionsClient() {
        if (isExplicitSpaceOverride) {
          return actions.getActionsClientWithRequestInSpace(request, spaceId);
        }
        return actions.getActionsClientWithRequest(request);
      },
      async getEventLogClient() {
        if (isExplicitSpaceOverride) {
          return eventLog.getClientWithRequestInSpace(request, spaceId);
        }
        return eventLog.getClient(request);
      },
      eventLogger: this.eventLogger,
      isAuthenticationTypeAPIKey() {
        if (!securityPluginStart) {
          return false;
        }
        const user = securityService.authc.getCurrentUser(request);
        if (user?.authentication_type) {
          return user.authentication_type === 'api_key';
        }
        const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
        return authorizationHeader?.scheme.toLowerCase() === 'apikey';
      },
      getAuthenticationAPIKey(name: string) {
        const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
        if (authorizationHeader && authorizationHeader.credentials) {
          const [apiKeyId, apiKey] = Buffer.from(authorizationHeader.credentials, 'base64')
            .toString()
            .split(':');

          if (!apiKeyId || !apiKey) {
            throw new Error(
              `Failed to parse API key credentials from authorization header for alerting rule : ${name}`
            );
          }

          if (isUiamCredential(apiKey) && !this.shouldGrantUiam) {
            throw new Error('UIAM API keys should only be used in serverless environments');
          }

          if (isUiamCredential(apiKey)) {
            return {
              apiKeysEnabled: true,
              uiamResult: {
                name: `uiam-${name}`,
                id: apiKeyId,
                api_key: apiKey,
              },
            };
          }

          return {
            apiKeysEnabled: true,
            result: {
              name,
              id: apiKeyId,
              api_key: apiKey,
            },
          };
        }
        return { apiKeysEnabled: false };
      },
      cloneApiKeysOnCreate: options?.cloneApiKeysOnCreate === true,
      async invalidateApiKeyNow(params) {
        await factory.invalidateApiKeyNow(params);
      },
      async cloneAPIKey(name: string) {
        const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
        // UIAM keys can't be cloned (native ES /_security/api_key/clone rejects essu_ keys),
        // so mint a fresh framework-owned UIAM key instead.
        if (authorizationHeader && isUiamCredential(authorizationHeader)) {
          const uiamResult = await factory.createUiamApiKey(request, name);
          if (!uiamResult) {
            throw new Error('Failed to grant UIAM API key for cloned alerting rule');
          }
          return {
            apiKeysEnabled: true,
            uiamResult,
          };
        }
        const cloneResult = await securityService.authc.apiKeys.cloneAsInternalUser(request, {
          name,
          metadata: { managed: true, kibana: { type: 'alerting_rule' } },
        });
        if (!cloneResult) {
          throw new Error('API key clone returned null (security feature may be disabled)');
        }
        return {
          apiKeysEnabled: true,
          result: cloneResult,
        };
      },
      isSystemAction(actionId: string) {
        return actions.isSystemActionConnector(actionId);
      },
    });
  }
}
