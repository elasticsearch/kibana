# Remote Clusters Scout tests

Scout tests for the Remote Clusters management app.

## UI tests

- `ui/tests/remote_clusters_crud.spec.ts` — walks the add-cluster wizard from the empty-list prompt through submit, with a11y checks at each step.
- `ui/tests/remote_clusters_edit_delete.spec.ts` — list, details, edit, and delete flows for sniff- and proxy-mode clusters, with a11y checks merged in.

## API tests

Cover the `api/remote_clusters` routes (migrated from `x-pack/platform/test/api_integration/apis/management/remote_clusters`):

- `api/tests/remote_clusters.spec.ts` — full CRUD lifecycle: empty list, add, duplicate rejection, update, list-once-connected, and single/multiple/unknown deletes.

Local stateful only: the Remote Clusters feature is disabled on serverless, and the connection assertions seed the cluster's own transport address, which is not a Cloud-safe assumption.

## How to run tests

First start the servers with

```bash
# ESS
node scripts/scout.js start-server --arch stateful --domain classic
```

Then run the tests in another terminal.

UI tests:

```bash
# ESS
node scripts/playwright test --config x-pack/platform/plugins/private/remote_clusters/test/scout/ui/playwright.config.ts --project local --grep stateful-classic
```

API tests:

```bash
# ESS
node scripts/playwright test --config x-pack/platform/plugins/private/remote_clusters/test/scout/api/playwright.config.ts --project local --grep stateful-classic
```

To check for flakiness, run the suite repeatedly (e.g. x30) by appending `--repeat-each 30` to either command:

```bash
node scripts/playwright test --config x-pack/platform/plugins/private/remote_clusters/test/scout/ui/playwright.config.ts --project local --grep stateful-classic --repeat-each 30
```

Test results are available under the matching `output` folder (`ui/output` or `api/output`).
