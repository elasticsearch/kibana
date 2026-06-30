/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import type { APIKeysType } from './authentication';

/**
 * Core's authentication service
 *
 * @public
 */
export interface CoreAuthenticationService {
  /**
   * Retrieve the user bound to the provided request, or null if
   * no user is authenticated.
   *
   * @param request The request to retrieve the authenticated user for.
   */
  getCurrentUser(request: KibanaRequest): AuthenticatedUser | null;
  /**
   * Retrieve the redacted session ID for the provided request.
   * Returns a redacted form of the session ID (e.g. last N characters).
   * Returns undefined if no session exists for the request.
   *
   * @param request The request to retrieve the session ID for.
   */
  getRedactedSessionId(request: KibanaRequest): Promise<string | undefined>;
  apiKeys: APIKeysType;
}

/**
 * Identity fields that can be bound to a fake request by a
 * {@link FakeRequestEnricher}. At least one field should be provided.
 *
 * @internal
 */
export interface FakeRequestUserFields {
  /** The originating user's profile ID, exposed as `profile_uid`. */
  profileId?: string;
  /** The originating user's username, exposed as `username`. */
  username?: string;
}

/**
 * Binds originating-user identity fields to a fake request so
 * `security.authc.getCurrentUser(request)` resolves to a synthetic
 * {@link AuthenticatedUser} exposing only those fields (currently
 * `profile_uid` and `username`). Obtained via
 * {@link SecurityServiceSetup.acquireFakeRequestEnricher}; see that method
 * for the security boundary. Throws on non-fake requests; calling twice on
 * the same fake request is a no-op (first-wins) and emits a warning.
 *
 * @internal Intended for trusted orchestrators that own the fake request
 *   lifecycle (e.g. Task Manager).
 */
export type FakeRequestEnricher = (request: KibanaRequest, user: FakeRequestUserFields) => void;
