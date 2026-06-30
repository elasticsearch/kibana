/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';

import { securityServiceMock } from '@kbn/core-security-server-mocks';
import { lazyObject } from '@kbn/lazy-object';

import { authenticationMock, authorizationMock } from './authentication/index.mock';
import { navControlServiceMock } from './nav_control/index.mock';
import { getUiApiMock } from './ui_api/index.mock';
import { licenseMock } from '../common/licensing/index.mock';

function createSetupMock() {
  return lazyObject({
    authc: authenticationMock.createSetup(),
    authz: authorizationMock.createStart(),
    license: licenseMock.create(),
  });
}
function createStartMock() {
  return lazyObject({
    authc: authenticationMock.createStart(),
    authz: authorizationMock.createStart(),
    navControlService: navControlServiceMock.createStart(),
    userProfiles: lazyObject({
      getCurrent: jest.fn(),
      bulkGet: jest.fn(),
      suggest: jest.fn(),
      update: jest.fn(),
      partialUpdate: jest.fn(),
      userProfile$: of({}),
      userProfileLoaded$: of(true),
      enabled$: of(true),
      dataUpdates$: of({}),
    }),
    uiApi: getUiApiMock.createStart(),
  });
}

export const securityMock = {
  createSetup: createSetupMock,
  createStart: createStartMock,
  createMockAuthenticatedUser: securityServiceMock.createMockAuthenticatedUser,
};
