---
navigation_title: Parallelism
---

# Parallelism [scout-parallelism]

Scout supports parallel execution using Playwright workers. Parallel runs are usually faster, but they require good isolation and predictable setup.

::::::{note}
Parallelism happens at the **file** level: Playwright runs test files in parallel workers. Tests in the same file still run in order.
::::::

## How it works [scout-parallelism-how]

- All workers share the same Kibana + Elasticsearch deployment.
- Each worker gets an isolated Kibana space via the `scoutSpace` fixture (used with `spaceTest`).
- The space is cleaned up when the worker finishes.

## When to use parallel vs sequential [scout-parallelism-differences]

- **Parallel**: UI suites that can share pre-ingested data and isolate state per space.
- **Sequential**: suites that require a “clean” cluster state or need global mutations that aren’t space-scoped.

## Enable parallel UI suites [enable-parallel-tests]

:::::::::::{stepper}

::::::::::{step} Create a parallel config

Add a config that points at a `parallel_tests/` directory and sets `workers`:

```ts
import { createPlaywrightConfig } from '@kbn/scout';

export default createPlaywrightConfig({
  testDir: './parallel_tests',
  workers: 2,
  runGlobalSetup: true,
});
```

::::::::::

::::::::::{step} Pre-ingest shared data (recommended)

Use a [global setup hook](./global-setup-hook.md) to load shared data once before workers start.

::::::::::

::::::::::{step} Use `spaceTest` (creates one Space per worker) or `test` (all workers use the default Space)

Use `spaceTest` to access `scoutSpace` (Scout will use a dedicated Space for each single parallel worker) or simply use `test` (Scout will reuse the default space for all workers):

```ts
import { spaceTest, tags } from '@kbn/scout';

spaceTest.describe('My parallel suite', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    // space-scoped setup (saved objects, ui settings, ...)
  });

  spaceTest('does something', async ({ pageObjects, browserAuth }) => {
    await browserAuth.loginAsViewer();
    // ...
  });
});
```

::::::::::

:::::::::::

## API tests and parallelism [api-tests-and-parallelism]

API tests can run in parallel workers (set `workers > 1` in your API Playwright config), but Scout does **not** provide Space-per-worker isolation for API tests. All parallel workers will reuse the same (default) Space.

If you run API tests in parallel, isolate state yourself:

- Use unique resource names per worker (for example include `workerInfo.parallelIndex` in index/role/object names)
- Avoid global mutations (cluster-wide settings, shared indices) unless the suite is fully isolated
- Clean up in `afterAll` / `afterEach`

## Parallel best practices [scout-parallelism-best-practices]

- Load shared ES data once (global setup) and avoid mutating it in tests.
- Clean up space-scoped changes (saved objects / UI settings) in `afterAll`.
- If a suite can’t be isolated, keep it sequential.
