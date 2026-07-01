/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core/server';
import { CASE_SAVED_OBJECT } from '../../../common/constants';
import { CONNECTOR_ID_REFERENCE_NAME } from '../../common/constants';
import type { UserActionPersistedAttributes } from '../../common/types/user_actions';

/**
 * Shape of a single document indexed into `.cases-activity`. Mirrors
 * `ACTIVITY_INDEX_MAPPING` exactly — every field has a matching mapping,
 * and the mapping is `dynamic: 'strict'` so adding a field here without
 * updating the mapping fails the write.
 *
 * Hand-crafted rather than extending `UserActionPersistedAttributes` for
 * the same reason as `CaseAnalyticsDoc`: the analytics doc is a curated
 * projection, not a cosmetic transform of the SO. Coupling them via
 * `extends` would force every additive change to the user-action SO into
 * the analytics surface.
 *
 * Intentional divergences from the SO shape:
 *   - `attributes.payload` (polymorphic) → `action.payload_json`
 *     (string) plus a curated set of typed extracts. The string carries
 *     every payload sub-field for ad-hoc ES|QL access; the curated
 *     extracts give first-class faceting in Lens for the common pivots.
 *   - `attributes.created_by` → `actor.*`. The SO calls every "who did
 *     this" field `created_by`, but for a user action the relevant
 *     person is the actor.
 *   - `references[case]` → `cases.id`, denormalized for ES|QL
 *     `LOOKUP JOIN`.
 *   - `attributes.created_at` → `@timestamp` so Discover/Lens time UX
 *     works without an extra transform.
 *   - `attributes.action` → `action.verb` (`action.action` would be
 *     confusing in queries).
 */
export interface ActivityAnalyticsDoc {
  '@timestamp': string;
  // Top-level scoping fields for implicit-privileges DLS, matching the cases
  // surface. `space_id` is singular — a user action lives in one space. See
  // `mappings/activity.ts`.
  space_id: string;
  owner: string;
  cases: {
    id: string;
  };
  actor: ActivityActorDoc;
  action: {
    type: string;
    verb: string;
    payload_json: string;
    // Curated extracts populated only when the action `type` carries a
    // matching payload sub-field. Absent fields are omitted (the strict
    // mapping treats absent and null differently; omitting keeps the
    // index sparse).
    status_new?: string;
    severity_new?: string;
    assignees_changed?: string[];
    tags_changed?: string[];
    connector_id_new?: string;
  };
}

interface ActivityActorDoc {
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
  profile_uid?: string;
}

/**
 * Pure transformation: user-action saved-object → analytics doc.
 * Side-effect-free, deterministic, safe to call from any context. The
 * round-trip guard in `mappings/activity_schema_drift.test.ts` asserts
 * every emitted dotted path resolves in the mapping.
 *
 * `@timestamp` is the user-action's `created_at`. User actions are
 * immutable (no `updated_at` clause in the reconciliation filter), so
 * the creation time is the only meaningful event time.
 *
 * Case id resolution: the user-action SO carries the parent case in
 * `references[]` with `name === 'associated-cases'` and
 * `type === 'cases'` (see `services/user_actions/transform.ts`).
 * `pickCaseId` reads the `id` off that reference; if it's missing
 * (malformed SO, not expected in practice) `cases.id` is set to the
 * empty string so the strict mapping still accepts the doc and
 * reconciliation can re-emit a corrected version once upstream is fixed.
 */
export function buildActivityDoc(
  so: SavedObject<UserActionPersistedAttributes>
): ActivityAnalyticsDoc {
  const a = so.attributes;
  const caseId = pickCaseId(so);
  // The connector id is NOT in `payload.connector` — `extractConnectorId`
  // (see `services/user_actions/abstract_builder.ts`) strips it out before
  // persisting and stores it in `so.references` under
  // `CONNECTOR_ID_REFERENCE_NAME`. Resolve it from there, the same way the
  // cases doc-builder does (`case_doc_builder.ts`).
  const connectorId = so.references?.find((ref) => ref.name === CONNECTOR_ID_REFERENCE_NAME)?.id;

  return {
    '@timestamp': a.created_at,
    // Top-level scoping fields for implicit-privileges DLS. `namespaces` is a
    // single-element array for space-isolated SOs; take the first element so
    // `space_id` is the singular scalar the DLS convention expects.
    space_id: so.namespaces?.[0] ?? 'default',
    owner: a.owner,
    cases: {
      id: caseId,
    },
    actor: toActor(a.created_by),
    action: {
      type: a.type,
      verb: a.action,
      payload_json: stringifyPayload(a.payload),
      ...extractCuratedFields(a.type, a.payload, connectorId),
    },
  };
}

/**
 * Locates the parent-case id in the SO's `references` array. The
 * user-action service always emits exactly one reference of type
 * `cases`; if multiple are present (forward-compat for future
 * cross-cases linkage), the first wins. Returns the empty string when
 * absent so the strict mapping still accepts the doc.
 */
function pickCaseId(so: SavedObject<UserActionPersistedAttributes>): string {
  for (const ref of so.references ?? []) {
    if (ref.type === CASE_SAVED_OBJECT) return ref.id;
  }
  return '';
}

/** Null-safe projection of the SO's `created_by` user shape. */
function toActor(user: UserActionPersistedAttributes['created_by'] | null): ActivityActorDoc {
  if (user == null) return {};
  return {
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    profile_uid: user.profile_uid,
  };
}

/**
 * Serializes the polymorphic payload. Returns the empty string for
 * null/undefined inputs and for inputs that throw from `JSON.stringify`
 * (cyclic refs, non-serializable values — not expected from persisted
 * SOs but defensive for forward-compat).
 *
 * No length cap is applied here: the mapping stores this as a `wildcard`
 * field, which has no per-value limit, so even very large bulk-edit
 * payloads are indexed and remain queryable in ES|QL rather than being
 * silently dropped (as a `keyword` past `ignore_above` would be).
 */
function stringifyPayload(payload: Record<string, unknown> | null | undefined): string {
  if (payload == null) return '';
  try {
    return JSON.stringify(payload);
  } catch {
    return '';
  }
}

/**
 * Extracts the curated typed sub-fields for the analytics doc,
 * conditional on the action `type`. Most clauses read from `payload`;
 * `connector_id_new` is the exception — its id is stripped from the
 * payload at persist time and lives in `so.references`, so the caller
 * resolves it and passes it in via `connectorId`.
 *
 * For each clause:
 *   1. Confirm the relevant value is present (in `payload`, or in
 *      `connectorId` for the connector case).
 *   2. Coerce it to the mapped type (string for keywords, string[] for
 *      keyword arrays).
 *   3. Drop it from the output when the value isn't present or doesn't
 *      have the expected shape; absent fields are a no-op under the
 *      strict mapping.
 *
 * Add new entries as analytical needs surface; the schema-drift Layer-2
 * test in `mappings/activity_schema_drift.test.ts` enforces a per-type
 * contract so an extract change can't silently desync from the mapping.
 */
function extractCuratedFields(
  type: string,
  payload: Record<string, unknown> | null | undefined,
  connectorId: string | undefined
): Partial<ActivityAnalyticsDoc['action']> {
  const out: Partial<ActivityAnalyticsDoc['action']> = {};

  // `connector_id_new` is sourced from `so.references` (resolved by the
  // caller), NOT from `payload.connector` — the id is stripped from the
  // payload at persist time. This branch is independent of `payload`, so
  // it runs even when `payload` is null.
  if (type === 'connector' && typeof connectorId === 'string' && connectorId.length > 0) {
    out.connector_id_new = connectorId;
  }

  if (payload == null) return out;

  if (type === 'status' && typeof payload.status === 'string') {
    out.status_new = payload.status;
  }
  if (type === 'severity' && typeof payload.severity === 'string') {
    out.severity_new = payload.severity;
  }
  if (type === 'assignees' && Array.isArray(payload.assignees)) {
    const uids: string[] = [];
    for (const entry of payload.assignees) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { uid?: unknown }).uid === 'string'
      ) {
        uids.push((entry as { uid: string }).uid);
      }
    }
    if (uids.length > 0) out.assignees_changed = uids;
  }
  if (type === 'tags' && Array.isArray(payload.tags)) {
    const tags: string[] = [];
    for (const tag of payload.tags) {
      if (typeof tag === 'string') tags.push(tag);
    }
    if (tags.length > 0) out.tags_changed = tags;
  }
  return out;
}
