# Elasticsearch resources

This folder defines the managed Elasticsearch resources for alerting v2:

- data streams with explicit mappings and ILM policies
- ES|QL views layered over those streams
- the startup registration path that initializes them at plugin start

If you change stored document shape, retention behavior, or ES|QL views, this folder is part of the change.

## What this folder owns

| Area | Files |
| --- | --- |
| Datastream definitions | `datastreams/alert_events.ts`, `datastreams/alert_actions.ts` |
| Datastream registration | `datastreams/register.ts` |
| ES\|QL view definitions | `esql_views/` |
| Startup initialization | `register_resources.ts` |

`register_resources.ts` registers datastreams and ES|QL views, then asks `ResourceManager` to start initialization during plugin start.

## Temporary reset API (pre-GA only)

While alerting v2 is still pre-GA and breaking resource changes are still expected, Kibana also exposes a temporary internal endpoint that wipes and recreates these resources:

- endpoint: `POST /internal/alerting/v2/_reset_resources`
- implementation: `server/routes/reset_resources_route.ts`
- success response: `204 No Content`

What it deletes:

- all documents in `.rule-events`
- all documents in `.alert-actions`
- the backing index templates for those two data streams
- all alerting v2 saved objects of type `alerting_rule`, `alerting_notification_policy`, and `alerting_api_key_pending_invalidation`
- all per-rule task manager tasks of type `alerting_v2:rule_executor`

What it recreates:

- `.rule-events`
- `.alert-actions`
- their ILM policies and index templates

How to call it from Kibana Dev Tools:

```http
POST kbn:/internal/alerting/v2/_reset_resources
```

Permissions required:

- The alerting v2 feature privilegs
- The superuser role to have access to system indices

Notes:

- This endpoint is intentionally destructive and only meant to unblock pre-GA development when resource or saved object schema changes require a clean slate.
- Remove this section from the README when `server/routes/reset_resources_route.ts` is removed for GA. That cleanup is tracked by `rna-program#426`.

## Design principles

| Topic | Behavior |
| --- | --- |
| Append-only storage | Both streams are written as immutable history; consumers derive state from history rather than in-place updates. |
| Strict mappings | Both data streams use `dynamic: false`. Only declared fields are indexed. |
| Runtime schema alignment | Zod schemas mirror the intended application-level document shape. |
| Versioned evolution | Datastream resources carry a version; bump it when template changes require rollover. |
| Backward compatibility | Existing fields may not be removed, renamed, or have incompatible type changes. |

## The two core streams

### `.rule-events`

Purpose: append-only rule events produced by the rule executor.

This stream is the durable history of rule evaluation.

| Field | ES type | Notes |
| --- | --- | --- |
| `@timestamp` | `date` | When the document was written. |
| `scheduled_timestamp` | `date` | When the rule run was scheduled. |
| `rule.id` | `keyword` | Rule identifier. |
| `rule.version` | `long` | Rule version at execution time. |
| `group_hash` | `keyword` | Per-rule series identity. |
| `data` | `flattened` | ES\|QL row payload. |
| `status` | `keyword` | `breached`, `recovered`, or `no_data`. |
| `source` | `keyword` | Origin marker. |
| `type` | `keyword` | `signal` or `alert`. |
| `episode.id` | `keyword` | Episode id for alert-type events. |
| `episode.status` | `keyword` | `inactive`, `pending`, `active`, or `recovering`. |
| `episode.status_count` | `long` | Consecutive count within the current episode status. |
| `episode.status_started_at` | `date` | When the current contiguous status span began. Carried forward across executions while the status is stable; reset on a status change. Acts as the contiguous-run discriminator so flapping (`active -> recovering -> active`) is not collapsed by min/max aggregations. |
| `transition` | `object` | Present only on the event where `episode.status` changes. `transition.from` is the previous status (absent on lifecycle start) and `transition.to` is the new status. |
| `transition.ends_*` | mixed | Flattened, synthetics-style snapshot of the status span this event closed: `ends_episode_id` (`keyword`), `ends_status` (`keyword`), `ends_started_at` (`date`), `ends_duration_ms` (`long`), and optional `ends_status_count` (`long`). Absent on lifecycle start. Flattened because the strict mapping type only allows one level of object nesting. |
| `severity` | `keyword` | Optional. Best-effort severity extracted from the ES\|QL `severity` column on breached events. One of `info`, `low`, `medium`, `high`, `critical`. |

Writers:

- `lib/rule_executor/steps/store_alert_events.ts`

Readers:

- `lib/director/queries.ts`
- `lib/dispatcher/queries.ts`
- UI and APIs that surface alert history / episodes

Runtime schema: `alertEventSchema` in `datastreams/alert_events.ts`

### `.alert-actions`

Purpose: append-only action history for alerts and notification groups.

This stream is the dispatcher's durable memory and also stores user/system actions such as acknowledgement or snoozing.

| Field | ES type | Notes |
| --- | --- | --- |
| `@timestamp` | `date` | Action time. |
| `last_series_event_timestamp` | `date` | Timestamp of the related series event. |
| `expiry` | `date` | Optional expiry for temporary actions such as snooze. |
| `actor` | `keyword` | Who performed the action. |
| `action_type` | `keyword` | `fire`, `suppress`, `notified`, `ack`, `deactivate`, and related values. |
| `group_hash` | `keyword` | Series identity. |
| `episode_id` | `keyword` | Optional episode scope. |
| `episode_status` | `keyword` | Optional episode status captured with the action. |
| `rule_id` | `keyword` | Rule identifier. |
| `tags` | `keyword` | Optional tags. |
| `notification_group_id` | `keyword` | Group identity for throttling / notify tracking. |
| `source` | `keyword` | Origin marker. |
| `reason` | `text` | Human-readable explanation. |

Writers:

- `lib/dispatcher/steps/store_actions_step.ts`
- alert action routes under `server/routes/alert_actions/`

Readers:

- `lib/dispatcher/queries.ts`
- alert action clients and APIs

Runtime schema: `alertActionSchema` in `datastreams/alert_actions.ts`

## Alert action taxonomy

`action_type` is the main vocabulary carried by `.alert-actions`. In practice the current system writes two broad categories of actions.

### User or API initiated actions

These actions are created through the alert action routes and clients. They change how later dispatcher runs interpret an alert or episode.

| Action type | Written by | Meaning |
| --- | --- | --- |
| `ack` | User/API | Marks an alert or episode as acknowledged. |
| `unack` | User/API | Clears a previous acknowledgement. |
| `snooze` | User/API | Temporarily suppresses notification handling, usually with an expiry. |
| `unsnooze` | User/API | Clears an active snooze. |
| `deactivate` | User/API | Disables the alert or episode from active notification handling. |
| `activate` | User/API | Reverses a previous deactivation. |
| `tag` | User/API | Attaches tags/metadata to the alert action history. |

### Dispatcher outcome actions

These actions are written by `StoreActionsStep` to record what the dispatcher decided during a run.

| Action type | Written by | Meaning |
| --- | --- | --- |
| `fire` | Dispatcher | This episode was eligible for dispatch in the current run. |
| `notified` | Dispatcher | A notification group was actually scheduled/sent. This is group-level history used for throttling. |
| `suppress` | Dispatcher | The episode was intentionally not fired in this run, for example because suppression logic or throttling held it back. |
| `unmatched` | Dispatcher | The episode stayed dispatchable but matched no enabled notification policy. |

### Why both `fire` and `notified` exist

The dispatcher records both per-episode and per-group outcomes:

- `fire` means an individual episode reached the dispatch stage
- `notified` means a notification group was actually sent and is the durable record later throttling queries look at

That distinction is why `.alert-actions` stores both episode-scoped and notification-group-scoped fields.

## ES|QL views

ES|QL views are registered as `optional: true`, which lets Kibana start even on clusters without ES|QL view support.

| Key | View name | Summary |
| --- | --- | --- |
| `view:rule-events` | `$.rule-events` | Direct view of `.rule-events` |
| `view:alert-actions` | `$.alert-actions` | Direct view of `.alert-actions` |
| `view:alert-episodes` | `$.alert-episodes` | Episode-oriented projection over rule events |

Definitions live in `esql_views/`. The richest example is `esql_views/alert_episodes.ts`.

## Changing a datastream schema safely

Schema evolution must be backward compatible.

Allowed changes:

- adding a new optional field
- adding new application-side parsing for an existing optional field
- creating a new optional view over existing data

Disallowed changes:

- removing or renaming existing fields
- changing field types incompatibly
- making an existing optional field required

### Change recipe

1. Update the datastream mapping in `datastreams/alert_events.ts` or `datastreams/alert_actions.ts`.
2. Update the corresponding Zod schema in the same file.
3. Bump the corresponding datastream version constant when the template change requires rollover.
4. Update writers and readers that need to understand the new field.
5. Update the relevant README if the field changes the architecture or contributor mental model.

## Example: adding a new optional alert event field

If you add a new optional field to `.rule-events`, the minimum change set is usually:

- `datastreams/alert_events.ts` for the mapping
- `datastreams/alert_events.ts` for `alertEventSchema`
- the writer in the rule executor or director
- any reader in dispatcher / UI / route code that consumes the field

That keeps stored schema, runtime validation, and application code aligned.

## ILM and retention

Current ILM policies keep both streams in the hot phase with rollover on:

- `30d` max age
- `50gb` primary shard size

See the `*_ILM_POLICY` definitions in the datastream files if you need to change retention behavior.

## Related server code

| Area | Role |
| --- | --- |
| `lib/services/resource_service/` | Resource registration and initialization orchestration |
| `lib/rule_executor/steps/store_alert_events.ts` | Writes `.rule-events` |
| `lib/dispatcher/steps/store_actions_step.ts` | Writes `.alert-actions` |
| `lib/dispatcher/queries.ts` | Reads from `.rule-events` and `.alert-actions` |
| `lib/director/queries.ts` | Reads latest alert state from `.rule-events` |
