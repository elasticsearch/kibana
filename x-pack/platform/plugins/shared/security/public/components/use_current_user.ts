/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import constate from 'constate';
import useAsync from 'react-use/lib/useAsync';
import useObservable from 'react-use/lib/useObservable';

import type { AuthenticationServiceSetup } from '@kbn/security-plugin-types-public';

import { useSecurityApiClients } from '.';
import type { UserProfileData } from '../../common';

export interface AuthenticationProviderProps {
  authc: AuthenticationServiceSetup;
}

const [AuthenticationProvider, useAuthentication] = constate(
  ({ authc }: AuthenticationProviderProps) => authc
);

export { AuthenticationProvider, useAuthentication };

/**
 * The unified current-user hook now lives in core's `@kbn/core-user-profile-browser` package so any
 * plugin can consume it without a security-plugin dependency. Re-exported here for back-compat.
 */
export { useCurrentUser } from '@kbn/core-user-profile-browser';
export type { CurrentUser } from '@kbn/core-user-profile-browser';

/**
 * Fetches the current user's profile for a specific `dataPath`. Prefer {@link useCurrentUser} for
 * the curated current user; use this hook only when you need to read a specific profile namespace.
 */
export function useUserProfile<T extends UserProfileData>(dataPath?: string) {
  const { userProfiles } = useSecurityApiClients();
  const dataUpdateState = useObservable(userProfiles.dataUpdates$);
  return useAsync(
    () => userProfiles.getCurrent<T>(dataPath ? { dataPath } : undefined),
    [userProfiles, dataPath, dataUpdateState]
  );
}
