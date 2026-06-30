/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { euid } from '@kbn/entity-store/common/euid_helpers';

import { buildActorDiscoveryQuery, buildActorPageFilter } from './build_actor_discovery_query';
import type { RelationshipIntegrationConfig, CompositeBucket } from './types';

const HOST_EUID_FILTER = euid.dsl.getEuidDocumentsContainsIdFilter('host');
const USER_EUID_FILTER = euid.dsl.getEuidDocumentsContainsIdFilter('user');

const accessesConfig: RelationshipIntegrationConfig = {
  kind: 'bucketed',
  id: 'test_accesses',
  name: 'Test Accesses',
  indexPattern: (ns) => `logs-test-${ns}`,
  targetEntityType: 'host',
  bucketTargetByThreshold: {
    threshold: 4,
    aboveThresholdRelationship: 'accesses_frequently',
    belowThresholdRelationship: 'accesses_infrequently',
  },
  requireTargetEntityIdExists: true,
  esqlWhereClause: 'event.action == "log_on" AND event.outcome == "success"',
};

const communicatesConfig: RelationshipIntegrationConfig = {
  kind: 'standard',
  id: 'test_comm',
  name: 'Test Comm',
  indexPattern: (ns) => `logs-okta-${ns}`,
  relationshipKey: 'communicates_with',
  targetEntityType: 'user',
  esqlWhereClause: 'event.action == "user.lifecycle.create"',
};

describe('buildActorDiscoveryQuery (actor discovery)', () => {
  it('includes timestamp range filter', () => {
    const result = buildActorDiscoveryQuery(accessesConfig, undefined);
    const filters = (result as { query: { bool: { filter: Array<Record<string, unknown>> } } })
      .query.bool.filter;
    const hasRange = filters.some(
      (f) => (f.range as Record<string, unknown> | undefined)?.['@timestamp']
    );
    expect(hasRange).toBe(true);
  });

  it('omits the timestamp range filter when disableLookbackWindow is true', () => {
    const config: RelationshipIntegrationConfig = {
      ...accessesConfig,
      disableLookbackWindow: true,
    };
    const filters = (
      buildActorDiscoveryQuery(config, undefined) as {
        query: { bool: { filter: Array<Record<string, unknown>> } };
      }
    ).query.bool.filter;
    const hasRange = filters.some(
      (f) => (f.range as Record<string, unknown> | undefined)?.['@timestamp']
    );
    expect(hasRange).toBe(false);
  });

  it('includes the user-EUID-exists DSL filter (deep-equality, not substring)', () => {
    const filters = (
      buildActorDiscoveryQuery(accessesConfig, undefined) as {
        query: { bool: { filter: Array<Record<string, unknown>> } };
      }
    ).query.bool.filter;
    const expected = JSON.stringify(USER_EUID_FILTER);
    const matches = filters.filter((f) => JSON.stringify(f) === expected);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT inject the engine-side event.outcome == "success" term filter that used to be auto-applied to accesses', () => {
    // The engine must no longer carry "accesses == success" semantics — that
    // belongs in the integration's compositeAggAdditionalFilters. Note: an
    // unrelated `event.outcome != "failure"` baseline appears inside
    // getEuidDocumentsContainsIdFilter and is expected.
    const filters = (
      buildActorDiscoveryQuery(accessesConfig, undefined) as {
        query: { bool: { filter: Array<Record<string, unknown>> } };
      }
    ).query.bool.filter;
    const successTerm = filters.find(
      (f) => JSON.stringify(f) === JSON.stringify({ term: { 'event.outcome': 'success' } })
    );
    expect(successTerm).toBeUndefined();
  });

  describe('requireTargetEntityIdExists', () => {
    it('emits the targetEntityType EUID-exists DSL filter when the flag is true (host target)', () => {
      const filters = (
        buildActorDiscoveryQuery(accessesConfig, undefined) as {
          query: { bool: { filter: Array<Record<string, unknown>> } };
        }
      ).query.bool.filter;
      const expected = JSON.stringify(HOST_EUID_FILTER);
      const hasHostFilter = filters.some((f) => JSON.stringify(f) === expected);
      expect(hasHostFilter).toBe(true);
    });

    it('parameterizes the gate by targetEntityType — a user-targeted config emits the user-EUID filter, not host', () => {
      const userTargetConfig: RelationshipIntegrationConfig = {
        ...communicatesConfig,
        requireTargetEntityIdExists: true,
      };
      const filters = (
        buildActorDiscoveryQuery(userTargetConfig, undefined) as {
          query: { bool: { filter: Array<Record<string, unknown>> } };
        }
      ).query.bool.filter;

      const hostShape = JSON.stringify(HOST_EUID_FILTER);
      const userShape = JSON.stringify(USER_EUID_FILTER);
      // User-EUID filter appears at least twice (actor identity + target gate),
      // host-EUID filter never appears as a top-level filter.
      const userMatches = filters.filter((f) => JSON.stringify(f) === userShape).length;
      const hostMatches = filters.filter((f) => JSON.stringify(f) === hostShape).length;
      expect(userMatches).toBeGreaterThanOrEqual(2);
      expect(hostMatches).toBe(0);
    });

    it('does NOT emit a target EUID-exists filter when the flag is omitted', () => {
      const filters = (
        buildActorDiscoveryQuery(communicatesConfig, undefined) as {
          query: { bool: { filter: Array<Record<string, unknown>> } };
        }
      ).query.bool.filter;
      // Only the actor-side user EUID filter should appear; no second copy and no host filter.
      const userShape = JSON.stringify(USER_EUID_FILTER);
      const hostShape = JSON.stringify(HOST_EUID_FILTER);
      const userMatches = filters.filter((f) => JSON.stringify(f) === userShape).length;
      const hostMatches = filters.filter((f) => JSON.stringify(f) === hostShape).length;
      expect(userMatches).toBe(1);
      expect(hostMatches).toBe(0);
    });
  });

  it('uses customActor.fields as composite sources when provided (structural, not substring)', () => {
    const config: RelationshipIntegrationConfig = {
      ...accessesConfig,
      customActor: { fields: ['custom.actor.field'] },
    };
    const result = buildActorDiscoveryQuery(config, undefined) as {
      aggs: {
        users: {
          composite: { sources: Array<Record<string, { terms: { field: string } }>> };
        };
      };
    };
    const sources = result.aggs.users.composite.sources;
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual({
      'custom.actor.field': { terms: { field: 'custom.actor.field', missing_bucket: true } },
    });
  });

  it('uses customActor.fields in bucket filter when provided', () => {
    const config: RelationshipIntegrationConfig = {
      ...accessesConfig,
      customActor: { fields: ['custom.actor.field'] },
    };
    const buckets: CompositeBucket[] = [{ key: { 'custom.actor.field': 'alice' }, doc_count: 1 }];
    const result = buildActorPageFilter(config, buckets);
    expect(JSON.stringify(result)).toContain('custom.actor.field');
    expect(JSON.stringify(result)).toContain('alice');
  });

  // Regression: every config — including `kind: 'override'` — goes through
  // Step 1 actor discovery. Hardcoding the ECS user-EUID-exists DSL filter
  // here silently drops every document whose actor identity lives entirely
  // in `customActor.fields` (e.g. Azure auditlogs docs that have only
  // `azure.auditlogs.properties.initiated_by.user.userPrincipalName`), so
  // Step 2 — including override Step 2s — never sees those actors.
  describe('customActor base actor-presence filter (no ECS user.* dependency)', () => {
    const customField = 'azure.auditlogs.properties.initiated_by.user.userPrincipalName';
    const customActorConfig: RelationshipIntegrationConfig = {
      ...communicatesConfig,
      customActor: { fields: [customField] },
    };

    it('does NOT include the ECS user-EUID-exists DSL filter when customActor is set', () => {
      const filters = (
        buildActorDiscoveryQuery(customActorConfig, undefined) as {
          query: { bool: { filter: Array<Record<string, unknown>> } };
        }
      ).query.bool.filter;
      const userShape = JSON.stringify(USER_EUID_FILTER);
      expect(filters.some((f) => JSON.stringify(f) === userShape)).toBe(false);
    });

    it('emits an "at least one of customActor.fields is non-empty" filter (each clause: exists AND != "")', () => {
      const multiFieldConfig: RelationshipIntegrationConfig = {
        ...communicatesConfig,
        customActor: { fields: ['custom.actor.one', 'custom.actor.two'] },
      };
      const filters = (
        buildActorDiscoveryQuery(multiFieldConfig, undefined) as {
          query: { bool: { filter: Array<Record<string, unknown>> } };
        }
      ).query.bool.filter;
      const presenceFilter = filters.find(
        (f) =>
          JSON.stringify(f).includes('custom.actor.one') &&
          JSON.stringify(f).includes('custom.actor.two')
      ) as
        | {
            bool: {
              should: Array<{
                bool: { must: Array<Record<string, unknown>> };
              }>;
              minimum_should_match: number;
            };
          }
        | undefined;
      expect(presenceFilter).toBeDefined();
      expect(presenceFilter!.bool.minimum_should_match).toBe(1);
      expect(presenceFilter!.bool.should).toHaveLength(2);
      // Each clause requires the field to exist AND not equal the empty string.
      const clauseFields = presenceFilter!.bool.should.map((s) => {
        const exists = s.bool.must.find((m) => 'exists' in m) as
          | { exists: { field: string } }
          | undefined;
        return exists?.exists.field;
      });
      expect(new Set(clauseFields)).toEqual(new Set(['custom.actor.one', 'custom.actor.two']));
    });

    it('preserves the existing requireTargetEntityIdExists target-EUID gate when set alongside customActor', () => {
      const filters = (
        buildActorDiscoveryQuery(
          { ...customActorConfig, requireTargetEntityIdExists: true },
          undefined
        ) as { query: { bool: { filter: Array<Record<string, unknown>> } } }
      ).query.bool.filter;
      // The actor-side filter must NOT include the ECS user-EUID gate, but
      // the target-side gate (parameterized by targetEntityType: 'user' for
      // communicatesConfig) IS still emitted as a separate filter.
      const userShape = JSON.stringify(USER_EUID_FILTER);
      const userMatches = filters.filter((f) => JSON.stringify(f) === userShape).length;
      // requireTargetEntityIdExists with targetEntityType 'user' adds the
      // user-EUID filter once (target-side only); the actor side uses the
      // custom-fields presence filter instead.
      expect(userMatches).toBe(1);
    });
  });

  it('includes afterKey in composite sources when provided', () => {
    const afterKey = { 'user.name': 'alice', 'user.email': null };
    const result = buildActorDiscoveryQuery(accessesConfig, afterKey);
    expect(JSON.stringify(result)).toContain('alice');
  });

  it('appends compositeAggAdditionalFilters to the base filters (deep-equality, not substring)', () => {
    const extra = { term: { 'event.action': 'log_on' } };
    const config: RelationshipIntegrationConfig = {
      ...accessesConfig,
      compositeAggAdditionalFilters: [extra],
    };
    const filters = (
      buildActorDiscoveryQuery(config, undefined) as {
        query: { bool: { filter: Array<Record<string, unknown>> } };
      }
    ).query.bool.filter;
    expect(filters.some((f) => JSON.stringify(f) === JSON.stringify(extra))).toBe(true);
  });

  it('does NOT include extra event filters when compositeAggAdditionalFilters is absent', () => {
    const result = buildActorDiscoveryQuery(accessesConfig, undefined);
    const queryStr = JSON.stringify(result);
    expect(queryStr).not.toContain('log_on');
  });
});

describe('buildActorPageFilter (page filter)', () => {
  it('returns a bool/should filter for user identity fields', () => {
    const buckets: CompositeBucket[] = [
      { key: { 'user.email': 'alice@corp', 'user.name': null }, doc_count: 2 },
    ];
    const result = buildActorPageFilter(accessesConfig, buckets);
    expect(JSON.stringify(result)).toContain('alice@corp');
  });

  it('returns a match_none filter when buckets is empty', () => {
    const result = buildActorPageFilter(accessesConfig, []);
    expect(JSON.stringify(result)).toContain('must_not');
  });

  // Locks the tuple-vs-OR documentation contract on `buildActorPageFilter`.
  // The function deliberately emits `field1 IN [...] OR field2 IN [...]`
  // rather than `(field1=a AND field2=b) OR (field1=c AND field2=d) ...`.
  // This is a strict superset of the bucket tuples but is safe given the
  // EUID-collapse invariant (one EUID per doc, single source field).
  describe('tuple-vs-OR page-filter contract (D.2)', () => {
    it('emits an OR-of-terms-per-field, NOT a tuple-of-AND-per-bucket', () => {
      // Two buckets that, taken as tuples, are
      //   (user.name=alice, user.email=null)
      //   (user.name=null,  user.email=bob@x)
      // The page filter should emit
      //   user.name IN [alice] OR user.email IN [bob@x]
      // (also matching a doc with name=alice AND email=bob@x — false-positive
      // tolerated; see the file-level docblock).
      const buckets: CompositeBucket[] = [
        { key: { 'user.name': 'alice', 'user.email': null }, doc_count: 1 },
        { key: { 'user.name': null, 'user.email': 'bob@x' }, doc_count: 1 },
      ];
      const result = buildActorPageFilter(accessesConfig, buckets) as {
        bool: { should: Array<{ terms: Record<string, string[]> }>; minimum_should_match: number };
      };
      expect(result.bool.minimum_should_match).toBe(1);

      // OR-of-terms-per-field: at most one `terms` clause per field, never a
      // bool/must per bucket.
      const fields = result.bool.should.map((clause) => Object.keys(clause.terms ?? {})).flat();
      expect(new Set(fields)).toEqual(new Set(['user.name', 'user.email']));
      expect(result.bool.should).toHaveLength(2);

      const byField = Object.fromEntries(
        result.bool.should.map((c) => Object.entries(c.terms)).flat()
      );
      expect(byField['user.name']).toEqual(['alice']);
      expect(byField['user.email']).toEqual(['bob@x']);
    });

    it('deduplicates values per field across buckets (no exploded-tuple growth)', () => {
      // Five buckets that share the same `user.name` value: the page filter
      // collapses to a single `user.name IN [alice]` clause, NOT five copies.
      const buckets: CompositeBucket[] = [
        { key: { 'user.name': 'alice', 'user.email': 'alice@a' }, doc_count: 1 },
        { key: { 'user.name': 'alice', 'user.email': 'alice@b' }, doc_count: 1 },
        { key: { 'user.name': 'alice', 'user.email': 'alice@c' }, doc_count: 1 },
        { key: { 'user.name': 'alice', 'user.email': 'alice@d' }, doc_count: 1 },
        { key: { 'user.name': 'alice', 'user.email': 'alice@e' }, doc_count: 1 },
      ];
      const result = buildActorPageFilter(accessesConfig, buckets) as {
        bool: { should: Array<{ terms: Record<string, string[]> }> };
      };
      const byField = Object.fromEntries(
        result.bool.should.map((c) => Object.entries(c.terms)).flat()
      );
      expect(byField['user.name']).toEqual(['alice']);
      expect(byField['user.email'].sort()).toEqual([
        'alice@a',
        'alice@b',
        'alice@c',
        'alice@d',
        'alice@e',
      ]);
    });

    it('uses customActor.fields verbatim (proves the page filter is data-driven, not hardcoded to ECS user.*)', () => {
      // Locks the EUID-collapse invariant: the page filter only uses fields
      // declared on `customActor.fields`. A future config that uses a custom
      // actor field set gets a page filter over THOSE fields. If a future
      // refactor accidentally hardcodes ECS user.*, this test catches it
      // (the produced filter would not contain the custom field).
      const config: RelationshipIntegrationConfig = {
        ...accessesConfig,
        customActor: { fields: ['azure.auditlogs.properties.initiated_by.user.userPrincipalName'] },
      };
      const buckets: CompositeBucket[] = [
        {
          key: {
            'azure.auditlogs.properties.initiated_by.user.userPrincipalName': 'alice@tenant',
          },
          doc_count: 1,
        },
      ];
      const result = buildActorPageFilter(config, buckets) as {
        bool: { should: Array<{ terms: Record<string, string[]> }> };
      };
      const byField = Object.fromEntries(
        result.bool.should.map((c) => Object.entries(c.terms)).flat()
      );
      expect(byField['azure.auditlogs.properties.initiated_by.user.userPrincipalName']).toEqual([
        'alice@tenant',
      ]);
      // ECS user.* fields are NOT present — there is no hardcoded fallback.
      expect(byField['user.name']).toBeUndefined();
      expect(byField['user.email']).toBeUndefined();
    });
  });
});
