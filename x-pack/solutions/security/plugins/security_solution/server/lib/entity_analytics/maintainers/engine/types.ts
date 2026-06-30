/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { EntityRelationshipKey } from '@kbn/entity-store/common/domain/definitions/common_fields';

export interface CompositeAfterKey {
  [key: string]: string | null;
}

export interface CompositeBucket {
  key: CompositeAfterKey;
  doc_count: number;
}

export type TargetEntityType = 'host' | 'user' | 'service';

/**
 * ES|QL identifier-quoting convention for config authors.
 *
 * The engine substitutes user-supplied ES|QL fragments (`esqlWhereClause`,
 * `targetEvalOverride`, `customActor.evalOverride`, `additionalTargetFilter`,
 * and the bodies of `esqlQueryOverride` functions) directly into the
 * generated query. ES|QL's identifier rules apply:
 *
 * - **Bare identifiers** (no quoting) work for ECS-style dotted names whose
 *   every segment starts with a letter and contains only alnum + underscore:
 *   `event.action`, `user.target.email`, `host.target.entity.id`. This is
 *   the common case — the four shipped accesses configs and three of the
 *   four communicates_with configs use bare identifiers throughout.
 *
 * - **Backtick-quoted identifiers** (`` `field.name` ``) are REQUIRED when
 *   the dotted name contains a segment that is not a valid bare identifier,
 *   for example a numeric segment or a reserved word:
 *   `` `azure.auditlogs.properties.target_resources.0.type` `` — note the
 *   numeric `.0.` segment. The Azure override uses backticks for every
 *   such field; un-quoted these would be ES|QL parse errors.
 *
 * Forgetting backticks on a dotted-numeric field surfaces as an ES|QL
 * `Unknown column` or `expecting identifier` error at run time, not at
 * compile time. When in doubt, run the produced query against a populated
 * cluster and the parse error will point at the offending identifier.
 */

/**
 * Bucket-classification config: actor→target pairs with `COUNT(*) >= threshold`
 * are classified into `aboveThresholdRelationship`, the rest into
 * `belowThresholdRelationship`. Every field is required so the engine carries
 * no implicit data-tuning defaults and bucket relationship keys are declared
 * explicitly at the call site (no engine-level coupling to specific schema
 * field names). Both keys must be members of the entity store's
 * `EntityRelationshipKey` union (TypeScript enforces this).
 */
export interface BucketTargetByThresholdConfig {
  threshold: number;
  aboveThresholdRelationship: EntityRelationshipKey;
  belowThresholdRelationship: EntityRelationshipKey;
}

/**
 * Custom actor binding — used by integrations whose actor is not in standard
 * ECS user.* fields (e.g. azure_auditlogs reads
 * `azure.auditlogs.properties.initiated_by.user.userPrincipalName`).
 *
 * `fields` and `evalOverride` are co-located so a config cannot set the Step 2
 * actor EUID expression (`evalOverride`) without also declaring the Step 1
 * composite-agg sources (`fields`). Without that pairing, Step 1 would
 * bucket-discover on ECS `user.*` while Step 2 computed the EUID from custom
 * fields, and Step 1 and Step 2 would silently surface different actor sets.
 */
export interface CustomActorBinding {
  /** Composite-agg sources + bucket filter keys (Step 1, all variants). */
  fields: string[];
  /**
   * ESQL expression for the actor EUID (Step 2 default builder only).
   * Used by `kind: 'standard'` and `kind: 'bucketed'` configs. Override
   * configs compute the actor EUID inside their override fn — set `fields`
   * here for Step 1 narrowing parity, but `evalOverride` is unused for them.
   * Defaults to `euid.esql.getEuidEvaluation('user', { withTypeId: true })`.
   *
   * Identifiers must follow the quoting convention described at the top of
   * this file (backticks required for dotted-numeric or reserved-word
   * segments, bare identifiers otherwise).
   */
  evalOverride?: string;
}

/**
 * Fields shared by every variant — the engine reads these regardless of
 * whether the config uses the default ES|QL builder or supplies its own
 * override (Step 1 composite-agg discovery always uses these).
 */
interface RelationshipIntegrationBase {
  /** Unique machine-readable identifier, e.g. 'elastic_defend'. */
  id: string;
  /** Human-readable name used in log messages. */
  name: string;
  /** Returns the Elasticsearch index pattern for this integration in the given namespace. */
  indexPattern: (namespace: string) => string;
  /** Entity type of the relationship target (controls the default target EVAL). */
  targetEntityType: TargetEntityType;
  /**
   * Additional DSL filters applied to the composite aggregation (Step 1).
   * Use this to mirror the same data-shape narrowing that the ES|QL query applies
   * in Step 2 (e.g. event.action / event.outcome term filters), so the actors
   * surfaced in Step 1 actually have matching documents in Step 2.
   */
  compositeAggAdditionalFilters?: QueryDslQueryContainer[];
  /**
   * When true, both Step 1 (composite agg) and Step 2 (ES|QL) require the source
   * document to contain a resolvable EUID for `targetEntityType`. Use this for
   * integrations whose target field is mandatory on every event (e.g. logon
   * events always carry a host). The gate is parameterized by `targetEntityType`,
   * so a user-targeted config with this flag emits a `user.*` existence check
   * and a host-targeted config emits a `host.*` existence check.
   *
   * Setting it makes Step 1 and Step 2 narrow consistently — without it, an
   * `esqlWhereClause` that filters to events with a target EUID would still
   * surface actors in Step 1 who never appear in such events, wasting Step 2
   * work and risking MAX_ITERATIONS exhaustion.
   *
   * Note: this flag affects Step 1 always, but only affects Step 2 for
   * `kind: 'standard'` and `kind: 'bucketed'` (the default ES|QL builder).
   * `kind: 'override'` configs control Step 2 entirely via their override fn.
   */
  requireTargetEntityIdExists?: boolean;
  /**
   * Optional override of the actor identity. Set this for integrations whose
   * actor is not in standard ECS `user.*` fields. Combining `fields` and
   * (optional) `evalOverride` in a single object guarantees Step 1 sources
   * and Step 2 EUID expression describe the same actor — they cannot drift.
   */
  customActor?: CustomActorBinding;
  /**
   * When true, the engine validates each derived target EUID against the entity
   * index before writing, filtering out any IDs that have no matching entity
   * document. Use this for `kind: 'override'` raw_identifiers-based maintainers
   * (e.g. administers) whose targets are inferred from free-text fields like
   * `raw_identifiers.host.name` — a field value does not guarantee an entity
   * exists. Log-based maintainers (accesses, communicates_with) derive targets
   * from real ECS host/user identity fields that extraction already indexed, so
   * the extra round-trip is unnecessary for them.
   *
   * Default (false/undefined): no validation, existing behavior preserved.
   */
  validateTargetIds?: boolean;
  /**
   * When true, the engine omits its default `@timestamp >= now-30d` lookback
   * filter from both Step 1 (composite agg) and Step 2 (ES|QL wrapper).
   *
   * The lookback is a *log-index* assumption: log-based maintainers only care
   * about recent events, and a 30-day window bounds the scan. But configs whose
   * `indexPattern` targets the **entity index** (`.entities.v2.latest`) read
   * one snapshot doc per entity, whose `@timestamp` tracks the transform's
   * write time, not event recency — applying the lookback there silently drops
   * entities the maintainer must process. Such configs set this flag and rely
   * on their own freshness gate instead (e.g. an `entity.lifecycle.last_seen`
   * watermark in `compositeAggAdditionalFilters` / the override query).
   *
   * Default (false/undefined): the lookback is applied, preserving existing
   * log-based maintainer behavior.
   */
  disableLookbackWindow?: boolean;
}

/**
 * Fields used only by the default ES|QL builder (i.e. by `kind: 'standard'`
 * and `kind: 'bucketed'`). Override configs do not carry these because they
 * generate the entire Step 2 query themselves.
 */
interface StandardBuilderFields {
  /**
   * Integration-specific ESQL WHERE clause — the single source of integration-specific
   * query logic. The engine adds only timestamp + actor-identity + (optional)
   * target-EUID existence filters; everything else (event.action, event.outcome,
   * etc.) belongs here.
   *
   * Identifiers must follow the quoting convention described at the top of
   * this file (backticks required for dotted-numeric or reserved-word
   * segments, bare identifiers otherwise).
   */
  esqlWhereClause: string;
  /**
   * Optional ESQL expression for the target entity ID.
   * Defaults to euid.esql.getEuidEvaluation(targetEntityType, { withTypeId: true }).
   * Required for integrations with non-standard target fields (e.g. okta,
   * aws_cloudtrail communicates_with).
   *
   * Identifiers must follow the quoting convention described at the top of
   * this file (backticks required for dotted-numeric or reserved-word
   * segments, bare identifiers otherwise).
   */
  targetEvalOverride?: string;
  /**
   * Optional additional filter appended after the standard empty-guard post-EVAL.
   * Use when the target eval can produce non-empty but semantically empty EUIDs.
   * Example: 'AND targetEntityId != "user:@okta"' for okta.
   *
   * Identifiers must follow the quoting convention described at the top of
   * this file.
   */
  additionalTargetFilter?: string;
}

/**
 * Standard config: default ES|QL builder, single relationship column named
 * after `relationshipKey` (e.g. `communicates_with`). The `relationshipKey`
 * is also the entity.relationships key the parser writes to.
 */
export interface StandardRelationshipIntegrationConfig
  extends RelationshipIntegrationBase,
    StandardBuilderFields {
  kind: 'standard';
  relationshipKey: EntityRelationshipKey;
}

/**
 * Bucketed config: default ES|QL builder, two relationship columns based on
 * access-count classification. The bucket pair declares both
 * `entity.relationships.<key>` keys this maintainer writes to, so no separate
 * `relationshipKey` is required.
 */
export interface BucketedRelationshipIntegrationConfig
  extends RelationshipIntegrationBase,
    StandardBuilderFields {
  kind: 'bucketed';
  bucketTargetByThreshold: BucketTargetByThresholdConfig;
}

/**
 * Override config: integration supplies the entire Step 2 ES|QL query. Use only
 * when the standard builder cannot express the integration's query (e.g.
 * multi-type targets, non-ECS actor fields).
 *
 * The override does NOT receive any of these engine-provided behaviours:
 * - actor / target EUID existence filters in Step 2 (Step 1 still applies them)
 * - getFieldEvaluationsEsql / getEuidEvaluation helpers (future source-field
 *   changes will not propagate automatically)
 * - LIMIT COMPOSITE_PAGE_SIZE ceiling
 *
 * Column contract — the query MUST emit these exact column names or results
 * will be silently empty:
 * - `actorUserId` (string) — the actor's full EUID, e.g. "user:alice@okta"
 * - a column named after `relationshipKey` (e.g. `communicates_with`)
 *   (string | string[])
 *
 * Identifiers inside the override body must follow the quoting convention
 * described at the top of this file (backticks for dotted-numeric or
 * reserved-word segments — see the Azure override for an example).
 */
export interface OverrideRelationshipIntegrationConfig extends RelationshipIntegrationBase {
  kind: 'override';
  relationshipKey: EntityRelationshipKey;
  esqlQueryOverride: (namespace: string) => string;
}

/**
 * Declarative config for one integration feeding a relationship maintainer.
 * The generic engine reads this to build composite agg queries and ES|QL queries
 * without any bespoke TypeScript per integration.
 *
 * Three variants, discriminated on `kind`:
 * - `'standard'`: default ES|QL builder, flat targets list.
 * - `'bucketed'`: default ES|QL builder + access-count classification into
 *   two relationship buckets.
 * - `'override'`: integration supplies the full Step 2 ES|QL query.
 *
 * The variants enforce field invariants at the type level — e.g. it is a
 * compile-time error to declare `bucketTargetByThreshold` on a `'standard'`
 * config or `esqlQueryOverride` on a `'bucketed'` config.
 */
export type RelationshipIntegrationConfig =
  | StandardRelationshipIntegrationConfig
  | BucketedRelationshipIntegrationConfig
  | OverrideRelationshipIntegrationConfig;

/**
 * Output record from the relationship-maintainer postprocessor.
 *
 * `entityType` is currently fixed to `'user'` because every shipped config
 * computes its actor EUID via `getEuidEvaluation('user', …)` and the engine
 * hardcodes `'user'` at every producer/builder site. Broadening to
 * `'user' | 'host' | 'service'` is tracked under the actorEntityType
 * follow-up (#266748). Agents/engineers implementing #266748 should change
 * **all** of these sites in lockstep — `grep -rn "266748"` from the
 * `maintainers/` root surfaces them:
 *
 *   1. `engine/types.ts` (this file) — widen `entityType` here and add
 *      `actorEntityType` to `RelationshipIntegrationConfig`.
 *   2. `engine/build_actor_discovery_query.ts` — Step 1 user-EUID existence
 *      filter is parameterized on entity type.
 *   3. `engine/build_targets_per_actor_query.ts` — Step 2 actor EVAL uses
 *      `getEuidEvaluation('user', …)`; thread the configured type through.
 *   4. `engine/parse_targets_per_actor_rows.ts` — drop the `'user' as const`
 *      on the produced records.
 *   5. `engine/update_entities.ts` — drop `type: 'user'` on the
 *      `bulkUpdateEntity` payload.
 *
 * Step 1 of the customActor presence-gate fix already derives actor *fields*
 * from `customActor.fields`; #266748 is what derives the actor *entity type*.
 */
export function entityTypeFromEuid(euid: string | null): 'user' | 'host' | 'service' {
  return euid?.split(':')[0] as 'user' | 'host' | 'service';
}

export interface EntityRelationshipRecord {
  /** Full EUID with type prefix, e.g. "user:alice@okta". Null if actor eval failed. */
  entityId: string | null;
  entityType: 'user' | 'host' | 'service';
  /**
   * relType → euid[]
   * e.g. { communicates_with: ['host:D3F5C9B9-...', 'user:bob@corp'] }
   */
  relationships: Record<string, string[]>;
}
