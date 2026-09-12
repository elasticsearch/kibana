# @kbn/evals-suite-nightshift-investigations

Evaluation suite for [Nightshift investigations](../../../plugins/shared/nightshift_investigations).

Today the suite holds one smoke eval that checks seed data loading, scoring and score ingestion
work end to end; real evaluators against the investigation engine land on top of it.

## Running the suite

```bash
node scripts/evals start --suite nightshift-investigations
```

`start` brings up Elasticsearch, Kibana and EDOT, then runs the suite. Later runs reuse those
services, so iteration is fast. Use `node scripts/evals run --suite nightshift-investigations`
when they are already up.

### Choosing where scores are recorded

The `--profile` flag decides which cluster records the run. Refer to [`--profile` in the `@kbn/evals` README](../kbn-evals/README.md#profiles) for the full list of profiles and how each one resolves its credentials. The two that matter most here:

| Goal                                 | Command                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Keep scores on your own machine      | `node scripts/evals start --suite nightshift-investigations --profile local`     |
| Publish scores to the golden cluster | `node scripts/evals start --suite nightshift-investigations --profile dev-vault` |

`dev-vault` publishes to the golden cluster, which is what the weekly pipeline writes to and what the dashboards read, so use it when a run needs to be comparable against the weekly baseline. It reads its credentials from Vault at runtime, handling the login itself and opening a browser if your Vault session has expired.

`local` records scores on your own development Elasticsearch and Kibana, so start those yourself before running the suite. Both stay in the foreground, so each needs its own terminal, and the suite then runs in a third:

```bash
# terminal 1
yarn es snapshot --license trial   # Elasticsearch on localhost:9200

# terminal 2
yarn start                         # Kibana on localhost:5601
```

`start` will not launch them for you. It brings up a separate Scout cluster on `9220` and `5620` for the suite to run against, and leaves your development instance alone. Omitting `--profile` prompts for a destination instead.

Either way the profile also supplies this suite's `GCS_CREDENTIALS`, read from `gcsDatasetAccessCredentials` in the profile's config — from Vault for `dev-vault`, from `config.<profile>.json` otherwise, and `node scripts/evals init` can fill it in. Export the variable by hand only when running outside a profile, as [publishing](#publishing-the-synthetic-snapshot) does.

For model and judge selection, `--grep` and repetitions, see [running evals locally](../kbn-evals/README.md#11-getting-started-locally). This suite does not override any of those flags.

## Two kinds of dataset

The word "dataset" means two different things in evals, and this suite keeps them apart deliberately. It is worth reading once.

| Term             | What it is                                                                                                                                  | Where it lives                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Eval dataset** | The examples a run is scored on: an input, the expected output, and metadata. Scores are recorded against it.                               | [`src/datasets/`](src/datasets)   |
| **Seed data**    | The Elasticsearch documents an eval dataset is evaluated _against_ — logs, metrics, traces, alerts. Restored into the cluster before a run. | [`src/seed_data/`](src/seed_data) |

An eval dataset names its seed data through `seedSource`, but the two are otherwise independent: several eval datasets can sit on top of the same seed data, and swapping the target under test changes neither. That is what lets one eval dataset and its evaluators be reused against a different target.

## Layout

One eval is one folder under `evals/`, holding everything specific to it. `src/` holds only what
every eval shares.

| Path              | Holds                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| `evals/<name>/`   | One eval: its datasets, task, evaluators, types and spec                 |
| `src/datasets/`   | The eval dataset contract, selection, and conversion to framework shape  |
| `src/seed_data/`  | Seed sources, plus seeding, publishing and clearing them                 |
| `src/evaluate.ts` | The suite's Playwright fixture                                           |
| `scripts/lib/`    | Code shared between the CLIs, such as connecting to a cluster from flags |
| `scripts/<name>/` | One developer CLI each, run via a launcher in Kibana's root `scripts/`   |

Inside an eval folder the files always mean the same thing, so `evals/smoke/` reads as a template:

| File            | Holds                                                              |
| --------------- | ------------------------------------------------------------------ |
| `types.ts`      | The example shape, its expected output, and the evaluator type     |
| `datasets.ts`   | The eval datasets and a `get<Name>Datasets()` that applies filters |
| `task.ts`       | What runs under test, and the shape of its output                  |
| `evaluators.ts` | The evaluators, and the array the spec passes to the runner        |
| `*.spec.ts`     | Wiring: iterate datasets, seed, run, score                         |

Playwright only collects `*.spec.ts`, so the neighbouring files are invisible to it while Jest
still picks up `*.test.ts`.

Specs stay thin because [`withSeedData`](src/seed_data/with_seed_data.ts) registers both the `beforeAll` that seeds and the `afterAll` that clears, so no spec carries its own copy and none can forget cleanup:

```ts
evaluate.describe(dataset.id, () => {
  const seedData = withSeedData(dataset);

  evaluate('...', async ({ esClient }) => {
    // seedData().indices — the data streams seeding actually wrote
  });
});
```

## Adding a new eval

Copy [`evals/smoke/`](evals/smoke) and work through its five files. Nothing outside the new
folder needs to change, and the suite picks the spec up automatically.

1. **`types.ts`** — describe an example: its input, the expected output your evaluators will read,
   and an evaluator type bound to your task's output.
2. **`task.ts`** — call the thing under test and return a typed result. For the investigation
   engine that means `POST /internal/nightshift/investigations` through the `fetch` fixture, then
   following the investigation to a terminal status.
3. **`datasets.ts`** — declare `Dataset` objects with an `id`, a `name` that scores are recorded
   against, a `seedSource`, and an `examples()` call returning ground truth. Export a
   `get<Name>Datasets()` that passes them through `selectDatasets`, which is what makes
   `NIGHTSHIFT_DATASETS` work for your eval too.
4. **`evaluators.ts`** — write CODE evaluators as plain objects, and reach for the `evaluators`
   fixture for LLM-as-judge scoring (`evaluators.criteria([...])`). Export them as one array.
5. **`<name>.spec.ts`** — iterate your datasets, call `withSeedData(dataset)` once per describe
   block, and hand the task and evaluators to `executorClient.runExperiment`.

Two details worth knowing before you start:

- **Seed data belongs in [`src/seed_data/sources.ts`](src/seed_data/sources.ts), not in your eval
  folder.** Several evals can share one snapshot, and the CLI that publishes it has to agree with
  the eval that reads it, so each source is declared once and referenced by both.
- **`examples` is a function, not an array.** It is called when Playwright collects the describe
  tree, which is what a dataset reading ground truth from files downloaded during global setup
  needs.

If your eval needs data from somewhere other than a GCS snapshot, add a member to `SeedSource` in
[`src/seed_data/types.ts`](src/seed_data/types.ts) and a branch to `seedDataset` in
[`src/seed_data/seed.ts`](src/seed_data/seed.ts). That switch is the only place seeding fans out.

## Seed data

Seed data comes from snapshots in the `nightshift-datasets` GCS bucket, laid out engine-first so a
suite can scope to a whole engine or narrow to one source:

```
nightshift-datasets/
└── investigation-engine/
    ├── synthetic/            # the smoke eval's snapshot and any other synthetic datasets
    └── customer0/            # labelled incidents
```

`detection-engine/` is reserved at the same level for later capabilities. Elasticsearch reads the
bucket through its own keystore rather than the eval process, which is why the credential has to
be present before the cluster starts; the `evals_tracing` Scout config (the default for eval
suites) handles the wiring.

### Publishing the synthetic snapshot

The smoke eval restores `synthetic-smoke` from `investigation-engine/synthetic`. To create or
refresh it:

```bash
export GCS_CREDENTIALS="$(cat service-account.json)"
node scripts/scout start-server --serverConfigSet evals_tracing
node scripts/publish_nightshift_eval_snapshot.js
```

The script seeds throwaway documents into a data stream, snapshots them to GCS and removes the
local copy. See `--help` for its flags.

Publishing refuses to overwrite a snapshot that already exists, since a snapshot is found by name
and the data it would replace is gone for good. Add `--replace` to refresh one deliberately:

```bash
node scripts/publish_nightshift_eval_snapshot.js --replace
```

Only the document generation in that script is specific to the synthetic dataset. Publishing goes
through [`publishEsSnapshot`](src/seed_data/publish_es_snapshot.ts), which takes an eval dataset's
own `seedSource` and so writes to exactly the location
[`replayEsSnapshot`](src/seed_data/es_snapshot.ts) will read from — the write side cannot drift
away from the read side. A CLI that captures real data should reuse it, along with
[`createEsClient`](scripts/lib/es_client.ts) for reaching a remote cluster:

```ts
await publishEsSnapshot({
  source: myDataset.seedSource,
  indices: ['logs-*', 'metrics-*', 'traces-*'],
  esClient,
  log,
});
```

This needs a service account with **write** access; the credential CI restores with is read-only.
Raising `--document-count` also means raising `SYNTHETIC_SMOKE_DOCUMENT_COUNT` in
[`sources.ts`](src/seed_data/sources.ts), since that constant is the ground truth the eval scores
against.

## Environment variables

| Variable              | Effect                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NIGHTSHIFT_DATASETS` | Eval datasets to run: unset or `all` for every one, otherwise a comma-separated list of ids. Unknown ids fail the run and list what is available. |
| `SELECTED_EVALUATORS` | Standard `@kbn/evals` filter, by evaluator name (`documents_restored`, `timestamps_replayed`).                                                    |
| `GCS_CREDENTIALS`     | Service account JSON Elasticsearch uses to reach the seed-data bucket. Read access is enough to run the suite.                                    |

Because every eval dataset gets its own `describe` block, Playwright's `--grep` filters by dataset id as well.

```bash
NIGHTSHIFT_DATASETS=synthetic-smoke node scripts/evals run --suite nightshift-investigations
```

## CI

Registered in [`evals.suites.json`](../../../../../.buildkite/pipelines/evals/evals.suites.json)
as `nightshift-investigations`.

- **On a PR:** add the `evals:nightshift-investigations` label. No `models:` label is needed —
  the suite pins a cheap connector through `defaultModelGroups`, and since no model affects the
  smoke eval's score, which one runs does not matter.
- **Weekly:** a step in [`llm_evals.yml`](../../../../../.buildkite/pipelines/evals/llm_evals.yml)
  runs it against that same connector.
- **Failures** are posted to `#nightshift-alerts`, resolved from `slackChannel` in the suite entry.
- **Scores** reach the golden cluster automatically, through `EVAL_KBN_URL` in CI.

## Enabling the investigation engine

The smoke eval never calls the engine, so the server config it would need does not exist yet. An eval that does needs `xpack.nightshift_investigations.enabled`, along with Agent Builder, workflows and an inference endpoint for `significant_events_investigation`. That belongs in a new `evals_nightshift_investigations` Scout config set extending `evals_tracing`, in the same shape as `evals_workflows`, referenced from `serverConfigSet` in the suite's entry in `evals.suites.json`.
