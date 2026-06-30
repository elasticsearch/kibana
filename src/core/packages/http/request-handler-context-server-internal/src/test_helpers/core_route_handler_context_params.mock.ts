/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { coreFeatureFlagsMock } from '@kbn/core-feature-flags-server-mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { deprecationsServiceMock } from '@kbn/core-deprecations-server-mocks';
import { securityServiceMock } from '@kbn/core-security-server-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-server-mocks';
import { i18nServiceMock } from '@kbn/core-i18n-server-mocks';

export const createCoreRouteHandlerContextParamsMock = () => {
  return {
    featureFlags: coreFeatureFlagsMock.createStart(),
    elasticsearch: elasticsearchServiceMock.createInternalStart(),
    savedObjects: savedObjectsServiceMock.createInternalStartContract(),
    uiSettings: uiSettingsServiceMock.createStartContract(),
    deprecations: deprecationsServiceMock.createInternalStartContract(),
    security: securityServiceMock.createInternalStart(),
    userProfile: userProfileServiceMock.createInternalStart(),
    i18n: i18nServiceMock.createStartContract(),
  };
};
