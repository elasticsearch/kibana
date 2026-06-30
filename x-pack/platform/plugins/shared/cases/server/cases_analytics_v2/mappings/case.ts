/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { CASE_DYNAMIC_TEMPLATES } from './dynamic_templates';

/**
 * Mapping for the `.cases` analytics index. One document per case,
 * keyed on the case saved-object id.
 *
 * Mirrors the cases SO mapping at
 * `server/saved_object_types/cases/cases.ts` except where an
 * analytics-only divergence is noted inline. `dynamic: 'strict'` makes
 * a doc-builder field not declared here fail the write with
 * `mapper_parsing_exception`, surfacing in logs instead of silently
 * dropping. `mappings/schema_drift.test.ts` prevents accidental drift.
 *
 * Field group conventions:
 *   - `@timestamp` — required by Discover / Lens; set to the case's
 *     latest activity timestamp at write time.
 *   - `space_id` / `owner` — top-level (document-root) scoping fields,
 *     deliberately NOT under `cases.*`. This mirrors the Kibana
 *     implicit-privileges DLS convention (elasticsearch#148331): a future
 *     ES `ImplicitPrivilegesProvider` can DLS-scope `.cases` by top-level
 *     `space_id` (+ `owner` for solution scoping) the same way the alerts
 *     provider scopes `.rule-events` by top-level `space_id`. Cases SOs
 *     are `multiple-isolated`, so a case lives in exactly one space —
 *     `space_id` is therefore singular, not an array. `owner` is also
 *     mirrored at `cases.owner` so analysts see it in the grouped
 *     data-view namespace; the top-level copy is the DLS field.
 *   - `cases.*` — case-specific fields, namespaced so runtime fields at
 *     `cases.<snake>` can lift extended-field keywords without
 *     colliding.
 *
 * Intentional divergences from the SO mapping:
 *   - `status` / `severity`: SO stores numeric enums (`short`); the
 *     analytics doc converts them to human-readable keywords so Lens
 *     and Discover show labels without an extra transform.
 *   - `extended_fields`: `flattened`. Per-child mappings via a
 *     `dynamic_template` would push past
 *     `index.mapping.total_fields.limit` (default 1000) on tenants with
 *     many templates × spaces; flattened keeps the mapping at one field
 *     regardless of cluster-wide snake-key cardinality. Per-child typed
 *     querying happens via runtime fields at `cases.<snake>` (see
 *     `data_view/runtime_fields.ts`), which read the value via
 *     `doc['cases.extended_fields.<snake>']`.
 *   - `observables`: SO uses a nested array of
 *     `{ typeKey, value, description }`; this index denormalizes to one
 *     keyword array per `typeKey` (`cases.observables.url: ["..."]`) so
 *     analysts run simple term queries instead of nested aggregations.
 *     `description` is dropped — free-text per observable, not an
 *     analytics dimension.
 *   - `time_to_acknowledge` / `time_to_investigate` /
 *     `time_to_resolve` / `in_progress_at`: present in the cases SO's
 *     persisted attributes but absent from its mapping (SO is
 *     `dynamic: false`). The strict analytics mapping requires explicit
 *     declaration, and these power SLA dashboards.
 *
 * `settings` is stored opaque (`enabled: false`). Per-case toggles
 * aren't an analytics dimension; round-trip through `_source` is
 * sufficient.
 */
export const CASE_INDEX_MAPPING: MappingTypeMapping = {
  dynamic: 'strict',
  dynamic_templates: CASE_DYNAMIC_TEMPLATES,
  properties: {
    '@timestamp': { type: 'date' },

    // Top-level scoping fields for implicit-privileges DLS (see the
    // file-level comment). `space_id` is singular — cases are
    // space-isolated. `owner` carries the solution dimension; it is also
    // mirrored at `cases.owner` below for data-view grouping.
    space_id: { type: 'keyword' },
    owner: { type: 'keyword' },

    cases: {
      properties: {
        id: { type: 'keyword' },
        // Mirror of the top-level `owner` (the DLS field). Kept under
        // `cases.*` so analysts see it in the grouped data-view namespace
        // alongside the other case fields.
        owner: { type: 'keyword' },
        title: {
          type: 'text',
          fields: { keyword: { type: 'keyword', ignore_above: 1024 } },
        },
        description: { type: 'text' },
        tags: { type: 'keyword' },
        category: { type: 'keyword' },
        // Human-readable strings, converted in the doc-builder from
        // the SO's numeric enums. See the file-level comment.
        status: { type: 'keyword' },
        severity: { type: 'keyword' },
        // Object (not `nested`) — matches the SO. `nested` is only
        // needed when sub-fields must be queried independently per
        // element, which isn't a case-level use case.
        assignees: {
          properties: {
            uid: { type: 'keyword' },
          },
        },
        created_at: { type: 'date' },
        updated_at: { type: 'date' },
        closed_at: { type: 'date' },
        in_progress_at: { type: 'date' },
        created_by: {
          properties: {
            username: { type: 'keyword' },
            full_name: { type: 'keyword' },
            email: { type: 'keyword' },
            profile_uid: { type: 'keyword' },
          },
        },
        updated_by: {
          properties: {
            username: { type: 'keyword' },
            full_name: { type: 'keyword' },
            email: { type: 'keyword' },
            profile_uid: { type: 'keyword' },
          },
        },
        closed_by: {
          properties: {
            username: { type: 'keyword' },
            full_name: { type: 'keyword' },
            email: { type: 'keyword' },
            profile_uid: { type: 'keyword' },
          },
        },
        // Counters are `integer` — bounded by the cases plugin's hard
        // limits (1000 alerts and 1000 events per case). `integer` is
        // half the storage of `long` with no practical cost.
        total_alerts: { type: 'integer' },
        total_comments: { type: 'integer' },
        total_events: { type: 'integer' },
        total_observables: { type: 'integer' },
        // Case lifetime in milliseconds. `unsigned_long` matches the SO
        // type to avoid an unnecessary divergence.
        duration: { type: 'unsigned_long' },
        // SLA timing fields. Not in the SO mapping (the SO is
        // `dynamic: false`, storing them in `_source` only); declared
        // here because the strict analytics mapping requires it.
        time_to_acknowledge: { type: 'long' },
        time_to_investigate: { type: 'long' },
        time_to_resolve: { type: 'long' },
        // Monotonic per-tenant id. Matches the SO exactly, including
        // the multi-fields: `keyword` for exact-match aggregations,
        // `text` for partial search.
        incremental_id: {
          type: 'unsigned_long',
          fields: {
            keyword: { type: 'keyword' },
            text: { type: 'text' },
          },
        },
        template: {
          properties: {
            id: { type: 'keyword' },
            version: { type: 'integer' },
          },
        },
        // `connector` and `external_service` answer "which integrations
        // are being pushed to" and "which connector instances are in
        // use".
        //
        // `connector.id`: connector instance id (e.g. which Jira
        //   config), keyword for aggregations. Not in the SO mapping
        //   (SO is `dynamic: false`, so it's `_source`-only) — declared
        //   here because it's a high-signal analytics dimension.
        // `connector.fields`: polymorphic per connector type (Jira has
        //   `{issueType, priority, parent}`, ServiceNow has different
        //   keys, etc.). `enabled: false` so ES stores the raw blob in
        //   `_source` without indexing it; keeps the index tolerant of
        //   new connector types without mapping changes.
        connector: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            type: { type: 'keyword' },
            fields: { type: 'object', enabled: false },
          },
        },
        external_service: {
          properties: {
            pushed_at: { type: 'date' },
            pushed_by: {
              properties: {
                username: { type: 'keyword' },
                full_name: { type: 'keyword' },
                email: { type: 'keyword' },
                profile_uid: { type: 'keyword' },
              },
            },
            connector_name: { type: 'keyword' },
            external_id: { type: 'keyword' },
            external_title: { type: 'text' },
            external_url: { type: 'text' },
          },
        },
        // Opaque — stored in `_source`, not indexed. Per-case config
        // (sync alerts, extract observables) isn't a useful analytics
        // dimension.
        settings: { type: 'object', enabled: false },
        // Matches the SO mapping exactly: nested array with a
        // multi-fielded `value` so users can filter typed sub-fields
        // (number, boolean, string, date, ip). `ignore_malformed: true`
        // keeps writes resilient when a user enters a value that
        // doesn't fit its declared type.
        customFields: {
          type: 'nested',
          properties: {
            key: { type: 'keyword' },
            type: { type: 'keyword' },
            value: {
              type: 'keyword',
              fields: {
                number: { type: 'long', ignore_malformed: true },
                boolean: { type: 'boolean', ignore_malformed: true },
                string: { type: 'text' },
                date: { type: 'date', ignore_malformed: true },
                ip: { type: 'ip', ignore_malformed: true },
              },
            },
          },
        },
        // Denormalized from the SO's nested
        // `{ typeKey, value, description }` array into a flat object
        // keyed by observable type
        // (`cases.observables.<typeKey>: keyword[]`). Lets analysts run
        // simple term queries
        // (`cases.observables.url: "http://..."`) without nested
        // aggregation overhead while preserving the type↔value
        // relationship via the field path.
        //
        // `description` is dropped — it's free text per observable,
        // not an analytics dimension. The full triple is still
        // available on the case SO for detail views.
        //
        // `dynamic: true` scopes dynamic mapping to this subtree (the
        // parent stays `dynamic: 'strict'`). Children are forced to
        // keyword by `CASE_DYNAMIC_TEMPLATES.observables_keyword`.
        observables: { type: 'object', dynamic: true },
        // `flattened` keeps the mapping at one field regardless of how
        // many distinct `<name>_as_<type>` snake-keys exist across
        // templates cluster-wide. Typed querying happens via runtime
        // fields at `cases.<snake>` (see `data_view/runtime_fields.ts`),
        // which read the value via
        // `doc['cases.extended_fields.<snake>']`. Matches the cases SO
        // mapping.
        extended_fields: { type: 'flattened' },
      },
    },
  },
};
