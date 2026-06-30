/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type {
  PluginSetup as DataPluginSetup,
  PluginStart as DataPluginStart,
} from '@kbn/data-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { UsageCollectionSetup as UsageCollectionPluginSetup } from '@kbn/usage-collection-plugin/server';
import type { AlertingServerSetup, AlertingServerStart } from '@kbn/alerting-plugin/server';
import type {
  PluginSetupContract as ActionsPluginSetup,
  PluginStartContract as ActionsPluginStartContract,
} from '@kbn/actions-plugin/server';
import type { CasesServerStart, CasesServerSetup } from '@kbn/cases-plugin/server';
import type {
  EncryptedSavedObjectsPluginSetup,
  EncryptedSavedObjectsPluginStart,
} from '@kbn/encrypted-saved-objects-plugin/server';
import type { IEventLogClientService, IEventLogService } from '@kbn/event-log-plugin/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { FleetStartContract as FleetPluginStart } from '@kbn/fleet-plugin/server';
import type { LicensingPluginStart, LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import type { ListPluginSetup } from '@kbn/lists-plugin/server';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import type {
  RuleRegistryPluginSetupContract as RuleRegistryPluginSetup,
  RuleRegistryPluginStartContract as RuleRegistryPluginStart,
} from '@kbn/rule-registry-plugin/server';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/server';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type {
  TaskManagerSetupContract as TaskManagerPluginSetup,
  TaskManagerStartContract as TaskManagerPluginStart,
} from '@kbn/task-manager-plugin/server';
import type { TelemetryPluginStart, TelemetryPluginSetup } from '@kbn/telemetry-plugin/server';
import type { OsqueryPluginSetup } from '@kbn/osquery-plugin/server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/server';
import type { PluginSetup as KqlServerPluginSetup } from '@kbn/kql/server';
import type { ElasticAssistantPluginStart } from '@kbn/elastic-assistant-plugin/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { AnonymizationPluginStart } from '@kbn/anonymization-plugin/server';
import type { AgentBuilderPluginSetup, AgentBuilderPluginStart } from '@kbn/agent-builder-server';
// TODO(alerting-v2 migration): the redesigned alerting_v2 plugin no longer exposes a
// server setup contract (`AlertingServerSetup` is internal/void). The security
// row-enricher and pre-query-filter integration is deferred; this local alias keeps
// the optional dependency slot until the platform plugin re-exposes extension points.
type AlertingV2ServerSetup = void;
import type { LlmTasksPluginStart } from '@kbn/llm-tasks-plugin/server';
import type {
  WorkflowsServerPluginSetup,
  WorkflowsServerPluginStart,
} from '@kbn/workflows-management-plugin/server';
import type {
  WorkflowsExtensionsServerPluginSetup,
  WorkflowsExtensionsServerPluginStart,
} from '@kbn/workflows-extensions/server';
import type { EntityStoreSetupContract, EntityStoreStartContract } from '@kbn/entity-store/server';
import type { SearchInferenceEndpointsPluginSetup } from '@kbn/search-inference-endpoints/server';
import type { ProductFeaturesService } from './lib/product_features_service/product_features_service';
import type { ExperimentalFeatures } from '../common';

export interface SecuritySolutionPluginSetupDependencies {
  alerting: AlertingServerSetup;
  actions: ActionsPluginSetup;
  cases: CasesServerSetup;
  cloud: CloudSetup;
  data: DataPluginSetup;
  encryptedSavedObjects?: EncryptedSavedObjectsPluginSetup;
  eventLog: IEventLogService;
  features: FeaturesPluginSetup;
  lists?: ListPluginSetup;
  ml?: MlPluginSetup;
  ruleRegistry: RuleRegistryPluginSetup;
  security?: SecurityPluginSetup;
  spaces?: SpacesPluginSetup;
  taskManager?: TaskManagerPluginSetup;
  telemetry?: TelemetryPluginSetup;
  usageCollection?: UsageCollectionPluginSetup;
  licensing: LicensingPluginSetup;
  osquery: OsqueryPluginSetup;
  kql: KqlServerPluginSetup;
  share?: SharePluginSetup;
  agentBuilder?: AgentBuilderPluginSetup;
  workflowsManagement?: WorkflowsServerPluginSetup;
  workflowsExtensions?: WorkflowsExtensionsServerPluginSetup;
  entityStore?: EntityStoreSetupContract;
  searchInferenceEndpoints?: SearchInferenceEndpointsPluginSetup;
  alertingVTwo?: AlertingV2ServerSetup;
}

export interface SecuritySolutionPluginStartDependencies {
  alerting: AlertingServerStart;
  cases?: CasesServerStart;
  cloud: CloudSetup;
  data: DataPluginStart;
  dataViews: DataViewsPluginStart;
  encryptedSavedObjects?: EncryptedSavedObjectsPluginStart;
  entityStore: EntityStoreStartContract;
  elasticAssistant: ElasticAssistantPluginStart;
  eventLog: IEventLogClientService;
  fleet?: FleetPluginStart;
  licensing: LicensingPluginStart;
  ruleRegistry: RuleRegistryPluginStart;
  security: SecurityPluginStart;
  spaces?: SpacesPluginStart;
  taskManager?: TaskManagerPluginStart;
  telemetry: TelemetryPluginStart;
  share: SharePluginStart;
  actions: ActionsPluginStartContract;
  inference: InferenceServerStart;
  anonymization: AnonymizationPluginStart;
  llmTasks?: LlmTasksPluginStart;
  agentBuilder?: AgentBuilderPluginStart;
  workflowsManagement?: WorkflowsServerPluginStart;
  workflowsExtensions?: WorkflowsExtensionsServerPluginStart;
}

export interface SecuritySolutionPluginSetup {
  /**
   * Sets the configurations for app features that are available to the Security Solution
   */
  setProductFeaturesConfigurator: ProductFeaturesService['setProductFeaturesConfigurator'];
  /**
   * The security solution generic experimental features
   */
  experimentalFeatures: ExperimentalFeatures;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SecuritySolutionPluginStart {}

export type SecuritySolutionPluginCoreSetupDependencies = CoreSetup<
  SecuritySolutionPluginStartDependencies,
  SecuritySolutionPluginStart
>;

export type SecuritySolutionPluginCoreStartDependencies = CoreStart;

export type ISecuritySolutionPlugin = Plugin<
  SecuritySolutionPluginSetup,
  SecuritySolutionPluginStart,
  SecuritySolutionPluginSetupDependencies,
  SecuritySolutionPluginStartDependencies
>;

export type {
  PluginInitializerContext,
  // Legacy type identifiers left for compatibility with the rest of the code:
  SecuritySolutionPluginSetupDependencies as SetupPlugins,
  SecuritySolutionPluginStartDependencies as StartPlugins,
  SecuritySolutionPluginSetup as PluginSetup,
  SecuritySolutionPluginStart as PluginStart,
};
