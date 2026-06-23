# @kbn/evals

Offline evaluation framework for LLM-based workflows in Kibana. Requires the `evals` plugin to be enabled.

**Entry points:**

- **Local** - `node scripts/evals start` (interactive CLI, see [CLI.md](./CLI.md) for the full command reference)
- **CI on PRs** - GitHub labels (`evals:<suite-id>`, `models:<model-group>`)
- **On-demand** - [Buildkite pipeline](https://buildkite.com/elastic/kibana-evals-on-demand)

---

## 1. Running evaluations

### 1.1 Getting started locally

```bash
node scripts/evals start
```

On first run, `start` prompts for an infrastructure target, discovers connectors, starts background services (EDOT collector + Scout), and runs a Playwright eval suite. Subsequent runs reuse the running services for fast iteration.

Suite selection is interactive. `start` lists registered suites from [`evals.suites.json`](../../../../../.buildkite/pipelines/evals/evals.suites.json). Pass `--suite <id>` to skip the prompt.

**Validate your setup with the smoke tests:**

```bash
node scripts/evals start --suite smoke-tests
```

#### Profiles

| `--profile` value | Behavior                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `dev-vault`       | Read Golden Cluster config from Vault at runtime (requires `vault login --method oidc`). No file needed. |
| `local`           | Use `config.local.json` (auto-created with localhost defaults if missing).                               |
| `<name>`          | Use `config.<name>.json`. If missing, runs an interactive wizard.                                        |
| _(omitted)_       | Interactive prompt: local / golden-cluster / custom.                                                     |

Config files live in `scripts/vault/config.<profile>.json`. The golden cluster profile reads secrets directly from Vault -- no local file required.

#### Key flags

| Flag                | Description                                      |
| ------------------- | ------------------------------------------------ |
| `--suite <id>`      | Suite to run (interactive prompt if omitted)     |
| `--model <id>`      | Connector/model to evaluate (comma-separated OK) |
| `--judge <id>`      | Connector for LLM-as-a-judge evaluators          |
| `--grep <pattern>`  | Filter tests by name                             |
| `--repetitions <n>` | Repeat each example N times                      |
| `--skip-server`     | Skip EDOT/Scout startup (use existing services)  |
| `--skip-init`       | Skip config and connector setup                  |
| `--dry-run`         | Print configuration and exit                     |

#### EIS connector setup

`start` auto-detects missing connectors and walks you through EIS model discovery (Vault auth, model selection, connector generation). To run setup separately and discover connectors to use across terminals:

```bash
node scripts/evals init
```

#### Loading datasets from Golden Cluster

Use `--datasets-profile` when dataset credentials should come from the shared golden cluster:

```bash
node scripts/evals start --suite agent-builder --datasets-profile dev-vault
```

#### Filtering, model selection, judge, repetitions

```bash
node scripts/evals start --suite agent-builder --grep "product documentation"
node scripts/evals start --suite agent-builder --model eis-gpt-4.1 --judge eis-claude-4-5-sonnet
node scripts/evals start --suite agent-builder --model eis-gpt-4.1,eis-claude-4-sonnet
node scripts/evals start --suite agent-builder --repetitions 3
```

#### Advanced options

<details>
<summary>LiteLLM setup</summary>

If you have access to the internal LiteLLM gateway:

```bash
bash x-pack/platform/packages/shared/kbn-evals/scripts/litellm/dev_env.sh
```

This logs you in via SSO, generates a virtual key, and exports `KIBANA_TESTING_AI_CONNECTORS`.

</details>

<details>
<summary>Scout server (standalone)</summary>

`start` manages Scout automatically. To run it independently:

```bash
node scripts/evals scout
```

This wraps `node scripts/scout.js start-server --arch stateful --domain classic --serverConfigSet evals_tracing`.

</details>

<details>
<summary>EDOT collector (standalone)</summary>

`start` manages the EDOT collector automatically. To run it independently:

```bash
node scripts/edot_collector.js
# Override target ES cluster:
ELASTICSEARCH_HOST=http://localhost:9200 node scripts/edot_collector.js
```

</details>

<details>
<summary>Phoenix executor (backward compatibility)</summary>

The Phoenix-backed executor is maintained in [`@kbn/evals-phoenix-executor`](../kbn-evals-phoenix-executor/) for backward compatibility. That package is the source of truth for Phoenix integration.

To switch:

```bash
KBN_EVALS_EXECUTOR=phoenix node scripts/evals run --suite <id>
```

</details>

<details>
<summary>Running directly via Playwright</summary>

Only use this if the CLI doesn't cover your use case. Ensure Scout and EDOT are already running.

```bash
node scripts/playwright test --config x-pack/platform/packages/shared/<suite-dir>/playwright.config.ts
```

</details>

<details>
<summary>Skipping connector setup/teardown</summary>

If evaluating with pre-configured connectors (e.g. from `kibana.yml`):

```bash
KBN_EVALS_SKIP_CONNECTOR_SETUP=true node scripts/evals run --suite <id>
```

</details>

<details>
<summary>Running against your local/dev Kibana</summary>

We recommend using Scout (the default). If you must target your own Kibana instance, create `.scout/servers/local.json`:

```json
{
  "serverless": false,
  "isCloud": false,
  "hosts": { "kibana": "http://localhost:5601/<basePath>" },
  "auth": { "username": "elastic", "password": "changeme" }
}
```

You must also configure tracing in `kibana.dev.yml`:

```yaml
elastic.apm.active: false
elastic.apm.contextPropagationOnly: false
telemetry.enabled: true
telemetry.tracing.enabled: true
telemetry.tracing.sample_rate: 1
telemetry.tracing.exporters:
  - http:
      url: 'http://localhost:4318/v1/traces'
```

> **Note:** Starting Scout overwrites `.scout/servers/local.json`, so you may need to recreate it when switching back.

</details>

---

### 1.2 Running evals on PRs (CI)

Add GitHub labels to trigger evals in PR CI:

| Label                         | Effect                                                            |
| ----------------------------- | ----------------------------------------------------------------- |
| `evals:<suite-id>`            | Run a specific suite                                              |
| `evals:all`                   | Run all suites                                                    |
| `models:<model-group>`        | Select model(s) to evaluate (required -- evals skip without this) |
| `models:judge:<connector-id>` | Override the judge connector                                      |
| `models:weekly-eis-models`    | Per-suite EIS model alias (resolves from `evals.suites.json`)     |

Model groups follow the pattern `eis/<modelId>` for EIS or `llm-gateway/<model>` for LiteLLM.

---

### 1.3 On-demand evals (Buildkite)

Run a suite on any branch without a PR:

1. Open [kibana-evals-on-demand](https://buildkite.com/elastic/kibana-evals-on-demand)
2. Click **New build**, select branch/commit
3. Add environment variables:

| Variable                          | Required           | Description                                                                                                  |
| --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `EVAL_SUITE_ID`                   | yes                | Suite id from `evals.suites.json`. Comma-separate to run several suites                                      |
| `EVAL_MODEL_GROUPS`               | yes                | Comma-separated model groups, e.g. `eis/openai-gpt-5.4,llm-gateway/gpt-5.2`                                  |
| `EVAL_INCLUDE_EIS_MODELS`         | for `eis/*` models | Set to `1` when using EIS models or an EIS judge                                                             |
| `EVALUATION_CONNECTOR_ID`         | no                 | LLM-as-judge connector override                                                                              |
| `EVAL_SERVER_CONFIG_SET`          | some suites        | From `serverConfigSet` in `evals.suites.json`                                                                |
| `KIBANA_BUILD_ID`                 | no                 | Reuse a Kibana build from another job (skips build step)                                                     |
| `EVAL_GREP`                       | no                 | Playwright test name filter (same as `node scripts/evals run --grep`)                                        |
| `EVALUATION_REPETITIONS`          | no                 | Repeat each example N times (same as `--repetitions`)                                                        |
| `EVAL_SLACK_NOTIFICATION_CHANNEL` | no                 | Slack channel or member ID to send the triage to. If unset, no Slack notification is sent for on-demand runs |

Example (single suite):

```text
EVAL_SUITE_ID=agent-builder
EVAL_MODEL_GROUPS=eis/openai-gpt-5.4
EVAL_INCLUDE_EIS_MODELS=1
```

Example (multiple suites):

```text
EVAL_SUITE_ID=agent-builder,observability-ai,streams
EVAL_MODEL_GROUPS=eis/openai-gpt-5.4
EVAL_INCLUDE_EIS_MODELS=1
```

#### Where the triage summary is sent (on-demand)

On-demand triage routing is "branch OR PR" (never both), plus an independent Slack opt-in:

- Run a **branch**: set the New Build **Branch** to branch (e.g. `main`). No PR comment is posted.
- Run a **PR**: set the New Build **Branch** to `refs/pull/<N>/head` (e.g. `refs/pull/123/head`), Commit `HEAD`.
- **Slack** is independent: set `EVAL_SLACK_NOTIFICATION_CHANNEL` to send the triage to a Slack channel.

Example (PR run + Slack)
Set Branch to `refs/pull/<N>/head`, Commit `HEAD`, then under Options -> Environment Variables:

```text
EVAL_SUITE_ID=observability-ai
EVAL_MODEL_GROUPS=eis/openai-gpt-5.4
EVAL_INCLUDE_EIS_MODELS=1
EVAL_SLACK_NOTIFICATION_CHANNEL=#my-test-channel
```

---

## 2. Creating a new evaluation suite

Each eval suite lives in its own `kbn-evals-suite-<name>` package. The package contains a Playwright config, evaluation specs, and optionally custom fixtures.

To scaffold a new suite, you can use the [`evals-create-suite`](../../../../../.agents/skills/evals-create-suite/SKILL.md) skill (available to AI coding agents) or follow its templates manually. Register suites in [`evals.suites.json`](../../../../../.buildkite/pipelines/evals/evals.suites.json) for CI labeling and `node scripts/evals list`.

### Playwright config

```ts
import { createPlaywrightEvalsConfig } from '@kbn/evals';

export default createPlaywrightEvalsConfig({ testDir: __dirname });
```

This auto-discovers connectors and creates one Playwright project per model so the same test file runs against each.

### Writing evaluation tests

```ts
import { evaluate } from '@kbn/evals';

evaluate('the model should answer truthfully', async ({ inferenceClient, executorClient }) => {
  const dataset = {
    name: 'my-dataset',
    description: 'my-description',
    examples: [{ input: { content: 'Hi' }, output: { content: 'Hey' } }],
  };

  await executorClient.runExperiment(
    {
      datasets: [dataset],
      task: async ({ input }) => {
        const result = await inferenceClient.output({
          id: 'foo',
          input: input.content as string,
        });
        return { content: result.content };
      },
    },
    [
      {
        name: 'equals',
        kind: 'CODE',
        evaluate: async ({ output, expected }) => ({
          score: output?.content === expected?.content ? 1 : 0,
          metadata: { output: output?.content, expected: expected?.content },
        }),
      },
    ]
  );
});
```

### Typing datasets

```ts
import type { Example } from '@kbn/evals';

type MyExample = Example<
  { question: string },
  { expectedAnswer: string },
  { tags?: string[] } | null
>;
```

Use `selectEvaluators<MyExample, MyTaskOutput>(...)` for typed evaluator callbacks.

### Available fixtures

| Fixture            | Description                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| `inferenceClient`  | Bound to the connector declared by the active Playwright project.          |
| `executorClient`   | Runs experiments (in-Kibana executor by default).                          |
| `evalsClient`      | Client for evals plugin APIs (scores, datasets, experiment stats).         |
| `reportModelScore` | Displays results in terminal (overridable for custom reporting).           |
| `traceEsClient`    | ES client for querying OTel traces (defaults to Scout `esClient` cluster). |

### Available evaluators

Built-in evaluator factories you can use directly or as inspiration for custom evaluators:

- **LLM-as-a-judge** -- the most common evaluator type. Built-in judge evaluators include:
  - `Criteria` -- scores output against user-defined criteria (most commonly used)
  - `Correctness` -- checks factual accuracy against expected output
  - `Groundedness` -- verifies claims are supported by provided context
- **Trace-based** -- `createTraceBasedEvaluator` (token usage, latency, tool calls), `createSkillInvocationEvaluator` (checks agent skill reads)
- **RAG** -- `createRagEvaluators` (Precision@K, Recall@K, F1@K)
- **Code evaluators** -- any inline `{ name, kind: 'CODE', evaluate }` object

You can use these as-is or build your own directly in the suite.

#### LLM-as-a-judge

Set `--judge` to select which model judges results. Judge evaluators receive the judge connector automatically.

```bash
node scripts/evals start --suite agent-builder --judge eis-claude-4-5-sonnet
```

#### Selecting evaluators at runtime

Wrap evaluators with `selectEvaluators()` then control which run via environment variable:

```bash
SELECTED_EVALUATORS="Factuality,Relevance" node scripts/evals run --suite agent-builder
```

### Customizing report display

Override `reportModelScore` to create custom reports:

```ts
import { evaluate as base, type EvalsClient } from '@kbn/evals';

export const evaluate = base.extend({
  reportModelScore: async ({}, use) => {
    await use(async (evalsClient: EvalsClient, experimentId, log) => {
      const experimentStats = await evalsClient.getExperimentStats(experimentId);
      log.info(`Model: ${experimentStats.taskModel.id}`);
      // Custom formatting, file output, etc.
    });
  },
});
```

Score ingestion happens before custom reporting and is not affected by it.

---

## 3. Seeding datasets into your environment

Use [`@kbn/es-snapshot-loader`](../kbn-es-snapshot-loader/) to restore snapshots and replay data streams within your eval suite. See that package's README for full API docs.

- **`restoreSnapshot`** -- restore indices directly from a GCS/URL/FS snapshot
- **`replaySnapshot`** -- restore with timestamp transformation, making historical data streams appear fresh

Typical usage in a suite (from [`kbn-evals-suite-observability-ai`](../../../../solutions/observability/packages/kbn-evals-suite-observability-ai)):

```ts
import { createGcsRepository, replaySnapshot } from '@kbn/es-snapshot-loader';

const result = await replaySnapshot({
  esClient,
  log,
  repository: createGcsRepository({ bucket: 'my-bucket', basePath: 'my-path' }),
  snapshotName: 'my-snapshot',
  patterns: ['logs-*', 'metrics-*', 'traces-*'],
});
```

Set `GCS_CREDENTIALS` (full JSON service account string) before starting Scout so Elasticsearch can access GCS repositories.

### Dataplex (optional)

Register snapshot datasets in Dataplex for discoverability. Aspects YAML files live in `snapshots/dataplex/<team>/`.

```bash
node scripts/evals dataplex sync            # Create/update entries from YAML
node scripts/evals dataplex sync --dry-run   # Preview changes
```

---

## 4. Developer details

### Automated label sync

`models:*` and `models:judge:*` labels are synced automatically:

- **Weekly** -- the weekly LLM evals pipeline includes a label sync step
- **On demand** -- add `ci:sync-model-labels` label to any PR

Stale labels are renamed to `deprecated:models:*` (kept for historical record).

### CI ops

Update all model + judge labels:

```bash
./scripts/create_models_labels.sh --repo elastic/kibana --update-all-labels
./scripts/create_models_labels.sh --repo elastic/kibana --update-all-labels --prune  # also deprecate stale
```

Update Vault config:

```bash
# Edit scripts/vault/config.json, then generate a vault write command:
node scripts/vault/get_command.js --vault ci-prod
# Sync from Vault:
node scripts/vault/retrieve_secrets.js --vault ci-prod
```

### CI telemetry

EIS inference requests are tagged with `X-Elastic-Product-Use-Case: kbn_evals`. Override via `KBN_EVALS_TELEMETRY_PLUGIN_ID`.

### Golden cluster privileges

A single API key covers all golden cluster operations (scores, traces, datasets). Create via Kibana Dev Tools using the privilege payload exported from [`@kbn/evals-common`](../kbn-evals-common/golden_cluster_privileges.ts).

Grants:

- Write/read `.evaluation-scores*` (results)
- Write/read `traces-*` (OTLP traces)
- Write/read/delete `.evaluation-dataset*` (managed datasets)
- Kibana `evals` feature privilege (`all`)

With `--profile dev-vault`, these keys are read from Vault automatically.
