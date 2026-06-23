/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { AuthenticatedUser } from '@kbn/core-security-common';

import { createFakeRequestEnrichment } from './fake_request_enrichment';

describe('createFakeRequestEnrichment', () => {
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    logger = loggingSystemMock.createLogger();
  });

  it('returns an enricher and an override getter bound to the same WeakMap', () => {
    const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
    const request = httpServerMock.createFakeKibanaRequest({});

    expect(getOverride(request)).toBeUndefined();

    enrichRequestWithUserProfile(request, 'u_test_profile_123');

    const override = getOverride(request);
    expect(override).toBeDefined();
    expect(override!.profile_uid).toBe('u_test_profile_123');
  });

  describe('enrichRequestWithUserProfile', () => {
    it('exposes the given profile_uid on the enriched user', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({});

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      const user = getOverride(request);
      expect(user).toBeDefined();
      expect(user!.profile_uid).toBe('u_test_profile_123');
    });

    it.each<keyof AuthenticatedUser>([
      'username',
      'email',
      'full_name',
      'roles',
      'enabled',
      'metadata',
      'authentication_realm',
      'lookup_realm',
      'authentication_provider',
      'authentication_type',
      'elastic_cloud_user',
      'operator',
      'api_key',
    ])('returns undefined when reading "%s" off the enriched user', (property) => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({});

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      const user = getOverride(request)!;
      expect(user[property]).toBeUndefined();
    });

    it.each(['someUnknownProp', 'then', 'toJSON'])(
      'returns undefined (not throw) for non-AuthenticatedUser string-keyed property "%s"',
      (property) => {
        const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
        const request = httpServerMock.createFakeKibanaRequest({});

        enrichRequestWithUserProfile(request, 'u_test_profile_123');

        const user = getOverride(request)! as unknown as Record<string, unknown>;
        expect(user[property]).toBeUndefined();
      }
    );

    it('allows symbol-keyed access so JS reflection on the enriched user does not throw', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({});

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      const user = getOverride(request)!;
      expect(() => (user as any)[Symbol.toPrimitive]).not.toThrow();
      expect(() => (user as any)[Symbol.toStringTag]).not.toThrow();
      expect(() => (user as any)[Symbol.iterator]).not.toThrow();
    });

    it('flows through Promise.resolve / async return without throwing on `.then`', async () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({});

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      const asyncReturn = async () => getOverride(request);
      const resolved = await asyncReturn();
      expect(resolved!.profile_uid).toBe('u_test_profile_123');
    });

    it('serializes via JSON.stringify with only the profile_uid exposed', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({});

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      const user = getOverride(request)!;
      expect(JSON.parse(JSON.stringify(user))).toEqual({ profile_uid: 'u_test_profile_123' });
    });

    it('returns a frozen enriched user', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({});

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      const user = getOverride(request)!;
      expect(Object.isFrozen(user)).toBe(true);
    });

    it('does not affect other fake requests', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const enrichedRequest = httpServerMock.createFakeKibanaRequest({});
      const otherRequest = httpServerMock.createFakeKibanaRequest({});

      enrichRequestWithUserProfile(enrichedRequest, 'u_enriched');

      expect(getOverride(otherRequest)).toBeUndefined();
    });

    it('throws and does not populate the override when called on a real (non-fake) request', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const realRequest = httpServerMock.createKibanaRequest();

      expect(() => enrichRequestWithUserProfile(realRequest, 'u_profile_123')).toThrow(
        /must only be called on a fake request/
      );

      expect(getOverride(realRequest)).toBeUndefined();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('warns and keeps the original enrichment when called twice on the same fake request', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({});

      enrichRequestWithUserProfile(request, 'u_first');
      enrichRequestWithUserProfile(request, 'u_second');

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('already-enriched'));
      expect(getOverride(request)!.profile_uid).toBe('u_first');
    });
  });

  describe('getOverride confused-deputy protection', () => {
    it('returns the enriched user when the authorization header is unchanged', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({
        headers: { authorization: 'ApiKey original' },
      });

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      const user = getOverride(request);
      expect(user!.profile_uid).toBe('u_test_profile_123');
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('handles requests with no authorization header on both enrichment and lookup', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({ headers: {} });

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      const user = getOverride(request);
      expect(user!.profile_uid).toBe('u_test_profile_123');
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('refuses to expose the bound user when authorization is swapped after enrichment', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({
        headers: { authorization: 'ApiKey original' },
      });

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      (request.headers as Record<string, string | undefined>).authorization = 'ApiKey attacker';

      expect(getOverride(request)).toBeUndefined();
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('mutated after enrichment')
      );
    });

    it('refuses to expose the bound user when authorization is removed after enrichment', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({
        headers: { authorization: 'ApiKey original' },
      });

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      delete (request.headers as Record<string, string | undefined>).authorization;

      expect(getOverride(request)).toBeUndefined();
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('refuses to expose the bound user when authorization is added after enrichment', () => {
      const { enrichRequestWithUserProfile, getOverride } = createFakeRequestEnrichment(logger);
      const request = httpServerMock.createFakeKibanaRequest({ headers: {} });

      enrichRequestWithUserProfile(request, 'u_test_profile_123');

      (request.headers as Record<string, string | undefined>).authorization = 'ApiKey attacker';

      expect(getOverride(request)).toBeUndefined();
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
