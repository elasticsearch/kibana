/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  SecurityServiceSetup,
  SecurityServiceStart,
  SecurityRequestHandlerContext,
} from '@kbn/core-security-server';
import type {
  InternalSecurityServiceSetup,
  InternalSecurityServiceStart,
} from '@kbn/core-security-server-internal';
import { apiKeysMock } from './api_keys.mock';
import { auditServiceMock, type MockedAuditService } from './audit.mock';
import type { MockAuthenticatedUserProps } from '@kbn/core-security-common/mocks';
import { mockAuthenticatedUser } from '@kbn/core-security-common/mocks';
import { lazyObject } from '@kbn/lazy-object';

const createSetupMock = () => {
  const mock: jest.Mocked<SecurityServiceSetup> = lazyObject({
    registerSecurityDelegate: jest.fn(),
    acquireFakeRequestEnricher: jest.fn().mockReturnValue(jest.fn()),
    fips: { isEnabled: jest.fn() },
  });

  return mock;
};

export type SecurityStartMock = jest.MockedObjectDeep<Omit<SecurityServiceStart, 'audit'>> & {
  audit: MockedAuditService;
};

const createStartMock = (): SecurityStartMock => {
  const mock = lazyObject({
    authc: lazyObject({
      getCurrentUser: jest.fn(),
      getRedactedSessionId: jest.fn().mockResolvedValue(undefined),
      apiKeys: apiKeysMock.create(),
    }),
    audit: auditServiceMock.create(),
  });

  return mock;
};

const createInternalSetupMock = () => {
  const mock: jest.Mocked<InternalSecurityServiceSetup> = lazyObject({
    registerSecurityDelegate: jest.fn(),
    acquireFakeRequestEnricher: jest.fn().mockReturnValue(jest.fn()),
    fips: { isEnabled: jest.fn() },
    uiam: { sharedSecret: 'some-shared-secret' },
  });

  return mock;
};

export type InternalSecurityStartMock = jest.MockedObjectDeep<
  Omit<InternalSecurityServiceStart, 'audit'>
> & {
  audit: MockedAuditService;
};

const createInternalStartMock = (): InternalSecurityStartMock => {
  const mock = lazyObject({
    authc: lazyObject({
      getCurrentUser: jest.fn(),
      getRedactedSessionId: jest.fn().mockResolvedValue(undefined),
      apiKeys: apiKeysMock.create(),
    }),
    audit: auditServiceMock.create(),
  });

  return mock;
};

const createServiceMock = () => {
  const mock = lazyObject({
    setup: jest.fn().mockReturnValue(createSetupMock()),
    start: jest.fn().mockReturnValue(createStartMock()),
    stop: jest.fn(),
  });

  return mock;
};

const createRequestHandlerContextMock = () => {
  const mock: jest.MockedObjectDeep<SecurityRequestHandlerContext> = lazyObject({
    authc: lazyObject({
      getCurrentUser: jest.fn(),
      apiKeys: lazyObject({
        areAPIKeysEnabled: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        validate: jest.fn(),
        invalidate: jest.fn(),
        uiam: {
          grant: jest.fn(),
          invalidate: jest.fn(),
          convert: jest.fn(),
        },
      }),
    }),
    audit: lazyObject({
      logger: lazyObject({
        log: jest.fn(),
        enabled: true,
        includeSavedObjectNames: false,
      }),
    }),
  });
  return mock;
};

export const securityServiceMock = {
  create: createServiceMock,
  createSetup: createSetupMock,
  createStart: createStartMock,
  createInternalSetup: createInternalSetupMock,
  createInternalStart: createInternalStartMock,
  createRequestHandlerContext: createRequestHandlerContextMock,
  createMockAuthenticatedUser: (props: MockAuthenticatedUserProps = {}) =>
    mockAuthenticatedUser(props),
};
