/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core/server';
import type { Observable } from '../../../common/types/domain';
import type { CasePersistedAttributes } from '../../common/types/case';
import { CasePersistedSeverity, CasePersistedStatus } from '../../common/types/case';
import { CONNECTOR_ID_REFERENCE_NAME } from '../../common/constants';

/**
 * Shape of a single document indexed into `.cases`. Mirrors
 * `CASE_INDEX_MAPPING` — every field has a matching mapping, and the
 * mapping is `dynamic: 'strict'` so adding a field here without updating
 * the mapping fails the write.
 *
 * Hand-crafted rather than extending `CasePersistedAttributes` because
 * the analytics doc is a curated projection with intentional divergences
 * from the SO:
 *
 *   - `status` / `severity` are persisted as numeric enums on the SO for
 *     sortability and a small index footprint; analytics consumers
 *     (Lens, ES|QL) want the human-readable strings, so the writer
 *     translates.
 *   - `observables` is denormalized: the SO is a nested array of
 *     `{ typeKey, value, description }`; the analytics doc collapses to
 *     one keyword array per type for cardinality-friendly aggregations.
 *     `description` is dropped because free-text observable descriptions
 *     can balloon the field count under sustained ingest.
 *   - `extended_fields` lives in a flattened sub-object with snake-key
 *     suffixes (`<name>_as_<type>`); the SO has no equivalent.
 *   - `@timestamp` and `space_id` are derived, not direct SO attributes.
 *   - `space_id` and `owner` are emitted at the document root to match the
 *     implicit-privileges DLS convention (see `mappings/case.ts`).
 *     `space_id` is singular — cases are space-isolated. `owner` is also
 *     mirrored at `cases.owner` for data-view grouping.
 *
 * Coupling the two via `extends` would force every additive change to
 * the cases SO into the analytics doc surface. The analytics-doc shape
 * is a contract with downstream dashboards / queries, so it evolves on
 * its own merits and the `dynamic: 'strict'` mapping breaks loudly when
 * an unintentional new field sneaks in. `mappings/schema_drift.test.ts`
 * catches the inverse mistake — an SO field added without an
 * accompanying analytics decision.
 *
 * Where the SO shape is the analytics shape (lossless 1:1), the type is
 * referenced via `CasePersistedAttributes['<field>']` so the two stay in
 * lockstep without inheritance (see `template` below).
 */
export interface CaseAnalyticsDoc {
  '@timestamp': string;
  // Top-level scoping fields for implicit-privileges DLS. `space_id` is
  // singular (cases are space-isolated); `owner` carries the solution
  // dimension. See `mappings/case.ts`.
  space_id: string;
  owner: string;
  cases: {
    id: string;
    // Mirror of the top-level `owner` (the DLS field), kept under `cases.*`
    // for data-view grouping. See `mappings/case.ts`.
    owner: string;
    title: string;
    description: string;
    tags: string[];
    category?: string | null;
    status: CaseStatusString;
    severity: CaseSeverityString;
    assignees?: Array<{ uid: string }>;
    created_at: string;
    updated_at?: string | null;
    closed_at?: string | null;
    in_progress_at?: string | null;
    created_by?: CaseUserDoc;
    updated_by?: CaseUserDoc | null;
    closed_by?: CaseUserDoc | null;
    total_alerts: number;
    total_comments: number;
    total_events?: number;
    total_observables?: number;
    duration?: number | null;
    time_to_acknowledge?: number | null;
    time_to_investigate?: number | null;
    time_to_resolve?: number | null;
    incremental_id?: number | null;
    // Tied 1:1 to the SO field — referencing the SO's type prevents the
    // two from drifting silently if a new sub-field lands on the SO.
    template?: CasePersistedAttributes['template'];
    // `connector` and `external_service` are fully indexed; their
    // sub-fields are searchable. `settings` is opaque (mapped
    // `enabled: false`).
    connector?: unknown;
    external_service?: unknown;
    settings?: unknown;
    // Matches the SO's `customFields` (camelCase) — nested array of
    // `{ key, type, value }`. The mapping indexes `value` with
    // multi-fields for typed querying (number, boolean, string, date,
    // ip).
    customFields?: unknown[];
    // Denormalized from the SO's nested
    // `[{ typeKey, value, description }]` array to one keyword array
    // per type. See `buildObservables` below.
    observables?: Record<string, string[]>;
    extended_fields?: Record<string, unknown>;
  };
}

interface CaseUserDoc {
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
  profile_uid?: string;
}

type CaseStatusString = 'open' | 'in-progress' | 'closed';
type CaseSeverityString = 'low' | 'medium' | 'high' | 'critical';

/**
 * Numeric-enum → string conversion for `status` and `severity`. The case
 * SO stores them as numeric enums for sortability and indexing
 * efficiency; analytics consumers (Lens, ES|QL) expect human strings.
 * Keep these maps aligned with `CasePersistedSeverity` /
 * `CasePersistedStatus` in `server/common/types/case.ts`.
 */
const STATUS_TO_STRING: Record<CasePersistedStatus, CaseStatusString> = {
  [CasePersistedStatus.OPEN]: 'open',
  [CasePersistedStatus.IN_PROGRESS]: 'in-progress',
  [CasePersistedStatus.CLOSED]: 'closed',
};

const SEVERITY_TO_STRING: Record<CasePersistedSeverity, CaseSeverityString> = {
  [CasePersistedSeverity.LOW]: 'low',
  [CasePersistedSeverity.MEDIUM]: 'medium',
  [CasePersistedSeverity.HIGH]: 'high',
  [CasePersistedSeverity.CRITICAL]: 'critical',
};

/**
 * Pure transformation: case saved-object → analytics doc. Side-effect-
 * free, deterministic, safe to call from any context. The round-trip
 * guard in `mappings/schema_drift.test.ts` asserts every emitted dotted
 * path resolves in the mapping.
 *
 * `@timestamp` is the most recent activity (`updated_at` or, if absent,
 * `created_at`) so a Discover/Lens time-picker filter reads as "show me
 * cases active in the last 24h".
 */
export function buildCaseDoc(so: SavedObject<CasePersistedAttributes>): CaseAnalyticsDoc {
  const a = so.attributes;
  const timestamp = a.updated_at ?? a.created_at;
  // The connector id is stored in so.references (under CONNECTOR_ID_REFERENCE_NAME),
  // not in a.connector, which is the persisted shape { name, type, fields }.
  const connectorId = so.references?.find((r) => r.name === CONNECTOR_ID_REFERENCE_NAME)?.id;

  return {
    '@timestamp': timestamp,
    // Top-level scoping fields for implicit-privileges DLS. `namespaces` is
    // the multi-namespace array core SO returns; cases are
    // `multiple-isolated`, so it's a single-element array of the space id.
    // Take the first element (default `'default'`) so `space_id` is the
    // singular scalar the DLS convention expects.
    space_id: so.namespaces?.[0] ?? 'default',
    owner: a.owner,
    cases: {
      id: so.id,
      // Mirror of the top-level `owner` for data-view grouping.
      owner: a.owner,
      title: a.title,
      description: a.description,
      tags: a.tags,
      category: a.category,
      status: STATUS_TO_STRING[a.status],
      severity: SEVERITY_TO_STRING[a.severity],
      assignees: a.assignees,
      created_at: a.created_at,
      updated_at: a.updated_at,
      closed_at: a.closed_at,
      in_progress_at: a.in_progress_at,
      created_by: toUserDoc(a.created_by),
      updated_by: toUserDoc(a.updated_by),
      closed_by: toUserDoc(a.closed_by),
      total_alerts: a.total_alerts,
      total_comments: a.total_comments,
      total_events: a.total_events,
      total_observables: a.total_observables,
      duration: a.duration,
      time_to_acknowledge: a.time_to_acknowledge,
      time_to_investigate: a.time_to_investigate,
      time_to_resolve: a.time_to_resolve,
      incremental_id: a.incremental_id,
      template: a.template,
      // Rehydrate connector.id from references — the persisted connector
      // attribute is { name, type, fields } only; the id is in so.references.
      connector: a.connector
        ? { ...a.connector, ...(connectorId ? { id: connectorId } : {}) }
        : a.connector,
      external_service: a.external_service,
      // `settings` is opaque (mapped `enabled: false`); `customFields`
      // is the SO's nested array. Both pass through.
      settings: a.settings,
      customFields: a.customFields,
      observables: buildObservables(a.observables),
      extended_fields: a.extended_fields ?? undefined,
    },
  };
}

/** Null-safe projection of the SO's `*_by` user fields. */
function toUserDoc(user: CasePersistedAttributes['created_by'] | null): CaseUserDoc | undefined {
  if (user == null) return undefined;
  return {
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    profile_uid: user.profile_uid,
  };
}

/**
 * Regroups observables from the SO's array shape into per-type keyword
 * arrays.
 *
 *   Input:  `[{ typeKey: 'url', value: 'http://...', description: '...' },
 *             { typeKey: 'url', value: 'http://other' },
 *             { typeKey: 'ipv4', value: '1.2.3.4' }]`
 *   Output: `{ url: ['http://...', 'http://other'], ipv4: ['1.2.3.4'] }`
 *
 * Returns `undefined` when there are no observables, so the doc stays
 * small for the common case. `description` is dropped — see the
 * file-level comment for the rationale.
 */
function buildObservables(
  observables: Observable[] | undefined
): Record<string, string[]> | undefined {
  if (observables == null || observables.length === 0) return undefined;

  const byType: Record<string, string[]> = {};
  let bucketed = 0;
  for (const obs of observables) {
    const type = obs.typeKey;
    // Skip observables missing a typeKey or value to avoid failing the
    // whole doc build on a single malformed entry.
    if (type != null && obs.value != null) {
      const bucket = byType[type] ?? (byType[type] = []);
      bucket.push(String(obs.value));
      bucketed++;
    }
  }
  return bucketed > 0 ? byType : undefined;
}
