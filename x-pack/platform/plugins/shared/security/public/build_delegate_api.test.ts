/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';

import type { CoreSecurityDelegateContract } from '@kbn/core-security-browser';
import type { CoreUserProfileDelegateContract } from '@kbn/core-user-profile-browser';
import type { UserProfileAPIClient } from '@kbn/security-plugin-types-public';

import { authenticationMock } from './authentication/index.mock';
import { buildSecurityApi, buildUserProfileApi } from './build_delegate_api';
import { securityMock } from './mocks';

describe('buildSecurityApi', () => {
  let authc: ReturnType<typeof authenticationMock.createSetup>;
  let api: CoreSecurityDelegateContract;

  beforeEach(() => {
    authc = authenticationMock.createSetup();
    api = buildSecurityApi({ authc });
  });

  describe('authc.getCurrentUser', () => {
    it('properly delegates to the service', async () => {
      await api.authc.getCurrentUser();

      expect(authc.getCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('returns the result from the service', async () => {
      const delegateReturn = securityMock.createMockAuthenticatedUser();

      authc.getCurrentUser.mockReturnValue(Promise.resolve(delegateReturn));

      const currentUser = await api.authc.getCurrentUser();

      expect(currentUser).toBe(delegateReturn);
    });
  });
});

describe('buildUserProfileApi', () => {
  let userProfile: jest.Mocked<UserProfileAPIClient>;
  let api: CoreUserProfileDelegateContract;

  beforeEach(() => {
    userProfile = {
      userProfile$: of(null),
      userProfileLoaded$: of(false),
      enabled$: of(true),
      dataUpdates$: of({}),
      getCurrent: jest.fn(),
      bulkGet: jest.fn(),
      suggest: jest.fn(),
      update: jest.fn(),
      partialUpdate: jest.fn(),
    };
    api = buildUserProfileApi({ userProfile });
  });

  describe('userProfile$', () => {
    it('returns the reference from the service', async () => {
      expect(api.userProfile$).toBe(userProfile.userProfile$);
    });
  });

  describe('getCurrent', () => {
    it('properly delegates to the service', async () => {
      await api.getCurrent({ dataPath: 'dataPath' });

      expect(userProfile.getCurrent).toHaveBeenCalledTimes(1);
      expect(userProfile.getCurrent).toHaveBeenCalledWith({ dataPath: 'dataPath' });
    });

    it('returns the result from the service', async () => {
      userProfile.getCurrent.mockResolvedValue({ stub: true } as any);

      const returnValue = await api.getCurrent({ dataPath: 'dataPath' });

      expect(returnValue).toEqual({ stub: true });
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
      await api.suggest('path', { name: 'foo' });

      expect(userProfile.suggest).toHaveBeenCalledTimes(1);
      expect(userProfile.suggest).toHaveBeenCalledWith('path', { name: 'foo' });
    });

    it('returns the result from the service', async () => {
      userProfile.suggest.mockResolvedValue([]);

      const returnValue = await api.suggest('path', { name: 'foo' });

      expect(returnValue).toEqual([]);
    });
  });

  describe('update', () => {
    it('properly delegates to the service', async () => {
      const updated = { foo: 'bar' };
      await api.update(updated);

      expect(userProfile.update).toHaveBeenCalledTimes(1);
      expect(userProfile.update).toHaveBeenCalledWith(updated);
    });
  });

  describe('partialUpdate', () => {
    it('properly delegates to the service', async () => {
      const updated = { foo: 'bar' };
      await api.partialUpdate(updated);

      expect(userProfile.partialUpdate).toHaveBeenCalledTimes(1);
      expect(userProfile.partialUpdate).toHaveBeenCalledWith(updated);
    });
  });
});
