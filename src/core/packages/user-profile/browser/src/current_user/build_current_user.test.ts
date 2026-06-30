/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildCurrentUser } from './build_current_user';
import type { AuthenticatedUser, GetUserProfileResponse } from './types';

const createAuthenticatedUser = (
  overrides: Partial<AuthenticatedUser> = {}
): AuthenticatedUser => ({
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
  ...overrides,
});

const createProfile = (
  overrides: Partial<GetUserProfileResponse> = {}
): GetUserProfileResponse => ({
  uid: 'profile-uid',
  enabled: true,
  user: {
    username: 'profile-username',
    email: 'profile@elastic.co',
    full_name: 'Profile Name',
    roles: ['profile-role'],
    realm_name: 'native1',
    authentication_provider: { type: 'basic', name: 'basic1' },
  },
  data: { avatar: { initials: 'JD' }, userSettings: { darkMode: 'dark' } },
  labels: {},
  ...overrides,
});

describe('buildCurrentUser', () => {
  it('returns null when there is no authenticated user', () => {
    expect(buildCurrentUser(undefined, createProfile())).toBeNull();
    expect(buildCurrentUser(undefined, null)).toBeNull();
  });

  it('maps the curated identity fields from the authenticated user', () => {
    const user = buildCurrentUser(createAuthenticatedUser(), null);

    expect(user).toEqual(
      expect.objectContaining({
        username: 'jdoe',
        email: 'jdoe@elastic.co',
        fullName: 'John Doe',
        displayName: 'John Doe',
        roles: ['superuser'],
      })
    );
  });

  it('derives displayName as full_name || email || username', () => {
    expect(
      buildCurrentUser(createAuthenticatedUser({ full_name: 'Full' }), null)?.displayName
    ).toBe('Full');
    expect(
      buildCurrentUser(createAuthenticatedUser({ full_name: undefined, email: 'e@x.co' }), null)
        ?.displayName
    ).toBe('e@x.co');
    expect(
      buildCurrentUser(
        createAuthenticatedUser({ full_name: undefined, email: undefined, username: 'just-name' }),
        null
      )?.displayName
    ).toBe('just-name');
  });

  it('derives flags', () => {
    expect(buildCurrentUser(createAuthenticatedUser({ elastic_cloud_user: true }), null)).toEqual(
      expect.objectContaining({ isCloudUser: true })
    );
    expect(buildCurrentUser(createAuthenticatedUser({ operator: true }), null)).toEqual(
      expect.objectContaining({ isOperator: true })
    );
    // operator defaults to false when unset
    expect(buildCurrentUser(createAuthenticatedUser({ operator: undefined }), null)).toEqual(
      expect.objectContaining({ isOperator: false })
    );
    expect(
      buildCurrentUser(
        createAuthenticatedUser({ authentication_provider: { type: 'anonymous', name: 'anon' } }),
        null
      )
    ).toEqual(expect.objectContaining({ isAnonymous: true }));
  });

  it('lifts avatar and userSettings from the profile data', () => {
    const user = buildCurrentUser(createAuthenticatedUser(), createProfile());

    expect(user?.avatar).toEqual({ initials: 'JD' });
    expect(user?.userSettings).toEqual({ darkMode: 'dark' });
  });

  it('leaves avatar/userSettings undefined when there is no profile', () => {
    const user = buildCurrentUser(createAuthenticatedUser(), null);

    expect(user?.avatar).toBeUndefined();
    expect(user?.userSettings).toBeUndefined();
  });

  it('prefers the authenticated user profile_uid, falling back to the profile uid', () => {
    expect(
      buildCurrentUser(createAuthenticatedUser({ profile_uid: 'auth-uid' }), createProfile())
        ?.profileUid
    ).toBe('auth-uid');
    expect(
      buildCurrentUser(createAuthenticatedUser({ profile_uid: undefined }), createProfile())
        ?.profileUid
    ).toBe('profile-uid');
  });

  it('derives identity only from the authenticated user, never from the profile user projection', () => {
    // The profile carries a different `user` projection; it must NOT override curated identity.
    const user = buildCurrentUser(createAuthenticatedUser(), createProfile());

    expect(user?.username).toBe('jdoe');
    expect(user?.email).toBe('jdoe@elastic.co');
    expect(user?.fullName).toBe('John Doe');
  });
});
