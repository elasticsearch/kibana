/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { ElasticsearchServiceStart } from '@kbn/core-elasticsearch-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import type { SecurityServiceStart } from '@kbn/core-security-server';
import type { FeatureFlagsStart } from '@kbn/core-feature-flags-server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import type { DataStreamsStart } from '@kbn/core-data-streams-server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import type { HooksServiceSetup, HooksServiceStart } from '@kbn/agent-builder-server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { UsageApiSetup } from '@kbn/usage-api-plugin/server';
import type { AgentExecutionService } from '@kbn/agent-builder-server/execution';
import type { ToolsServiceSetup, ToolsServiceStart } from './tools';
import type { RunnerFactory } from './execution/runner';
import type { AgentsServiceSetup, AgentsServiceStart } from './agents';
import type { ConversationService } from './conversation';
import type { AttachmentServiceSetup, AttachmentServiceStart } from './attachments';
import type { RendererServiceSetup, RendererServiceStart } from './renderers';
import type { SkillServiceSetup, SkillServiceStart } from './skills';
import type { TrackingService } from '../telemetry/tracking_service';
import type { AnalyticsService } from '../telemetry';
import type { AuditLogService } from '../audit';
import type { TaskHandler } from './execution';
import type { MeteringService, ConsumptionServiceStart } from './metering';
import type { PluginsServiceSetup, PluginsServiceStart } from './plugins';

export interface InternalSetupServices {
  tools: ToolsServiceSetup;
  agents: AgentsServiceSetup;
  attachments: AttachmentServiceSetup;
  renderers: RendererServiceSetup;
  hooks: HooksServiceSetup;
  skills: SkillServiceSetup;
  plugins: PluginsServiceSetup;
  metering: MeteringService;
}

export interface InternalStartServices {
  tools: ToolsServiceStart;
  agents: AgentsServiceStart;
  attachments: AttachmentServiceStart;
  renderers: RendererServiceStart;
  skills: SkillServiceStart;
  conversations: ConversationService;
  runnerFactory: RunnerFactory;
  hooks: HooksServiceStart;
  auditLogService: AuditLogService;
  spaces?: SpacesPluginStart;
  featureFlags: FeatureFlagsStart;
  uiSettings: UiSettingsServiceStart;
  savedObjects: SavedObjectsServiceStart;
  execution: AgentExecutionService;
  taskHandler: TaskHandler;
  plugins: PluginsServiceStart;
  consumption: ConsumptionServiceStart;
}

export interface ServiceSetupDeps {
  logger: Logger;
  workflowsManagement?: WorkflowsServerPluginSetup;
  trackingService?: TrackingService;
  cloud?: CloudSetup;
  usageApi?: UsageApiSetup;
}

export interface ServicesStartDeps {
  // core services
  logger: Logger;
  elasticsearch: ElasticsearchServiceStart;
  security: SecurityServiceStart;
  uiSettings: UiSettingsServiceStart;
  savedObjects: SavedObjectsServiceStart;
  featureFlags: FeatureFlagsStart;
  dataStreams: DataStreamsStart;
  // plugin deps
  inference: InferenceServerStart;
  spaces?: SpacesPluginStart;
  actions: ActionsPluginStart;
  taskManager: TaskManagerStartContract;
  securityPlugin?: SecurityPluginStart;
  trackingService?: TrackingService;
  analyticsService?: AnalyticsService;
  searchInferenceEndpoints: SearchInferenceEndpointsPluginStart;
}
