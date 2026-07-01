/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CustomRequestHandlerContext, KibanaRequest } from '@kbn/core/server';
import type { AlertingApiRequestHandlerContext } from '@kbn/alerting-plugin/server';
import type { LicensingApiRequestHandlerContext } from '@kbn/licensing-plugin/server';
import type { ActionsApiRequestHandlerContext } from '@kbn/actions-plugin/server';
import type { FleetStartContract } from '@kbn/fleet-plugin/server';
import type {
  CoreStart,
  IBasePath,
  IRouter,
  Logger,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { AlertingServerSetup, AlertingServerStart } from '@kbn/alerting-plugin/server';
import type { SharePluginSetup } from '@kbn/share-plugin/server';
import type { ObservabilityPluginSetup } from '@kbn/observability-plugin/server';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import type { TelemetryPluginSetup, TelemetryPluginStart } from '@kbn/telemetry-plugin/server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { MlPluginSetup as MlSetup } from '@kbn/ml-plugin/server';
import type {
  EncryptedSavedObjectsPluginSetup,
  EncryptedSavedObjectsPluginStart,
} from '@kbn/encrypted-saved-objects-plugin/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { RuleRegistryPluginSetupContract } from '@kbn/rule-registry-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { EmbeddableSetup } from '@kbn/embeddable-plugin/server/plugin';
import type {
  MaintenanceWindowClient,
  MaintenanceWindowsServerStart,
} from '@kbn/maintenance-windows-plugin/server';
import type { ObservabilityAgentBuilderPluginSetup } from '@kbn/observability-agent-builder-plugin/server';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import type { TelemetryEventsSender } from './telemetry/sender';
import type { UptimeConfig } from './config';
import type { SyntheticsEsClient } from './lib';

export interface SyntheticsServerSetup {
  router: UptimeRouter;
  config: UptimeConfig;
  cloud?: CloudSetup;
  spaces?: SpacesPluginStart;
  fleet: FleetStartContract;
  security: SecurityPluginStart;
  savedObjectsClient?: SavedObjectsClientContract;
  authSavedObjectsClient?: SavedObjectsClientContract;
  encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
  share: SharePluginSetup;
  stackVersion: string;
  logger: Logger;
  telemetry: TelemetryEventsSender;
  syntheticsEsClient: SyntheticsEsClient;
  basePath: IBasePath;
  isDev?: boolean;
  coreStart: CoreStart;
  alerting: AlertingServerSetup;
  pluginsStart: SyntheticsPluginsStartDependencies;
  isElasticsearchServerless: boolean;
  getMaintenanceWindowClientInternal: (
    request: KibanaRequest
  ) => MaintenanceWindowClient | undefined;
}

export interface SyntheticsPluginsSetupDependencies {
  features: FeaturesPluginSetup;
  alerting: AlertingServerSetup;
  observability: ObservabilityPluginSetup;
  usageCollection: UsageCollectionSetup;
  ml: MlSetup;
  cloud?: CloudSetup;
  ruleRegistry: RuleRegistryPluginSetupContract;
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
  taskManager: TaskManagerSetupContract;
  telemetry: TelemetryPluginSetup;
  share: SharePluginSetup;
  embeddable: EmbeddableSetup;
  observabilityAgentBuilder?: ObservabilityAgentBuilderPluginSetup;
  agentBuilder?: AgentBuilderPluginSetup;
}

export interface SyntheticsPluginsStartDependencies {
  security: SecurityPluginStart;
  elasticsearch: SecurityPluginStart;
  fleet: FleetStartContract;
  encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
  taskManager: TaskManagerStartContract;
  telemetry: TelemetryPluginStart;
  spaces?: SpacesPluginStart;
  alerting: AlertingServerStart;
  maintenanceWindows?: MaintenanceWindowsServerStart;
}

export type UptimeRequestHandlerContext = CustomRequestHandlerContext<{
  licensing: LicensingApiRequestHandlerContext;
  alerting: AlertingApiRequestHandlerContext;
  actions: ActionsApiRequestHandlerContext;
}>;

/**
 * @internal
 */
export type UptimeRouter = IRouter<UptimeRequestHandlerContext>;
