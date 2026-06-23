# Significant Events snapshots

This folder contains a small CLI + helper modules for producing **repeatable Elasticsearch snapshots** that can be used as datasets for **Streams Significant Events** evaluation and experimentation.

The snapshots are written to **GCS** (bucket: `significant-events-datasets`) under a run-specific base path, and each scenario snapshot contains:
- `logs*` - Demo app log data generated during the run
- `sigevents-streams-features-<scenario>` - extracted features produced by Streams feature extraction (copied out of system indices so it can be snapshotted)

## What this does

For each selected scenario, the [capture_otel_demo_snapshots](index.ts) script:

1. Deploys the selected demo app on minikube
2. Waits for pods to become ready
3. Accumulates baseline traffic for a configurable window (`--baseline-wait`)
4. Optionally patches a failure scenario and accumulates failure traffic (`--failure-wait`)
5. Enables Significant Events + runs feature extraction for the `logs` stream
6. Creates an Elasticsearch snapshot to GCS
7. Cleans up logs + extracted features, disables streams, and tears down the demo

The per-scenario deploy/teardown + data cleanup is intentional as each snapshot should be isolated and not contaminated by previous scenarios.

### Prerequisites

- **minikube** + **kubectl** - the script will automatically start minikube if it is not already running, using `--cpus=4 --memory=8g`. Ensure your system can spare these resources before running the script.
- Local **Elasticsearch** running with access to GCS credentials: `yarn es snapshot --license trial --secure-files gcs.client.default.credentials_file=/path/to/creds.json`
- Local **Kibana** running
- GCS repository access configured in Elasticsearch (so ES can write snapshots to the bucket)
- An LLM connector configured in `kibana.dev.yml` for feature extraction

### Flags

| Flag | Description | Default |
| --- | --- | --- |
| `--connector-id` | **Required.** LLM connector ID used for feature extraction. | none |
| `--run-id` | Run identifier used for the snapshot repo name and GCS base path. | Today's date `YYYY-MM-DD` (local time) |
| `--scenario` | Limit to specific scenario(s). Can be repeated. Omit to run all scenarios for the selected demo app. | All scenarios |
| `--demo-app` | Demo app to use. Must be a registered demo type (see `listAvailableDemos()`). | `otel-demo` |
| `--baseline-wait` | Duration to wait for baseline traffic. Accepts `s`, `m`, `h`, `d` suffixes (e.g. `3m`, `90s`, `1h`). | `3m` |
| `--failure-wait` | Duration to wait after applying a failure scenario. Same format as `--baseline-wait`. | `5m` |
| `--dry-run` | Print what would happen without deploying, extracting, or snapshotting. | `false` |
| `--es-url` | Elasticsearch URL | from `config/kibana.dev.yml` |
| `--es-username` | Elasticsearch username | from `config/kibana.dev.yml` |
| `--es-password` | Elasticsearch password | from `config/kibana.dev.yml` |
| `--kibana-url` | Kibana base URL (if omitted, built from Kibana config with basePath resolution) | from `config/kibana.dev.yml` |

## How to run

### Create snapshots for all available scenarios

```
node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id <connectorId>
```

### Create snapshots for a specific demo app

```
node scripts/capture_sigevents_otel_demo_snapshots.js \
  --connector-id <connectorId> \
  --demo-app online-boutique
```

### Create snapshots for specific scenarios

```
node scripts/capture_sigevents_otel_demo_snapshots.js \
  --connector-id <connectorId> \
  --scenario healthy-baseline \
  --scenario payment-unreachable
```

### Create snapshots with a specific run ID

**What `--run-id` does:** It namespaces where snapshots are stored in GCS and what the ES snapshot repository is called.
- GCS base path: `gs://significant-events-datasets/<run-id>/<demo-app>/`
- Snapshot repository name: `sigevents-<run-id>`

**Default:** If omitted, `--run-id` defaults to today's date in `YYYY-MM-DD` format (local time).

Note: Use a unique run ID (e.g.: `test-run-...`) to keep multiple runs side-by-side without colliding with previous snapshots.

```
node scripts/capture_sigevents_otel_demo_snapshots.js \
  --connector-id <connectorId> \
  --run-id test-run-2026-02-23
```

### Customize wait durations

```
node scripts/capture_sigevents_otel_demo_snapshots.js \
  --connector-id <connectorId> \
  --baseline-wait 5m \
  --failure-wait 15m
```

## Output

At the end of a run you should see:
- Snapshot Run ID
- GCS base path for the run
- Snapshot names (one per scenario)

Those snapshot names are what you will replay later in the eval setup.

## Best Practices

This script is designed for **disposable dev data** and assumes it owns the `logs*` space.

- **Run against a dedicated dev ES/Kibana**: The cleanup step deletes data in `logs*` and `.significant_events-knowledge_indicators`, and it disables Streams. Do not point this at a shared cluster with important logs.
- **Features are snapshotted from a non-system index**: Elasticsearch snapshots cannot include system indices via the `indices` parameter, so we copy extracted features into `sigevents-streams-features-<scenario>` before snapshotting.
- **Keep the cluster quiet**: Feature extraction is scheduled over the **last 24 hours** (`from = now - 24h`), so any unrelated `logs*` data in that time range can affect extracted features and snapshots.
- **Use a unique `--run-id`**: It determines the snapshot repository name (`sigevents-<run-id>`) and the GCS base path. Reusing a run ID can collide with existing snapshots (same scenario snapshot names).
- **Start small**: When iterating, run a single `--scenario` first; use `--dry-run` to verify what will be created.
- **If you abort mid-run**: You may need to manually teardown the demo (`node scripts/otel_demo.js --teardown`) and/or clean up remaining `logs*` / streams state before retrying.
