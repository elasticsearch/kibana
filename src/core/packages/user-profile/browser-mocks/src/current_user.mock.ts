/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  CurrentUser,
  UseCurrentUserResult,
  UseCurrentUserResultWithRaw,
} from '@kbn/core-user-profile-browser';

const createCurrentUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  username: 'jdoe',
  email: 'jdoe@elastic.co',
  fullName: 'John Doe',
  displayName: 'John Doe',
  roles: ['superuser'],
  isCloudUser: false,
  isOperator: false,
  isAnonymous: false,
  profileUid: 'uid',
  ...overrides,
});

const createResult = (overrides: Partial<UseCurrentUserResult> = {}): UseCurrentUserResult => ({
  user: createCurrentUser(),
  isLoading: false,
  ...overrides,
});

const createResultWithRaw = (
  overrides: Partial<UseCurrentUserResultWithRaw> = {}
): UseCurrentUserResultWithRaw => ({
  user: createCurrentUser(),
  isLoading: false,
  rawAuthQuery: { isLoading: false, state: undefined, error: undefined },
  rawProfileQuery: { isLoading: false, state: null, error: undefined },
  ...overrides,
});

export const currentUserMock = {
  createCurrentUser,
  createResult,
  createResultWithRaw,
};
