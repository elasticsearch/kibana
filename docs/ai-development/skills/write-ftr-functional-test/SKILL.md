---
name: write-ftr-functional-test
description: Generate an FTR or Scout UI test for a Kibana UI workflow; aligns with existing .agent/skills (ftr-testing, scout-ui-testing, scout-migrate-from-ftr)
---

# Write FTR or Scout UI test for a Kibana UI workflow

Use this skill when the user wants a functional (UI) test for a Kibana app or workflow (e.g. "add a functional test for the X page" or "test that clicking Y does Z").

## Coordination with existing Kibana skills

If the Kibana repo (or worktree) has **`.agent/skills/`** (e.g. under `agent-builder-planning-mode` or a branch that ships them), **prefer those skills** for full conventions:

- **ftr-testing** — FTR structure, loadTestFile, getService/getPageObjects, configs, services (testSubjects, retry, esArchiver, browser).
- **scout-ui-testing** — Scout UI (Playwright): `test`/`spaceTest`, page objects, `browserAuth`, **tags required**; paths `test/scout*/ui/{tests,parallel_tests}/**/*.spec.ts`; package by module (`@kbn/scout`, `@kbn/scout-oblt`, etc.); assertions from `@kbn/scout/ui`; EUI wrappers, a11y checks.
- **scout-migrate-from-ftr** — When migrating existing FTR UI tests to Scout (decide UI vs API, map services to fixtures, split loadTestFile).
- **scout-create-scaffold** — Generate Scout scaffold: `node scripts/scout.js generate --path <moduleRoot> --type ui` (or `both`).

**When to use which:** For **new** UI test configs (new suite or new module), **default to Scout**: use the **scout-ui-testing** skill and **scout-create-scaffold** if needed (`node scripts/scout.js generate --path <moduleRoot> --type ui`). Use **FTR** only when adding to or modifying **existing** FTR functional tests (plugin already has tests under `test/functional/` or `x-pack/.../test/functional/` and no `test/scout*/ui/`). For **migrating** existing FTR to Scout, use **scout-migrate-from-ftr**. When in doubt, prefer Scout for new configs.

## Inputs

- **App or workflow** — e.g. "Dashboard save flow", "Uptime overview filters"
- **Test location** — which FTR config and folder (e.g. `test/functional/apps/dashboard`, or `x-pack/solutions/observability/test/functional/apps/uptime`), or Scout path `test/scout*/ui/tests/` / `parallel_tests/`
- **Scenarios** — what to assert (e.g. "page loads", "filter applies", "save button creates saved object")

## Steps (FTR UI — use only when extending existing FTR functional tests)

1. **Locate the right FTR config and test layout.** Find the functional test suite for this app (e.g. under `test/functional/` or `x-pack/.../test/functional/`). Note the config file (e.g. `config.base.ts`) and how tests receive `FtrProviderContext` (e.g. `export default ({ getPageObjects, getService }: FtrProviderContext) => { ... }`).

2. **Create or open the test file** (e.g. `overview.ts` or `save_flow.ts`). Use the same extension (ts) and export pattern as neighboring tests: `export default (context: FtrProviderContext) => { ... }`.

3. **Use FTR services and page objects:**
   - **getPageObjects(names)** — Returns page objects (e.g. `common`, `dashboard`, `uptime`). Use for navigation (`navigateToApp`, `navigateToUrl`) and high-level actions.
   - **getService(name)** — Use `retry` for retry-aware waits, `testSubjects` for `data-test-subj` selectors, `esArchiver` for loading fixtures, `browser` for URL/cookies if needed. Prefer `testSubjects` over CSS or XPath.

4. **Structure the test:**
   - Top-level `describe('feature or page name', function () { ... })`.
   - Use `before`/`beforeEach` for fixtures (e.g. `esArchiver.load(...)`) and navigation to the app. Use `after`/`afterEach` for cleanup if needed.
   - Use `it('does something specific', async () => { ... })` for each scenario. Use async/await for all FTR calls.

5. **Interact via data-test-subj:** Use `testSubjects.find('myButton')`, `testSubjects.click('myButton')`, `testSubjects.exists('myPanel')`, `testSubjects.getVisibleText('title')`. Ensure the app under test adds the corresponding `data-test-subj` attributes so tests are stable. If they are missing, add them to the UI and then reference them in the test.

6. **Use retry for flakiness:** Wrap assertions or actions that depend on async UI in `retry.try(async () => { ... })` or use the page object’s retry-aware helpers (e.g. wait for an element then click). Avoid raw `setTimeout`; prefer waiting for a specific condition.

7. **Assert:** Use `@kbn/expect` (e.g. `expect(await testSubjects.getVisibleText('heading')).to.equal('Expected')`). Keep assertions focused on visible behavior and URL/state where relevant.

## Validation (run these and fix any failures)

1. **Type check:** Run `node scripts/type_check` from repo root. Fix any errors in the new test file.
2. **Lint:** Run `node scripts/eslint_all_files` for the test file. Fix any violations.
3. **Run the FTR functional suite** that includes this test (e.g. the app’s functional config). Ensure the new test passes. Re-run once more to reduce flakiness; fix any intermittent failures (e.g. add waits or narrow scope).

After validation, report: test file path, scenarios covered, and that type-check, lint, and the functional test run pass.

## If using Scout UI instead

- Follow the **scout-ui-testing** skill in `.agent/skills/scout-ui-testing/SKILL.md`: paths under `test/scout*/ui/tests/` (sequential) or `ui/parallel_tests/` (parallel with `spaceTest`); import `test` or `spaceTest` from local fixtures; **tags are required** (e.g. `tags.deploymentAgnostic`, `tags.stateful.classic`); use `browserAuth` for auth; put UI actions in page objects; use `page.testSubj.locator(...)`; optional `page.checkA11y()`. Run with `node scripts/scout.js run-tests --stateful --testFiles <path>`. For new modules, run **scout-create-scaffold** first: `node scripts/scout.js generate --path <moduleRoot> --type ui`.
