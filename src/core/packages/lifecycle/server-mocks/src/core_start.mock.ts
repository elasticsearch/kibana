/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart } from '@kbn/core-lifecycle-server';
import type { MockedKeys } from '@kbn/utility-types-jest';
import { analyticsServiceMock } from '@kbn/core-analytics-server-mocks';
import { capabilitiesServiceMock } from '@kbn/core-capabilities-server-mocks';
import { docLinksServiceMock } from '@kbn/core-doc-links-server-mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { executionContextServiceMock } from '@kbn/core-execution-context-server-mocks';
import { httpServiceMock } from '@kbn/core-http-server-mocks';
import { metricsServiceMock } from '@kbn/core-metrics-server-mocks';
import { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { coreUsageDataServiceMock } from '@kbn/core-usage-data-server-mocks';
import { userActivityServiceMock } from '@kbn/core-user-activity-server-mocks';
import { customBrandingServiceMock } from '@kbn/core-custom-branding-server-mocks';
import { securityServiceMock } from '@kbn/core-security-server-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-server-mocks';
import { coreFeatureFlagsMock } from '@kbn/core-feature-flags-server-mocks';
import { pricingServiceMock } from '@kbn/core-pricing-server-mocks';
import { injectionServiceMock } from '@kbn/core-di-mocks';
import { dataStreamServiceMock } from '@kbn/core-data-streams-server-mocks';
import { userStorageServiceMock } from '@kbn/core-user-storage-server-mocks';
import { lazyObject } from '@kbn/lazy-object';

export function createCoreStartMock() {
  const mock: MockedKeys<CoreStart> = lazyObject({
    analytics: analyticsServiceMock.createAnalyticsServiceStart(),
    capabilities: capabilitiesServiceMock.createStartContract(),
    docLinks: docLinksServiceMock.createStartContract(),
    elasticsearch: elasticsearchServiceMock.createStart(),
    featureFlags: coreFeatureFlagsMock.createStart(),
    http: httpServiceMock.createStartContract(),
    metrics: metricsServiceMock.createStartContract(),
    savedObjects: savedObjectsServiceMock.createStartContract(),
    uiSettings: uiSettingsServiceMock.createStartContract(),
    coreUsageData: coreUsageDataServiceMock.createStartContract(),
    executionContext: executionContextServiceMock.createInternalStartContract(),
    customBranding: customBrandingServiceMock.createStartContract(),
    userActivity: userActivityServiceMock.createInternalStartContract(),
    security: securityServiceMock.createStart(),
    userProfile: userProfileServiceMock.createStart(),
    injection: injectionServiceMock.createStartContract(),
    plugins: lazyObject({
      onStart: jest.fn(),
      loadPluginContract: jest.fn(),
      lazyInit: lazyObject({
        trigger: jest.fn(),
        getStatus: jest.fn(),
        status$: jest.fn(),
        onLazyStartService: jest.fn(),
      }),
    }),
    pricing: pricingServiceMock.createStartContract(),
    dataStreams: dataStreamServiceMock.createStartContract(),
    userStorage: userStorageServiceMock.createStartContract(),
  });

  return mock;
}
