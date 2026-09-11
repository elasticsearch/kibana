# Rollup Scout tests

Scout tests for the Rollup Jobs management app (a deprecated, stateful-only feature).

## UI tests

- `ui/tests/rollup_jobs_wizard.spec.ts` — walks the create-rollup-job wizard from the empty-list deprecation prompt through save, and lists the new job, with a11y checks at each step.
- `ui/tests/hybrid_data_view.spec.ts` — creates a rollup data view over a regular + rollup index, and one over an alias to the rollup index, asserting the Rollup badge and the exposed fields.
- `ui/tests/tsvb.spec.ts` — a TSVB Metric panel reads a rollup index by name (`metrics:allowStringIndices`) and renders the rolled-up doc count.

## API tests

Cover the `api/rollup/*` routes plus the data-views `fields_for_wildcard` extension (migrated from `x-pack/platform/test/api_integration/apis/management/rollup`):

- `api/tests/rollup_indices.spec.ts` — `GET /indices` and job creation on a cluster with no rollup usage (local only).
- `api/tests/index_pattern_validity.spec.ts` — `GET /index_pattern_validity/{pattern}` field classification.
- `api/tests/index_pattern_fields.spec.ts` — the internal data-views `fields_for_wildcard` route with `type=rollup`.
- `api/tests/rollup_jobs_crud.spec.ts` — job list/create/duplicate/validation and the created rollup index's aggregations (local only).
- `api/tests/rollup_jobs_delete.spec.ts` — deleting stopped vs. started jobs.
- `api/tests/rollup_job_actions.spec.ts` — start/stop job state transitions.
- `api/tests/rollup_search.spec.ts` — `POST /search` against a missing and an existing rollup index.

Local + cloud stateful only (except the two local-only specs noted above, which assert on cluster-wide rollup state): the Rollup feature does not exist on serverless.

De-scoped from the FTR suites:

- The CCS variant of the wizard test stays in FTR (`x-pack/platform/test/functional/apps/rollup_job/rollup_jobs.js`, run via `config.ccs.ts`) until Scout supports a real remote cluster — a self-referential remote can't detect `remote:pattern` mishandling, since the same indices also resolve locally. Tracked in elastic/kibana#281791.

## How to run tests

First start the servers with

```bash
node scripts/scout.js start-server --arch stateful --domain classic
```

Then run the tests in another terminal.

UI tests:

```bash
node scripts/playwright test --config x-pack/platform/plugins/private/rollup/test/scout/ui/playwright.config.ts --project local --grep stateful-classic
```

API tests:

```bash
node scripts/playwright test --config x-pack/platform/plugins/private/rollup/test/scout/api/playwright.config.ts --project local --grep stateful-classic
```

Test results are available under the matching `output` folder (`ui/output` or `api/output`).
