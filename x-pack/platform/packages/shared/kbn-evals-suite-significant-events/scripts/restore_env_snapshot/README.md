# Restore Environment Snapshot

Restores a Streams/SigEvents environment from a GCS snapshot. Automates the full restore workflow: restoring system indices, recreating aliases, enabling streams, restoring the KI data stream, replaying data indices with timestamp transformation, recreating alert aliases, and repromoting query rules.

## Prerequisites

- Local Elasticsearch running.
- Access to the GCS bucket containing the snapshot (credentials available in your environment or keystore).
- Credentials with `manage_security` privilege (see [Required privileges](#required-privileges)).

> **Dirty environment?** If you have existing `logs.otel`, `.internal.alerts-streams.*`, `.kibana_streams*`, or `.significant_events-knowledge_indicators` indices, the script will detect them and prompt you to delete them before proceeding. Pass `--clean` to skip the prompt and delete automatically.

## Why

Restoring a SigEvents snapshot involves several distinct steps that previously had to be run manually in sequence:

1. **Restore** plain system indices (e.g. `.kibana_streams_tasks-*`) — renames them back from `snapshot-*` to `.*`.
2. **Recreate** `.kibana_*` aliases — system index aliases cannot be baked into the snapshot; they must be recreated after restore.
3. **Enable streams** — calls the Kibana Streams API to ensure streams are enabled before replaying data.
4. **Restore the KI data stream** (`.significant_events-knowledge_indicators`) — reindexed into the data stream so it is not left as a plain index squatting the data-stream name. No-op on old snapshots that predate KI capture.
5. **Replay** data indices (e.g. `logs.otel`) — restores with timestamp transformation so alerts fire on current data.
6. **Recreate** alert-index aliases.
7. **Repromote** query rules so the Streams rule engine reflects the restored state.

This script automates all steps in a single invocation.

## Usage

```bash
node scripts/restore_sigevents_env_snapshot.js \
  --snapshot-name my-snapshot \
  --gcs-base-path 2026-03-22/otel-demo
```

### With custom options

```bash
node scripts/restore_sigevents_env_snapshot.js \
  --snapshot-name my-snapshot \
  --gcs-bucket significant-events-datasets \
  --gcs-base-path 2026-03-22/otel-demo \
  --logs-index logs.otel \
  --es-username elastic \
  --es-password changeme
```

### Flags

| Flag | Description | Default |
| --- | --- | --- |
| `--snapshot-name` | **Required.** Name of the snapshot to restore. | none |
| `--gcs-base-path` | **Required.** GCS base path to the snapshot repository. | none |
| `--gcs-bucket` | GCS bucket containing the snapshot. | `significant-events-datasets` |
| `--logs-index` | Logs index to replay. | `logs.otel` |
| `--alert-indices` | Alert index to replay. Can be repeated. | `.internal.alerts-streams.alerts-default-*` |
| `--clean` | Delete conflicting indices before restoring without prompting | `false` |
| `--es-url` | Elasticsearch URL | from `config/kibana.dev.yml` |
| `--es-username` | Elasticsearch username | from `config/kibana.dev.yml` |
| `--es-password` | Elasticsearch password | from `config/kibana.dev.yml` |

## How it works

All steps run inside a temporary-user context: the script creates `restore_sigevents_env_snapshot_tmp` with the `system_indices_superuser` role before Step 1 and deletes it after Step 7 (or on any failure).

1. **Step 1/7 — Restore system indices**: calls `restoreSnapshot` with rename pattern `snapshot-(.*)` → `.$1`. Plain system indices were captured as `snapshot-kibana_streams_tasks-000001` and are restored back to `.kibana_streams_tasks-000001`. Missing indices are a hard error (no `allowNoMatches`).

2. **Step 2/7 — Ensure system-index aliases**: calls `ensureKnownAliases` for the restored system indices. Uses a known alias configuration (`INDEX_ALIAS_CONFIG`) to recreate aliases with `is_write_index: true` and `is_hidden: true`. Idempotent — skips aliases that already exist.

3. **Step 3/7 — Enable streams**: calls `ensureStreamsEnabled` to enable Streams via the Kibana API (`POST /api/streams/_enable`). This must happen before replaying data so that Streams-managed data streams are properly configured.

4. **Step 4/7 — Restore the KI data stream**: `.significant_events-knowledge_indicators` is captured as a plain `snapshot-*` index but is a data stream owned by the streams plugin. Restoring it under its real name would create a concrete index squatting the data-stream name (which ES cannot then materialize as a data stream), so the snapshot is restored to a temp index and reindexed into the data-stream name — ES auto-creates the data stream from the always-present template. No-op on old snapshots that predate KI capture — logs a notice and continues.

5. **Step 5/7 — Replay data indices**: calls `replaySnapshot` from `@kbn/es-snapshot-loader` with a GCS repository and the resolved `--patterns`. This restores data streams (e.g. `logs.otel`) with timestamp transformation so timestamps are shifted to the current time window.

6. **Step 6/7 — Ensure alert-index aliases**: calls `ensureKnownAliases` for the replayed alert indices.

7. **Step 7/7 — Repromote queries**: the snapshot captures KI query docs (`rule_backed: true`) but not the alerting rule saved objects, so the restored docs claim to be rule-backed while no rules exist. This step resets `rule_backed` to `false` and then re-promotes, so `_promote` re-creates the rules (with the same deterministic `rule_id`); otherwise it would skip the phantom-backed queries and no alerts would fire.

## Relationship to capture

The capture script (`capture_sigevents_env_snapshot.js`) prints the exact restore command with the correct `--gcs-bucket`, `--gcs-base-path`, and `--snapshot-name` flags after a successful capture. Copy that command to restore the environment later.

See [`capture_env_snapshot/README.md`](../capture_env_snapshot/README.md) for the capture workflow.

## Required privileges

The script automatically creates and deletes a temporary `system_indices_superuser` user. The credentials you pass (`--es-username` / `--es-password`) only need the `manage_security` cluster privilege to do so — the built-in `elastic` superuser works out of the box.
