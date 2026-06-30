/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PluginSetup, PluginStart } from '@kbn/core-di';
import { CoreStart, Request, SavedObjectsClientFactory } from '@kbn/core-di-server';
import type { ContainerModuleLoadOptions } from 'inversify';
import { MAINTENANCE_WINDOW_SAVED_OBJECT_TYPE } from '@kbn/maintenance-windows-plugin/common';
import { AlertActionsClient } from '../lib/alert_actions_client';
import { DirectorService } from '../lib/director/director';
import { BasicTransitionStrategy } from '../lib/director/strategies/basic_strategy';
import { CountTimeframeStrategy } from '../lib/director/strategies/count_timeframe_strategy';
import { TransitionStrategyFactory } from '../lib/director/strategies/strategy_resolver';
import { TransitionStrategyToken } from '../lib/director/strategies/types';
import { DispatcherService } from '../lib/dispatcher/dispatcher';
import { DispatcherServiceInternalToken } from '../lib/dispatcher/tokens';
import { ActionPolicyClient } from '../lib/action_policy_client';
import { ActionPolicyNamespaceToken } from '../lib/action_policy_client/tokens';
import { ActionPolicyExecutionHistoryClient } from '../lib/action_policy_execution_history_client';
import {
  ExecutionHistoryClient,
  ExecutionHistoryClientToken,
} from '../lib/execution_history_client';
import { RulesClient } from '../lib/rules_client';
import { RequestSpaceIdToken } from '../lib/services/spaces_service/tokens';
import { ApiKeyService } from '../lib/services/api_key_service/api_key_service';
import {
  EsServiceInternalToken,
  EsServiceScopedToken,
  EsServiceScopedSpaceRoutingToken,
} from '../lib/services/es_service/tokens';
import { EventLogService } from '../lib/services/event_log_service/event_log_service';
import { EventLogServiceToken } from '../lib/services/event_log_service/tokens';
import { LoggerService, LoggerServiceToken } from '../lib/services/logger_service/logger_service';
import { SettingsService } from '../lib/services/settings_service/settings_service';
import {
  SettingsServiceToken,
  UiSettingsClientToken,
} from '../lib/services/settings_service/tokens';
import { MaintenanceWindowService } from '../lib/services/maintenance_window_service/maintenance_window_service';
import {
  MaintenanceWindowSavedObjectsClientToken,
  MaintenanceWindowServiceInternalToken,
} from '../lib/services/maintenance_window_service/tokens';
import { ActionPolicySavedObjectService } from '../lib/services/action_policy_saved_object_service/action_policy_saved_object_service';
import {
  ActionPolicySavedObjectsClientToken,
  ActionPolicySavedObjectServiceInternalToken,
  ActionPolicySavedObjectServiceScopedToken,
} from '../lib/services/action_policy_saved_object_service/tokens';
import { QueryService } from '../lib/services/query_service/query_service';
import {
  QueryServiceInternalToken,
  QueryServiceScopedToken,
  QueryServiceScopedSpaceRoutingToken,
} from '../lib/services/query_service/tokens';
import { ResourceManager } from '../lib/services/resource_service/resource_manager';
import { AlertingRetryService } from '../lib/services/retry_service';
import { RetryServiceToken } from '../lib/services/retry_service/tokens';
import { RulesSavedObjectService } from '../lib/services/rules_saved_object_service/rules_saved_object_service';
import {
  RuleSavedObjectsClientToken,
  RulesSavedObjectServiceInternalToken,
  RulesSavedObjectServiceScopedToken,
} from '../lib/services/rules_saved_object_service/tokens';
import { StorageService } from '../lib/services/storage_service/storage_service';
import {
  StorageServiceInternalToken,
  StorageServiceScopedToken,
} from '../lib/services/storage_service/tokens';
import {
  createTaskRunnerFactory,
  TaskRunnerFactoryToken,
} from '../lib/services/task_run_scope_service/create_task_runner';
import { UserService } from '../lib/services/user_service/user_service';
import { WorkflowService } from '../lib/services/workflow_service/workflow_service';
import { WorkflowServiceToken } from '../lib/services/workflow_service/tokens';
import { ApiKeyServiceSavedObjectsClientToken } from '../lib/services/api_key_service/tokens';
import {
  API_KEY_PENDING_INVALIDATION_TYPE,
  ACTION_POLICY_SAVED_OBJECT_TYPE,
  RULE_SAVED_OBJECT_TYPE,
} from '../saved_objects';
import {
  EncryptedSavedObjectsClientToken,
  WorkflowsManagementApiToken,
} from '../lib/dispatcher/steps/dispatch_step_tokens';
import { MatcherSuggestionsService } from '../lib/services/matcher_suggestions_service/matcher_suggestions_service';
import type { AlertingServerSetupDependencies, AlertingServerStartDependencies } from '../types';

export function bindServices({ bind }: ContainerModuleLoadOptions) {
  bind(AlertActionsClient).toSelf().inRequestScope();
  bind(RulesClient).toSelf().inRequestScope();
  bind(RequestSpaceIdToken)
    .toDynamicValue(({ get }) => {
      const request = get(Request);
      const spaces = get(PluginStart<AlertingServerStartDependencies['spaces']>('spaces'));
      return spaces.spacesService.getSpaceId(request);
    })
    .inRequestScope();
  bind(ActionPolicyNamespaceToken)
    .toDynamicValue(({ get }) => {
      const request = get(Request);
      const spaces = get(PluginStart<AlertingServerStartDependencies['spaces']>('spaces'));
      const spaceId = spaces.spacesService.getSpaceId(request);
      return spaces.spacesService.spaceIdToNamespace(spaceId);
    })
    .inRequestScope();
  bind(ActionPolicyClient).toSelf().inRequestScope();
  bind(ActionPolicyExecutionHistoryClient).toSelf().inRequestScope();
  bind(ExecutionHistoryClient).toSelf().inRequestScope();
  bind(ExecutionHistoryClientToken).toService(ExecutionHistoryClient);
  bind(UserService).toSelf().inRequestScope();
  bind(ApiKeyService).toSelf().inRequestScope();
  bind(AlertingRetryService).toSelf().inSingletonScope();
  bind(RetryServiceToken).toService(AlertingRetryService);

  bind(LoggerService).toSelf().inSingletonScope();
  bind(LoggerServiceToken).toService(LoggerService);

  bind(UiSettingsClientToken)
    .toDynamicValue(({ get }) => {
      const savedObjects = get(CoreStart('savedObjects'));
      const uiSettings = get(CoreStart('uiSettings'));
      const internalSoClient = savedObjects.createInternalRepository();
      return uiSettings.globalAsScopedToClient(internalSoClient);
    })
    .inSingletonScope();
  bind(SettingsService).toSelf().inSingletonScope();
  bind(SettingsServiceToken).toService(SettingsService);

  bind(EventLogService).toSelf().inSingletonScope();
  bind(EventLogServiceToken).toService(EventLogService);
  bind(WorkflowService).toSelf().inSingletonScope();
  bind(WorkflowServiceToken).toService(WorkflowService);
  bind(ResourceManager).toSelf().inSingletonScope();

  bind(EsServiceInternalToken)
    .toDynamicValue(({ get }) => {
      const elasticsearch = get(CoreStart('elasticsearch'));
      return elasticsearch.client.asInternalUser;
    })
    .inSingletonScope();

  bind(EsServiceScopedToken)
    .toDynamicValue(({ get }) => {
      const request = get(Request);
      const elasticsearch = get(CoreStart('elasticsearch'));
      return elasticsearch.client.asScoped(request).asCurrentUser;
    })
    .inRequestScope();

  bind(EsServiceScopedSpaceRoutingToken)
    .toDynamicValue(({ get }) => {
      const request = get(Request);
      const elasticsearch = get(CoreStart('elasticsearch'));
      // `projectRouting: 'space'` scopes rule-execution queries to the originating space/project
      // when CPS is enabled, matching alerting v1 behavior. Only `asCurrentUser` honors the option.
      return elasticsearch.client.asScoped(request, { projectRouting: 'space' }).asCurrentUser;
    })
    .inRequestScope();

  bind(TaskRunnerFactoryToken).toFactory((context) =>
    createTaskRunnerFactory({
      getInjection: () => context.get(CoreStart('injection')),
    })
  );

  bind(RuleSavedObjectsClientToken)
    .toResolvedValue(
      (savedObjectsClientFactory) =>
        savedObjectsClientFactory({ includedHiddenTypes: [RULE_SAVED_OBJECT_TYPE] }),
      [SavedObjectsClientFactory]
    )
    .inRequestScope();

  bind(RulesSavedObjectService).toSelf().inRequestScope();
  bind(RulesSavedObjectServiceScopedToken).toService(RulesSavedObjectService);
  bind(RulesSavedObjectServiceInternalToken)
    .toDynamicValue(({ get }) => {
      const savedObjects = get(CoreStart('savedObjects'));
      const spaces = get(PluginStart<AlertingServerStartDependencies['spaces']>('spaces'));
      const internalClient = savedObjects.createInternalRepository([RULE_SAVED_OBJECT_TYPE]);
      return new RulesSavedObjectService(internalClient, spaces);
    })
    .inSingletonScope();

  bind(MaintenanceWindowSavedObjectsClientToken)
    .toDynamicValue(({ get }) => {
      const savedObjects = get(CoreStart('savedObjects'));
      return savedObjects.createInternalRepository([MAINTENANCE_WINDOW_SAVED_OBJECT_TYPE]);
    })
    .inSingletonScope();

  bind(MaintenanceWindowServiceInternalToken)
    .toDynamicValue(({ get }) => {
      const client = get(MaintenanceWindowSavedObjectsClientToken);
      const logger = get(LoggerServiceToken);
      return new MaintenanceWindowService(client, logger);
    })
    .inSingletonScope();

  bind(EncryptedSavedObjectsClientToken)
    .toDynamicValue(({ get }) => {
      const eso = get(
        PluginStart<AlertingServerStartDependencies['encryptedSavedObjects']>(
          'encryptedSavedObjects'
        )
      );
      return eso.getClient({ includedHiddenTypes: [ACTION_POLICY_SAVED_OBJECT_TYPE] });
    })
    .inSingletonScope();

  bind(ActionPolicySavedObjectsClientToken)
    .toResolvedValue(
      (savedObjectsClientFactory) =>
        savedObjectsClientFactory({
          includedHiddenTypes: [ACTION_POLICY_SAVED_OBJECT_TYPE],
        }),
      [SavedObjectsClientFactory]
    )
    .inRequestScope();

  bind(ActionPolicySavedObjectService).toSelf().inRequestScope();
  bind(ActionPolicySavedObjectServiceScopedToken).toService(ActionPolicySavedObjectService);
  bind(ActionPolicySavedObjectServiceInternalToken)
    .toDynamicValue(({ get }) => {
      const savedObjects = get(CoreStart('savedObjects'));
      const spaces = get(PluginStart<AlertingServerStartDependencies['spaces']>('spaces'));
      const internalClient = savedObjects.createInternalRepository([
        ACTION_POLICY_SAVED_OBJECT_TYPE,
      ]);
      const esoClient = get(EncryptedSavedObjectsClientToken);
      return new ActionPolicySavedObjectService(internalClient, spaces, esoClient);
    })
    .inSingletonScope();

  bind(ApiKeyServiceSavedObjectsClientToken)
    .toDynamicValue(({ get }) => {
      const savedObjects = get(CoreStart('savedObjects'));
      return savedObjects.createInternalRepository([API_KEY_PENDING_INVALIDATION_TYPE]);
    })
    .inSingletonScope();

  bind(QueryServiceScopedToken)
    .toDynamicValue(({ get }) => {
      const loggerService = get(LoggerServiceToken);
      const esClient = get(EsServiceScopedToken);
      return new QueryService(esClient, loggerService);
    })
    .inRequestScope();

  bind(QueryServiceScopedSpaceRoutingToken)
    .toDynamicValue(({ get }) => {
      const loggerService = get(LoggerServiceToken);
      // Rule-execution queries run against user data and must respect the space project routing.
      const esClient = get(EsServiceScopedSpaceRoutingToken);
      return new QueryService(esClient, loggerService);
    })
    .inRequestScope();

  bind(QueryServiceInternalToken)
    .toDynamicValue(({ get }) => {
      const loggerService = get(LoggerServiceToken);
      const esClient = get(EsServiceInternalToken);
      return new QueryService(esClient, loggerService);
    })
    .inSingletonScope();

  bind(StorageServiceScopedToken)
    .toDynamicValue(({ get }) => {
      const loggerService = get(LoggerServiceToken);
      const esClient = get(EsServiceScopedToken);
      return new StorageService(esClient, loggerService);
    })
    .inRequestScope();

  bind(StorageServiceInternalToken)
    .toDynamicValue(({ get }) => {
      const loggerService = get(LoggerServiceToken);
      const esClient = get(EsServiceInternalToken);
      return new StorageService(esClient, loggerService);
    })
    .inSingletonScope();

  bind(WorkflowsManagementApiToken)
    .toDynamicValue(({ get }) => {
      const wfm = get(
        PluginSetup<AlertingServerSetupDependencies['workflowsManagement']>('workflowsManagement')
      );
      return wfm.management;
    })
    .inSingletonScope();

  bind(MatcherSuggestionsService).toSelf().inRequestScope();

  bind(DispatcherService).toSelf().inSingletonScope();
  bind(DispatcherServiceInternalToken).toService(DispatcherService);

  bind(DirectorService).toSelf().inSingletonScope();
  bind(TransitionStrategyFactory).toSelf().inSingletonScope();

  bind(TransitionStrategyToken).to(CountTimeframeStrategy).inSingletonScope();
  bind(TransitionStrategyToken).to(BasicTransitionStrategy).inSingletonScope();
}
