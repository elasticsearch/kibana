/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useContext, useMemo } from 'react';
import useAsync from 'react-use/lib/useAsync';
import useObservable from 'react-use/lib/useObservable';

import { buildCurrentUser } from './build_current_user';
import { CurrentUserContext } from './current_user_context';
import type {
  AuthenticatedUser,
  CurrentUser,
  GetUserProfileResponse,
  RawQuerySource,
} from './types';

/**
 * The profile `dataPath` requested by the hook. It intentionally matches the paths the security
 * plugin prefetches at start (`avatar,userSettings`) so the underlying API client cache (keyed by
 * the exact `dataPath` string) is reused instead of issuing a second request.
 *
 * Exported so the security plugin can use the same constant for its prefetch, keeping both
 * cache keys identical and preventing a redundant network round-trip.
 */
export const CURRENT_USER_DATA_PATH = 'avatar,userSettings';

export interface UseCurrentUserResult {
  /** The curated current user, or `null` while loading or if authentication failed. */
  user: CurrentUser | null;
  /** Whether either the auth or profile request is still in flight. */
  isLoading: boolean;
}

export interface UseCurrentUserResultWithRaw extends UseCurrentUserResult {
  /**
   * Raw authenticated user query state. This source is critical: when it fails, `user` is `null`.
   */
  rawAuthQuery: RawQuerySource<AuthenticatedUser>;
  /**
   * Raw user profile query state. This source is non-critical: `user` is still valid from auth even
   * if the profile fails. A missing profile (HTTP 404) is NOT an error — `error` stays `undefined`
   * and `data` is `null`.
   */
  rawProfileQuery: RawQuerySource<GetUserProfileResponse | null>;
}

export interface UseCurrentUserOptions {
  /** When `true`, additionally return the raw per-source query states. */
  includeRawQuerySource?: boolean;
}

const isNotFound = (error: unknown): boolean =>
  (error as { response?: { status?: number } })?.response?.status === 404;

/**
 * Returns the curated current user (authenticated user + profile) unified into a single result.
 * Network requests are deduped by the underlying client caches.
 *
 * Must be used within a {@link CurrentUserProvider}.
 *
 * @example
 * const { user, isLoading } = useCurrentUser();
 * @example
 * const { user, rawAuthQuery, rawProfileQuery } = useCurrentUser({ includeRawQuerySource: true });
 */
export function useCurrentUser(): UseCurrentUserResult;
export function useCurrentUser(options: {
  includeRawQuerySource: true;
}): UseCurrentUserResultWithRaw;
export function useCurrentUser(
  options?: UseCurrentUserOptions
): UseCurrentUserResult | UseCurrentUserResultWithRaw {
  const services = useContext(CurrentUserContext);
  if (!services) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }
  const { authc, userProfile } = services;

  const authState = useAsync(() => authc.getCurrentUser(), [authc]);

  const profileUpdate = useObservable(userProfile.dataUpdates$);

  const profileState = useAsync(async () => {
    try {
      return await userProfile.getCurrent({ dataPath: CURRENT_USER_DATA_PATH });
    } catch (error) {
      // A missing profile (anonymous/proxy-authenticated users) is not an error.
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }, [userProfile, profileUpdate]);

  const user = useMemo(
    () => buildCurrentUser(authState.value, profileState.value),
    [authState.value, profileState.value]
  );
  const isLoading = authState.loading || profileState.loading;

  return {
    user,
    isLoading,
    ...(options?.includeRawQuerySource
      ? {
          rawAuthQuery: {
            isLoading: authState.loading,
            state: authState.value,
            error: authState.error,
          },
          rawProfileQuery: {
            isLoading: profileState.loading,
            state: profileState.value,
            error: profileState.error,
          },
        }
      : {}),
  };
}
