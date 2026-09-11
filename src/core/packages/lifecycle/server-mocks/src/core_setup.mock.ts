/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContext } from '@kbn/core-http-request-handler-context-server';
import type { CoreSetup, StartServicesAccessor } from '@kbn/core-lifecycle-server';
import type { MockedKeys } from '@kbn/utility-types-jest';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { httpServiceMock } from '@kbn/core-http-server-mocks';
import { httpResourcesMock } from '@kbn/core-http-resources-server-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { analyticsServiceMock } from '@kbn/core-analytics-server-mocks';
import { capabilitiesServiceMock } from '@kbn/core-capabilities-server-mocks';
import { docLinksServiceMock } from '@kbn/core-doc-links-server-mocks';
import { i18nServiceMock } from '@kbn/core-i18n-server-mocks';
import { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
import { statusServiceMock } from '@kbn/core-status-server-mocks';
import { loggingServiceMock } from '@kbn/core-logging-server-mocks';
import { metricsServiceMock } from '@kbn/core-metrics-server-mocks';
import { deprecationsServiceMock } from '@kbn/core-deprecations-server-mocks';
import { userActivityServiceMock } from '@kbn/core-user-activity-server-mocks';
import { executionContextServiceMock } from '@kbn/core-execution-context-server-mocks';
import { coreUsageDataServiceMock } from '@kbn/core-usage-data-server-mocks';
import { customBrandingServiceMock } from '@kbn/core-custom-branding-server-mocks';
import { userSettingsServiceMock } from '@kbn/core-user-settings-server-mocks';
import { securityServiceMock } from '@kbn/core-security-server-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-server-mocks';
import { createCoreStartMock } from './core_start.mock';
import { coreFeatureFlagsMock } from '@kbn/core-feature-flags-server-mocks';
import { pricingServiceMock } from '@kbn/core-pricing-server-mocks';
import { injectionServiceMock } from '@kbn/core-di-mocks';
import { dataStreamServiceMock } from '@kbn/core-data-streams-server-mocks';
import { userStorageServiceMock } from '@kbn/core-user-storage-server-mocks';
import { lazyObject } from '@kbn/lazy-object';

type CoreSetupMockType = MockedKeys<CoreSetup> & {
  elasticsearch: ReturnType<typeof elasticsearchServiceMock.createSetup>;
  getStartServices: jest.MockedFunction<StartServicesAccessor<any, any>>;
};

export function createCoreSetupMock({
  pluginStartDeps = {},
  pluginStartContract,
}: {
  pluginStartDeps?: object;
  pluginStartContract?: any;
} = {}) {
  const httpMock: jest.Mocked<CoreSetup['http']> = lazyObject({
    ...httpServiceMock.createSetupContract<RequestHandlerContext>(),
    resources: httpResourcesMock.createRegistrar(),
  });

  const uiSettingsMock = lazyObject({
    register: uiSettingsServiceMock.createSetupContract().register,
    registerGlobal: uiSettingsServiceMock.createSetupContract().registerGlobal,
    setAllowlist: uiSettingsServiceMock.createSetupContract().setAllowlist,
  });

  const mock: CoreSetupMockType = lazyObject({
    analytics: analyticsServiceMock.createAnalyticsServiceSetup(),
    capabilities: capabilitiesServiceMock.createSetupContract(),
    customBranding: customBrandingServiceMock.createSetupContract(),
    userSettings: userSettingsServiceMock.createSetupContract(),
    docLinks: docLinksServiceMock.createSetupContract(),
    elasticsearch: elasticsearchServiceMock.createSetup(),
    featureFlags: coreFeatureFlagsMock.createSetup(),
    http: httpMock,
    i18n: i18nServiceMock.createSetupContract(),
    savedObjects: savedObjectsServiceMock.createInternalSetupContract(),
    status: statusServiceMock.createSetupContract(),
    uiSettings: uiSettingsMock,
    logging: loggingServiceMock.createSetupContract(),
    metrics: metricsServiceMock.createSetupContract(),
    deprecations: deprecationsServiceMock.createSetupContract(),
    userActivity: userActivityServiceMock.createInternalSetupContract(),
    executionContext: executionContextServiceMock.createInternalSetupContract(),
    security: securityServiceMock.createSetup(),
    userProfile: userProfileServiceMock.createSetup(),
    coreUsageData: lazyObject({
      registerUsageCounter: coreUsageDataServiceMock.createSetupContract().registerUsageCounter,
      registerDeprecatedUsageFetch:
        coreUsageDataServiceMock.createSetupContract().registerDeprecatedUsageFetch,
    }),
    plugins: lazyObject({
      onSetup: jest.fn(),
      onStart: jest.fn(),
      loadPluginContract: jest.fn(),
      lazyInit: lazyObject({
        trigger: jest.fn(),
        getStatus: jest.fn(),
        status$: jest.fn(),
        onLazyStartService: jest.fn(),
      }),
    }),
    pricing: pricingServiceMock.createSetupContract(),
    injection: injectionServiceMock.createSetupContract(),
    dataStreams: dataStreamServiceMock.createSetupContract(),
    userStorage: userStorageServiceMock.createSetupContract(),
    getStartServices: jest
      .fn<Promise<[ReturnType<typeof createCoreStartMock>, object, any]>, []>()
      .mockResolvedValue([createCoreStartMock(), pluginStartDeps, pluginStartContract]),
    createRequestHandlerContext: jest.fn(),
  });

  return mock;
}
