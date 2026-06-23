/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSecurityDelegateContract } from '@kbn/core-security-server';
import { getDefaultSecurityImplementation } from './default_implementation';

describe('getDefaultSecurityImplementation', () => {
  let implementation: CoreSecurityDelegateContract;

  beforeEach(() => {
    implementation = getDefaultSecurityImplementation();
  });

  describe('authc.getCurrentUser', () => {
    it('returns null', async () => {
      const user = implementation.authc.getCurrentUser({} as any);
      expect(user).toBeNull();
    });
  });

  describe('authc.getRedactedSessionId', () => {
    it('returns undefined', async () => {
      const sessionId = await implementation.authc.getRedactedSessionId({} as any);
      expect(sessionId).toBeUndefined();
    });
  });

  describe('authc.apiKeys', () => {
    it('returns stub object', async () => {
      const { apiKeys } = implementation.authc;
      const areAPIKeysEnabled = await apiKeys.areAPIKeysEnabled();

      expect(areAPIKeysEnabled).toBe(false);
    });
  });

  describe('audit.asScoped', () => {
    it('returns null', async () => {
      const logger = implementation.audit.asScoped({} as any);
      expect(logger.log({ message: 'something' })).toBeUndefined();
    });
  });

  describe('audit.withoutRequest', () => {
    it('does not log', async () => {
      const logger = implementation.audit.withoutRequest;
      expect(logger.enabled).toBe(false);
      expect(logger.log({ message: 'no request' })).toBeUndefined();
    });
  });

  describe('fakeRequestEnricher', () => {
    it('is a no-op (no security delegate registered)', () => {
      expect(() =>
        implementation.fakeRequestEnricher({} as any, 'u_test_profile_123')
      ).not.toThrow();
    });
  });
});
