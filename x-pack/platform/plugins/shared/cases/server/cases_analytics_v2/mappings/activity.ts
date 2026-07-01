/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

/**
 * Mapping for the `.cases-activity` analytics index. One document per
 * `cases-user-actions` SO, keyed on the user-action SO id.
 *
 * Mirrors the user-actions SO mapping at
 * `server/saved_object_types/user_actions.ts` except where an
 * analytics-only divergence is noted inline. `dynamic: 'strict'` makes
 * a doc-builder field not declared here fail the write with
 * `mapper_parsing_exception`, surfacing in logs instead of silently
 * dropping. The three-layer drift guard in
 * `mappings/activity_schema_drift.test.ts` catches accidental drift
 * (see the README for the layered contract).
 *
 * Field group conventions:
 *   - `@timestamp` — required by Discover / Lens; set to the user
 *     action's `created_at` (immutable, no later edits).
 *   - `space_id` / `owner` — top-level (document-root) scoping fields for
 *     implicit-privileges DLS, matching the cases surface (see
 *     `mappings/case.ts`). `space_id` is singular — a user action belongs
 *     to exactly one case in one space.
 *   - `cases.id` — denormalized from the SO `references[case]` so
 *     ES|QL `LOOKUP JOIN .cases ON cases.id` works without an
 *     intermediate aggregation.
 *   - `actor.*` — flattened `created_by` so `actor.username` etc. are
 *     first-class analytics dimensions.
 *   - `action.*` — the user-action shape: `type`, `verb`, the
 *     polymorphic `payload` stringified as `action.payload_json`, plus
 *     a curated set of typed extracts for the common analytical pivots.
 *
 * Intentional divergences from the SO mapping:
 *   - `payload`: SO uses `dynamic: false` with a sparse set of indexed
 *     sub-fields. The analytics index strict-maps the curated extracts
 *     and also stringifies the full payload as `action.payload_json`
 *     (`wildcard`, no length cap). The string carries every payload
 *     sub-field so analysts can reach into it via ES|QL
 *     (`MV_AVG(MV_FROM_JSON(payload_json, "status"))` and similar);
 *     the curated extracts give first-class faceting in Lens without
 *     requiring users to know the JSON structure.
 *   - `payload.connector.fields`: dropped. Polymorphic per connector
 *     type and not an analytics dimension; the connector instance id
 *     (`connector_id_new`) is what tracks adoption.
 *
 * Curated extracts are bounded keyword fields chosen for value to
 * common analyses (status flow, severity changes, assignees changes,
 * tag churn, connector adoption). They're populated only when the
 * relevant action `type` carries a matching payload sub-field; other
 * action types leave them unset (no defaults, consistent with
 * `dynamic: 'strict'`). See `writer/activity_doc_builder.ts` for the
 * per-type extraction.
 */
export const ACTIVITY_INDEX_MAPPING: MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    '@timestamp': { type: 'date' },

    // Top-level scoping fields for implicit-privileges DLS, matching the
    // cases surface. `space_id` is singular (a user action lives in exactly
    // one space); `owner` carries the solution dimension.
    space_id: { type: 'keyword' },
    owner: { type: 'keyword' },

    cases: {
      properties: {
        // Denormalized from the user-action SO's `references[case]`.
        // Single value per doc — a user action belongs to exactly one
        // case. Keyword for `LOOKUP JOIN` from ES|QL onto `.cases`.
        id: { type: 'keyword' },
      },
    },

    actor: {
      properties: {
        username: { type: 'keyword' },
        full_name: { type: 'keyword' },
        email: { type: 'keyword' },
        profile_uid: { type: 'keyword' },
      },
    },

    action: {
      properties: {
        // The user-action `type` (`status`, `severity`, `assignees`,
        // etc.). Drives every per-type curated extract below.
        type: { type: 'keyword' },
        // The high-level verb (`create`, `update`, `delete`, `add`,
        // `push_to_service`). Mirrors `attributes.action`.
        verb: { type: 'keyword' },
        // Stringified `attributes.payload`. The payload union is wide
        // and evolves frequently; storing the raw JSON keeps every
        // field accessible via ES|QL without per-type mapping churn.
        // `wildcard` (not `keyword`) so there is no length cap: a
        // `keyword` silently drops values over `ignore_above` from the
        // index and doc values, which would make oversized payloads
        // (large bulk-attachment edits) return `null` in ES|QL. The
        // `wildcard` type stores the full value with no per-value limit
        // and is purpose-built for large, opaque strings queried with
        // grep-style predicates — exactly this field's access pattern.
        // We never aggregate or sort on `payload_json` (the curated
        // extracts below serve faceting), so `wildcard`'s slightly
        // higher disk cost and slower exact-term ops carry no
        // regression for how this field is actually queried.
        payload_json: { type: 'wildcard' },
        // ----- Curated extracts -----
        // Populated only when the action `type` carries a matching
        // payload sub-field. See `activity_doc_builder.ts` for the
        // per-type extraction.
        // For `status` actions: the new status (`open`, `in-progress`,
        // `closed`).
        status_new: { type: 'keyword' },
        // For `severity` actions: the new severity (`low`, `medium`,
        // ...).
        severity_new: { type: 'keyword' },
        // For `assignees` actions: the assignee profile uids touched
        // by the action (added or removed, depending on `verb`).
        assignees_changed: { type: 'keyword' },
        // For `tags` actions: the tags touched by the action.
        tags_changed: { type: 'keyword' },
        // For `connector` actions: the new connector instance id.
        // High-signal for connector-adoption dashboards.
        connector_id_new: { type: 'keyword' },
      },
    },
  },
};
