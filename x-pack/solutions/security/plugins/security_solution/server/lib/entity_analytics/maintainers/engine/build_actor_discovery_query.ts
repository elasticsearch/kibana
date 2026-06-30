/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { euid } from '@kbn/entity-store/common/euid_helpers';
import { getEuidSourceFields } from '@kbn/entity-store/common/domain/euid';

import type { RelationshipIntegrationConfig, CompositeAfterKey, CompositeBucket } from './types';
import { LOOKBACK_WINDOW, COMPOSITE_PAGE_SIZE } from './constants';

/**
 * Returns the @timestamp lookback filter when the config does not opt out, or
 * an empty array when it does. Applied identically to Step 1 (DSL composite
 * agg) and Step 2 (ES|QL wrapper filter) so the two query stages narrow on the
 * same time range.
 */
export const buildLookbackFilter = (
  config: RelationshipIntegrationConfig
): QueryDslQueryContainer[] =>
  config.disableLookbackWindow
    ? []
    : [{ range: { '@timestamp': { gte: LOOKBACK_WINDOW, lt: 'now' } } }];

// TODO(#266748): actorEntityType is hardcoded to 'user' — add actorEntityType to
// RelationshipIntegrationConfig to support host→host, host→service, and service→* relationships.
const USER_IDENTITY_FIELDS = getEuidSourceFields('user').requiresOneOf;

/**
 * "At least one of these fields exists and is non-empty" DSL.
 *
 * Used as the base actor-presence filter when the config supplies its own
 * `customActor.fields`. The default path (no `customActor`) keeps using
 * `euid.dsl.getEuidDocumentsContainsIdFilter('user')`, which carries the
 * full ECS user-EUID semantics (including the `event.outcome != "failure"`
 * baseline) — that behaviour is unchanged here. This helper exists only so
 * configs whose actor identity lives outside ECS `user.*` (e.g. Azure
 * auditlogs `…initiated_by.user.userPrincipalName`) are not silently
 * filtered out by an ECS-shape requirement they cannot satisfy.
 */
const buildAnyActorFieldNonEmptyDsl = (fields: string[]): QueryDslQueryContainer => ({
  bool: {
    should: fields.map((field) => ({
      bool: {
        must: [{ exists: { field } }, { bool: { must_not: { term: { [field]: '' } } } }],
      },
    })),
    minimum_should_match: 1,
  },
});

export const buildActorDiscoveryQuery = (
  config: RelationshipIntegrationConfig,
  afterKey: CompositeAfterKey | undefined
): Record<string, unknown> => {
  const actorFields = config.customActor?.fields ?? USER_IDENTITY_FIELDS;

  // Step 1 runs for every kind, including `kind: 'override'`. Hardcoding the
  // user-EUID DSL filter here would silently drop documents whose actor
  // identity lives entirely in `customActor.fields` (Azure auditlogs is the
  // canonical case), and Step 2 — including override Step 2s — would never
  // see those actors. Match the gate to the actor-fields the config declares.
  const actorPresenceFilter: QueryDslQueryContainer = config.customActor
    ? buildAnyActorFieldNonEmptyDsl(config.customActor.fields)
    : euid.dsl.getEuidDocumentsContainsIdFilter('user');

  // The @timestamp lookback is a log-index assumption. Entity-index configs
  // (e.g. administers) opt out via `disableLookbackWindow` and gate freshness
  // on `entity.lifecycle.last_seen` instead. See `disableLookbackWindow` docs.
  const baseFilters: QueryDslQueryContainer[] = [
    ...buildLookbackFilter(config),
    actorPresenceFilter,
  ];

  if (config.requireTargetEntityIdExists) {
    baseFilters.push(euid.dsl.getEuidDocumentsContainsIdFilter(config.targetEntityType));
  }

  if (config.compositeAggAdditionalFilters?.length) {
    baseFilters.push(...config.compositeAggAdditionalFilters);
  }

  return {
    size: 0,
    query: { bool: { filter: baseFilters } },
    aggs: {
      users: {
        composite: {
          size: COMPOSITE_PAGE_SIZE,
          ...(afterKey ? { after: afterKey } : {}),
          sources: actorFields.map((field) => ({
            [field]: { terms: { field, missing_bucket: true } },
          })),
        },
      },
    },
  };
};

/**
 * Builds the page filter that narrows the Step 2 ES|QL query to the actors
 * surfaced by Step 1's composite aggregation.
 *
 * **Tuple-vs-OR semantic — required reading for future maintainers.**
 *
 * Composite-aggregation buckets are tuples over the `actorFields`. With
 * default ECS user fields, the bucket key is something like
 * `(user.name=alice, user.email=null)` or `(user.name=null, user.email=bob@x)`.
 * To re-fetch documents for a page of buckets we'd ideally rebuild the same
 * tuples — but Elasticsearch has no compact "any-of-these-tuples" filter,
 * and writing one bool-`should`-of-bool-`must` per bucket explodes for
 * `COMPOSITE_PAGE_SIZE = 3500`. So this function emits the simpler
 *
 *   `{ user.name IN [alice, ...] OR user.email IN [bob@x, ...] OR ... }`
 *
 * which is a strict superset of the tuples: it also matches a hypothetical
 * doc with `(user.name=alice, user.email=bob@x)` even though no such bucket
 * exists. Step 2 then receives some false-positive actors.
 *
 * **Why that's safe today (the "EUID collapse" invariant).**
 *
 * Step 2 computes `actorUserId = EUID(user.*)` per document and `STATS … BY
 * actorUserId`. The EUID is a *function of a single identity field* (e.g.
 * `user:alice@…` or `user:bob@x@…`), chosen by deterministic precedence
 * across `USER_IDENTITY_FIELDS`. So a false-positive document with both
 * `user.name=alice` and `user.email=bob@x` collapses into either
 * `user:alice@…` (if precedence picks `user.name`) or `user:bob@x@…`,
 * never into a *new* `actorUserId`. Each Step 2 row's `actorUserId`
 * therefore corresponds to some bucket that Step 1 actually saw — the
 * false positive's data joins the right actor's row instead of fabricating
 * an unrelated one.
 *
 * This invariant lives in `@kbn/entity-store`'s EUID helpers (one EUID per
 * doc, single source field). Composite sources that violate it (e.g. a
 * future custom `actorFields` that derives EUID from a *combination* of
 * fields) would corrupt this query — record numbers per actor would drift
 * because the page filter would surface unrelated documents.
 */
export const buildActorPageFilter = (
  config: RelationshipIntegrationConfig,
  buckets: CompositeBucket[]
): QueryDslQueryContainer => {
  const actorFields = config.customActor?.fields ?? USER_IDENTITY_FIELDS;

  if (buckets.length === 0) {
    return { bool: { must_not: { match_all: {} } } };
  }

  const valuesByField = new Map<string, Set<string>>();
  for (const bucket of buckets) {
    for (const field of actorFields) {
      const value = bucket.key[field];
      if (value != null) {
        let fieldSet = valuesByField.get(field);
        if (!fieldSet) {
          fieldSet = new Set();
          valuesByField.set(field, fieldSet);
        }
        fieldSet.add(value);
      }
    }
  }

  const should: QueryDslQueryContainer[] = [];
  for (const [field, values] of valuesByField) {
    should.push({ terms: { [field]: Array.from(values) } });
  }

  if (should.length === 0) {
    return { bool: { must_not: { match_all: {} } } };
  }

  return { bool: { should, minimum_should_match: 1 } };
};
