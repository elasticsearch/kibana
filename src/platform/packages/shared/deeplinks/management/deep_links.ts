/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  MONITORING_APP_ID,
  INTEGRATIONS_APP_ID,
  FLEET_APP_ID,
  OSQUERY_APP_ID,
  MANAGEMENT_APP_ID,
  CLOUD_CONNECT_NAV_ID,
  RULES_APP_ID,
} from './constants';

// Monitoring
export type MonitoringAppId = typeof MONITORING_APP_ID;
export type MonitoringDeepLinkId = MonitoringAppId;

// Integrations
export type IntegrationsAppId = typeof INTEGRATIONS_APP_ID;
export type FleetAppId = typeof FLEET_APP_ID;
export type OsQueryAppId = typeof OSQUERY_APP_ID;
export type IntegrationsDeepLinkId = IntegrationsAppId | FleetAppId | OsQueryAppId;

// Management
export type ManagementAppId = typeof MANAGEMENT_APP_ID;
export type RulesAppId = typeof RULES_APP_ID;
export type ManagementId =
  | 'ad_settings'
  | 'aiAssistantManagementSelection'
  | 'analytics'
  | 'anomaly_detection'
  | 'queryActivity'
  | 'evals'
  | 'securityAiAssistantManagement'
  | 'observabilityAiAssistantManagement'
  | 'api_keys'
  | 'application_connections'
  | 'cases'
  | 'cross_cluster_replication'
  | 'dataViews'
  | 'data_quality'
  | 'data_usage'
  | 'episodes'
  | 'content_connectors'
  | 'data_federation'
  | 'filesManagement'
  | 'license_management'
  | 'index_lifecycle_management'
  | 'index_management'
  | 'elastic_inference_service'
  | 'inference_endpoints'
  | 'model_settings'
  | 'ingest_pipelines'
  | 'jobsListLink'
  | 'maintenanceWindows'
  | 'migrate_data'
  | 'objects'
  | 'overview'
  | 'pipelines'
  | 'remote_clusters'
  | 'reporting'
  | 'role_mappings'
  | 'roles'
  | 'rollup_jobs'
  | 'search_sessions'
  | 'settings'
  | 'snapshot_restore'
  | 'spaces'
  | 'supplied_configurations'
  | 'tags'
  | 'trained_models'
  | 'transform'
  | 'action_policies'
  | 'execution_history'
  | 'rules'
  | 'triggersActions'
  | 'triggersActionsAlerts'
  | 'triggersActionsConnectors'
  | 'upgrade_assistant'
  | 'users'
  | 'watcher'
  | 'genAiSettings';

export type ManagementDeepLinkId = MonitoringAppId | `${ManagementAppId}:${ManagementId}`;

export type CloudConnectDeepLinkId = typeof CLOUD_CONNECT_NAV_ID;

// Combined
export type AppId = MonitoringAppId | IntegrationsAppId | ManagementAppId | RulesAppId;
export type LinkId = ManagementId;
export type DeepLinkId =
  | AppId
  | MonitoringDeepLinkId
  | IntegrationsDeepLinkId
  | CloudConnectDeepLinkId
  | ManagementDeepLinkId;
