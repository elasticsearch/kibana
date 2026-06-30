# Cases Analytics v2 — case surface

Cluster-level analytics index for the cases plugin, populated by real-time
saved-object hooks with periodic reconciliation as the durability backstop.
Replaces the per-(space × owner) reindex pipeline at `server/cases_analytics/`.

## Status

v2 is gated by `xpack.cases.analyticsV2.enabled` (default `false`). v1
(`server/cases_analytics/`) remains the primary path while v2 is being
validated.

This module ships the **case surface** (`.cases`) plus the full v2
infrastructure — async `/reset` task, configurable tuning knobs,
per-space data view management, live progress reporting. The activity
surface (`.cases-activity`) lands in a follow-up PR; the file layout,
reset task, dual-cursor schema, and routes are already structured to
accept it without rework.

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

## Index

`.cases` — `index.mode: lookup`, hidden by default, one doc per case.

Lookup mode lets future analytics surfaces (e.g. the activity surface in PR
2) `LOOKUP JOIN` the cases dimension table from ES|QL — "for each activity
row, what's the current case title / severity / owner?" without
denormalization at write time. Lookup mode is Technical Preview as of
Elasticsearch 8.18 / 9.0; the breaking-change risk is acceptable for cases
data because the dataset fits comfortably (single shard handles ~50GB; a
tenant with millions of cases at ~2KB/doc is a few GB at most).

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
    # "Admin routes" below for the rationale.
  resetTaskTimeoutMinutes:
    60 # default — wall-clock budget for the
    # one-shot backfill task scheduled by /reset.
    # Comfortable through ~2K spaces; raise for
    # larger tenants (see "Tuning /reset at
    # scale" below). Min 5, max 1440 (24h).
  resetPageDelayMs:
    0 # default — inter-page sleep applied by the
    # reconciliation runner ONLY when invoked
    # from the reset task. Default 0 keeps the
    # post-reset backfill as fast as possible.
    # Administrators on shared / capacity-
    # constrained ES clusters raise this to
    # throttle bulk-write pressure during the
    # backfill. Min 0, max 5000.
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

A managed data view named `Case Analytics` is bootstrapped **per space**,
lazily, on the first Cases request in that space. The id is
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
process restart, an administrator `/reset`, or a template create / update /
delete in that space (the templates service fires a refresh callback).

**Cross-space analytics.** No global data view is shipped. An administrator
who needs a cross-space dashboard can duplicate the per-space view (saving
it without the `managed` flag), edit it to use `namespaces: ['*']`, and
curate the runtime fields they want to keep. Out of scope for the managed
feature.

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
compatible top-level cases fields), the reconciliation task's last run,
and the live or most-recently-failed reset task. Superuser only.

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
    }
  },
  "reconciliation": {
    "task_type": "cases.analyticsV2.reconciliation",
    "last_run": {
      "cases_last_run_at": "2026-05-15T15:30:00.000Z",
      "runs": 0,
      "next_run_at": "2026-05-15T16:00:00.000Z",
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
seconds. Administrators polling `/state` see the cumulative
`cases_processed` count tick up live, and the `phase` field reports
which surface is currently being walked:

```json
"active_reset": {
  "task_id": "cases-analyticsV2-reset",
  "status": "running",
  "scheduled_at": "2026-05-15T16:02:00.000Z",
  "attempts": 1,
  "state": {
    "phase": "cases",
    "cases_processed": 50000,
    "started_at": "2026-05-15T16:02:13.000Z"
  }
}
```

**Final state.** When the walk completes, Task Manager writes the full
`ResetTaskState` from the runner's return value (including
`cases_cursor`, `completed_at`, and any error message) and then — on
success — removes the SO. The brief window between the final write and
the SO removal is when consumers polling `/state` see `phase:
"completed"`. After the SO removal, `active_reset` returns to `null`.
On failure the SO is preserved with `status: "failed"` and the most
recent throttled state intact (so `phase` shows where the walk died and
`cases_processed` shows how far it got).

If `enabled: true` but `index_exists: false`, the bootstrap
(`ensureCaseIndex`) hit an error at plugin start and logged at ERROR;
check Kibana logs and consider `POST /reset`.

### Admin routes (mutating)

The two routes below mutate subsystem state cluster-wide and operate
**globally** across every space even when invoked from a single space's
URL. They're gated behind a second flag:

```yaml
xpack.cases.analyticsV2.enableAdminRoutes: true # default false
```

When the flag is off, neither route is registered — requests return HTTP
404. The read-only `GET /state` route above is registered regardless (a
future Case Settings page polls it for health info).

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
    "scheduled_at": "2026-05-15T16:02:00.000Z",
    "poll": "/internal/cases/_analyticsV2/state"
  }
}
```

**Two-phase contract.** The destructive cleanup is synchronous (drops the
index, recreates it from scratch using the same bootstrap path as plugin
start, deletes every per-space managed `Case Analytics` data view, clears
the data view bootstrap cache). The full backfill walk that repopulates
`.cases` from the SO source of truth runs **asynchronously** in a one-shot
Task Manager job (`cases.analyticsV2.fullReset`). The route returns 202
once the synchronous portion completes; the administrator polls
`/state.active_reset` to track the backfill. **Requires
`xpack.cases.analyticsV2.enableAdminRoutes: true`.**

**Why async.** Even at PR-1 scale (~50K cases on a ~1K-space tenant) the
backfill walk runs for several minutes — well past any reasonable HTTP
request budget. Running the walk in a dedicated Task Manager job means:

- `/reset` returns in seconds at any tenant size.
- The walk is durable across Kibana node restarts (Task Manager re-claims
  a stuck task on another node).
- Two `/reset` calls can't race — the second call removes the in-flight
  reset task SO before scheduling its own (latest-wins).
- The walk timeout is configurable per tenant
  (`resetTaskTimeoutMinutes`) instead of capped by the HTTP request
  timeout.
- A configurable inter-page delay (`resetPageDelayMs`) lets administrators
  throttle bulk-write pressure on shared clusters.

**Polling for completion.** While the backfill task is running,
`/state.active_reset.status` reports `"running"`. On success, Task Manager
auto-removes the task SO and `/state.active_reset` returns `null`. On
failure, the SO is preserved with `status: "failed"` and `state.cases_error`
populated. The seed step omits the cursor on failure, so the next periodic
tick falls back to a full walk and recovers any docs the partial reset
missed.

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
| `xpack.cases.analyticsV2.resetPageDelayMs` | `0` | `0`–`5000` | Inter-page sleep (in ms) between reconciliation runner pages. `0` = no throttle (runner still yields via `setImmediate`). |

**Sizing the timeout.** The backfill walk is `O(documents)` not `O(spaces)` —
what matters is total case volume. Approximate wall-clock at typical tenant
shapes (default `resetPageDelayMs: 0`):

| Tenant scale | Cases | Wall-clock | `resetTaskTimeoutMinutes` |
| ------------ | ----- | ---------- | ------------------------- |
| ≤ 100 spaces | ~5K | < 1 min | `60` (default) |
| ~1K spaces | ~50K | ~3 min | `60` (default) |
| ~5K spaces | ~250K | ~12 min | `60` (default) |
| ~10K spaces | ~500K | ~25 min | `60` (default) |
| ≥ 25K spaces | ~1.25M | ~60 min | `120` recommended |

Numbers are extrapolated from a 3-space measurement of ~100 cases per space.
Real tenants will vary — the WARN log line `cases-analyticsV2: reset failed:
... task timeout exceeded` is the signal to raise the timeout. (When the
activity surface lands in PR 2, total document volume ~20× — re-tune
accordingly.)

**Sizing the page delay.** A non-zero delay halves (at 50ms) or thirds (at
100ms) the sustained ES bulk-write rate the backfill puts on the cluster, at
proportional cost to wall-clock. The default `0` is the right call for most
administrators — set this above zero only when the backfill is observably
impacting concurrent workloads on a shared ES cluster. Always raise
`resetTaskTimeoutMinutes` first if you raise `resetPageDelayMs` — a higher
delay means a longer walk, which needs a bigger budget.

**PIT lifetime caveat.** The reset task's reconciliation runner holds a
Point-In-Time snapshot open for the duration of the walk. At multi-hour
walks this prevents ES from merging segments that fall behind the snapshot's
view, which can affect merge cadence and disk usage on busy clusters.
Mitigation if you observe segment-merge stalls during a long backfill: drop
the task timeout to a few hours (forcing a fresh PIT after each timeout) and
let the periodic task fill in the residual delta — slower convergence but
lighter merge pressure.

### Failure modes

| Symptom                                                        | Likely cause                                                          | Action                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `cases-analyticsV2: write failed [...]` at WARN                | Transient ES blip                                                     | Reconciliation will repair within 30 min                                                                     |
| Sustained write failures on every case event                   | Mapping conflict (e.g. drifted schema)                                | Inspect mapping; consider POST /reset                                                                        |
| Reconciliation tick logs `processed=0` forever                 | Task state cursor stuck in the future                                 | POST /reset (clears state + repopulates)                                                                     |
| Runtime fields missing from `Cases` data view                  | Template SOs have no extended fields                                  | Check template SOs; reconciliation tick re-syncs runtime fields                                              |
| Case missing from `.cases` long after creation, no edits since | Out-of-band drift on a never-patched case (e.g. a direct ES delete)   | POST /reset. Periodic reconciliation only catches never-patched cases whose `created_at` is later than the cursor; older never-patched cases need the cursor cleared, which `/reset` does. |
| `/state.active_reset.status: "failed"`                         | Reset task threw during the walk                                      | Inspect Kibana logs for the `cases-analyticsV2: full reset failed` ERROR; address the root cause; re-run POST /reset |
| `/state.active_reset.status: "running"` for a long time        | Backfill task is mid-walk on a large tenant                           | Wait. Raise `resetTaskTimeoutMinutes` in `kibana.yml` if it exceeds your tolerance window (see "Tuning /reset at scale") |
| `Event loop utilization exceeded threshold` from the reset task | A runner page is slower than expected on this hardware                | Raise `resetPageDelayMs` to 50–100 to throttle further                                                       |
| `Case Analytics` data view missing in Discover / Lens after `/reset` | Lazy recreation hasn't fired in that space yet — `/reset` deletes every per-space data view, and they recreate on the next cases request per space | Open the Cases UI in the affected space, or run `curl /s/<spaceId>/api/cases/_find?perPage=1` to pre-warm. See "Per-space data views after /reset" above. |

## File layout

```
cases_analytics_v2/
├── README.md          this file
├── index.ts           public surface (CasesAnalyticsV2Service, writer contract)
├── service.ts         lifecycle orchestrator (setup → start → stop)
├── constants.ts       index name + administrator route URLs
│
├── ensure_indices/
│   └── case.ts        idempotent bootstrap for .cases (lookup-mode)
│
├── mappings/
│   ├── case.ts                  CASE_INDEX_MAPPING (dynamic: strict)
│   ├── dynamic_templates.ts     keyword template for observables denormalization
│   └── schema_drift.test.ts     round-trip + snake-key guards (cases)
│
├── writer/
│   ├── index.ts                 CasesAnalyticsV2Writer + V2_NOOP_WRITER
│   ├── case_doc_builder.ts      pure transform: case SO → analytics doc
│   ├── case_doc_builder.test.ts
│   ├── retry.ts                 bounded jittered exponential backoff
│   └── retry.test.ts
│
├── reconciliation/
│   ├── index.ts             periodic task type registration + scheduling
│   │                        (`maxAttempts: 1`; per-surface cursor named
│   │                        `cases_last_run_at` for forward-compat with the
│   │                        activity surface in PR 2)
│   ├── runner.ts            walks cases by `updated_at > last_run_at OR
│   │                        (updated_at IS MISSING AND created_at >
│   │                        last_run_at)` using PIT. The null branch picks up
│   │                        never-patched cases the writer missed at create
│   │                        time; the `created_at` guard keeps the per-tick
│   │                        walk bounded. Both the PIT open and every paged
│   │                        `find` opt into `namespaces: ['*']` — the
│   │                        unscoped internal SO client otherwise silently
│   │                        scopes to `default`. Configurable inter-page
│   │                        delay (`pageDelayMs`); periodic ticks pass `0`
│   │                        and yield via `setImmediate`, the reset task
│   │                        passes `resetPageDelayMs` for ES throttling.
│   ├── reset_runner.ts      "walk + seed cursor" coordinator called by the
│   │                        one-shot reset task. Per-surface failure
│   │                        isolation; cursor-omit-on-failure so the next
│   │                        periodic tick re-walks instead of accepting
│   │                        silent data loss.
│   └── reset_task.ts        one-shot Task Manager task type for the async
│                            backfill (`cases.analyticsV2.fullReset`).
│                            Singleton ID, configurable timeout + page delay,
│                            wall-clock-throttled live progress reporting,
│                            throws on failure to preserve
│                            `/state.active_reset` visibility.
│
├── data_view/
│   ├── service.ts                   ensures Cases data view; syncs runtime fields
│   ├── data_view_specs.ts           base spec (namespaces: [<spaceId>], managed: true)
│   ├── runtime_fields.ts            snake-key → painless source + runtime entry
│   └── runtime_fields.test.ts
│
└── routes/
    └── index.ts       /state, /reconcile/run_soon, /reset (superuser only)
```
