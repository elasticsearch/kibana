---
name: scout-ui-testing
description: Use when creating, updating, debugging, or reviewing Scout UI tests in Kibana (Playwright + Scout fixtures), including page objects, browser authentication, parallel UI tests (spaceTest/scoutSpace), a11y checks, and flake control.
---

# Scout UI Testing

## Pick the right test mode

- **Sequential UI**: `<module-root>/test/scout*/ui/tests/**/*.spec.ts`.
- **Parallel UI**: `<module-root>/test/scout*/ui/parallel_tests/**/*.spec.ts` and (recommended) use `spaceTest` + `scoutSpace` (one Kibana space per worker). If you run with `workers > 1` but keep using `test`, you won't get space isolation.
- Use the Scout package that matches the module root:
- `src/platform/**` or `x-pack/platform/**` -> `@kbn/scout`
- `x-pack/solutions/observability/**` -> `@kbn/scout-oblt`
- `x-pack/solutions/search/**` -> `@kbn/scout-search`
- `x-pack/solutions/security/**` -> `@kbn/scout-security`

## Imports

- Test framework + tags: `import { tags } from '@kbn/scout';` (or the module's Scout package)
- Test fixture: `import { test } from '../fixtures';` (or `import { test } from '@kbn/scout';` when not extending)
- Assertions: `import { expect } from '@kbn/scout/ui';` (or `@kbn/scout-oblt/ui`, etc.) — **not** from the main entry
- `expect` is **not** exported from the main `@kbn/scout` entry. Use the `/ui` subpath for UI tests.

## Non-negotiable conventions

- **Tags are required**: Scout validates UI test tags at runtime. Ensure each test has at least one supported tag (typically by tagging the top-level `test.describe(...)` / `spaceTest.describe(...)`, e.g. `tags.deploymentAgnostic`, `tags.stateful.classic`, or `tags.performance`).
- **No `@` in test titles**: Playwright treats `@word` in test/describe titles as tags. Do not use `@` followed by word characters in titles (e.g., `@timestamp`, `@elastic`). This causes Scout tag validation to fail with "Unsupported tag(s) found". Rephrase the title instead (e.g., use `timestamp field` instead of `@timestamp`).
- **Prefer one suite per file**: keep a single top-level `test.describe(...)` (sequential) or `spaceTest.describe(...)` (parallel) and avoid nested `describe` blocks where possible.
- **UI actions live in page objects**; assertions stay in the spec.
- **Use APIs for setup/teardown**: prefer `apiServices`/`kbnClient`/`esArchiver` in hooks over clicking through the UI.

## Auth (UI)

- Use `browserAuth` — available methods: `loginAsAdmin()`, `loginAsPrivilegedUser()`, `loginAsViewer()`, `loginAs(role)`, `loginWithCustomRole(role)`.
- Prefer least privilege: use `loginAsViewer()` or `loginWithCustomRole()` over `loginAsAdmin()`.
- Avoid `loginAsAdmin()` unless the test is explicitly about admin-only behavior.

## Page objects (UI)

- Prefer `page.testSubj.locator(...)`, role/label locators; avoid brittle CSS.
- Keep selectors + interactions inside the page object class. **Do not use `expect` assertions in page objects** — use `waitForSelector` for waiting on elements. Assertions belong in test specs only.
- **Keep route mocks out of page objects** — page objects are for UI interactions only. Put `page.route()` mocks in a dedicated `fixtures/mocks.ts` file as standalone functions that accept `page` as a parameter. See `cloud_security_posture/test/scout_cspm_agentless/ui/fixtures/mocks.ts` for the reference pattern.
- Don't make API calls from page objects (use `apiServices`/`kbnClient` in hooks instead).
- Register plugin page objects by extending the `pageObjects` fixture in `test/scout*/ui/fixtures/index.ts`.
- **Use `readonly` class fields for static locators** — assign them in the constructor, not as getter methods. Use methods only for parameterized locators/actions. See `DashboardApp` in `kbn-scout` for the reference pattern.
- Scout provides EUI component wrappers for stable interactions with common EUI widgets: `EuiComboBoxWrapper`, `EuiDataGridWrapper`, `EuiSelectableWrapper`, `EuiCheckBoxWrapper`, `EuiFieldTextWrapper`, `EuiCodeBlockWrapper`, `EuiSuperSelectWrapper`, `EuiToastWrapper`. Import them from `@kbn/scout` and use them as class members in page objects.
- **Avoid `.first()`, `.nth()`, `.last()`** — the `playwright/no-nth-methods` lint rule flags these. Instead, use `data-test-subj` attributes or other targeted selectors. If the component lacks a `data-test-subj`, add one rather than disabling the rule.
- **Do not disable eslint rules** — avoid `eslint-disable` comments in test files. Fix the underlying issue (e.g., use targeted selectors instead of positional ones, add `data-test-subj` to the components) rather than suppressing the lint rule.

## Parallel UI specifics (spaceTest)

- Use `spaceTest` so you can access `scoutSpace` for worker-isolated saved objects + UI settings.
- Pre-ingest shared ES data in `parallel_tests/global.setup.ts` via `globalSetupHook(...)`.
  - Only **worker** fixtures are available there (no `page`, `browserAuth`, `pageObjects`).
- Reset Elasticsearch/Kibana state once after the suite via `globalTeardownHook(...)` in `parallel_tests/global.teardown.ts` (optional, opt-in by file presence). For state that does need resetting, use `esClient`/`kbnClient`/`apiServices`. See `references/scout-ui-parallelism.md`.
- Cleanup space-scoped mutations in `afterAll` (`scoutSpace.savedObjects.cleanStandardList()`, unset UI settings you set).

## Extending fixtures

Most modules extend the base `test` (or `spaceTest`) in `test/scout*/ui/fixtures/index.ts` to add custom page objects and auth helpers:

```ts
import { test as baseTest } from '@kbn/scout'; // or the module's Scout package
import type { ScoutTestFixtures, ScoutWorkerFixtures, ScoutPage } from '@kbn/scout';

class MyPluginPage {
  constructor(private readonly page: ScoutPage) {}
  async goto() { await this.page.gotoApp('myPlugin'); }
}

interface ExtendedFixtures extends ScoutTestFixtures {
  pageObjects: ScoutTestFixtures['pageObjects'] & { myPlugin: MyPluginPage };
}

export const test = baseTest.extend<ExtendedFixtures, ScoutWorkerFixtures>({
  pageObjects: async ({ pageObjects, page }, use) => {
    await use({ ...pageObjects, myPlugin: new MyPluginPage(page) });
  },
});
```

Tests then import from local fixtures: `import { test } from '../fixtures';`

## Multi-step flows with `test.step()`

Use `test.step(...)` to group related actions within a single test. Steps appear in Playwright's trace viewer and HTML report, making failures easier to debug without splitting into many small tests:

```ts
test('creates and verifies a dashboard', async ({ pageObjects, page }) => {
  await test.step('create dashboard', async () => {
    await pageObjects.dashboard.create('My Dashboard');
  });
  await test.step('verify dashboard appears in list', async () => {
    await expect(page.testSubj.locator('dashboardTitle')).toHaveText('My Dashboard');
  });
});
```

## Waiting + flake control

- Don’t use `page.waitForTimeout`. Wait on a page-ready signal (loading indicator hidden, container visible, `expect.poll` on element counts).
- When an explicit wait is needed, prefer `locator.waitFor({ state: 'visible' })` over a bare `locator.waitFor()`. The two are equivalent (`visible` is the default state), but stating it keeps the intent explicit and consistent with RTL-style readiness checks.
- If selectors aren’t stable, add `data-test-subj` (Scout uses it as the `testIdAttribute`).
- Some locators are restricted by `@kbn/eslint/scout_no_locators` (e.g. `globalLoadingIndicator`). Don’t use them in tests or page objects for app loading state management; rely on Playwright auto-waiting and page-ready signals instead.

## A11y checks (optional, high value)

- Use `page.checkA11y()` at a few stable checkpoints (landing pages, modals/flyouts).
- Prefer `include` scoped checks; assert `violations` is empty.

## Run / debug quickly

- Use either `--config` or `--testFiles` (they are mutually exclusive).
- Run by config: `node scripts/scout.js run-tests --arch stateful --domain classic --config <module-root>/test/scout*/ui/playwright.config.ts` (or `.../ui/parallel.playwright.config.ts` for parallel UI)
- Run by file/dir (Scout derives the right `playwright.config.ts` vs `parallel.playwright.config.ts`): `node scripts/scout.js run-tests --arch stateful --domain classic --testFiles <module-root>/test/scout*/ui/tests/my.spec.ts`
- For faster iteration, start servers once in another terminal: `node scripts/scout.js start-server --arch stateful --domain classic [--serverConfigSet <configSet>]`, then run Playwright directly: `node scripts/playwright test --config <...> --project local --grep <tag> --headed`.
- `run-tests` auto-detects custom config sets from `.../test/scout_<name>/...` paths.
- `start-server` has no Playwright config to inspect, so pass `--serverConfigSet <name>` when your tests require a custom config set.
- Debug: `SCOUT_LOG_LEVEL=debug`, or `node scripts/playwright test --config <...> --project local --ui`

## CI enablement

- Scout tests run in CI only for modules listed under `plugins.enabled` / `packages.enabled` in `.buildkite/scout_ci_config.yml`.
- `node scripts/scout.js generate` registers the module under `enabled` so the new configs run in CI.

## References

Open only what you need:

- Browser authentication helpers and patterns: `references/scout-browser-auth.md`
- Parallel UI (`spaceTest` + `scoutSpace`) isolation + global setup rules: `references/scout-ui-parallelism.md`
- API services patterns (setup/teardown helpers shared with UI): `../scout-api-testing/references/scout-api-services.md`
