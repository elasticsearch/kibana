# Cases Analytics v2

Cluster-level analytics indices for the cases plugin, populated by real-time
saved-object hooks with periodic reconciliation as the durability backstop.
Replaces the per-(space × owner) reindex pipeline at `server/cases_analytics/`.

## Status

v2 is gated by `xpack.cases.analyticsV2.enabled` (default `false`). v1
(`server/cases_analytics/`) remains the primary path while v2 is being
validated.

v2 ships two surfaces: the **`case` surface** (`.cases`) and the
**`activity` surface** (`.cases-activity`).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Cases SO services (services/cases)                                 │
│  ─ post-success hook ─► CasesAnalyticsV2Writer (fire-and-forget)    │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────┐
                  │  .cases  (lookup mode, hidden)     │
                  │  one doc per case                  │
                  └────────────────────────────────────┘
                                       ▲
                                       │
                ┌──────────────────────────────────────┐
                │  Reconciliation task (every 30m)     │
                │  ─ walks SOs since last_run_at       │
                │  ─ re-emits any missed analytics doc │
                └──────────────────────────────────────┘
```

**Two write paths** — fire-and-forget hooks on every case create / patch /
delete (primary, low-latency), and a periodic reconciliation task (backstop,
catches anything the primary path missed). Both call `writer.upsertCase` /
`writer.deleteCase`, which are idempotent against the same `_id`.

## Index layout

| Surface    | Index             | Mode                         | Source SO(s)         |
| ---------- | ----------------- | ---------------------------- | -------------------- |
| `case`     | `.cases`          | `index.mode: lookup`, hidden | `cases`              |
| `activity` | `.cases-activity` | plain, hidden                | `cases-user-actions` |

`.cases` is **lookup-mode** so the activity surface can `LOOKUP JOIN` it from
ES|QL — "for each activity row, what's the current case title / severity /
owner?" without denormalization at write time. Lookup mode is Technical
Preview as of Elasticsearch 8.18 / 9.0; the breaking-change risk is
acceptable for cases data because the dataset fits comfortably (single shard
handles ~50GB; a tenant with millions of cases at ~2KB/doc is a few GB at
most).

`.cases-activity` is a plain regular index — it grows per-event and shouldn't
be locked to a single shard.

## Configuration

```yaml
xpack.cases.analyticsV2:
  enabled: false # default — set to true to opt in
  reconciliationIntervalMinutes:
    30 # default — Task Manager cadence for the
    # reconciliation backstop. Min 5; lower
    # values catch up faster after a hook
    # failure but cost more SO walks against
    # the cases index. Picked up at plugin
    # start: on every Kibana boot, the
    # reconciliation task's persisted schedule
    # is reconciled against this value via
    # `bulkUpdateSchedules`. Changing the value
    # therefore requires a Kibana restart to
    # take effect — runtime changes are not
    # picked up automatically.
  enableAdminRoutes:
    false # default — set to true to register the
    # mutating administrator routes (/reset and
    # /reconcile/run_soon). The read-only /state
    # route is unaffected (always registered
    # while analyticsV2.enabled is true). See
    # "Debug-mode routes" below for the rationale.
  resetTaskTimeoutMinutes:
    60 # default — wall-clock budget for the
    # one-shot backfill task scheduled by /reset.
    # Comfortable through ~2K spaces; raise for
    # larger tenants (see "Tuning /reset at
    # scale" below). Min 5, max 1440 (24h).
  resetPageDelayMs:
    0 # default — inter-page sleep applied by the
    # reconciliation runners ONLY when invoked
    # from the reset task. Default 0 keeps the
    # post-reset backfill as fast as possible.
    # Administrators on shared / capacity-constrained
    # ES clusters raise this to throttle bulk-
    # write pressure during the backfill. Min 0,
    # max 5000.
```

When `analyticsV2.enabled: false`, the v2 service is a no-op. Nothing
registers, nothing schedules, nothing writes. v1 is unaffected regardless of
v2's state. When `analyticsV2.enableAdminRoutes: false` (the default) but
`analyticsV2.enabled: true`, v2 runs normally and `/state` is reachable; only
the two mutating routes return HTTP 404.

## Authorization

Out of the box, only **superusers** can read v2 indices — they're created
hidden and no Kibana feature privilege grants access. To allow specific users:

1. Define an Elasticsearch role with `read` on the index pattern.
2. Map the role to the user via Kibana role management or the ES `_security` API.

Sample role:

```json
PUT _security/role/cases_analytics_reader
{
  "indices": [
    {
      "names": [".cases"],
      "privileges": ["read"],
      "allow_restricted_indices": true
    }
  ]
}
```

A future Kibana-side provider (built on the `ImplicitPrivilegesProvider` SPI
tracked in [elastic/elasticsearch#147176](https://github.com/elastic/elasticsearch/pull/147176))
will scope which case documents a user can read inside `.cases` via DLS on
the top-level `space_id` + `owner` fields. These are deliberately placed at
the document root (not under `cases.*`) to match the implicit-privileges DLS
convention — `space_id` is singular because cases are space-isolated. Until
that provider lands, role-granted access to `.cases` is unrestricted across
cases — apply with care.

## Data views (per-space)

A managed data view named `Cases` is bootstrapped **per space**, lazily, on
the first Cases request in that space. The id is
`cases-analytics-managed-<spaceId>`, scoped to `namespaces: [<spaceId>]`.

**Why per-space, not global.** The runtime field map is derived from template
SOs — which are themselves space-scoped. A global data view would merge every
space's runtime fields into one view, with three problems on tenants with
many spaces:

- field-picker bloat for analysts (they see thousands of fields, most
  irrelevant to their space),
- cross-space naming collisions (two spaces declaring the same
  `riskScore_as_long` for different concepts; last-write-wins resolution is
  non-deterministic),
- info leakage of field names across space boundaries.

Per-space scoping fixes all three. The underlying `.cases` index stays
cluster-level — only the view is scoped.

**Bootstrap timing.** First Cases request in a space triggers the ensure.
After that, subsequent requests skip via an in-memory cache. A new template
in a space won't appear in that space's runtime fields until either a Kibana
process restart or an administrator `/reset`.

**Cross-space analytics.** No global data view is shipped. An administrator
who needs a cross-space dashboard can duplicate the per-space view (saving
it without the `managed` flag), edit it to use `namespaces: ['*']`, and
curate
the runtime fields they want to keep. Out of scope for the managed feature.

**DLS interaction.** A future Kibana-side provider (built on the
`ImplicitPrivilegesProvider` SPI tracked in
[elastic/elasticsearch#147176](https://github.com/elastic/elasticsearch/pull/147176))
will scope which case documents a user can read inside `.cases` (and
`.cases-activity`) via DLS on the top-level `space_id` + `owner` fields —
placed at the document root on both surfaces to match the implicit-privileges
DLS convention. Until that lands, role-granted access is unrestricted (see
"Authorization" above). The per-space data view
is orthogonal — it scopes the _runtime field set_, not the document set. The
two compose cleanly: a user in space A sees only space-A runtime fields
**and** (once DLS is enforced) only space-A cases.

## Runtime field lift

Each template-declared extended field is stored at
`cases.extended_fields.<name>_as_<type>` inside a `flattened` mapping, with
a typed runtime field published at `cases.<name>_as_<type>` — Lens and
Discover get numeric / date / boolean filter operators instead of
string-contains. The runtime field reads the value via
`doc['cases.extended_fields.<name>_as_<type>']` at query time (flattened
sub-keys are doc-values-backed under the parent's value stream).

`flattened` is used (not `dynamic_template`-per-key) so the index mapping
stays at one field for `extended_fields` regardless of how many distinct
snake-keys exist across templates cluster-wide. With per-key dynamic
mappings, a tenant with many templates trips ES's default
`index.mapping.total_fields.limit` (1000). The trade-off is per-doc
`_source` decode cost at query time vs `doc_values` — small for the
volumes this surface is sized for, and the runtime path was already on
the hot path for typed lookup.

## Schema

The `.cases` index mapping mirrors the cases SO mapping at
`server/saved_object_types/cases/cases.ts` with these deliberate divergences:

- **`status` and `severity`**: SO stores numeric enums; v2 converts to human
  strings (`"low"`, `"open"`, etc.) in the doc-builder so Lens shows readable
  labels.
- **`observables`**: SO stores nested `[{ typeKey, value, description }]`; v2
  denormalizes to per-type keyword arrays — `cases.observables.url: ["..."]`,
  `cases.observables.ipv4: [...]`. Type↔value relationship preserved via the
  field path; `description` dropped (free text, not an analytics dimension).
- **`extended_fields`**: SO uses `flattened`; v2 matches. Runtime fields
  at `cases.<snake>` parse the raw string from `_source` at query time
  (see "Runtime field lift" above for the field-limit rationale).
- **`time_to_acknowledge` / `time_to_investigate` / `time_to_resolve` /
  `in_progress_at`**: present in the SO's persisted attributes but not the SO
  mapping (the SO uses `dynamic: false`); v2 maps them explicitly because
  they power SLA dashboards.
- **`settings`**: stored opaque (`enabled: false`). Per-case config isn't an
  analytics dimension.

The mapping is `dynamic: 'strict'` — any field the doc-builder emits that
isn't declared fails the write with `mapper_parsing_exception`. A
schema-drift guard test round-trips a fully-populated synthetic case and
asserts every emitted path resolves in the mapping (see
`mappings/schema_drift.test.ts`).

## Operations

### Health check

```
GET /internal/cases/_analyticsV2/state
```

Returns the enabled flag, per-surface index info (with backwards-
compatible top-level cases fields), and the reconciliation task's last
run + per-surface cursors. Superuser only.

Example response:

```json
{
  "enabled": true,
  "index": ".cases",
  "index_exists": true,
  "surfaces": {
    "cases": {
      "index": ".cases",
      "index_exists": true
    },
    "activity": {
      "index": ".cases-activity",
      "index_exists": true
    }
  },
  "reconciliation": {
    "task_type": "cases.analyticsV2.reconciliation",
    "last_run": {
      "cases_last_run_at": "2026-05-13T15:30:00.000Z",
      "activity_last_run_at": "2026-05-13T15:30:00.000Z",
      "runs": 0,
      "next_run_at": "2026-05-13T16:00:00.000Z",
      "status": "idle"
    }
  },
  "active_reset": null
}
```

`active_reset` is `null` when no reset is in flight AND the most recent
reset succeeded (Task Manager auto-removes one-shot tasks on success).
A non-null value reflects either an in-flight reset or the most recent
failed one.

**Live progress.** During the walk, the reset task's wall-clock-throttled
progress writer flushes the partial state to the task SO every ~30
seconds. Administrators polling `/state` see the cumulative `cases_processed` /
`activity_processed` counts tick up live, and the `phase` field
discriminates which surface is currently being walked:

```json
"active_reset": {
  "task_id": "cases-analyticsV2-reset",
  "status": "running",
  "scheduled_at": "2026-05-13T16:02:00.000Z",
  "attempts": 1,
  "state": {
    "phase": "activity",
    "cases_processed": 50000,
    "activity_processed": 312000,
    "started_at": "2026-05-13T16:02:13.000Z"
  }
}
```

**Final state.** When the walk completes, Task Manager writes the full
`ResetTaskState` from the runner's return value (including `cases_cursor`,
`activity_cursor`, `completed_at`, and any per-surface error messages)
and then — on success — removes the SO. The brief window between the
final write and the SO removal is when consumers polling `/state` see
`phase: "completed"`. After the SO removal, `active_reset` returns to
`null`. On total failure the SO is preserved with `status: "failed"`
and the most-recent throttled state intact (so `phase` shows which
surface died and `*_processed` shows how far the walks got).

If `enabled: true` but either `index_exists` is `false`, the
corresponding bootstrap (`ensureCaseIndex` / `ensureActivityIndex`)
hit an error at plugin start and logged at ERROR; check Kibana logs
and consider `POST /reset`.

### Debug-mode routes (mutating)

The two routes below mutate subsystem state cluster-wide and operate
**globally** across every space even when invoked from a single
space's URL. They're gated behind a second flag:

```yaml
xpack.cases.analyticsV2.enableAdminRoutes: true # default false
```

When the flag is off, neither route is registered — requests return
HTTP 404. The read-only `GET /state` route above is registered
regardless (a future Case Settings page polls it for health info).

Lives under `analyticsV2` to keep it isolated from the v1 `analytics`
namespace.

### Re-run reconciliation immediately

```
POST /internal/cases/_analyticsV2/reconcile/run_soon
```

Triggers Task Manager's `runSoon` for the reconciliation task. Useful if you
suspect the primary write path dropped a case. **Requires
`xpack.cases.analyticsV2.enableAdminRoutes: true`.** Superuser only.

### Reset the index

```
POST /internal/cases/_analyticsV2/reset
→ 202 Accepted
{
  "reset": ".cases",
  "data_views_deleted": 12,
  "reset_task": {
    "id": "cases-analyticsV2-reset",
    "task_type": "cases.analyticsV2.fullReset",
    "scheduled_at": "2026-05-13T16:02:00.000Z",
    "poll": "/internal/cases/_analyticsV2/state"
  },
  "surfaces": {
    "cases": { "reset": ".cases" },
    "activity": { "reset": ".cases-activity" }
  }
}
```

**Two-phase contract.** The destructive cleanup is synchronous (drops both
indices, recreates them from scratch using the same bootstrap path as plugin
start, deletes every per-space managed Case Analytics data view, clears the
data view bootstrap cache). The full backfill walk that repopulates both
indices from the SO source of truth runs **asynchronously** in a one-shot
Task Manager job (`cases.analyticsV2.fullReset`). The route returns 202 once
the synchronous portion completes; the administrator polls `/state.active_reset`
to track the backfill. **Requires `xpack.cases.analyticsV2.enableAdminRoutes: true`.**

**Why async.** At ~1K+ spaces the backfill walk runs for many minutes, and
at 10K+ spaces it can run for over an hour — well past any reasonable HTTP
request budget. Running the walk in a dedicated Task Manager job means:

- `/reset` returns in seconds at any tenant size.
- The walk is durable across Kibana node restarts (Task Manager re-claims
  a stuck task on another node).
- Two `/reset` calls can't race — the second call removes the in-flight reset
  task SO before scheduling its own (latest-wins).
- The walk timeout is configurable per tenant
  (`resetTaskTimeoutMinutes`) instead of capped by the HTTP request
  timeout.
- A configurable inter-page delay (`resetPageDelayMs`) lets administrators throttle
  bulk-write pressure on shared clusters.

**Polling for completion.** While the backfill task is running,
`/state.active_reset.status` reports `"running"`. On success, Task Manager
auto-removes the task SO and `/state.active_reset` returns `null`. On total
failure (both surfaces threw), the SO is preserved with `status: "failed"`
and `state.cases_error` / `state.activity_error` populated. A partial failure
(one surface succeeded, the other threw) is treated as success at the task
level — the per-surface error lands in Kibana logs at WARN. The seed step
omits the failed surface's cursor, so the next periodic tick falls back to
a full walk of that surface and recovers any docs the partial reset missed.

Use for mapping migrations, recovery from sustained writer failures, or
administrator-initiated full backfills. Superuser only.

**Per-space data views after `/reset`.** `/reset` deletes every managed
`Case Analytics` data view across all spaces (the SOs the cluster needs to
walk and remove are namespace-scoped, so this is unavoidable for a
correct reset). Data views are recreated **lazily** on the first cases
request in each space — opening the Cases UI or hitting any cases API
endpoint (e.g. `GET /api/cases/_find`) triggers the bootstrap and the
data view appears within seconds.

That means users in spaces that had a data view before `/reset` see "no
data view found" in Discover/Lens until someone exercises Cases in that
space. For an active space the gap is usually invisible (the first
person to load the Cases page recreates it). For spaces that are
rarely-visited but still need the analytics dashboard available
post-reset (e.g. audit / compliance views polled by a scheduled job),
the recommended workflow after a `/reset` is:

1. Wait for `/state.active_reset` to return `null` (reset task
   completed and `.cases` is repopulated).
2. For each space whose data view you want to pre-warm, hit any cases
   API endpoint in that space:
   ```bash
   curl -k -H 'kbn-xsrf: true' -H 'x-elastic-internal-origin: kibana' \
     "http://<kibana>/s/<spaceId>/api/cases/_find?perPage=1"
   ```
   The bootstrap runs in the request handler before the response
   returns. A successful 200 means the data view has been recreated
   for that space.

Eager recreation of pre-existing data views inside the `/reset` flow
itself was considered and deferred — `/reset` is intentionally rare,
and the implementation cost (bypassing the data views factory to write
SOs cross-namespace from an unscoped internal client) wasn't justified
for a workflow that's already an administrator-initiated, infrequent
operation.

### Tuning `/reset` at scale

Two configuration knobs control the post-reset backfill's behaviour:

| Setting | Default | Bounds | Effect |
| ------- | ------- | ------ | ------ |
| `xpack.cases.analyticsV2.resetTaskTimeoutMinutes` | `60` | `5`–`1440` (24h) | Wall-clock budget for the one-shot reset task. Task Manager kills the task and marks it failed if it exceeds this. |
| `xpack.cases.analyticsV2.resetPageDelayMs` | `0` | `0`–`5000` | Inter-page sleep (in ms) between reconciliation runner pages. `0` = no throttle (runners still yield via `setImmediate`). |

**Sizing the timeout.** The backfill walk is `O(documents)` not `O(spaces)` —
what matters is total case + user-action volume. Approximate wall-clock at
typical tenant shapes (default `resetPageDelayMs: 0`):

| Tenant scale | Cases | User-actions | Wall-clock | `resetTaskTimeoutMinutes` |
| ------------ | ----- | ------------ | ---------- | ------------------------- |
| ≤ 100 spaces | ~5K | ~150K | < 2 min | `60` (default) |
| ~1K spaces | ~50K | ~1.5M | ~10 min | `60` (default) |
| ~5K spaces | ~250K | ~7.5M | ~40 min | `60` (default; tight margin) |
| ~10K spaces | ~500K | ~15M | ~75 min | `120` recommended |
| ≥ 25K spaces | ~1.25M | ~37.5M | ~3 hours | `240` recommended |

Numbers are extrapolated from a 3-space measurement of ~100 cases / ~1500 user-actions per space. Real tenants will vary — the WARN log line `cases-analyticsV2: reset failed: ... task timeout exceeded` is the signal to raise the timeout.

**Sizing the page delay.** A non-zero delay halves (at 50ms) or thirds (at 100ms) the sustained ES bulk-write rate the backfill puts on the cluster, at proportional cost to wall-clock. The default `0` is the right call for most administrators — set this above zero only when the backfill is observably impacting concurrent workloads on a shared ES cluster:

| `resetPageDelayMs` | Effect at 10K-space backfill |
| --- | --- |
| `0` (default) | ~75 min wall-clock, ~3,300 docs/sec sustained ES write rate |
| `50` | ~200 min, ~1,250 docs/sec |
| `100` | ~325 min, ~770 docs/sec |
| `500` | ~22 hours, ~190 docs/sec |

Always raise `resetTaskTimeoutMinutes` first if you raise `resetPageDelayMs` — a higher delay means a longer walk, which needs a bigger budget. The 24-hour timeout ceiling means tenants beyond ~10K-space scale running with high page delays may need the partitioned-walk architecture described under "Beyond 10K spaces" below.

**Beyond 10K spaces.** The architecture runs the entire backfill on a single Kibana node (Task Manager dedupes by task ID). At very large tenant sizes (~25K+ spaces) the walk becomes CPU-bound on doc-build and ES bulk serialization, so a single node's throughput is the limiting factor. The fix is to partition the walk across spaces — multiple reset tasks each handling a contiguous slice, running on different Kibana nodes. Not implemented today.

**PIT lifetime caveat.** The reset task's reconciliation runners hold a Point-In-Time snapshot open for the duration of each surface's walk. At multi-hour walks this prevents ES from merging segments that fall behind the snapshot's view, which can affect merge cadence and disk usage on busy clusters. Mitigation if you observe segment-merge stalls during a long backfill: drop the task timeout to a few hours (forcing a fresh PIT after each timeout) and let the periodic task fill in the residual delta — slower convergence but lighter merge pressure.

### Failure modes

| Symptom                                         | Likely cause                           | Action                                                          |
| ----------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `cases-analyticsV2: write failed [...]` at WARN | Transient ES blip                      | Reconciliation will repair within 30 min                        |
| Sustained write failures on every case event    | Mapping conflict (e.g. drifted schema) | Inspect mapping; consider POST /reset                           |
| Reconciliation tick logs `processed=0` forever  | Task state cursor stuck in the future  | POST /reset (clears state + repopulates)                        |
| Runtime fields missing from `Cases` data view   | Template SOs have no extended fields   | Check template SOs; reconciliation tick re-syncs runtime fields |
| Case missing from `.cases` long after creation, no edits since | Out-of-band drift on a never-patched case (e.g. a direct ES delete during incident response, or a schema migration that dropped some docs) | POST /reset. Periodic reconciliation only catches never-patched cases whose `created_at` is later than the cursor; older never-patched cases need the cursor cleared, which `/reset` does. |
| `/state.active_reset.status: "failed"`          | Reset task threw on both surfaces      | Inspect Kibana logs for the `cases-analyticsV2: full reset failed on both surfaces` ERROR; address the root cause; re-run POST /reset |
| `/state.active_reset.status: "running"` for hours | Backfill task is mid-walk on a large tenant | Wait. Raise `resetTaskTimeoutMinutes` in `kibana.yml` if it exceeds your tolerance window (see "Tuning /reset at scale") |
| `Event loop utilization exceeded threshold` from `/internal/cases/_analyticsV2/reset` | A runner page is slower than expected on this hardware | Raise `resetPageDelayMs` to 50–100 to throttle further |
| `Case Analytics` data view missing in Discover / Lens after `/reset` | Lazy recreation hasn't fired in that space yet — `/reset` deletes every per-space data view, and they recreate on the next cases request per space | Open the Cases UI in the affected space, or run `curl /s/<spaceId>/api/cases/_find?perPage=1` to pre-warm. See "Per-space data views after /reset" above. |

## Activity surface

`.cases-activity` mirrors the `cases-user-actions` SO — one analytics
doc per user-action, keyed on the SO id. Same fire-and-forget hook +
reconciliation backstop architecture as the cases surface, with a few
deliberate differences driven by the user-action shape:

- **Append-only.** User actions are immutable at the SO layer (`create`
  only, never `patch`). The reconciliation runner therefore filters on
  `created_at > tracker` only — no `updated_at IS NULL` branch — and
  the writer exposes only `upsertAction` / `bulkUpsertActions` on the
  write side. There is no per-action `delete` path; activity rows are
  removed only via the cascade-delete path described next.
- **Cascade on case delete.** When a case is deleted, the SO layer
  cascades to its user-action SOs. Reconciliation walks forward in
  time and never sees the gap, so the activity writer exposes a
  `bulkDeleteActionsByCaseIds` path that runs a `delete_by_query` on
  `cases.id`. `CasesService.deleteCase` and `bulkDeleteCaseEntities`
  dispatch this immediately after the SO delete succeeds.
- **Polymorphic payload + curated extracts.** The user-action
  `attributes.payload` shape is union-typed by `attributes.type`. The
  doc-builder strict-maps a small set of curated extracts
  (`action.status_new`, `action.severity_new`, `action.assignees_changed`,
  `action.tags_changed`, `action.connector_id_new`) for the common
  analytical pivots, AND stringifies the full payload as
  `action.payload_json` (`keyword`, `ignore_above: 32766`) so analysts
  can dig into any payload sub-field via ES|QL `MV_FROM_JSON` without
  per-type mapping churn.
- **No `index.mode: lookup`.** `.cases-activity` is the **fact** table
  in the analytics model. ES|QL queries `FROM .cases-activity | LOOKUP
  JOIN .cases ON cases.id`; the lookup-mode index is on the cases side.
- **Same reconciliation page size as cases (100).** User-action docs are
  smaller than case docs, but the per-page sync CPU is dominated by the
  `JSON.stringify(payload)` for the polymorphic payload field (which can
  be large for bulk-attachment or push payloads). 100 keeps the worst-
  case sync span between event-loop yields bounded; throughput is
  limited by ES bulk roundtrip latency, not page count.

The same managed `Case Analytics` data view spans both surfaces — its
title is `.cases,.cases-activity`, so a single Discover / Lens
selection covers both. A `LOOKUP JOIN` from the activity surface to
the cases surface is just `LOOKUP JOIN .cases ON cases.id` against the
joined view.

The reconciliation task runs both surfaces sequentially per tick, with
**independent cursors** (`cases_last_run_at`, `activity_last_run_at`).
A sustained outage on one surface pins only its own cursor; the other
keeps advancing. `/state` reports both, and `/reset` rebuilds both.

## File layout

```
cases_analytics_v2/
├── README.md          this file
├── index.ts           public surface (CasesAnalyticsV2Service, writer contract)
├── service.ts         lifecycle orchestrator (setup → start → stop)
├── constants.ts       index name + administrator route URLs
│
├── ensure_indices/
│   ├── case.ts        idempotent bootstrap for .cases (lookup-mode)
│   └── activity.ts    idempotent bootstrap for .cases-activity (fact table)
│
├── mappings/
│   ├── case.ts                          CASE_INDEX_MAPPING (dynamic: strict)
│   ├── activity.ts                      ACTIVITY_INDEX_MAPPING (dynamic: strict)
│   ├── dynamic_templates.ts             keyword template for observables denormalization
│   ├── schema_drift.test.ts             round-trip + snake-key guards (cases)
│   └── activity_schema_drift.test.ts    per-action-type guards (activity)
│
├── writer/
│   ├── index.ts                       CasesAnalyticsV2Writer + V2_NOOP_WRITER
│   ├── activity.ts                    CasesActivityV2Writer + V2_NOOP_ACTIVITY_WRITER
│   ├── case_doc_builder.ts            pure transform: case SO → analytics doc
│   ├── case_doc_builder.test.ts
│   ├── activity_doc_builder.ts        pure transform: user-action SO → activity doc
│   ├── retry.ts                       bounded jittered exponential backoff
│   └── retry.test.ts
│
├── reconciliation/
│   ├── index.ts             periodic task type registration + scheduling
│   │                        (cases first, activity second, per tick;
│   │                        independent cursors; maxAttempts: 1)
│   ├── runner.ts            walks cases by `updated_at > last_run_at OR
│   │                        (updated_at IS MISSING AND created_at >
│   │                        last_run_at)` using PIT. The null branch picks up
│   │                        never-patched cases the writer missed at create
│   │                        time; the `created_at` guard keeps the per-tick
│   │                        walk bounded. Both the PIT open and every paged
│   │                        `find` opt into `namespaces: ['*']` — the
│   │                        unscoped internal SO client otherwise silently
│   │                        scopes to `default`.
│   ├── activity_runner.ts   walks user-actions by `created_at > last_run_at`
│   │                        (immutable SOs — no `updated_at` branch needed).
│   ├── reset_runner.ts      shared "walk both surfaces + seed cursors" helper
│   │                        called by the one-shot reset task. Per-surface
│   │                        failure isolation; no throws on per-surface walk
│   │                        errors (logged at WARN).
│   └── reset_task.ts        one-shot Task Manager task type for the async
│                            backfill (`cases.analyticsV2.fullReset`). Singleton
│                            ID, configurable timeout + page delay, throws on
│                            total failure to preserve `/state.active_reset`
│                            visibility.
│
├── data_view/
│   ├── service.ts                   ensures Cases data view; syncs runtime fields
│   ├── data_view_specs.ts           base spec (namespaces: ['*'], managed: true)
│   ├── runtime_fields.ts            snake-key → painless source + runtime entry
│   └── runtime_fields.test.ts
│
└── routes/
    └── index.ts       /state, /reconcile/run_soon, /reset (superuser only)
```
