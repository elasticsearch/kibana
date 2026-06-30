---
navigation_title: Global setup and teardown
---

# Global setup and teardown [scout-global-setup-hook]

Use the global setup and teardown hooks to run code **once** before any tests start and/or after all workers finish — even with multiple workers. They are most useful for [parallel suites](./parallelism.md), where shared data/setup must exist before workers begin and suite-wide state may need to be reset afterwards. Both hooks are also supported by non-parallel test suites.

## Global setup hook [global-setup-hook]

Use `globalSetupHook(...)` in `global.setup.ts` to run code once before any tests start.

### When to use [when-to-use]

Global setup is most valuable when:

- **Running parallel suites**: shared data must exist before workers start
- **Heavy one-time ingestion**: data that takes significant time to load
- **Shared, immutable data**: data that all suites read but none modify

**Keep in `beforeAll`/`afterAll` instead** when:

- **Per-test/per-suite cleanup is required**: `kbnClient.importExport.load()` creates saved objects that should be removed with `.unload()` after tests; saved objects/data created for a single spec belong in `afterAll` so they're scoped to that spec.
- **Data isolation matters**: suites that create/modify data should manage their own setup and cleanup.

For **suite-wide** state that's shared across spec files (data ingested in `global.setup.ts`, feature-flag overrides, global UI settings), use the optional [global teardown hook](#global-teardown-hook) instead.

::::::{tip}
`esArchiver.loadIfNeeded()` is idempotent: only the first call ingests data; subsequent calls do a fast index-exists check and skip. For **sequential runs**, keeping it in `beforeAll` is fine (no benefit from global setup). For **parallel runs**, move it to global setup so ES isn't handling ingestion while workers are running (ingestion can affect Kibana performance).
::::::

### Enable it [enable-global-setup-hook]

:::::::::::{stepper}

::::::::::{step} Turn it on in your config

Set `runGlobalSetup: true` in your Playwright config:

```ts
import { createPlaywrightConfig } from '@kbn/scout';

export default createPlaywrightConfig({
  testDir: './parallel_tests',
  workers: 2,
  runGlobalSetup: true,
});
```

::::::::::

::::::::::{step} Create `global.setup.ts`

Add `global.setup.ts` inside the `testDir` folder. Scout will discover and run it automatically.

```text
test/scout/ui/
└── parallel_tests/
    ├── global.setup.ts
    └── some_suite.spec.ts
```

::::::::::

::::::::::{step} Write setup code

Example: load an ES archive once:

```ts
import { globalSetupHook } from '@kbn/scout';

globalSetupHook('Load test data', async ({ esArchiver, log }) => {
  log.info('[setup] loading ES archive (only if needed)...');
  await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/farequote');
});
```

::::::{warning}
The global setup hook only has access to **worker-scoped** fixtures. It cannot use test-scoped fixtures like `page`, `browserAuth`, or `pageObjects`.
::::::

::::::::::

::::::::::{step} Run tests

Run tests as usual via [Run Scout tests](./run-scout-tests.md). The global setup hook runs first — check console logs to verify it ran successfully.

::::::::::::

## Global teardown hook (optional) [global-teardown-hook]

When `runGlobalSetup: true` is set, Scout also wires up an optional `globalTeardownHook` that runs **once after all workers finish**, even when tests fail. Use it to reset shared cluster/Kibana state that would otherwise leak into other Scout configs running against the same Kibana/ES — for example, dropping legacy or hand-indexed data ingested by `global.setup.ts`, reverting feature-flag overrides, or unsetting global UI settings.

### Enable it

Add `global.teardown.ts` next to `global.setup.ts` in your `testDir` and call `globalTeardownHook(...)`. No extra config flag — `runGlobalSetup: true` is already enough. If the file is absent, the project is silently skipped.

```text
test/scout/ui/
└── parallel_tests/
    ├── global.setup.ts
    ├── global.teardown.ts
    └── some_suite.spec.ts
```

### Example: Reset shared state

```ts
import { globalTeardownHook } from '@kbn/scout';

globalTeardownHook(
  'Reset shared Kibana state',
  async ({ esClient, kbnClient, apiServices, log }) => {
    log.info('[teardown] resetting shared state');

    // Drop legacy or hand-indexed data the suite created.
    await esClient.indices.delete({ index: 'apm-8.0.0-*', ignore_unavailable: true });
    await esClient.indices
      .deleteDataStream({ name: 'logs-my_dataset-*' })
      .catch(() => undefined); // tolerate missing data stream on a clean cluster

    // Revert any global UI settings / advanced settings the suite set.
    await kbnClient.uiSettings.unset('discover:searchOnPageLoad');
    await kbnClient.uiSettings.updateGlobal({ hideAnnouncements: false });

    // Revert feature-flag overrides flipped via apiServices.core.settings(...).
    await apiServices.core.settings({
      'feature_flags.overrides': { 'discover.isEsqlDefault': false },
    });
  }
);
```

### Available fixtures

`globalTeardownHook` exposes a deliberately narrower fixture surface than `globalSetupHook`:

- `log`, `config`, `kbnUrl`
- `esClient`, `kbnClient`
- `apiServices` (incl. `apiServices.core.settings(...)` for feature-flag rollbacks)

::::::{warning}
**`esArchiver` is intentionally not exposed in `globalTeardownHook`.** Scout's `esArchiver` fixture only ever exposed `loadIfNeeded` — by design, there is no archive-driven unload. Removing archives that way is slow and unnecessary: leftover indexes in the cluster don't break Scout tests (setup is idempotent via `loadIfNeeded`), so there's no reason to spend time deleting them at the end of every run.

For state that **does** need resetting (server-wide feature-flag overrides, global UI settings, hand-indexed data that breaks redirect or navigation logic for other configs sharing the cluster), use targeted `esClient.indices.delete`, `esClient.indices.deleteDataStream`, `esClient.deleteByQuery`, `kbnClient.uiSettings.unset`, or `apiServices.core.settings`.
::::::

### Cautions

- **Don't load new data here.** Teardown is for resetting state, not setting up new data. Data loading belongs in `globalSetupHook` (which is idempotent via `esArchiver.loadIfNeeded`).
- **Per-test/per-suite cleanup still belongs in `afterEach`/`afterAll`.** The global teardown is for state shared across the whole suite — typically state seeded by `global.setup.ts` itself, or anything that other Scout configs sharing the cluster would inherit.
- **Same fixture-scope limitation as setup**: only worker-scoped fixtures are available — no `page`, `browserAuth`, or `pageObjects`.
- **Runs even when tests fail.** Wired via Playwright's per-project `teardown` field, so the hook runs after the setup project AND every project depending on it has finished, including on failure. Use this to your advantage (always-clean cluster) but write the teardown defensively — pass `ignore_unavailable: true` on Elasticsearch deletes and swallow expected `404`s on optional resources — so a partial setup doesn't break cleanup.
