/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { AuditLogger, CoreSecurityDelegateContract } from '@kbn/core-security-server';
import type { UserProfileData } from '@kbn/core-user-profile-common';
import type { CoreUserProfileDelegateContract } from '@kbn/core-user-profile-server';

import { auditServiceMock } from './audit/mocks';
import { authenticationServiceMock } from './authentication/authentication_service.mock';
import { buildSecurityApi, buildUserProfileApi } from './build_delegate_apis';
import { securityMock } from './mocks';
import { getPrintableSessionId } from './session_management';
import { sessionMock } from './session_management/session.mock';
import { userProfileServiceMock } from './user_profile/user_profile_service.mock';

describe('buildSecurityApi', () => {
  let authc: ReturnType<typeof authenticationServiceMock.createStart>;
  let auditService: ReturnType<typeof auditServiceMock.create>;
  let session: ReturnType<typeof sessionMock.create>;
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;
  let api: CoreSecurityDelegateContract;

  beforeEach(() => {
    authc = authenticationServiceMock.createStart();
    auditService = auditServiceMock.create();
    session = sessionMock.create();
    logger = loggingSystemMock.createLogger();
    api = buildSecurityApi({
      getAuthc: () => authc,
      getSession: () => session,
      audit: auditService,
      config: { uiam: { enabled: false } },
      logger,
    });
  });

  describe('authc.getCurrentUser', () => {
    it('properly delegates to the service', () => {
      const request = httpServerMock.createKibanaRequest();
      api.authc.getCurrentUser(request);

      expect(authc.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(authc.getCurrentUser).toHaveBeenCalledWith(request);
    });

    it('returns the result from the service', async () => {
      const request = httpServerMock.createKibanaRequest();
      const delegateReturn = securityMock.createMockAuthenticatedUser();

      authc.getCurrentUser.mockReturnValue(delegateReturn);

      const currentUser = api.authc.getCurrentUser(request);

      expect(currentUser).toBe(delegateReturn);
    });

    it('returns the enriched override for fake requests when the enricher has bound a profile', () => {
      const request = httpServerMock.createFakeKibanaRequest({});

      api.fakeRequestEnricher(request, { profileId: 'u_test_profile_123', username: 'jdoe' });

      const user = api.authc.getCurrentUser(request);

      expect(authc.getCurrentUser).not.toHaveBeenCalled();
      expect(user!.profile_uid).toBe('u_test_profile_123');
      expect(user!.username).toBe('jdoe');
    });

    it('falls back to the authentication service for fake requests without an enrichment', () => {
      const request = httpServerMock.createFakeKibanaRequest({});
      const delegateReturn = securityMock.createMockAuthenticatedUser();
      authc.getCurrentUser.mockReturnValue(delegateReturn);

      const user = api.authc.getCurrentUser(request);

      expect(authc.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(authc.getCurrentUser).toHaveBeenCalledWith(request);
      expect(user).toBe(delegateReturn);
    });
  });

  describe('fakeRequestEnricher', () => {
    it('binds a profile_uid and username that are then surfaced via getCurrentUser', () => {
      const request = httpServerMock.createFakeKibanaRequest({});

      api.fakeRequestEnricher(request, { profileId: 'u_test_profile_123', username: 'jdoe' });

      const user = api.authc.getCurrentUser(request);
      expect(user!.profile_uid).toBe('u_test_profile_123');
      expect(user!.username).toBe('jdoe');
    });

    it('throws when called on a real (non-fake) request', () => {
      const request = httpServerMock.createKibanaRequest();
      expect(() => api.fakeRequestEnricher(request, { profileId: 'u_test_profile_123' })).toThrow(
        /must only be called on a fake request/
      );
    });
  });

  describe('audit.asScoped', () => {
    let auditLogger: AuditLogger;
    it('properly delegates to the service', () => {
      const request = httpServerMock.createKibanaRequest();
      auditLogger = api.audit.asScoped(request);
      auditLogger.log({ message: 'an event' });
      expect(auditService.asScoped).toHaveBeenCalledTimes(1);
      expect(auditService.asScoped).toHaveBeenCalledWith(request);
    });

    it('returns the result from the service', async () => {
      const request = httpServerMock.createKibanaRequest();
      auditLogger = api.audit.asScoped(request);
      auditLogger.log({ message: 'an event' });
      expect(auditService.asScoped(request).log).toHaveBeenCalledTimes(1);
      expect(auditService.asScoped(request).log).toHaveBeenCalledWith({ message: 'an event' });
    });
  });

  describe('authc.apiKeys', () => {
    it('properly delegates to the service', async () => {
      await authc.apiKeys.areAPIKeysEnabled();
      expect(authc.apiKeys.areAPIKeysEnabled).toHaveBeenCalledTimes(1);
    });

    it('returns the result from the service', async () => {
      authc.apiKeys.areAPIKeysEnabled.mockReturnValue(Promise.resolve(false));

      const areAPIKeysEnabled = await authc.apiKeys.areAPIKeysEnabled();

      expect(areAPIKeysEnabled).toBe(false);
    });
  });

  describe('authc.getRedactedSessionId', () => {
    it('properly delegates to session.getSID and redacts the result', async () => {
      const request = httpServerMock.createKibanaRequest();
      const fullSid = '1234567890abcdefghijklmno';
      session.getSID.mockResolvedValue(fullSid);

      const result = await api.authc.getRedactedSessionId(request);

      expect(session.getSID).toHaveBeenCalledTimes(1);
      expect(session.getSID).toHaveBeenCalledWith(request);
      expect(result).toBe(getPrintableSessionId(fullSid));
    });

    it('returns undefined when session.getSID resolves to undefined', async () => {
      const request = httpServerMock.createKibanaRequest();
      session.getSID.mockResolvedValue(undefined);

      const result = await api.authc.getRedactedSessionId(request);

      expect(result).toBeUndefined();
    });
  });

  describe('config.uiam', () => {
    describe('when uiam is enabled', () => {
      beforeEach(() => {
        authc = authenticationServiceMock.createStart();
        auditService = auditServiceMock.create();
        session = sessionMock.create();
        api = buildSecurityApi({
          getAuthc: () => authc,
          getSession: () => session,
          audit: auditService,
          config: { uiam: { enabled: true } },
          logger,
        });
      });

      it('should expose the uiam API', () => {
        expect(api.authc.apiKeys.uiam).not.toBeNull();
        expect(api.authc.apiKeys.uiam).toBeDefined();
      });

      it('should properly delegate grant to the service', async () => {
        const request = httpServerMock.createKibanaRequest();
        const grantParams = {
          name: 'test-key',
          expiration: '1d',
        };

        await api.authc.apiKeys.uiam!.grant(request, grantParams);

        expect(authc.apiKeys.uiam!.grant).toHaveBeenCalledTimes(1);
        expect(authc.apiKeys.uiam!.grant).toHaveBeenCalledWith(request, grantParams);
      });

      it('should properly delegate invalidate to the service', async () => {
        const request = httpServerMock.createKibanaRequest();
        const invalidateParams = {
          id: 'key-id-1',
        };

        await api.authc.apiKeys.uiam!.invalidate(request, invalidateParams);

        expect(authc.apiKeys.uiam!.invalidate).toHaveBeenCalledTimes(1);
        expect(authc.apiKeys.uiam!.invalidate).toHaveBeenCalledWith(request, invalidateParams);
      });
    });

    describe('when uiam is disabled', () => {
      beforeEach(() => {
        authc = authenticationServiceMock.createStart();
        auditService = auditServiceMock.create();
        session = sessionMock.create();
        api = buildSecurityApi({
          getAuthc: () => authc,
          getSession: () => session,
          audit: auditService,
          config: { uiam: { enabled: false } },
          logger,
        });
      });

      it('should set uiam to null', () => {
        expect(api.authc.apiKeys.uiam).toBeNull();
      });
    });

    describe('when uiam config is not provided', () => {
      beforeEach(() => {
        authc = authenticationServiceMock.createStart();
        auditService = auditServiceMock.create();
        session = sessionMock.create();
        api = buildSecurityApi({
          getAuthc: () => authc,
          getSession: () => session,
          audit: auditService,
          config: {},
          logger,
        });
      });

      it('should set uiam to null', () => {
        expect(api.authc.apiKeys.uiam).toBeNull();
      });
    });
  });
});

describe('buildUserProfileApi', () => {
  let userProfile: ReturnType<typeof userProfileServiceMock.createStart>;
  let api: CoreUserProfileDelegateContract;

  beforeEach(() => {
    userProfile = userProfileServiceMock.createStart();
    api = buildUserProfileApi({ getUserProfile: () => userProfile });
  });

  describe('getCurrent', () => {
    it('properly delegates to the service', async () => {
      const request = httpServerMock.createKibanaRequest();
      await api.getCurrent({ request, dataPath: 'dataPath' });

      expect(userProfile.getCurrent).toHaveBeenCalledTimes(1);
      expect(userProfile.getCurrent).toHaveBeenCalledWith({ request, dataPath: 'dataPath' });
    });

    it('returns the result from the service', async () => {
      const request = httpServerMock.createKibanaRequest();

      userProfile.getCurrent.mockResolvedValue(null);

      const returnValue = await api.getCurrent({ request, dataPath: 'dataPath' });

      expect(returnValue).toBe(null);
    });
  });

  describe('bulkGet', () => {
    it('properly delegates to the service', async () => {
      const uids = new Set(['foo', 'bar']);
      await api.bulkGet({ uids, dataPath: 'dataPath' });

      expect(userProfile.bulkGet).toHaveBeenCalledTimes(1);
      expect(userProfile.bulkGet).toHaveBeenCalledWith({ uids, dataPath: 'dataPath' });
    });

    it('returns the result from the service', async () => {
      userProfile.bulkGet.mockResolvedValue([]);

      const returnValue = await api.bulkGet({ uids: new Set(), dataPath: 'dataPath' });

      expect(returnValue).toEqual([]);
    });
  });

  describe('suggest', () => {
    it('properly delegates to the service', async () => {
      await api.suggest({ name: 'foo' });

      expect(userProfile.suggest).toHaveBeenCalledTimes(1);
      expect(userProfile.suggest).toHaveBeenCalledWith({ name: 'foo' });
    });

    it('returns the result from the service', async () => {
      userProfile.suggest.mockResolvedValue([]);

      const returnValue = await api.suggest({ name: 'foo' });

      expect(returnValue).toEqual([]);
    });
  });

  describe('update', () => {
    it('properly delegates to the service', async () => {
      const updated = { foo: 'bar' };
      await api.update('foo', updated as unknown as UserProfileData);

      expect(userProfile.update).toHaveBeenCalledTimes(1);
      expect(userProfile.update).toHaveBeenCalledWith('foo', updated);
    });
  });
});
