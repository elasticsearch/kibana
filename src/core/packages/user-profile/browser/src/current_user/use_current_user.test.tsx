/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook, waitFor } from '@testing-library/react';
import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { of } from 'rxjs';

import type { CoreAuthenticationService } from '@kbn/core-security-browser';

import { CurrentUserProvider } from './current_user_provider';
import type { AuthenticatedUser, GetUserProfileResponse } from './types';
import { useCurrentUser } from './use_current_user';
import type { UserProfileService } from '../service';

const authenticatedUser: AuthenticatedUser = {
  username: 'jdoe',
  email: 'jdoe@elastic.co',
  full_name: 'John Doe',
  roles: ['superuser'],
  enabled: true,
  authentication_realm: { name: 'native1', type: 'native' },
  lookup_realm: { name: 'native1', type: 'native' },
  authentication_provider: { type: 'basic', name: 'basic1' },
  authentication_type: 'realm',
  elastic_cloud_user: false,
  profile_uid: 'auth-uid',
  metadata: { _reserved: false },
};

const profileResponse: GetUserProfileResponse = {
  uid: 'profile-uid',
  enabled: true,
  user: {
    username: 'jdoe',
    email: 'jdoe@elastic.co',
    full_name: 'John Doe',
    roles: ['superuser'],
    realm_name: 'native1',
    authentication_provider: { type: 'basic', name: 'basic1' },
  },
  data: { avatar: { initials: 'JD' } },
  labels: {},
};

const createAuthc = (
  getCurrentUser: jest.Mock = jest.fn().mockResolvedValue(authenticatedUser)
): CoreAuthenticationService => ({ getCurrentUser });

const createUserProfile = (
  getCurrent: jest.Mock = jest.fn().mockResolvedValue(profileResponse)
): UserProfileService =>
  ({
    getCurrent,
    getUserProfile$: () => of(null),
    getEnabled$: () => of(false),
    dataUpdates$: of({}),
    bulkGet: jest.fn(),
    suggest: jest.fn(),
    update: jest.fn(),
    partialUpdate: jest.fn(),
  } as unknown as UserProfileService);

const createWrapper =
  (authc: CoreAuthenticationService, userProfile: UserProfileService): FC<PropsWithChildren> =>
  ({ children }) =>
    (
      <CurrentUserProvider authc={authc} userProfile={userProfile}>
        {children}
      </CurrentUserProvider>
    );

describe('useCurrentUser', () => {
  it('throws when used outside a CurrentUserProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCurrentUser())).toThrow(
      'useCurrentUser must be used within a CurrentUserProvider'
    );
    consoleError.mockRestore();
  });

  it('transitions from loading to a resolved curated user', async () => {
    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(createAuthc(), createUserProfile()),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(
      expect.objectContaining({
        username: 'jdoe',
        displayName: 'John Doe',
        avatar: { initials: 'JD' },
      })
    );
  });

  it('requests auth once and the profile with the bootstrap-prefetched dataPath', async () => {
    const getCurrentUser = jest.fn().mockResolvedValue(authenticatedUser);
    const getCurrent = jest.fn().mockResolvedValue(profileResponse);

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(createAuthc(getCurrentUser), createUserProfile(getCurrent)),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    // The profile is fetched with the same dataPath the security plugin prefetches at start, so the
    // underlying client cache is reused (network dedup happens at the client layer).
    expect(getCurrent).toHaveBeenCalledWith({ dataPath: 'avatar,userSettings' });
  });

  it('treats a 404 profile as "no profile" rather than an error', async () => {
    const getCurrent = jest.fn().mockRejectedValue({ response: { status: 404 } });

    const { result } = renderHook(() => useCurrentUser({ includeRawQuerySource: true }), {
      wrapper: createWrapper(createAuthc(), createUserProfile(getCurrent)),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rawProfileQuery.state).toBeNull();
    expect(result.current.rawProfileQuery.error).toBeUndefined();
    // user is still valid from auth
    expect(result.current.user).toEqual(expect.objectContaining({ username: 'jdoe' }));
  });

  it('surfaces a critical auth failure: no user, auth error reported', async () => {
    const authError = new Error('auth boom');
    const getCurrentUser = jest.fn().mockRejectedValue(authError);

    const { result } = renderHook(() => useCurrentUser({ includeRawQuerySource: true }), {
      wrapper: createWrapper(createAuthc(getCurrentUser), createUserProfile()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.rawAuthQuery.error).toBe(authError);
  });

  it('surfaces a non-critical profile failure independently: user still valid', async () => {
    const profileError = Object.assign(new Error('profile boom'), {
      response: { status: 500 },
    });
    const getCurrent = jest.fn().mockRejectedValue(profileError);

    const { result } = renderHook(() => useCurrentUser({ includeRawQuerySource: true }), {
      wrapper: createWrapper(createAuthc(), createUserProfile(getCurrent)),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(expect.objectContaining({ username: 'jdoe' }));
    expect(result.current.rawProfileQuery.error).toBe(profileError);
    expect(result.current.rawAuthQuery.error).toBeUndefined();
  });

  it('omits raw query sources unless requested', async () => {
    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(createAuthc(), createUserProfile()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).not.toHaveProperty('rawAuthQuery');
    expect(result.current).not.toHaveProperty('rawProfileQuery');
  });
});
