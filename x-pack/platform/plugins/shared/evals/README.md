# Evals plugin

The **Evals plugin** provides an in-Kibana UI for browsing LLM evaluation experiment results, per-evaluator statistics, and OpenTelemetry traces produced by the `@kbn/evals` evaluation framework.

## Architecture

The evaluation system spans three packages:

- `@kbn/evals-common` — shared schemas (OpenAPI-generated Zod types), constants, and Elasticsearch query builders. Used by both the plugin server routes and the CLI tooling in `@kbn/evals`.
- `@kbn/evals` — dev-only CLI tooling for running offline evaluation suites against LLM-based workflows. Ingests evaluation score documents via the Kibana API and emits traces via OpenTelemetry.
- `@kbn/evals-runner` — server-safe runtime primitives shared between the plugin server and workflow steps (bounded-concurrency helpers, score-document builders, and the runner types). Unlike `@kbn/evals`, it is **not** dev-only, so it can be imported from production server code.
- `evals` plugin (this package) — Kibana server routes for experiment browsing, score ingestion, dataset management, tracing, and remote config; custom Kibana Workflows steps for running experiments on the server; plus a React UI.

```
┌──────────────────────────────────────────────────────────────┐
│  @kbn/evals  (CLI / dev-only)                                │
│  - runs evaluation suites                                    │
│  - ingests scores via POST /internal/evals/scores            │
│  - emits traces via OTLP                                     │
└──────────────────┬───────────────────────────────────────────┘
                   │ imports shared query builders & types
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  @kbn/evals-common                                           │
│  - OpenAPI schemas (Zod)                                     │
│  - ES query builders                                         │
│  - constants (URLs, index patterns, API versions)            │
└──────────────────┬───────────────────────────────────────────┘
                   │ imports shared query builders & types
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  evals plugin  (this package)                                │
│  - server: internal API routes for experiments, datasets,    │
│    scores, traces, tracing, and remotes                      │
│  - public: React UI (Experiments, Datasets, Tracing,         │
│    Remotes tabs)                                             │
│  - uses @kbn/llm-trace-waterfall for trace visualization     │
└──────────────────────────────────────────────────────────────┘
```

## Enabling the plugin

The plugin is **disabled by default**. To enable it locally, add the following to your `kibana.dev.yml`:

```yaml
# Enable the evals plugin
xpack.evals.enabled: true

# Required: enable experimental agent-builder features
uiSettings:
  overrides:
    agentBuilder:experimentalFeatures: true

# Disable APM (conflicts with OTel tracing)
elastic.apm.active: false
elastic.apm.contextPropagationOnly: false

# Enable tracing so evaluation traces are collected
telemetry.enabled: true
telemetry.tracing.enabled: true
telemetry.tracing.sample_rate: 1
telemetry.tracing.exporters:
  - http:
      url: 'http://localhost:4318/v1/traces'
```

Then start the EDOT collector in a separate terminal:

```bash
node scripts/edot_collector
```

### Prerequisite data

The plugin reads from the following indices:

| Index pattern                  | Source                | Contents                   |
| ------------------------------ | --------------------- | -------------------------- |
| `.evaluation-scores`           | Score ingestion API   | Evaluation score documents |
| `.evaluation-datasets`         | Datasets API          | Dataset metadata           |
| `.evaluation-dataset-examples` | Datasets API          | Dataset examples           |
| `.evaluation-evaluators`       | Evaluators API        | User-defined evaluators    |
| `traces-*`                     | OTLP / EDOT collector | OpenTelemetry trace spans  |
| `logs-*`                       | OTLP / EDOT collector | OpenTelemetry log events   |

Run evaluation suites via the `@kbn/evals` CLI to populate the scores and traces indices. See the [`@kbn/evals` README](../../packages/shared/kbn-evals/README.md) for details.

## Score ingestion

The `@kbn/evals` CLI sends scores via `POST /internal/evals/scores` rather than writing directly to Elasticsearch. The plugin validates the payload and persists documents to the `.evaluation-scores` data stream.

For a shared "golden cluster", set `EVAL_KBN_URL` (and optionally `EVAL_KBN_API_KEY`) to route score ingestion and dataset operations to a remote Kibana instance.

## Workflow-based experiment execution

In addition to the dev-only `@kbn/evals` CLI (which runs suites in CI), the plugin can run **experiments on the server** — from the "New experiment" UI, from Agent Builder, or from version-controlled workflow YAML. This is additive and does not change how evals run in CI.

An **experiment** evaluates one task model against one or more datasets. Running the same configuration against several models produces multiple experiments you can compare.

> Running experiments requires an **Enterprise** license (it runs on [Kibana Workflows](../../../../src/platform/plugins/shared/workflows_management)). When Workflows is unavailable, experiment execution is disabled; the rest of the plugin (browsing, ingestion, datasets, tracing) is unaffected.

### Running experiments

#### From the UI

The **New experiment** button on the Experiments tab opens a form: choose one or more models to evaluate, what to evaluate (the task target), datasets, evaluators, and run options (repetitions, concurrency). Choosing two or more models produces one comparable experiment per model, and runs across many datasets are split up and run in parallel.

"Run now" launches the run and opens the experiment detail page, which shows live progress and lets you cancel. "Save as workflow" instead persists a reusable workflow you can re-run later.

#### From Agent Builder

An `eval-experiment-authoring` skill lets you do the same thing from an Agent Builder chat: discover datasets, evaluators, task targets, and connectors, preview the experiment, then run it or save it as a workflow. It is available only when `xpack.evals.enabled` is set.

#### From YAML

You can also version-control an experiment as a workflow file and (re-)run it through Workflows Management — no UI required. A minimal single-model experiment:

```yaml
version: '1'
name: Evaluate my-model
description: Saved evaluation experiment
enabled: true
tags:
  - evals
  - evals-experiment
settings:
  timeout: 24h
triggers:
  - type: manual
steps:
  - name: start
    type: ai.evals.startExperiment
    with:
      task_model:
        id: my-model-connector-id
  - name: evaluate
    type: ai.evals.evaluateDataset
    with:
      experiment_id: '{{ steps.start.output.experiment_id }}'
      execution_id: '{{ steps.start.output.execution_id }}'
      connector_id: my-model-connector-id
      dataset_ids:
        - my-dataset-id
      evaluators:
        - name: correctness
          connector_id: my-judge-connector-id # required for LLM evaluators
      repetitions: 1
      concurrency: 5
```

The full set of `ai.evals.*` steps:

| Step                          | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `ai.evals.startExperiment`    | Create the experiment/execution ids that group a run's scores. |
| `ai.evals.resolveDataset`     | Load datasets and their examples.                              |
| `ai.evals.executeTask`        | Run the thing being evaluated against one example.             |
| `ai.evals.evaluateTrace`      | Grade one trace with one or more evaluators.                   |
| `ai.evals.ingestScores`       | Persist evaluator scores for one example.                      |
| `ai.evals.evaluateExample`    | Execute, evaluate, and ingest scores for a single example.     |
| `ai.evals.evaluateDataset`    | Resolve datasets and evaluate every example (the main step).   |
| `ai.evals.compareExperiments` | Statistically compare two or more experiments.                 |

The Workflows YAML editor autocompletes and validates these steps and their inputs as you author.

### What you can evaluate

Each experiment runs one **task target** — the thing being evaluated for each example. Two are built in:

| Task target                | Runs                                 |
| -------------------------- | ------------------------------------ |
| Direct inference (default) | A direct model call.                 |
| Agent Builder agent        | An Agent Builder agent conversation. |

Other plugins can contribute their own production feature as an additional target, so the real feature — not a reimplementation — is what gets evaluated.

## API routes

All routes are internal (`elastic-api-version: 1`). Read routes require the `read_evals` privilege; write routes require `manage_evals`.

- **Experiments** — list, detail, scores, dataset-level examples, and statistical comparison of two experiments
- **Experiment execution (Workflows)** — launch a run, save it as a reusable workflow, preview the generated YAML, list run templates, and poll or cancel a run. Requires an Enterprise license; otherwise returns `501`.
- **Datasets** — full CRUD for datasets and their examples, plus a bulk upsert endpoint. The listing accepts `tags` and `maturity` filters and returns facet counts for both (see [Dataset tags and maturity](#dataset-tags-and-maturity)). Supports remote forwarding to a configured golden-cluster Kibana.
- **Evaluators** — list every evaluator available in the space, and create, read, update, or delete user-defined ones
- **Scores** — bulk ingestion of evaluation score documents
- **Examples** — per-example score history across experiments
- **Traces** — span retrieval for a given trace ID
- **Tracing** — project-level aggregations (error rate, latency, token usage) and per-project trace listing with search
- **Remotes** — manage remote Kibana configurations for dataset forwarding

For full request/response schemas, see the OpenAPI definitions in [`@kbn/evals-common/impl/schemas/`](../../packages/shared/kbn-evals-common/impl/schemas/).

## Dataset tags and maturity

Datasets carry two optional keyword fields for organization.

- **`tags`** - up to 20 labels of at most 64 characters matching `^[a-zA-Z0-9][a-zA-Z0-9:._-]*$`; anything else is a 400. Stored lowercased and deduplicated, so `ESQL` and `esql` are one tag. Filtering by several tags matches datasets carrying _all_ of them.
- **`maturity`** — `raw`, `cleaned`, or `golden`. Filtering by several levels matches _any_ of them.

Writes are patch-like: a field omitted from a create, update, or upsert keeps its current value, so a suite can upsert examples without wiping tags curated in the UI. Send `tags: []` or `maturity: null` to clear.

The listing also returns `facets` — the distinct tags and maturity levels with dataset counts. They follow the search term but ignore the active tag and maturity filters, so filter options stay stable as they are toggled.

Concurrent writes are guarded with optimistic concurrency, so a suite adding examples cannot roll back tags saved from the UI while it was running. If many writers contend for the same dataset and the retries run out, a write that only refreshes `examples_count` is skipped and logged (the count catches up on the next change), while a metadata change that could not be applied fails the request rather than disappearing.

## Instrumentation profiles

Evaluator routes reconstruct a normalized evidence round (`input.message`, `response.message`, `steps`) from a trace using an **instrumentation profile**. Pass `subject.instrumentation.profile` on `_validate` / `_evaluate`; when omitted, **`elastic-inference`** is used.

| Profile                       | `user_query`                                                | `agent_response`                                             | `tool_calls`                               |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `elastic-inference` (default) | LLM spans, `gen_ai.input.messages` (`genai_messages`)       | LLM spans, `gen_ai.output.messages` (`genai_messages`)       | TOOL spans via Elastic inference span kind |
| `otel-genai-attributes`       | Trace attributes `gen_ai.input.messages` (`genai_messages`) | Trace attributes `gen_ai.output.messages` (`genai_messages`) | `execute_tool` spans                       |
| `otel-genai-events`           | Log event `gen_ai.user.message` (string)                    | Log event `gen_ai.choice` (string)                           | `execute_tool` spans                       |
| `claude-code`                 | Log event `user_prompt` (string)                            | Log event `api_response_body` (`anthropic_message`)          | `claude_code.tool` spans (`prefixed_json`) |

Profile definitions live in [`server/evaluators/evidence/profiles.ts`](server/evaluators/evidence/profiles.ts).

### Reading normalized trace evidence

`GET /internal/evals/traces/{traceId}/evidence` returns the normalized single-turn evidence used by evaluators. Omit `profile` to auto-detect the instrumentation or pass one explicitly.

`wait` defaults to `none` for an immediate read. `stable` waits for non-empty evidence to remain unchanged for five seconds. `complete` also requires a response and root span; log-backed profiles normally take at least 7.5 seconds. Waits can run for about 28 seconds, including for a valid but missing trace ID, and return available evidence as `best_effort` on expiry.

`_evaluate` uses the same whole-round `complete` readiness check.

The endpoint requires `read_evals` and current-user read access to `traces-*` and `logs-*`; missing index privileges can appear as `404`. It returns full message and tool content, does not persist it, and supports one turn only.

## UI pages

The plugin UI is organized into four navigation tabs:

- **Experiments** — paginated listing of evaluation experiments, detail view with per-evaluator stats, and a comparison view with paired t-test results. The **New experiment** flow launches or saves workflow-based runs and streams live progress on the detail page (see [Workflow-based experiment execution](#workflow-based-experiment-execution)).
- **Datasets** — manage evaluation datasets and examples (CRUD, JSON editor), tag and set the maturity of a dataset, and filter the listing by tag or maturity
- **Tracing** — browse tracing projects with metrics, drill into individual traces with a waterfall view
- **Remotes** — configure remote Kibana instances for cross-cluster dataset management

The trace waterfall UI lives in the standalone `@kbn/llm-trace-waterfall` package. The evals plugin uses it for trace visualization but does not re-export it — other plugins can depend on `@kbn/llm-trace-waterfall` directly.

## Development

### Running tests

```bash
# Plugin unit tests
yarn test:jest --config=x-pack/platform/plugins/shared/evals/jest.config.js

# Shared query builders tests
yarn test:jest --config=x-pack/platform/packages/shared/kbn-evals-common/jest.config.js
```

### Regenerating OpenAPI schemas

The Zod types in `@kbn/evals-common` are generated from OpenAPI `.schema.yaml` files:

```bash
cd x-pack/platform/packages/shared/kbn-evals-common
yarn openapi:generate
```

After regenerating, you may need to fix unused imports added by the generator:

```bash
node scripts/eslint --fix x-pack/platform/packages/shared/kbn-evals-common/impl/schemas/**/*.gen.ts
```
