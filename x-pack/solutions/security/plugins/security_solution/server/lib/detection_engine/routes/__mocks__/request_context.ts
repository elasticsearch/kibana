/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AwaitedProperties } from '@kbn/utility-types';
import type { MockedKeys } from '@kbn/utility-types-jest';
import type { KibanaRequest } from '@kbn/core/server';
import { analyticsServiceMock, coreMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';

import { dataViewsService } from '@kbn/data-views-plugin/server/mocks';

import type { ActionsApiRequestHandlerContext } from '@kbn/actions-plugin/server';
import type { AlertingApiRequestHandlerContext } from '@kbn/alerting-plugin/server';
import { rulesClientMock } from '@kbn/alerting-plugin/server/mocks';

// See: https://github.com/elastic/kibana/issues/117255, the moduleNameMapper creates mocks to avoid memory leaks from kibana core.
// We cannot import from "../../../../../../../../actions/server" directly here or we have a really bad memory issue. We cannot add this to the existing mocks we created, this fix must be here.
import { actionsClientMock } from '@kbn/actions-plugin/server/actions_client/actions_client.mock';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { listMock } from '@kbn/lists-plugin/server/mocks';
import { ruleRegistryMocks } from '@kbn/rule-registry-plugin/server/mocks';

import { siemMock } from '../../../../mocks';
import { createMockConfig } from '../../../../config.mock';
import { detectionEngineHealthClientMock, ruleExecutionLogMock } from '../../rule_monitoring/mocks';
import { requestMock } from './request';
import { internalFrameworkRequest } from '../../../framework';

import type {
  SecuritySolutionApiRequestHandlerContext,
  SecuritySolutionRequestHandlerContext,
} from '../../../../types';

import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import type { EndpointAuthz } from '../../../../../common/endpoint/types/authz';
import { riskEngineDataClientMock } from '../../../entity_analytics/risk_engine/risk_engine_data_client.mock';
import { riskScoreDataClientMock } from '../../../entity_analytics/risk_score/risk_score_data_client.mock';
import { assetCriticalityDataClientMock } from '../../../entity_analytics/asset_criticality/asset_criticality_data_client.mock';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { detectionRulesClientMock } from '../../rule_management/logic/detection_rules_client/__mocks__/detection_rules_client';
import { packageServiceMock } from '@kbn/fleet-plugin/server/services/epm/package_service.mock';
import type { EndpointInternalFleetServicesInterface } from '../../../../endpoint/services/fleet';
import { siemMigrationsServiceMock } from '../../../siem_migrations/__mocks__/mocks';
import { createProductFeaturesServiceMock } from '../../../product_features_service/mocks';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import { padPackageInstallationClientMock } from '../../../entity_analytics/privilege_monitoring/privileged_access_detection/pad_package_installation_client.mock';
import { privilegeMonitorDataClientMock } from '../../../entity_analytics/privilege_monitoring/engine/data_client.mock';
import { getMockRulesAuthz } from '../../rule_management/__mocks__/authz';

export const createMockClients = () => {
  const core = coreMock.createRequestHandlerContext();
  const license = licensingMock.createLicenseMock();

  return {
    core,
    clusterClient: core.elasticsearch.client,
    savedObjectsClient: core.savedObjects.client,

    licensing: {
      ...licensingMock.createRequestHandlerContext({ license }),
      license,
    },
    lists: {
      listClient: listMock.getListClient(),
      exceptionListClient: listMock.getExceptionListClient(core.savedObjects.client),
    },
    rulesClient: rulesClientMock.create(),
    detectionRulesClient: detectionRulesClientMock.create(),
    actionsClient: actionsClientMock.create(),
    ruleDataService: ruleRegistryMocks.createRuleDataService(),

    config: createMockConfig(),
    appClient: siemMock.createClient(),

    detectionEngineHealthClient: detectionEngineHealthClientMock.create(),
    ruleExecutionLog: ruleExecutionLogMock.forRoutes.create(),
    riskEngineDataClient: riskEngineDataClientMock.create(),
    riskScoreDataClient: riskScoreDataClientMock.create(),
    assetCriticalityDataClient: assetCriticalityDataClientMock.create(),
    privilegeMonitorDataClient: privilegeMonitorDataClientMock.create(),
    padPackageInstallationClient: padPackageInstallationClientMock.create(),

    internalFleetServices: {
      packages: packageServiceMock.createClient(),
    },
    siemRuleMigrationsClient: siemMigrationsServiceMock.createRulesClient(),
    siemDashboardMigrationsClient: siemMigrationsServiceMock.createDashboardsClient(),
    getInferenceClient: jest.fn(),
    productFeaturesService: createProductFeaturesServiceMock(),
    logger: loggerMock.create(),
  };
};

export type MockClients = ReturnType<typeof createMockClients>;

export type SecuritySolutionRequestHandlerContextMock = MockedKeys<
  AwaitedProperties<Omit<SecuritySolutionRequestHandlerContext, 'resolve'>>
> & {
  core: MockClients['core'];
};

const createRequestContextMock = (
  clients: MockClients = createMockClients(),
  overrides: {
    endpointAuthz?: Partial<EndpointAuthz>;
    endpointAppServices?: EndpointAppContextService;
  } = {}
): SecuritySolutionRequestHandlerContextMock => {
  return {
    core: clients.core,
    securitySolution: createSecuritySolutionRequestContextMock(clients, overrides),
    actions: {
      getActionsClient: jest.fn(() => clients.actionsClient),
    } as unknown as jest.Mocked<ActionsApiRequestHandlerContext>,
    alerting: {
      getRulesClient: jest.fn().mockResolvedValue(clients.rulesClient),
    } as unknown as jest.Mocked<AlertingApiRequestHandlerContext>,
    licensing: clients.licensing,
    lists: {
      getListClient: jest.fn(() => clients.lists.listClient),
      getExceptionListClient: jest.fn(() => clients.lists.exceptionListClient),
      getExtensionPointClient: jest.fn(),
      getInternalListClient: jest.fn(),
    },
  };
};

const convertRequestContextMock = (
  context: AwaitedProperties<SecuritySolutionRequestHandlerContextMock>
): SecuritySolutionRequestHandlerContext => {
  return coreMock.createCustomRequestHandlerContext(
    context
  ) as unknown as SecuritySolutionRequestHandlerContext;
};

const createSecuritySolutionRequestContextMock = (
  clients: MockClients,
  overrides: {
    endpointAuthz?: Partial<EndpointAuthz>;
    endpointAppServices?: EndpointAppContextService;
  } = {}
): jest.Mocked<SecuritySolutionApiRequestHandlerContext> => {
  const core = clients.core;
  const kibanaRequest = requestMock.create();
  const mockAuditLogger = auditLoggerMock.create();

  return {
    core,
    getAnalytics: jest.fn(() => analyticsServiceMock.createAnalyticsServiceSetup()),
    getServerBasePath: jest.fn(() => ''),
    getEndpointAuthz: jest.fn(async () =>
      getEndpointAuthzInitialStateMock(overrides.endpointAuthz)
    ),
    getCheckOsqueryResponseActionAuthz: jest.fn(() => jest.fn()),
    getEndpointService: jest.fn(() => {
      if (overrides.endpointAppServices) {
        return overrides.endpointAppServices;
      }

      throw new Error(
        `getEndpointService() not mocked. Needs to be done from withing testing context (due to circular dependencies)`
      );
    }),
    getConfig: jest.fn(() => clients.config),
    getFrameworkRequest: jest.fn(() => {
      return {
        ...kibanaRequest.body,
        [internalFrameworkRequest]: kibanaRequest,
        context: { core },
        user: {
          username: 'mockUser',
        },
      };
    }),
    getAppClient: jest.fn(() => clients.appClient),
    getRacClient: jest.fn((req: KibanaRequest) => {
      throw new Error('Not implemented');
    }),
    getSpaceId: jest.fn(() => 'default'),
    getRuleDataService: jest.fn(() => clients.ruleDataService),
    getDetectionRulesClient: jest.fn(() => clients.detectionRulesClient),
    getDetectionEngineHealthClient: jest.fn(() => clients.detectionEngineHealthClient),
    getRuleExecutionLog: jest.fn(() => clients.ruleExecutionLog),
    getExceptionListClient: jest.fn(() => clients.lists.exceptionListClient),
    getInternalFleetServices: jest.fn(
      () => clients.internalFleetServices as unknown as EndpointInternalFleetServicesInterface
    ),
    getRiskEngineDataClient: jest.fn(() => clients.riskEngineDataClient),
    getRiskScoreDataClient: jest.fn(() => clients.riskScoreDataClient),
    getAssetCriticalityDataClient: jest.fn(() => clients.assetCriticalityDataClient),
    getAuditLogger: jest.fn(() => mockAuditLogger),
    getLogger: jest.fn(() => clients.logger),
    getDataViewsService: jest.fn(),
    getInternalDataViewsService: jest.fn(async () => dataViewsService),
    getPrivilegedUserMonitoringApiKeyManager: jest.fn(),
    getEntityStoreUpdateClient: jest.fn(),
    getPrivilegeMonitoringDataClient: jest.fn(() => clients.privilegeMonitorDataClient),
    getPadPackageInstallationClient: jest.fn(() => clients.padPackageInstallationClient),
    getMonitoringEntitySourceDataClient: jest.fn(),
    siemMigrations: {
      getRulesClient: jest.fn(() => clients.siemRuleMigrationsClient),
      getDashboardsClient: jest.fn(() => clients.siemDashboardMigrationsClient),
    },
    getInferenceClient: jest.fn(() => clients.getInferenceClient()),
    getProductFeatureService: jest.fn(() => clients.productFeaturesService),
    getMlAuthz: jest.fn(() => ({
      validateRuleType: jest.fn(async () => ({ valid: true, message: undefined })),
    })),
    getRulesAuthz: jest.fn(() => getMockRulesAuthz()),
  };
};

const createTools = () => {
  const clients = createMockClients();
  const context = createRequestContextMock(clients);

  return { clients, context };
};

export const requestContextMock = {
  create: createRequestContextMock,
  convertContext: convertRequestContextMock,
  createMockClients,
  createTools,
};
