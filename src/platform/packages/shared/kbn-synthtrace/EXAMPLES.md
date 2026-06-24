# Examples

This document contains all usage examples for `@kbn/synthtrace`. See the [README.md](./README.md) for general documentation.

## Table of Contents

- [Node.js Module Examples](#nodejs-module-examples)
- [CLI Examples](#cli-examples)
- [Scenario Examples](#scenario-examples)
  - [APM Scenarios](#apm-scenarios)
  - [Log Scenarios](#log-scenarios)
  - [Infrastructure Scenarios](#infrastructure-scenarios)
  - [Combined Scenarios](#combined-scenarios)
  - [Specialized Scenarios](#specialized-scenarios)
  - [SRE Incident Scenarios](#sre-incident-scenarios)
- [Advanced Usage Examples](#advanced-usage-examples)

## Node.js Module Examples

### Basic Example

```ts
import { service, timerange, toElasticsearchOutput } from '@kbn/synthtrace';

const instance = service({ name: 'synth-go', environment: 'production', agentName: 'go' }).instance(
  'instance-a'
);

const from = new Date('2021-01-01T12:00:00.000Z').getTime();
const to = new Date('2021-01-01T12:00:00.000Z').getTime();

const traceEvents = timerange(from, to)
  .interval('1m')
  .rate(10)
  .flatMap((timestamp) =>
    instance
      .transaction({ transactionName: 'GET /api/product/list' })
      .timestamp(timestamp)
      .duration(1000)
      .success()
      .children(
        instance
          .span('GET apm-*/_search', 'db', 'elasticsearch')
          .timestamp(timestamp + 50)
          .duration(900)
          .destination('elasticsearch')
          .success()
      )
      .serialize()
  );

const metricsets = timerange(from, to)
  .interval('30s')
  .rate(1)
  .flatMap((timestamp) =>
    instance
      .appMetrics({
        'system.memory.actual.free': 800,
        'system.memory.total': 1000,
        'system.cpu.total.norm.pct': 0.6,
        'system.process.cpu.total.norm.pct': 0.7,
      })
      .timestamp(timestamp)
      .serialize()
  );

const esEvents = toElasticsearchOutput(traceEvents.concat(metricsets));
```

### Generating Metricsets

`@kbn/synthtrace` can also automatically generate transaction metrics, span destination metrics and transaction breakdown metrics based on the generated trace events:

```ts
import {
  getTransactionMetrics,
  getSpanDestinationMetrics,
  getBreakdownMetrics,
} from '@kbn/synthtrace';

const esEvents = toElasticsearchOutput([
  ...traceEvents,
  ...getTransactionMetrics(traceEvents),
  ...getSpanDestinationMetrics(traceEvents),
  ...getBreakdownMetrics(traceEvents),
]);
```

## CLI Examples

### Basic Usage

For live data ingestion:

```sh
node scripts/synthtrace simple_trace --target=http://admin:changeme@localhost:9200 --live
```

For a fixed time window:

```sh
node scripts/synthtrace simple_trace --target=http://admin:changeme@localhost:9200 --from=now-24h --to=now
```

### Local Development

When running the CLI locally, you can simply use the following command to ingest data to a locally running Elasticsearch and Kibana instance:

```sh
node scripts/synthtrace simple_trace
```

_Assuming both Elasticsearch and Kibana are running on the default localhost ports with default credentials._

### When Kibana URL differs from Elasticsearch URL

If the Kibana URL differs from the Elasticsearch URL in protocol or hostname, you should explicitly pass the `--kibana` option to the CLI along with `--target`.

For example when running ES (with ssl) and Kibana (without ssl) locally in Serverless mode:

```sh
node scripts/synthtrace simple_trace --target=https://elastic_serverless:changeme@localhost:9200 --kibana=http://elastic_serverless:changeme@localhost:5601
```

### Using CLI for Elastic Cloud URLs

If you are ingesting data to Elastic Cloud, you can pass the `--target` option with the Elastic Cloud URL:

```sh
node scripts/synthtrace simple_trace --target=https://<username>:<password>@your-cloud-cluster.kb.us-west2.gcp.elastic-cloud.com/
```

### Using CLI with an API key

You can use a Kibana API key for authentication by passing the `--apiKey` option:

```sh
node scripts/synthtrace simple_trace --target=https://my-deployment.es.us-central1.gcp.elastic.cloud --apiKey="your-api-key"
```

## Scenario Examples

Synthtrace includes a wide variety of scenarios for generating different types of synthetic data. Each scenario is designed to test specific features or use cases in Kibana.

### APM Scenarios

#### `simple_trace`

Generates basic APM trace data with transactions and spans.

**Options:**

- `numServices` (number, default: 3): Number of services to generate
- `pipeline` (string): APM pipeline to use

**Usage:**

```sh
node scripts/synthtrace simple_trace --live
node scripts/synthtrace simple_trace --from=now-24h --to=now
```

**Example with options:**

```sh
node scripts/synthtrace simple_trace --scenarioOpts.numServices=5 --live
```

#### `distributed_trace`

Generates distributed traces across multiple services with parent-child relationships.

**Usage:**

```sh
node scripts/synthtrace distributed_trace --live
```

#### `distributed_trace_long`

Generates long-running distributed traces with deep call stacks.

**Usage:**

```sh
node scripts/synthtrace distributed_trace_long --live
```

#### `many_services`

Generates data for a large number of services.

**Usage:**

```sh
node scripts/synthtrace many_services --live
```

#### `many_instances`

Generates data for multiple instances of the same service.

**Usage:**

```sh
node scripts/synthtrace many_instances --live
```

#### `many_transactions`

Generates a high volume of transactions.

**Usage:**

```sh
node scripts/synthtrace many_transactions --live
```

#### `many_errors`

Generates a high volume of APM error documents with varied messages and types.

**Usage:**

```sh
node scripts/synthtrace many_errors --live
```

#### `many_dependencies`

Generates traces with many service dependencies.

**Usage:**

```sh
node scripts/synthtrace many_dependencies --live
```

#### `service_map`

Generates data for testing the service map visualization with predefined service relationships.

**Usage:**

```sh
node scripts/synthtrace service_map --live
```

#### `service_map_oom`

Generates data designed to test service map with out-of-memory scenarios.

**Usage:**

```sh
node scripts/synthtrace service_map_oom --live
```

#### `diagnostic_service_map`

Generates diagnostic data for service map testing.

**Usage:**

```sh
node scripts/synthtrace diagnostic_service_map --live
```

#### `high_throughput`

Generates high-throughput APM data for performance testing.

**Usage:**

```sh
node scripts/synthtrace high_throughput --live
```

#### `low_throughput`

Generates low-throughput APM data.

**Usage:**

```sh
node scripts/synthtrace low_throughput --live
```

#### `variance`

Generates data with high variance in metrics and durations.

**Usage:**

```sh
node scripts/synthtrace variance --live
```

#### `mobile`

Generates mobile APM data (iOS/Android).

**Usage:**

```sh
node scripts/synthtrace mobile --live
```

#### `trace_with_orphan_items`

Generates traces with orphan spans/transactions.

**Usage:**

```sh
node scripts/synthtrace trace_with_orphan_items --live
```

#### `trace_with_service_names_with_slashes`

Generates traces with service names containing slashes.

**Usage:**

```sh
node scripts/synthtrace trace_with_service_names_with_slashes --live
```

#### `span_links`

Generates traces with span links.

**Usage:**

```sh
node scripts/synthtrace span_links --live
```

#### `services_without_transactions`

Generates services that have metrics but no transactions.

**Usage:**

```sh
node scripts/synthtrace services_without_transactions --live
```

#### `other_bucket_group`

Generates data for testing "other" bucket grouping.

**Usage:**

```sh
node scripts/synthtrace other_bucket_group --live
```

#### `service_summary_field_version_dependent`

Generates data for testing service summary field version dependencies.

**Usage:**

```sh
node scripts/synthtrace service_summary_field_version_dependent --live
```

#### `apm_ml_anomalies`

Generates data designed to trigger ML anomaly detection.

**Usage:**

```sh
node scripts/synthtrace apm_ml_anomalies --live
```

#### `apm_anomalies`

Generates APM transactions engineered so that, once APM anomaly-detection ML jobs run, the UI surfaces anomaly badges that exercise multi-detector and multi-environment scoring. Every service exists in both `production` and `development`, and each environment is anomalous at a different time (the trailing anomaly span is split in half: production earlier, development later), so the "all environments" combined chart shows two distinct anomaly clusters each tagged with its environment. Production is the higher (critical) score, so the badge / open-anomalies link still surfaces production.

Services generated:

- `synth-anomaly-detectors` — critical failure-rate anomaly plus a minor latency bump in production (so the badge surfaces failure rate, not latency), and a major failure-rate anomaly in development.
- `synth-anomaly-environments` — critical latency spike in production, major in development.
- `synth-anomaly-side-by-side` — the SAME critical latency spike in both environments, optionally offset in time by `sideBySideOffsetMinutes`, so the combined view shows two identical anomalies side by side.
- `synth-anomaly-throughput` — large throughput spike in production, smaller one in development.
- `synth-anomaly-all-metrics` — trips all three detectors (latency, failure rate, throughput) on one service in both environments, each in its own sub-window at a different time but with intentional overlaps (failure rate ramps from major to critical). The two environments use shifted windows, so some anomalous times line up across environments and others do not, and some buckets are anomalous on two or three detectors at once (so the badge surfaces the highest-scoring detector).

**Options:**

- `anomalyWindowHours` (number, default: 2): Trailing hours that are anomalous (split in half across the two environments).
- `baselineRate` (number, default: 10): Transactions per minute during the baseline.
- `sideBySideOffsetMinutes` (number, default: 15): Time offset applied to the `synth-anomaly-side-by-side` service's development environment relative to production. Both environments get the same anomaly, so the combined view shows identical anomalies side by side; `15` makes them land on the exact same time bucket.

**Do not run with `--live`** (no baseline would exist for ML to learn). Use a fixed past range wider than the anomaly window. After ingesting, create APM ML jobs (APM > Settings > Anomaly detection) for the `production` and `development` environments and run their datafeeds over the ingested range for the badges to appear.

**Usage:**

```sh
node scripts/synthtrace apm_anomalies --from=now-7d --to=now --clean
node scripts/synthtrace apm_anomalies --from=now-7d --to=now --clean --scenarioOpts.anomalyWindowHours=4
node scripts/synthtrace apm_anomalies --from=now-7d --to=now --clean --scenarioOpts.sideBySideOffsetMinutes=30
```

### Log Scenarios

#### `simple_logs`

Generates simple, structured log documents with varying log levels.

**Usage:**

```sh
node scripts/synthtrace simple_logs --type=log --live
node scripts/synthtrace simple_logs --type=log --from=now-24h --to=now
```

#### `sample_logs`

Generates sample logs from various systems (Linux, Windows, Android).

**Options:**

- `rpm` (number): Requests per minute
- `systems` (string|string[]): Systems to generate logs for
- `streamType` ('classic'|'wired'): Stream type

**Usage:**

```sh
node scripts/synthtrace sample_logs --type=log --live
```

**Example with options:**

```sh
node scripts/synthtrace sample_logs --type=log --scenarioOpts.rpm=100 --live
```

#### `logs_and_metrics`

Generates a combination of log documents and APM metrics for several services with a fixed 50% error rate.

**Usage:**

```sh
node scripts/synthtrace logs_and_metrics --type=log --live
```

#### `logs_and_metrics_custom_error_rate`

Generates a combination of log documents and APM metrics with configurable error and debug rates.

**Options:**

- `errorRate` (number, default: 0.5): Error rate between 0 and 1 (minimum 1% if provided)
  - `0.0` = 0% errors (all successful)
  - `0.1` = 10% errors
  - `0.5` = 50% errors
  - `1.0` = 100% errors (all failures)
- `debugRate` (number, default: 0): Debug log rate between 0 and 1 (minimum 1% if provided)
- `numServices` (number, default: 3): Number of services to generate
- `transactionsPerMinute` (number, default: 360): Total transactions per minute
- `logsPerMinute` (number): Override calculated logs per minute
- `interval` (string, default: '1m'): Time interval for rate calculation
  - `'1s'` = per second (better for live mode)
  - `'1m'` = per minute (default)
  - `'5m'` = per 5 minutes
- `isLogsDb` (boolean, default: false): Use LogsDB format

**Accuracy Notes:**

The scenario uses advanced algorithms to generate accurate log distributions:

- Automatically calculates optimal log volume based on time range to balance accuracy with performance
- Targets ~10,000 total logs to align with Kibana's default sampling behavior
- Uses the Largest Remainder Method (Hamilton method) for proportional allocation, minimizing rounding errors
- Displayed percentages may vary by ±0.1-0.5% due to Kibana's sampling when viewing large datasets, rounding during integer allocation, or statistical variance
- For custom volume requirements, override `logsPerMinute` manually

**Usage:**

```sh
node scripts/synthtrace logs_and_metrics_custom_error_rate --live --scenarioOpts.errorRate=0.1
node scripts/synthtrace.js logs_and_metrics_custom_error_rate --live --scenarioOpts='{"errorRate":0.2,"debugRate":0.1}'
```

**Examples with different configurations:**

```sh
# Generate with 10% error rate and 5% debug rate
node scripts/synthtrace logs_and_metrics_custom_error_rate --type=log --live --scenarioOpts='{"errorRate":0.1,"debugRate":0.05}'

# Generate with custom service count and transaction rate
node scripts/synthtrace logs_and_metrics_custom_error_rate --type=log --live --scenarioOpts='{"errorRate":0.2,"numServices":10,"transactionsPerMinute":72}'
```

#### `apache_logs`

Generates Apache access and error logs.

**Usage:**

```sh
node scripts/synthtrace apache_logs --type=log --live
```

#### `kubernetes_logs`

Generates Kubernetes container and audit logs.

**Usage:**

```sh
node scripts/synthtrace kubernetes_logs --type=log --live
```

#### `unstructured_logs`

Generates unstructured log documents.

**Usage:**

```sh
node scripts/synthtrace unstructured_logs --type=log --live
```

#### `distributed_unstructured_logs`

Generates distributed unstructured logs across multiple services.

**Usage:**

```sh
node scripts/synthtrace distributed_unstructured_logs --live --scenarioOpts.distribution=uniform
```

#### `failed_logs`

Generates logs that represent failed operations.

**Usage:**

```sh
node scripts/synthtrace failed_logs --type=log --live
```

#### `degraded_logs`

Generates degraded or malformed logs.

**Usage:**

```sh
node scripts/synthtrace degraded_logs --type=log --live
```

#### `slash_logs`

Generates logs with slashes in field values.

**Usage:**

```sh
node scripts/synthtrace slash_logs --type=log --live
```

#### `simple_non_ecs_logs`

Generates simple logs that don't follow ECS (Elastic Common Schema).

**Usage:**

```sh
node scripts/synthtrace simple_non_ecs_logs --type=log --live
```

#### `simple_otel_logs`

Generates OpenTelemetry format logs.

**Usage:**

```sh
node scripts/synthtrace simple_otel_logs --type=log --live
```

#### `otel_logs_and_metrics_only`

Generates OpenTelemetry logs and metrics only.

**Usage:**

```sh
node scripts/synthtrace otel_logs_and_metrics_only --type=log --live
```

### Infrastructure Scenarios

#### `infra_hosts_with_apm_hosts`

Generates infrastructure host metrics along with APM host data.

**Usage:**

```sh
node scripts/synthtrace infra_hosts_with_apm_hosts --live
```

#### `infra_hosts_minimal_host`

Generates a single ECS infrastructure host row without numeric system metric fields. Useful for verifying Hosts page `N/A` behavior when a host exists but utilization/throughput values are unavailable.

**Options:**

- `hostName` (string, default: `minimal-host`): Host name to generate.

**Usage:**

```sh
node scripts/synthtrace infra_hosts_minimal_host --from=now-15m --to=now --clean
node scripts/synthtrace infra_hosts_minimal_host --scenarioOpts.hostName=my-host --from=now-15m --to=now --clean
```

#### `infra_docker_containers`

Generates Docker container metrics.

**Usage:**

```sh
node scripts/synthtrace infra_docker_containers --live
```

#### `infra_k8s_containers`

Generates Kubernetes container metrics.

**Usage:**

```sh
node scripts/synthtrace infra_k8s_containers --live
```

#### `infra_aws_rds`

Generates AWS RDS infrastructure metrics.

**Usage:**

```sh
node scripts/synthtrace infra_aws_rds --live
```

#### `infra_hosts_missing_normalized_load`

Generates three groups of hosts to reproduce missing metrics in the Hosts table and KPIs. Linux hosts emit all metrics; Windows "partial" hosts emit everything except `system.load` (the primary bug case — normalized load shows "0%" instead of "N/A"); Windows "minimal" hosts emit only CPU (maximizing N/A columns).

**Options:**

- `numLinuxHosts` (number, default: 2): Hosts with full metrics
- `numWindowsPartialHosts` (number, default: 2): All metrics except load (primary bug case)
- `numWindowsMinimalHosts` (number, default: 1): Only CPU metrics (maximum N/A)

**Usage:**

```sh
node scripts/synthtrace infra_hosts_missing_normalized_load --from now-1w --to now
node scripts/synthtrace infra_hosts_missing_normalized_load --from now-1w --to now --scenarioOpts='{"numLinuxHosts":2,"numWindowsPartialHosts":3,"numWindowsMinimalHosts":1}'
```

### Combined Scenarios

#### `logs_traces_hosts`

Generates a comprehensive set of correlated logs, APM traces, and host metrics.

**Options:**

- `numSpaces` (number, default: 1): Number of spaces
- `numServices` (number, default: 10): Number of services
- `numHosts` (number, default: 10): Number of hosts
- `numAgents` (number, default: 5): Number of agents
- `numDatasets` (number, default: 6): Number of datasets
- `datasets` (string[]): Custom list of datasets
- `degradedRatio` (number, default: 0.25): Percentage of malformed logs
- `numCustomFields` (number, default: 50): Number of custom fields per document
- `customFieldPrefix` (string, default: 'field'): Prefix for custom fields
- `logsInterval` (string, default: '1m'): Log generation interval
- `logsRate` (number, default: 1): Log generation rate
- `ingestHosts` (boolean, default: true): Whether to ingest host metrics
- `ingestTraces` (boolean, default: true): Whether to ingest traces
- `logsdb` (boolean, default: false): Use LogsDB format

**Usage:**

```sh
node scripts/synthtrace logs_traces_hosts --type=log --live
```

**Example with options:**

```sh
node scripts/synthtrace logs_traces_hosts --type=log --scenarioOpts='{"numServices":20,"numHosts":50}' --live
```

#### `kubernetes_logs_traces_pods`

Generates a comprehensive set of correlated Kubernetes logs, APM traces, and Kubernetes pod/container metrics.

**Options:**

- `numServices` (number, default: 10): Number of Kubernetes services to generate
- `numPods` (number, default: 20): Number of Kubernetes pods to generate
- `numContainers` (number, default: 30): Number of Kubernetes containers to generate
- `numAgents` (number, default: 5): Number of agents
- `logsInterval` (string, default: '1m'): Log generation interval
- `logsRate` (number, default: 1): Log generation rate
- `ingestPods` (boolean, default: true): Whether to ingest pod metrics
- `ingestContainers` (boolean, default: true): Whether to ingest container metrics
- `ingestTraces` (boolean, default: true): Whether to ingest traces
- `logsdb` (boolean, default: false): Use LogsDB format

**Usage:**

```sh
node scripts/synthtrace kubernetes_logs_traces_pods --live
```

**Example with options:**

```sh
node scripts/synthtrace kubernetes_logs_traces_pods --scenarioOpts='{"numServices":20,"numPods":50,"numContainers":100}'
```

### Specialized Scenarios

#### `aws_lambda`

Generates AWS Lambda function traces and metrics.

**Usage:**

```sh
node scripts/synthtrace aws_lambda --live
```

#### `azure_functions`

Generates Azure Functions traces and metrics.

**Usage:**

```sh
node scripts/synthtrace azure_functions --live
```

#### `many_otel_services`

Generates data for many OpenTelemetry services.

**Usage:**

```sh
node scripts/synthtrace many_otel_services --live
```

#### `otel_simple_trace`

Generates simple OpenTelemetry traces.

**Usage:**

```sh
node scripts/synthtrace otel_simple_trace --live
```

#### `apm_service_legacy_to_otel_metrics`

Simulates a service migrating from classic Elastic APM to OTel instrumentation. The first half of the time range produces classic APM Java data (metrics + transactions), the second half produces OTel data with stable semconv `jvm.*` metrics in a dedicated OTel index. Both halves share the same `service.name`, so the APM Metrics tab must select the correct dashboard based on the latest agent data.

**Options:**

- `serviceName` (string, default: `migration-svc`): The shared service name across both phases
- `rpm` (number, default: 2): Transactions per minute per phase

**Usage:**

```sh
node scripts/synthtrace apm_service_legacy_to_otel_metrics --from now-1w --to now --clean
```

#### `apm_service_overlapping_otel_metrics`

Simulates a service migrating from classic Elastic APM to OTel instrumentation with an overlap period where both instrumentations send data simultaneously. Classic APM runs from `from` to 75% of the range, OTel runs from 25% to `to`, so the middle 50% has both types sending data at the same time. Both phases share the same `service.name`, so the APM Metrics tab must handle the overlap and let the user switch between dashboard variants.

**Options:**

- `serviceName` (string, default: `overlap-svc`): The shared service name across both phases
- `rpm` (number, default: 2): Transactions per minute per phase

**Usage:**

```sh
node scripts/synthtrace apm_service_overlapping_otel_metrics --from now-2d --to now --clean
```

#### `apm_jvm_metrics_type_conflict`

Reproduces `verification_exception` errors on the APM Metrics tab when both classic (Elastic APM) and OTel Java agents ingest data for the same service. The OTel metrics index is configured as TSDB with gauge annotations, causing type conflicts with classic APM fields when queried via ES|QL.

**Options:**

- `serviceName` (string, default: `kms-gps-synth`): OTel service name
- `classicServiceName` (string, default: `kms-gps-classic`): Classic APM service name
- `rpm` (number, default: 2): OTel traces per minute

**Usage:**

```sh
node scripts/synthtrace apm_jvm_metrics_type_conflict --from now-1w --to now --clean
```

#### `degraded_synthetics_monitors`

Generates degraded synthetic monitor data.

**Usage:**

```sh
node scripts/synthtrace degraded_synthetics_monitors --live
```

#### `cloud_services_icons`

Generates data for testing cloud service icons.

**Usage:**

```sh
node scripts/synthtrace cloud_services_icons --live
```

#### `agent_config`

Generates data for testing agent configuration.

**Usage:**

```sh
node scripts/synthtrace agent_config --live
```

### SRE Incident Scenarios

Located in `sre_incidents/` directory:

#### `spiked_latency`

Generates data simulating a latency spike incident.

**Usage:**

```sh
node scripts/synthtrace sre_incidents/spiked_latency --live
```

#### `bad_feature_flag`

Generates data simulating a bad feature flag deployment.

**Usage:**

```sh
node scripts/synthtrace sre_incidents/bad_feature_flag --live
```

## Advanced Usage Examples

### Custom Scenario Options

Many scenarios accept custom options via `--scenarioOpts`. Options can be passed in two formats:

**JSON format:**

```sh
node scripts/synthtrace logs_and_metrics_custom_error_rate --scenarioOpts='{"errorRate":0.1,"debugRate":0.05,"numServices":5}'
```

**Key-value format:**

```sh
node scripts/synthtrace logs_and_metrics_custom_error_rate --scenarioOpts=errorRate=0.1,debugRate=0.05,numServices=5
```

**Note:** When using the key-value format, use `--scenarioOpts=` (with equals sign) not `--scenarioOpts.` (with dot). The dot notation (`--scenarioOpts.key=value`) only works for single options and cannot be combined with comma-separated values.

### Combining Options

You can combine multiple options:

```sh
node scripts/synthtrace simple_trace --live --clean --scenarioOpts.numServices=10 --logLevel=debug
```

### Backfilling Data

You can backfill historical data and then continue with live generation:

```sh
# First, backfill 24 hours of data
node scripts/synthtrace simple_trace --from=now-24h --to=now

# Then start live generation
node scripts/synthtrace simple_trace --from=now-24h --to=now --live
```

### Performance Tuning

For high-volume scenarios, you can tune performance:

```sh
# Use multiple workers for parallel processing
node scripts/synthtrace high_throughput --workers=4 --live

# Increase concurrency for bulk indexing
node scripts/synthtrace high_throughput --concurrency=5 --live

# Adjust live bucket size
node scripts/synthtrace high_throughput --liveBucketSize=500 --live
```

### Cleaning Data

To clean existing data before generating new data:

```sh
node scripts/synthtrace simple_trace --clean --live
```

**Note:** The `--clean` option only cleans APM indices tracked by the client. For custom indices (like heartbeat), scenarios may implement their own cleanup logic.

### Date Math

You can use date math expressions for time ranges:

```sh
# Last 24 hours
node scripts/synthtrace simple_trace --from=now-24h --to=now

# Last week
node scripts/synthtrace simple_trace --from=now-7d --to=now

# Specific date range
node scripts/synthtrace simple_trace --from=2024-01-01T00:00:00Z --to=2024-01-02T00:00:00Z
```

### Log Levels

Control verbosity with log levels:

```sh
# Verbose output
node scripts/synthtrace simple_trace --logLevel=verbose --live

# Debug output
node scripts/synthtrace simple_trace --logLevel=debug --live

# Quiet mode
node scripts/synthtrace simple_trace --logLevel=error --live
```
