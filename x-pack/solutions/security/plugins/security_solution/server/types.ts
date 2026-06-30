/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AnalyticsServiceSetup,
  CoreRequestHandlerContext,
  CustomRequestHandlerContext,
  IRouter,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import type { ActionsApiRequestHandlerContext } from '@kbn/actions-plugin/server';
import type { AlertingApiRequestHandlerContext } from '@kbn/alerting-plugin/server';
import type { FleetRequestHandlerContext } from '@kbn/fleet-plugin/server';
import type { LicensingApiRequestHandlerContext } from '@kbn/licensing-plugin/server';
import type { ExceptionListClient, ListsApiRequestHandlerContext } from '@kbn/lists-plugin/server';
import type { AlertsClient, IRuleDataService } from '@kbn/rule-registry-plugin/server';
import type { EntityStoreCRUDClient as EntityStoreUpdateClient } from '@kbn/entity-store/server';

import type { Readable } from 'stream';
import type { AuditLogger } from '@kbn/security-plugin-types-server';
import type { InferenceClient } from '@kbn/inference-common';
import type { DataViewsService } from '@kbn/data-views-plugin/common';
import type { PadPackageInstallationClient } from './lib/entity_analytics/privilege_monitoring/privileged_access_detection/pad_package_installation_client';
import type { EndpointAppContextService } from './endpoint/endpoint_app_context_services';
import type { Immutable } from '../common/endpoint/types';
import { AppClient } from './client';
import type { ConfigType } from './config';
import type {
  IDetectionEngineHealthClient,
  IRuleExecutionLogForRoutes,
} from './lib/detection_engine/rule_monitoring';
import type { IRuleExecutionLogV2ForRoutes } from './lib/detection_engine/rule_monitoring/logic/rule_execution_log/client_for_routes/v2_client';
import type { FrameworkRequest } from './lib/framework';
import type { EndpointAuthz } from '../common/endpoint/types/authz';
import type { EndpointInternalFleetServicesInterface } from './endpoint/services/fleet';
import type { RiskEngineDataClient } from './lib/entity_analytics/risk_engine/risk_engine_data_client';
import type { RiskScoreDataClient } from './lib/entity_analytics/risk_score/risk_score_data_client';
import type { AssetCriticalityDataClient } from './lib/entity_analytics/asset_criticality';
import type { IDetectionRulesClient } from './lib/detection_engine/rule_management/logic/detection_rules_client/detection_rules_client_interface';
import type { EntityStoreDataClient } from './lib/entity_analytics/entity_store/entity_store_data_client';
import type { PrivilegeMonitoringDataClient } from './lib/entity_analytics/privilege_monitoring/engine/data_client';
import type { ApiKeyManager as EntityStoreApiKeyManager } from './lib/entity_analytics/entity_store/auth/api_key';
import type { ApiKeyManager as PrivilegedUsersApiKeyManager } from './lib/entity_analytics/privilege_monitoring/auth/api_key';
import type { ProductFeaturesService } from './lib/product_features_service';
import type { MonitoringEntitySourceDataClient } from './lib/entity_analytics/privilege_monitoring/data_sources/monitoring_entity_source_data_client';
import type { MlAuthz } from './lib/machine_learning/authz';
import type { SiemMigrationClients } from './lib/siem_migrations/types';
import type { EntityStoreCrudClient } from './lib/entity_analytics/entity_store/entity_store_crud_client';
import type { CheckOsqueryResponseActionAuthz } from './endpoint/services/actions/utils/rule_response_actions_validators';
import type { DetectionRulesAuthz } from '../common/detection_engine/rule_management/authz';

export { AppClient };

export interface SecuritySolutionApiRequestHandlerContext {
  core: CoreRequestHandlerContext;
  getAnalytics: () => AnalyticsServiceSetup;
  getServerBasePath: () => string;
  getEndpointAuthz: () => Promise<Immutable<EndpointAuthz>>;
  getEndpointService: () => EndpointAppContextService;
  getCheckOsqueryResponseActionAuthz: () => CheckOsqueryResponseActionAuthz;
  getConfig: () => ConfigType;
  getFrameworkRequest: () => FrameworkRequest;
  getAppClient: () => AppClient;
  getSpaceId: () => string;
  getRuleDataService: () => IRuleDataService;
  getDetectionRulesClient: () => IDetectionRulesClient;
  getDetectionEngineHealthClient: () => IDetectionEngineHealthClient;
  getRuleExecutionLog: () => IRuleExecutionLogForRoutes;
  getRuleExecutionLogV2: () => IRuleExecutionLogV2ForRoutes;
  getRacClient: (req: KibanaRequest) => Promise<AlertsClient>;
  getAuditLogger: () => AuditLogger | undefined;
  getLogger: () => Logger;
  getDataViewsService: () => DataViewsService;
  getInternalDataViewsService: () => Promise<DataViewsService>;
  getEntityStoreApiKeyManager: () => EntityStoreApiKeyManager;
  getExceptionListClient: () => ExceptionListClient | null;
  getInternalFleetServices: () => EndpointInternalFleetServicesInterface;
  getRiskEngineDataClient: () => RiskEngineDataClient;
  getRiskScoreDataClient: () => RiskScoreDataClient;
  getAssetCriticalityDataClient: () => AssetCriticalityDataClient;
  getEntityStoreDataClient: () => EntityStoreDataClient;
  getEntityStoreCrudClient: () => EntityStoreCrudClient;
  getEntityStoreUpdateClient: () => EntityStoreUpdateClient;
  getPrivilegeMonitoringDataClient: () => PrivilegeMonitoringDataClient;
  getMonitoringEntitySourceDataClient: () => MonitoringEntitySourceDataClient;
  getPrivilegedUserMonitoringApiKeyManager: () => PrivilegedUsersApiKeyManager;
  getPadPackageInstallationClient: () => PadPackageInstallationClient;
  siemMigrations: SiemMigrationClients;
  getInferenceClient: () => InferenceClient;
  getProductFeatureService: () => ProductFeaturesService;
  getMlAuthz: () => MlAuthz;
  getRulesAuthz: () => DetectionRulesAuthz;
}

export type SecuritySolutionRequestHandlerContext = CustomRequestHandlerContext<{
  securitySolution: SecuritySolutionApiRequestHandlerContext;
  actions: ActionsApiRequestHandlerContext;
  alerting: AlertingApiRequestHandlerContext;
  licensing: LicensingApiRequestHandlerContext;
  lists?: ListsApiRequestHandlerContext;
  fleet?: FleetRequestHandlerContext['fleet'];
}>;

export type SecuritySolutionPluginRouter = IRouter<SecuritySolutionRequestHandlerContext>;

/**
 * Readable returned by Hapi when `stream` is used to defined a property and/or route payload
 */
export interface HapiReadableStream extends Readable {
  hapi: {
    filename: string;
    headers: Record<string, string>;
  };
}
