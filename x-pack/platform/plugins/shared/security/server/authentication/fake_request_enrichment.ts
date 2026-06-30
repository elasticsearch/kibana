/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import type { FakeRequestEnricher } from '@kbn/core-security-server';
import type { Logger } from '@kbn/logging';
import { deepFreeze } from '@kbn/std';

/**
 * Identity fields suppressed on the enriched user — reads return `undefined`
 * (matching the pre-enrichment `getCurrentUser === null` contract). Only
 * `profile_uid` and `username` are intentionally exposed. The
 * `Record<keyof Omit<...>>` shape keeps this list in sync with
 * `AuthenticatedUser` via the type checker.
 */
const ENRICHED_USER_BLOCKED_PROPERTIES_RECORD: Record<
  keyof Omit<AuthenticatedUser, 'profile_uid' | 'username'>,
  true
> = {
  email: true,
  full_name: true,
  roles: true,
  enabled: true,
  metadata: true,
  authentication_realm: true,
  lookup_realm: true,
  authentication_provider: true,
  authentication_type: true,
  elastic_cloud_user: true,
  operator: true,
  api_key: true,
};

const ENRICHED_USER_BLOCKED_PROPERTIES = new Set<string>(
  Object.keys(ENRICHED_USER_BLOCKED_PROPERTIES_RECORD)
);

/** Captured at enrichment time so {@link getOverride} can detect a confused-deputy header swap. */
interface EnrichmentEntry {
  user: AuthenticatedUser;
  authorization: string | undefined;
}

export interface FakeRequestEnrichment {
  enrichRequestWithUserProfile: FakeRequestEnricher;
  getOverride(request: KibanaRequest): AuthenticatedUser | undefined;
}

const readAuthorization = (request: KibanaRequest): string | undefined => {
  const value = request.headers.authorization;
  return typeof value === 'string' ? value : undefined;
};

export const createFakeRequestEnrichment = (logger: Logger): FakeRequestEnrichment => {
  const fakeRequestEntries = new WeakMap<KibanaRequest, EnrichmentEntry>();

  const enrichRequestWithUserProfile: FakeRequestEnricher = (request, { profileId, username }) => {
    if (!request.isFakeRequest) {
      throw new Error(
        `enrichRequestWithUserProfile must only be called on a fake request ` +
          `(profile_uid="${profileId}").`
      );
    }

    if (fakeRequestEntries.has(request)) {
      logger.warn(
        `enrichRequestWithUserProfile called on an already-enriched fake request; ignoring ` +
          `the new enrichment (profile_uid="${profileId}").`
      );
      return;
    }

    logger.debug(`Enriching request with user profile ID "${profileId}".`);

    // Only `profile_uid` and `username` are exposed; blocked fields return
    // undefined, other props (symbols, `then`, `toJSON`) fall through so JS
    // reflection works.
    const enrichedUserStub: Partial<AuthenticatedUser> = {
      profile_uid: profileId,
      username,
    };
    const enrichedUser = deepFreeze(
      new Proxy(enrichedUserStub as AuthenticatedUser, {
        get: (target, prop, receiver) => {
          if (typeof prop === 'string' && ENRICHED_USER_BLOCKED_PROPERTIES.has(prop)) {
            return undefined;
          }
          return Reflect.get(target, prop, receiver);
        },
      })
    );

    fakeRequestEntries.set(request, {
      user: enrichedUser,
      authorization: readAuthorization(request),
    });
  };

  const getOverride = (request: KibanaRequest): AuthenticatedUser | undefined => {
    const entry = fakeRequestEntries.get(request);
    if (!entry) {
      return undefined;
    }

    // Detect post-enrichment `authorization` swap and refuse to vouch for the profile.
    const currentAuthorization = readAuthorization(request);
    if (currentAuthorization !== entry.authorization) {
      logger.error(
        `Authorization header on an enriched fake request was mutated after enrichment; ` +
          `refusing to expose the bound user profile to avoid a confused-deputy.`
      );
      return undefined;
    }

    return entry.user;
  };

  return {
    enrichRequestWithUserProfile,
    getOverride,
  };
};
