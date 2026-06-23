# Capture Environment Snapshot

Captures the current Streams/SigEvents environment into a GCS snapshot. `.kibana` system indices are reindexed to snapshot-safe names with mappings preserved, then everything is snapshotted together.

## Prerequisites

- The environment must already contain all the data you want to capture (logs, alerts, Streams features/assets, etc.). This script only snapshots existing indices — it does not generate or ingest any data. Run the appropriate data generation scripts (e.g. OTel demo, Significant Events scenarios) before capturing.
- Local Elasticsearch with GCS credentials in the keystore.
- Credentials with `manage_security` privilege (see [Required privileges](#required-privileges)).

## Why

Elasticsearch system indices (`.kibana_*`) cannot be directly included in snapshots, and `_reindex` does not carry mappings. This script handles it: it fetches the live mapping, creates a regular index copy (`snapshot-*`), reindexes the data, then snapshots everything together with non-system indices.

## Usage

```bash
node scripts/capture_sigevents_env_snapshot.js --snapshot-name my-snapshot
```

### With custom options

```bash
node scripts/capture_sigevents_env_snapshot.js \
  --snapshot-name my-snapshot \
  --run-id <run-id> \
  --logs-index <custom-logs-index> \
```

### Flags

| Flag | Description | Default |
| --- | --- | --- |
| `--snapshot-name` | **Required.** Name for the snapshot. | none |
| `--run-id` | Run identifier for GCS repo name and base path. | Today's date `YYYY-MM-DD` |
| `--logs-index` | Logs index to include in the snapshot + replay. | `logs.otel` |
| `--alert-indices` | Alert index to include in the snapshot + replay. Can be repeated. | `.internal.alerts-streams.alerts-default-*` |
| `--es-url` | Elasticsearch URL | from `config/kibana.dev.yml` |
| `--es-username` | Elasticsearch username | from `config/kibana.dev.yml` |
| `--es-password` | Elasticsearch password | from `config/kibana.dev.yml` |

## How it works

1. Creates a temporary Elasticsearch user (`restore_sigevents_env_snapshot_tmp`) with the `system_indices_superuser` role. This user is deleted on script exit (success or failure).
2. Resolves wildcard patterns to concrete index names via `GET _resolve/index`.
3. For each fixed system index (`.kibana_streams_tasks-*`) and the KI data stream (`.significant_events-knowledge_indicators`), fetches its mapping, creates a `snapshot-*` copy, and reindexes the data. `--logs-index` and `--alert-indices` targets are included directly in the snapshot without reindexing.
4. Registers a GCS snapshot repository and creates the snapshot containing all captured indices.

### Naming convention

System indices and the KI data stream are reindexed under a renamed copy. Leading `.` is replaced with `snapshot-`:

| Source index | Snapshot index |
| --- | --- |
| `.kibana_streams_tasks-000001` | `snapshot-kibana_streams_tasks-000001` |
| `.significant_events-knowledge_indicators` | `snapshot-significant_events-knowledge_indicators` |
| `.internal.alerts-streams.alerts-default-000001` | `.internal.alerts-streams.alerts-default-000001` (no change) |
| `logs.otel` | `logs.otel` (no change) |

## Restoring

After capturing a snapshot, use the restore script to bring up a fresh environment:

```bash
node scripts/restore_sigevents_env_snapshot.js \
  --gcs-bucket significant-events-datasets \
  --gcs-base-path <run-id>/<base-path> \
  --snapshot-name <snapshot-name>
```

See [`restore_env_snapshot/README.md`](../restore_env_snapshot/README.md) for the full restore workflow and all available flags.

## Required privileges

The script automatically creates and deletes a temporary `system_indices_superuser` user. The credentials you pass (`--es-username` / `--es-password`) only need the `manage_security` cluster privilege to do so — the built-in `elastic` superuser works out of the box.

## Why aliases can't be baked into the snapshot

During capture, the source system indices (e.g. `.kibana_streams_tasks-000001`) still exist in the cluster with their aliases. Elasticsearch enforces that an alias cannot point to both a system and a non-system index simultaneously. Since the snapshot copies are regular (non-system) indices, adding the same alias name to them is rejected. This is a fundamental Elasticsearch limitation, not a script limitation.
