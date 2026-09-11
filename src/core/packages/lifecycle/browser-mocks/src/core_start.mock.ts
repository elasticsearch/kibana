/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { docLinksServiceMock } from '@kbn/core-doc-links-browser-mocks';
import { themeServiceMock } from '@kbn/core-theme-browser-mocks';
import { analyticsServiceMock } from '@kbn/core-analytics-browser-mocks';
import { injectionServiceMock } from '@kbn/core-di-mocks';
import { executionContextServiceMock } from '@kbn/core-execution-context-browser-mocks';
import { i18nServiceMock } from '@kbn/core-i18n-browser-mocks';
import { fatalErrorsServiceMock } from '@kbn/core-fatal-errors-browser-mocks';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { uiSettingsServiceMock, settingsServiceMock } from '@kbn/core-ui-settings-browser-mocks';
import { deprecationsServiceMock } from '@kbn/core-deprecations-browser-mocks';
import { overlayServiceMock } from '@kbn/core-overlays-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { applicationServiceMock } from '@kbn/core-application-browser-mocks';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { customBrandingServiceMock } from '@kbn/core-custom-branding-browser-mocks';
import { deferredInitServiceMock } from '@kbn/core-deferred-init-browser-mocks';
import { securityServiceMock } from '@kbn/core-security-browser-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { renderingServiceMock } from '@kbn/core-rendering-browser-mocks';
import { coreFeatureFlagsMock } from '@kbn/core-feature-flags-browser-mocks';
import { pricingServiceMock } from '@kbn/core-pricing-browser-mocks';
import { userStorageServiceMock } from '@kbn/core-user-storage-browser-mocks';
import { lazyObject } from '@kbn/lazy-object';

export function createCoreStartMock({ basePath = '' } = {}) {
  const mock = lazyObject({
    analytics: analyticsServiceMock.createAnalyticsServiceStart(),
    application: applicationServiceMock.createStartContract(),
    chrome: chromeServiceMock.createStartContract(),
    customBranding: customBrandingServiceMock.createStartContract(),
    deferredInit: deferredInitServiceMock.createStartContract(),
    docLinks: docLinksServiceMock.createStartContract(),
    executionContext: executionContextServiceMock.createStartContract(),
    featureFlags: coreFeatureFlagsMock.createStart(),
    http: httpServiceMock.createStartContract({ basePath }),
    i18n: i18nServiceMock.createStartContract(),
    injection: injectionServiceMock.createStartContract(),
    notifications: notificationServiceMock.createStartContract(),
    overlays: overlayServiceMock.createStartContract(),
    uiSettings: uiSettingsServiceMock.createStartContract(),
    settings: settingsServiceMock.createStartContract(),
    deprecations: deprecationsServiceMock.createStartContract(),
    theme: themeServiceMock.createStartContract(),
    fatalErrors: fatalErrorsServiceMock.createStartContract(),
    security: securityServiceMock.createStart(),
    userProfile: userProfileServiceMock.createStart(),
    rendering: renderingServiceMock.create(),
    pricing: pricingServiceMock.createStartContract(),
    userStorage: userStorageServiceMock.createStartContract(),
    plugins: lazyObject({
      onStart: jest.fn(),
    }),
  });

  return mock;
}
