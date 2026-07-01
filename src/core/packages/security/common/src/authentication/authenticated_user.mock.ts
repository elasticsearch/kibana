/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AuthenticatedUser } from './authenticated_user';

// We omit `roles` here since the original interface defines this field as `readonly string[]` that makes it hard to use
// in various mocks that expect mutable string array.
export type MockAuthenticatedUserProps = Partial<
  Omit<AuthenticatedUser, 'roles'> & { roles: string[] }
>;
export function mockAuthenticatedUser(user: MockAuthenticatedUserProps = {}) {
  return {
    username: 'user',
    email: 'email',
    full_name: 'full name',
    roles: ['user-role'],
    enabled: true,
    authentication_realm: { name: 'native1', type: 'native' },
    lookup_realm: { name: 'native1', type: 'native' },
    authentication_provider: { type: 'basic', name: 'basic1' },
    authentication_type: 'realm',
    elastic_cloud_user: false,
    http_authentication_scheme: null,
    profile_uid: 'uid',
    metadata: { _reserved: false },
    ...user,
  };
}
