---
navigation_title: Best practices
---

# General Scout best practices [scout-best-practices]

For test-type-specific guidance, see [UI](./ui-best-practices.md) and [API](./api-best-practices.md) test best practices.

## Pick the right test type [pick-the-right-test-type]

Pick the test type **before** writing the test:

| Test type                                                                      | Ideal for                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scout UI test**                                                              | • user flows that span multiple pages or components<br>• role-based behavior (e.g. viewer can see X, editor can do Y)<br>• confirming the UI renders and reacts to interaction (not exact data values)                                 |
| **Scout API test**                                                             | • status code, response shape, and key fields of an HTTP endpoint<br>• authorization checks (e.g. role X gets `403` from endpoint Y)<br>• exact data values computed by the backend (counts, aggregations, formulas)                   |
| **Jest integration test**<br>A unit test with an Elasticsearch instance running | • saved object / data migrations from a previous version<br>• behavior that depends on a specific Elasticsearch data shape on disk<br>• scenarios that modify the system in ways a real user couldn't (e.g. writing to system indices) |
| **Jest unit test**<br>Often paired with the React Testing Library              | • conditional rendering and component state (loading, error, empty)<br>• field validation, formatters, tooltips<br>• pure business logic (utilities, hooks, reducers)                                                                  |

:::::{dropdown} Examples

✔️ **Do:** use a Scout UI test to verify behavior, not exact data values.

```ts
await expect(page.testSubj.locator('datasetQualityTable-loaded')).toBeVisible();
await page.testSubj.click('tableSortByLastActivity');
await expect(page.testSubj.locator('row-0-col-dataset')).not.toHaveText('');
```

❌ **Don't:** assert exact computed values from a UI test — those belong in an API or unit test.

```ts
await expect(page.testSubj.locator('row-0-col-count')).toHaveText('1,024');
await expect(page.testSubj.locator('row-0-col-avg')).toHaveText('42.7');
```

✔️ **Do:** use a Scout API test to validate an endpoint's contract.

```ts
apiTest('returns 200 and the expected fields for a viewer', async ({ apiClient }) => {
  const response = await apiClient.get('api/my-feature/data', {
    headers: { ...COMMON_HEADERS, ...viewerCredentials.apiKeyHeader },
  });

  expect(response).toHaveStatusCode(200);
  expect(response.body).toMatchObject({ items: expect.any(Array) });
});
```

✔️ **Do:** use a Scout API test to assert exact values computed by the backend (counts, aggregations, formulas).

```ts
apiTest('returns the correct count for each included types', async ({ apiClient }) => {
  const response = await apiClient.post(MANAGEMENT_API.SCROLL_COUNT, {
    headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
    body: { typesToInclude: ['visualization'] },
  });

  expect(response).toHaveStatusCode(200);
  expect(response.body).toStrictEqual({ visualization: 12000 });
});
```

The suite seeds a known dataset in `beforeAll` (12,000 visualizations) so the count is deterministic. See [`scroll_count_large.spec.ts`](https://github.com/elastic/kibana/blob/main/src/platform/plugins/shared/saved_objects_management/test/scout/api/tests/scroll_count_large.spec.ts).

✔️ **Do:** use a Jest integration test for data-migration coverage.

A Scout API test is the wrong layer here: no real user can drive a stack upgrade through an HTTP route, and Scout suites share a single Kibana/Elasticsearch instance — so writing directly to system indices from one test leaks state into the rest of the suite.

```ts
import { startElasticsearch, getKibanaMigratorTestKit } from '@kbn/migrator-test-kit';

let esServer;
beforeAll(async () => {
  esServer = await startElasticsearch({ dataArchive: BASELINE_TEST_ARCHIVE_LARGE });
});
afterAll(async () => esServer?.stop());

it('migrates docs from a previous version', async () => {
  const { runMigrations, client } = await getKibanaMigratorTestKit({ ...getBaseMigratorParams() });
  const results = await runMigrations();

  const mappings = await client.indices.getMapping({ index: '.kibana' });
  expect(results[0].status).toBe('migrated');
  expect(mappings).toMatchObject({
    /* expected shape after migration */
  });
});
```

How these tests work:

- They start a real Elasticsearch with `startElasticsearch(...)`, then import Kibana's real `KibanaMigrator` and run it in-process via `getKibanaMigratorTestKit(...).runMigrations()`. The HTTP server, plugins, and UI aren't booted — the test exercises the actual migration code path against real ES, just without the Kibana process around it.
- "Previous version" data comes from a baseline ES data archive zip (e.g. `BASELINE_TEST_ARCHIVE_LARGE`) passed as `dataArchive`; if you don't need a snapshot, skip it and seed via `savedObjectsRepository.bulkCreate`.
- Assertions run directly against ES (`client.indices.get` / `getMapping`), the SO repository (`savedObjectsRepository.find`), the returned `MigrationResult[]`, or migration logs.

See [`src/core/server/integration_tests/saved_objects/migrations`](https://github.com/elastic/kibana/tree/main/src/core/server/integration_tests/saved_objects/migrations) for the full set of examples, and [`group1/v2_migration.test.ts`](https://github.com/elastic/kibana/blob/main/src/core/server/integration_tests/saved_objects/migrations/group1/v2_migration.test.ts) for a representative archive-based test.

:::::{tip}
**New to Scout?** Start with our [Scout introduction page](../testing/scout.md).
:::::

## Design tests with a cloud-first mindset [design-tests-with-a-cloud-first-mindset]

Scout is deployment-agnostic: write once, run locally and on Elastic Cloud.

- Every suite must have [deployment tags](../testing/deployment-tags.md). Use tags to target the environments where your tests apply (for example, a feature that only exists in stateful deployments).
- Within a test, avoid relying on configuration, data, or behavior specific to a single deployment. Test logic should produce the same result locally and on Cloud.
- Run your tests against a real Elastic Cloud project before merging to catch environment-specific surprises early.
## Keep tests close to the code they test [keep-tests-close-to-source-code]

A test should live in the plugin or package that owns the code it exercises. When writing or reviewing a test, confirm that the scenarios logically belong to the plugin they were added to:

- **API tests**: the routes under test should be defined in this plugin's `/server` directory.
- **UI tests**: the UI being driven should come from this plugin's `/public` directory — a quick look there is usually enough to understand what the plugin renders and whether the test fits.

This also keeps Scout's selective testing effective: it runs only the tests for modules affected by a PR, so a test placed in the wrong plugin won't be triggered by changes to the code it actually covers. The full suite still runs post-merge on `kibana-on-merge`.

## Prefer runtime feature flags [prefer-runtime-feature-flags]

When a feature is gated behind a flag, enable it at runtime with `apiServices.core.settings()` rather than creating a custom server config. Runtime flags work locally and on Cloud, don’t require a server restart, and avoid the CI cost of a dedicated server instance.

For the full guide (including when a custom server config is unavoidable), see [Feature flags](../testing/feature-flags.md).

## Run tests multiple times to catch flakiness [use-the-flaky-test-runner-to-catch-flaky-tests-early]

When you add new tests, fix flakes, or make significant changes, run the same tests multiple times to catch flakiness early. A good starting point is **20–50 runs**.

Prefer doing this locally first (faster feedback), and use the Flaky Test Runner in CI when needed. See [Debug flaky tests](../testing/debugging.md#scout-debugging-flaky-tests) for guidance.

## Keep test suites independent [keep-test-suites-independent]

- Keep **one top-level suite** per file (`test.describe`).
- Avoid nested `describe` blocks. Use `test.step` for structure inside a test.
- Don’t rely on test file execution order (it’s [not guaranteed](https://playwright.dev/docs/test-parallel#control-test-order)).
- Don’t assume a previous test in the suite already set up the data you need (if that test fails or is skipped, the test will break with a misleading error).

## Use `test.step` for multi-step flows [use-teststep-for-multi-step-flows]

Use `test.step()` (or `apiTest.step()` in API tests) to structure a multi-step flow within a single test. It keeps the test in one context (faster, clearer reporting) and produces labelled entries in the test report that make failures easier to diagnose. Group closely related actions into a single step when it keeps the report readable without hiding intent.

:::::{dropdown} Example

```ts
test('navigates through pages', async ({ pageObjects }) => {
  await test.step('go to Dashboards', async () => {
    await pageObjects.navigation.clickDashboards();
  });

  await test.step('go to Overview', async () => {
    await pageObjects.navigation.clickOverview();
  });
});
```

The same pattern works in API tests with `apiTest.step()`.

:::::

## Write descriptive test names [write-descriptive-test-names]

Test names should read like a sentence describing expected behavior. Clear names make failures self-explanatory and test suites scannable.

:::::{dropdown} Examples
❌ **Don’t:**

```ts
test('test 1', async ({ page }) => {
  /* ... */
});
test('works correctly', async ({ page }) => {
  /* ... */
});
```

❌ **Don’t:** use variables or template literals in test titles as they look opaque in stack traces and test reports:

```ts
test(`handles ${dataView.title} correctly`, async ({ page }) => {
  /* ... */
});
```

✔️ **Do:**

```ts
test('viewer can see dashboard but cannot edit', async ({ page }) => {
  /* ... */
});
test('returns 403 when missing read privilege', async ({ apiClient }) => {
  /* ... */
});
```

:::::

## Organize test suites by role and user flow [organize-test-suites-by-role-and-user-flow]

Prefer “one role + one flow per file” and keep spec files small (roughly 4–5 short tests or 2–3 longer ones). The test runner balances work at the spec-file level, so oversized files become bottlenecks during [parallel execution](../testing/parallelism.md). Put shared login/navigation in `beforeEach`.

:::::{dropdown} Example

```ts
// dashboard_viewer.spec.ts
test.beforeEach(async ({ browserAuth, pageObjects }) => {
  await browserAuth.loginAsViewer();
  await pageObjects.dashboard.goto();
});

test('can see dashboard', async ({ page }) => {
  // assertions...
});
```

:::::

## Use the global setup and teardown hooks in parallel test suites [move-repeated-one-time-setup-operations-to-a-global-setup-hook]

For parallel suites, move shared “one-time” work (archives, API calls, settings) to a [global setup hook](./global-setup-hook.md), and reset any state that would leak into other Scout configs in a [global teardown hook](./global-setup-hook.md#global-teardown-hook). See [When to use](./global-setup-hook.md#when-to-use) for the full guidance on what belongs here vs. in `beforeAll`/`afterAll`.

:::::{dropdown} Examples

✔️ **Do:** load shared data once in `global.setup.ts`:

```ts
globalSetupHook('Load shared test data (if needed)', async ({ esArchiver, log }) => {
  log.debug('[setup] loading archives (only if indexes do not exist)...');
  await esArchiver.loadIfNeeded(MY_ARCHIVE);
});
```

✔️ **Do:** revert suite-wide state in `global.teardown.ts` so it doesn't leak into other configs:

```ts
globalTeardownHook('Reset shared Kibana state', async ({ kbnClient, apiServices, log }) => {
  log.debug('[teardown] resetting shared state...');
  await kbnClient.uiSettings.unset('discover:searchOnPageLoad');
  await apiServices.core.settings({
    'feature_flags.overrides': { 'discover.isEsqlDefault': false },
  });
});
```

:::::

## Only load archives your tests actually use [only-load-archives-your-tests-actually-use]

It’s common for test suites to load Elasticsearch or Kibana archives that are barely used (or not used at all). Unused archives slow down setup, waste resources, and make it harder to understand what a test actually depends on. Check if your tests ingest the data they actually need.

Use `esArchiver.loadIfNeeded()`, which skips ingestion if the index already exists (useful when multiple suites share the same data).

::::::{warning}
`loadIfNeeded()` checks at the **index level**, not individual documents. If a test deletes specific documents, subsequent runs or retries won't restore them. Reindex documents that were deleted.
::::::

:::::{dropdown} Examples
❌ **Don’t:** load archives that no test in the suite relies on:

```ts
test.beforeAll(async ({ esArchiver }) => {
  await esArchiver.loadIfNeeded('large_metrics_archive');
  await esArchiver.loadIfNeeded('user_actions_archive');
});

test('shows metrics dashboard', async ({ page }) => {
  // only uses large_metrics_archive; user_actions_archive is never referenced
});
```

✔️ **Do:** load only what the suite needs:

```ts
test.beforeAll(async ({ esArchiver }) => {
  await esArchiver.loadIfNeeded('large_metrics_archive');
});
```

:::::

## Keep cleanup in hooks [put-cleanup-code-in-hooks-not-in-the-test-body]

Cleanup in the test body doesn’t run after a failure. Prefer `afterEach` / `afterAll`. **Don’t duplicate** the same teardown in the test body when a hook already runs it; duplication invites unnecessary `try/catch` and drift between paths.

:::::{dropdown} Examples
❌ **Don’t:** put cleanup at the end of the test body (it’s skipped if the test fails):

```ts
test('creates and deletes index', async ({ esClient }) => {
  await esClient.indices.create({ index: testIndexName });
  // ... assertions ...
  await esClient.indices.delete({ index: testIndexName }); // skipped on failure!
});
```

✔️ **Do:** use hooks so cleanup always runs:

```ts
test.afterEach(async ({ esClient, log }) => {
  try {
    await esClient.indices.delete({ index: testIndexName });
  } catch (e: any) {
    log.debug(`Index cleanup failed: ${e.message}`);
  }
});
```

:::::

## Don’t use `try/catch` in tests [dont-use-try-catch-in-tests]

Tests should be clean and declarative. If a helper might return an expected error (for example, 404 during cleanup), the helper should handle it internally, for example by accepting an `ignoreErrors` option or treating a 404 during deletion as a success.

:::::{dropdown} Examples
❌ **Don’t:** catch errors in the test:

```ts
test.afterAll(async ({ apiServices }) => {
  try {
    await apiServices.cases.delete(caseId);
  } catch {
    // might already be deleted
  }
});
```

✔️ **Do:** let the helper handle expected errors:

```ts
test.afterAll(async ({ apiServices }) => {
  await apiServices.cases.cleanup.deleteAllCases();
});
```

Inside the helper, handle the expected error — either by treating 404 as success, or by accepting an `ignoreErrors` option:

```ts
async function deleteCase(caseId: string, { ignoreErrors = false } = {}) {
  const response = await apiClient.delete(`api/cases/${caseId}`, {
    headers: { ...COMMON_HEADERS, ...adminCredentials.apiKeyHeader },
  });

  // already gone — nothing to do
  if (response.status === 404) return;
  if (!ignoreErrors && response.status >= 400) {
    throw new Error(`Failed to delete case ${caseId}: ${response.status}`);
  }
}
```

:::::

## Use `expect.soft` for independent checks [use-expect-soft-for-independent-checks]

When a test verifies multiple independent items (KPI tiles, chart counts, table columns, several response fields), you can optionally use `expect.soft()` so the test continues checking everything instead of stopping at the first failure (to facilitate troubleshooting). Playwright still fails the test at the end if any soft assertion failed.

:::::{dropdown} Examples

UI test:

```ts
test('Overview tab shows all KPI values', async ({ pageObjects }) => {
  await pageObjects.nodeDetails.clickOverviewTab();
  await expect.soft(pageObjects.nodeDetails.getKPI('cpuUsage')).toHaveText('50.0%');
  await expect.soft(pageObjects.nodeDetails.getKPI('memoryUsage')).toHaveText('35.0%');
  await expect.soft(pageObjects.nodeDetails.getKPI('diskUsage')).toHaveText('80.0%');
});
```

API test:

```ts
apiTest('returns expected summary fields', async ({ apiClient }) => {
  const response = await apiClient.get('api/my-feature/summary', {
    headers: { ...COMMON_HEADERS, ...viewerCredentials.apiKeyHeader },
  });

  expect(response).toHaveStatusCode(200);
  expect.soft(response.body.total).toBe(42);
  expect.soft(response.body.active).toBe(10);
  expect.soft(response.body.archived).toBe(32);
});
```

:::::

## Use constants for shared test values [use-constants-for-shared-test-values]

If a value is reused across suites (archive paths, fixed time ranges, endpoints, common headers), extract it into a shared `constants.ts` file. This reduces duplication and typos, and makes updates safer.

:::::{dropdown} Example

```ts
// test/scout/ui/constants.ts
export const LENS_BASIC_TIME_RANGE = {
  from: 'Sep 22, 2015 @ 00:00:00.000',
  to: 'Sep 23, 2015 @ 00:00:00.000',
};

export const DASHBOARD_SAVED_SEARCH_ARCHIVE =
  'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana';

export const DASHBOARD_DEFAULT_INDEX_TITLE = 'logstash-*';

// test/scout/api/constants.ts
export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
  'Content-Type': 'application/json;charset=UTF-8',
} as const;
```

:::::

## Test with minimal permissions [test-with-minimal-permissions-avoid-admin-when-possible]

Avoid `admin` unless there’s no alternative. Minimal permissions catch real permission bugs and keep tests realistic. Also test the forbidden path: verify that an under-privileged role receives `403` for endpoints it shouldn’t access.

See [browser authentication](../testing/browser-auth.md) and [API authentication](../testing/api-auth.md).

:::::{dropdown} Examples
❌ **Don’t:** default to `admin` for convenience:

```ts
test.beforeEach(async ({ browserAuth }) => {
  await browserAuth.loginAsAdmin();
});
```

✔️ **Do:** use a built-in role when it fits (`viewer`, `editor`, etc.), or create a custom one for tighter scoping:

```ts
// built-in role
await browserAuth.loginAsViewer();

// custom role for finer-grained control
await browserAuth.loginWithCustomRole('logs_analyst', {
  elasticsearch: {
    indices: [{ names: ['logs-*'], privileges: ['read'] }],
  },
  kibana: [{ spaces: ['*'], base: [], feature: { discover: ['read'] } }],
});
```

:::::

## Contribute to Scout when possible [contribute-to-scout-when-possible]

If you build a helper that will benefit other tests, consider upstreaming it to `@kbn/scout` (platform-wide reuse), to a solution Scout package (solution-scoped reuse), or keep it in your plugin's `test/scout` tree (plugin-specific).

See [Contribute to Scout when possible](./scout.md#contribute-to-scout-when-possible) for the decision matrix.

:::::{tip} Keep Scout packages package and plugin-agnostic
When you move a helper into `@kbn/scout` or a solution Scout package, **don't import types from plugins or plugin-scoped packages**. Scout packages are intentionally slim, shared infrastructure — adding a dependency on a specific plugin's types pulls that plugin into every consumer and breaks the sharing model.
:::::
