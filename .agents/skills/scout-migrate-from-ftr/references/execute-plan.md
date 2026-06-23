# Migration execution

Detailed execution steps for converting FTR tests to Scout, used **after** the user has approved the migration plan produced in step 1 of the parent skill ([`SKILL.md`](../SKILL.md)).

The plan answers _what_ and _why_; this file answers _how_.

## Required sub-skills

- **REQUIRED SUB-SKILL:** scout-create-scaffold (place tests under the correct `test/scout` path).
- **REQUIRED SUB-SKILL:** scout-ui-testing (page objects, browser auth, parallel UI patterns).
- **REQUIRED SUB-SKILL:** scout-api-testing (apiClient/auth, apiServices patterns).
- **REQUIRED SUB-SKILL:** ftr-testing (understand FTR structure, loadTestFile, and configs).

## Important note

- If the suite mostly validates **data correctness**, migrate it to a Scout **API** test (or unit/integration) instead of a Scout UI test.
- Prefer component/unit tests (RTL/Jest) for isolated UI behaviors rather than Scout functional tests. For a full catalog of what should be downgraded and where the resulting tests live, see [`pick-correct-test-type.md`](pick-correct-test-type.md).
- Follow steps **1–10** below. Common migration failures: missing UI tags, wrong Scout package imports, relying on ordering/shared state, and ingestion/setup that isn't space/parallel-safe.

## Guardrails / gotchas (high signal)

- **Preserve relevant comments**: if FTR test comments provide useful context (intent, workarounds, non-obvious setup), keep them in the migrated Scout spec. Drop only outdated comments.
- Scout specs are **standalone**: don't rely on file execution order or `loadTestFile()` indexes.
- Each Scout `test()` runs in a **fresh browser context**: if an FTR suite used multiple `it()` blocks as one journey, combine into one `test()` + `test.step()`. Do login/navigation in `beforeEach` (avoid `page`/`browserAuth`/`pageObjects` in `beforeAll`).
- Keep **one suite per file**, avoid nested `describe`, and don't use `*.describe.configure()`.
- Keep spec files **focused and small**: aim for **4–5 short test scenarios** or **2–3 long scenarios** per file. This is critical for parallel execution, where the test runner balances work at the spec-file level — oversized specs create bottlenecks.
- UI tests: tags are **required** (validated at runtime).
- `parallel_tests/`: ingest via `parallel_tests/global.setup.ts` + `globalSetupHook` (don't use `esArchiver` in spec files).
- Use the correct Scout package for the test location (`@kbn/scout` vs `@kbn/scout-security`/`@kbn/scout-oblt`/`@kbn/scout-search`) and import `expect` from `/ui` or `/api`.
- **TypeScript layout for Scout tests** (pick one; see **Where Scout tests are typechecked** under step 6): either fold `test/scout/**/*` into the **plugin root** `tsconfig.json` and add Scout `kbn_references` (like `discover_enhanced`), or keep **dedicated** `test/scout/{ui,api}/tsconfig.json` files. Only the latter forbids relative imports into `server/` / `public/`.
- **Prefer Scout's default servers config**: replace FTR config nesting / per-suite server args with `uiSettings` / `scoutSpace.uiSettings` and (when needed) `apiServices.core.settings(...)` runtime settings. Only create a custom server config set when the plan calls for it (a setting that must apply at Kibana boot) — custom configs run only in local pipelines (no Cloud) and add CI cost.
- Auth/roles are fixture-driven: `browserAuth` (UI), `requestAuth` (API key), `samlAuth` (cookie / `cookieHeader`), plus custom roles. Avoid FTR-style role mutation. For Scout **API** tests, see **Scout API auth (`cookieHeader` vs API key)** under step 4.
- **Prefer default Cloud-compatible roles over custom ones.** For general user flows, use the least-privileged built-in role (`browserAuth.loginAsViewer()` → `loginAsPrivilegedUser()` → `loginAsAdmin()`). Reach for `loginWithCustomRole(roleDescriptor)` only when the test specifically validates permission-scoped behavior that no built-in role expresses — don't port FTR custom roles 1:1, as many were scoped incidentally and work fine on a default role. `loginAs(role)` (built-in role by name) is stateful-only and isn't supported on serverless (ensure the tests aren't targeting serverless).

## Core workflow

### 1) Decide the test type

For each FTR file the plan marked as **API test**, **UI test**, or **unit test (RTL/Jest)**, follow the plan. The full criteria for downgrades to API or RTL/Jest live in [`pick-correct-test-type.md`](pick-correct-test-type.md); consult it when:

- the plan flags a test as a downgrade, or
- you discover during execution that the plan's classification is wrong (rare; report back to the user before proceeding).

### 2) Place files correctly

- UI: `<module-root>/test/scout*/ui/{tests,parallel_tests}/**/*.spec.ts`
- API: `<module-root>/test/scout*/api/{tests,parallel_tests}/**/*.spec.ts`
- UI: use `ui/parallel_tests/` + `spaceTest` when the flow can be space-isolated (state is scoped to a Kibana space) and should run in parallel; otherwise use `ui/tests/` + `test`. See [Scout parallelism](../../../../docs/extend/scout/parallelism.md) for details on when to choose parallel vs sequential.
- API: default to `api/tests/` (sequential). Use `api/parallel_tests/` + `parallel.playwright.config.ts` only when the test is safe to run in parallel (no shared state) and you need the speedup.
- Parallel UI: avoid hardcoded saved object IDs (they can differ per space) and make names unique when needed (often suffix with `scoutSpace.id`).

#### Tags when the FTR suite was "deployment agnostic"

For available tag helpers and their meaning, see [Deployment tags](../../../../docs/extend/scout/deployment-tags.md).

FTR **deployment-agnostic** configs often load the same files under both stateful and serverless. In Scout, **do not assume** `tags.deploymentAgnostic` is the right default for every migrated spec. Instead:

- **Solution modules** (`x-pack/solutions/observability|security|search/...`): use explicit solution targets (e.g. `[...tags.stateful.classic, ...tags.serverless.observability.complete]`) so CI only runs where that solution is present. Match sibling specs in the same module.
- **Platform modules** (`src/platform/**`, `x-pack/platform/**`): `tags.deploymentAgnostic` is appropriate when the original intent was "run everywhere."

API and UI specs should both carry tags that match the intended `run-tests` / CI targets; see step 9.

**Prefer tags inline.** Avoid wrapping tags in a named constant unless the same tag set is reused across multiple suites. Never change an existing tag constant's value to fit a different suite. Apply per-issue tag instructions inline and only to the tests specified.

### 3) Translate the test structure

- `describe/it` -> `test.describe/test` or `apiTest.describe/apiTest` (but don't assume 1:1 `it` -> `test`).
- `before/after` -> `test.beforeAll/test.afterAll`.
- `beforeEach/afterEach` -> `test.beforeEach/test.afterEach`.
- Keep **one suite per file** and a flat hierarchy (avoid nested `describe`; use `test.step()` inside a test for structure).
- If a single FTR file contains multiple top-level `describe` blocks, split into multiple Scout specs (one describe per file).
- **Nested `describe` blocks**: if the FTR file has nested describes, prefer splitting into separate Scout spec files. However, if the file is small and the nested describes are lightweight, flatten them into a single `test.describe` with individual `test(...)` blocks using `test.step(...)` for sub-structure instead of creating many tiny spec files.

#### Combine duplicate stateful / serverless FTR tests

FTR often has **separate but near-identical** test files under `test/*api_integration*/` (stateful) and `test/serverless/` (or similar directories). Before migrating each file individually, compare them: if the test flow is identical or almost identical, **combine into a single Scout spec** with tags covering both deployment targets (e.g. `[...tags.stateful.classic, ...tags.serverless.observability.complete]`). Extract any deployment-specific differences into conditional helpers or small branching within the spec. Only keep separate specs when the flows genuinely diverge.

#### `it` blocks are sometimes steps (not full test cases)

In FTR it's common for multiple `it(...)` blocks in one `describe(...)` to behave like a single user journey (shared browser state across `it`s).
In Scout (Playwright), each `test(...)` runs with a fresh browser context, so you usually can't preserve that state across multiple `test`s.

Guideline:

- If the FTR suite uses multiple `it(...)` blocks as sequential steps of one flow, combine them into a single `test(...)` and convert the step boundaries into `test.step(...)`.
- If an `it(...)` block is already an independent test case, keep it as its own `test(...)` and ensure it sets up its own preconditions.

Minimal sketch:

```ts
// FTR: multiple `it`s continue in the same browser context
it('create entity', async () => {});
it('edit entity', async () => {}); // continues...

// Scout: combine into one test and use `test.step` for debuggability
test('create and edit entity', async () => {
  await test.step('create entity', async () => {});
  await test.step('edit entity', async () => {});
});
```

### 4) Replace FTR dependencies

- Replace `supertest` calls with Scout `apiClient` (endpoint under test) + `requestAuth`/`samlAuth` (auth). FTR stateful tests often use `supertest` with an implicit **admin** role—don't carry that over blindly. Research whether a lower default role like `editor` or `viewer` is sufficient; comparing the roles used in the **serverless** version of the same test (if one exists) is a good starting point.
- Replace other FTR services with Scout fixtures (`pageObjects`, `browserAuth`, `apiServices`, `kbnClient`, `esArchiver`).
- Use `apiServices`/`kbnClient` for setup/teardown and verifying side effects.
- **Audit FTR before/after hooks carefully**—don't copy them verbatim. Review every call in `before`/`beforeEach`/`after`/`afterEach` and verify it is still correct for Scout: replace FTR-specific APIs with their Scout equivalents, remove unnecessary calls (e.g. FTR service initialization that Scout fixtures handle automatically), and add any missing setup or cleanup that the FTR suite neglected. Ensure every resource created in `beforeAll`/`beforeEach` has matching cleanup in `afterAll`/`afterEach`—FTR suites frequently lack proper teardown. Place `kbnClient.savedObjects.cleanStandardList()` (or `scoutSpace.savedObjects.cleanStandardList()`) in **`afterAll`**, not `beforeAll`; `beforeAll` cleanup masks missing teardown and hides leaked state from previous runs.
- Replace FTR webdriver waits (`retry.waitFor`, `testSubjects.existOrFail`, `find.*` with timeouts) with `locator.waitFor({ state: 'visible' })` / `page.testSubj.waitForSelector(..., { state: 'visible' })` to synchronize. Reserve `await expect(locator).toBeVisible()` for spec assertions on Scout's default timeouts — don't use it as a wait or pass `{ timeout }` overrides without a justifying comment.
- **Page objects — before writing any page object code:** (1) read the FTR page object's actual source; never infer a method's selectors or steps from its name (this is what produces hallucinated, non-existent methods). (2) Check for an existing equivalent in `src/platform/packages/shared/kbn-scout/src/playwright/page_objects/` (and the solution package, e.g. `@kbn/scout-oblt`) and reuse it rather than recreating it locally. (3) When a method is genuinely missing, place it per the plan's exists/wrong-scope/missing classification: contribute it to the global `kbn-scout` package (exported from that dir's `index.ts`) if it drives platform-wide UI (Discover, Dashboard, Lens, etc.); only keep it in the plugin's `test/scout*/ui/fixtures/page_objects/` (registered in that fixtures `index.ts`) if it's plugin-specific.
- Move UI selectors/actions into Scout page objects; register new page objects in the plugin fixtures index.
- If the test needs API setup/cleanup, add a scoped API service and use it in `beforeAll/afterAll`.
- Replace per-suite FTR config flags with `uiSettings` / `scoutSpace.uiSettings`, and (when needed) `apiServices.core.settings(...)`.
- Use the correct Scout package for the test location (`@kbn/scout` vs `@kbn/scout-<solution>`), and import `expect` from `/ui` or `/api`.
- If the test needs rison-encoded query params, use `@kbn/rison` and add it to `test/scout*/ui/tsconfig.json` `kbn_references`.

#### Scout API auth (`cookieHeader` vs API key)

For general Scout API auth patterns (`requestAuth`, `samlAuth`, common headers, code examples), see [Authentication in Scout API tests](../../../../docs/extend/scout/api-auth.md).

**FTR mapping:** FTR `roleScopedSupertest` with `useCookieHeader: true` / `withInternalHeaders` maps to **`samlAuth`** + **`cookieHeader`** merged with common headers on `apiClient` requests. FTR `supertest` with API key auth maps to **`requestAuth.getApiKey(...)`** + **`apiKeyHeader`**.

**FTR migration gotchas (not covered in the general doc):**

- Handlers that call **`core.security.authc.apiKeys.create`** (nested API keys) often **fail with HTTP 500** when the incoming request uses an API key. Use **`samlAuth.asInteractiveUser('admin')`** (or the role FTR used with cookies) for those routes.
- **Negative / least-privilege tests** that in FTR used a **custom role + cookie** (e.g. empty `kibana: []` privileges) and expect **404** from scoped saved-object access: use **`samlAuth.asInteractiveUser(customRoleDescriptor)`** + **`cookieHeader`**. **`requestAuth.getApiKeyForCustomRole(...)`** can resolve **200** for the same role shape because API-key privilege resolution differs from an interactive session.

### 5) Split loadTestFile suites

- Each `loadTestFile` target becomes its own Scout spec.
- Move shared setup into each spec (or a shared fixture/helper).
- Don't rely on spec execution order (it's not guaranteed).
- Split flows with different state requirements (localStorage, tour visibility) into dedicated specs.

### 6) Add helpers and constants

- Put shared helpers in `test/scout*/ui/fixtures/helpers.ts` (or API helpers in API fixtures).
- Add test-subject constants in `fixtures/constants.ts` for reuse across tests and page objects. For other shared values (archive paths, time ranges, etc.), follow the plan's "Shared constants to extract" list rather than introducing new constants during execution.
- For `parallel_tests/` ingestion, use `parallel_tests/global.setup.ts` + `globalSetupHook` (no `esArchiver` in spec files).
- For suite-wide Elasticsearch/Kibana state reset (e.g. reverting feature flags or global `uiSettings`, dropping hand-indexed data that affects other Scout configs sharing the cluster), use the **optional** `globalTeardownHook` in `parallel_tests/global.teardown.ts`. Picked up automatically when `runGlobalSetup: true` — no extra config flag. Use `esClient.indices.delete` / `deleteDataStream` / `deleteByQuery`, `kbnClient.uiSettings.unset(...)`, and `apiServices.core.settings(...)` to reset state. Per-test/per-suite cleanup still belongs in `afterEach`/`afterAll`.

#### Synthtrace in Scout **API** tests

Import the fixture from **`@kbn/scout-synthtrace`** (not from `@kbn/scout` / `@kbn/scout-oblt` alone). Merge it into your module's `apiTest` in `test/scout*/api/fixtures/index.ts`:

```ts
import { apiTest as baseApiTest, mergeTests } from '@kbn/scout-oblt'; // or '@kbn/scout' for platform-only modules
import { synthtraceFixture } from '@kbn/scout-synthtrace';

export const apiTest = mergeTests(baseApiTest, synthtraceFixture);
```

Specs then receive worker fixtures such as **`logsSynthtraceEsClient`** (`index` / `clean`) for `@kbn/synthtrace-client` generators (`log`, `timerange`, etc.).

Add the same Scout **`kbn_references`** on **whichever `tsconfig.json` includes the Scout API files**: either the **plugin root** `tsconfig.json` or `test/scout*/api/tsconfig.json`. Typical API set: `@kbn/scout-oblt` (or `@kbn/scout`), **`@kbn/scout-synthtrace`**, **`@kbn/synthtrace-client`** (add `@kbn/synthtrace` only if types require it). UI-only synthtrace: same **`@kbn/scout-synthtrace`** import in fixtures.

#### Where Scout tests are typechecked (choose one)

See **TypeScript layout** in the `scout-create-scaffold` skill for full **Pattern A** / **Pattern B** details (what to add to `tsconfig.json`, `kbn_references`, and the `yarn kbn bootstrap` / `type_check` steps).

**Choosing:** Prefer **Pattern A** when migrating FTR tests that already imported registration constants or server helpers. Prefer **Pattern B** when you want minimal plugin compile cost and can keep imports boundary-safe.

#### Scout API imports and TypeScript project boundaries (Pattern B only)

If the module uses **Pattern B**, treat the Scout API directory as isolated:

- Avoid relative imports into plugin **`server/`** / **`public/`** just to reuse a string constant—use **`api/fixtures/constants.ts`** or move the constant to **`common/`** if both prod and tests should share it.
- Prefer **`@kbn/scout*`** / **`@kbn/synthtrace-client`** per that folder's **`kbn_references`**.

**FTR migration tip:** FTR often imported server files because tests sat in the plugin program. **Pattern A** preserves that. **Pattern B** matches "thin" e2e deps—duplicate small literals or use fixtures when adding `server/` to the Scout `tsconfig` graph is wrong.

### 7) Extract component/unit tests where possible

While implementing, look for logic that can be pulled out of e2e into RTL/Jest. Not every FTR `it` block needs a Scout equivalent. The full catalog of extraction candidates and where the resulting tests live is in [`pick-correct-test-type.md`](pick-correct-test-type.md).

Keep Scout tests for what **requires a real browser and running server**: navigation, cross-page flows, permission-gated UI, and serverless-vs-stateful differences.

### 8) Clean up FTR wiring

- Remove `loadTestFile` entries from any stateful and serverless FTR configs/index files.
- Delete old FTR test files once Scout coverage is verified.
- For staged migrations, mark remaining FTR suites as `describe.skip` to avoid duplicate coverage.

### 9) Verify and run tests locally

- **Typecheck:** For **Pattern A**, run **`node scripts/type_check --project <plugin-root>/tsconfig.json`**. For **Pattern B**, run **`node scripts/type_check --project <plugin>/test/scout/api/tsconfig.json`** (and UI project if present). Use full **`node scripts/type_check`** when shared types changed broadly. Huge **`TS6059` / `TS6307`** counts under a **Scout-only** project usually mean **Pattern B** + forbidden **`server/`** relatives—switch to **Pattern A** or fix imports (step 6).
- Use `node scripts/scout.js run-tests --arch stateful --domain classic --testFiles <path>` and
  `node scripts/scout.js run-tests --arch serverless --domain observability_complete --testFiles <path>` (adjust serverless domain).
- If the tests are under `test/scout_<configSet>/...`, `run-tests` auto-detects the server config set from the Playwright config path.
- `start-server` has no Playwright config to inspect, so pass `--serverConfigSet <configSet>` when your tests require a custom config set.
- Each test must include assertions in the test body (not hidden inside page objects; page objects should return state).
- UI tests must have at least one supported tag (Scout validates UI tags at runtime). API tests should also be tagged.
- Avoid checking raw data in UI tests; prefer page object methods over direct selectors.
- Preserve or update tags for deployment targets when needed; for **solution** modules, prefer **stateful + solution serverless** tags over `tags.deploymentAgnostic` (see **Tags when the FTR suite was "deployment agnostic"** under step 2).
- Run Scout tests in both stateful and serverless if the plugin supports both.

### 10) Hand off to Step 5

Once the new specs typecheck and run, control returns to the parent skill. Step 5 (review parity & best practices) is owned by [`SKILL.md`](../SKILL.md), which dispatches to the `scout-best-practices-reviewer` skill with the removed FTR files as parity context.

## Common patterns

- Use `test.step(...)` inside a single `test(...)` when an FTR suite used multiple `it(...)` blocks as one journey.
- Parallel UI: isolate per-space state via `spaceTest` + `scoutSpace`; avoid hardcoded saved object IDs and make names unique (often suffix with `scoutSpace.id`).
- Use `globalSetupHook` in `parallel_tests/global.setup.ts` to ingest shared data once.
- Use the optional `globalTeardownHook` in `parallel_tests/global.teardown.ts` to reset shared state once after the suite (no `esArchiver`; `esClient`/`kbnClient`/`apiServices` only). See step 6 above for the cleanup primitives and cautions.
- Use `page.addInitScript(...)` before navigation to set localStorage/cookies (skip tours/onboarding).
- When FTR used rison-encoded query params, replicate with `@kbn/rison` and add **`@kbn/rison`** to **`kbn_references`** on the `tsconfig.json` that includes the Scout UI files (plugin root under **Pattern A**, or `test/scout/ui/tsconfig.json` under **Pattern B**).
- Add stable `data-test-subj` attributes when selectors are unstable.
- Centralize deep links + page-ready waits in page objects.

## Common mistakes

- Migrating data validation UI tests instead of converting to API tests.
- Forgetting to split `loadTestFile` suites into separate Scout specs.
- Forgetting UI tags (required; Scout validates UI tags at runtime). API tests should also be tagged so CI/discovery can select the right deployment target.
- Placing Scout tests outside `test/scout*/{ui,api}/{tests,parallel_tests}`.
- Ignoring existing parallel Scout config (mixing `tests/` with `parallel_tests/`).
- Using the wrong Scout package (solution tests in security/observability/search must import from their solution Scout package, not `@kbn/scout`).
- Using `tags.deploymentAgnostic` for specs under a **solution** plugin/package when the FTR suite was only "deployment agnostic" in the sense of shared stateful+serverless **observability** (or security/search) configs—those jobs still differ from the broad `deploymentAgnostic` tag set; use **explicit `tags.stateful.*` + `tags.serverless.<solution>`** instead (see step 2).
- Importing `expect` from the wrong entrypoint (use `/ui` for UI, `/api` for API).
- Using `esArchiver` in `parallel_tests/` spec files (ingest in `parallel_tests/global.setup.ts` instead).
- Using nested `describe` blocks or `*.describe.configure()` (split into separate specs, or flatten small files into `test` + `test.step`—see step 3).
- Migrating near-identical stateful and serverless FTR files as two separate Scout specs instead of combining them into one spec with appropriate tags (see step 3).
- Spreading one user journey across multiple Scout `test(...)` blocks (fresh browser context per test).
- Hiding assertions inside page objects (ESLint `expect-expect` requires assertions in the test body; page objects should return state, not assert).
- Packing too many `test(...)` blocks into a single spec file. Keep specs focused: 4–5 short scenarios or 2–3 long scenarios per file. Oversized specs create bottlenecks in parallel execution.
- Using **`requestAuth.getApiKey('admin')`** for **internal** routes whose handlers **create nested API keys**—often **HTTP 500**; use **`samlAuth.asInteractiveUser`** and merge **`cookieHeader`** (see step 4).
- Using **`getApiKeyForCustomRole`** for FTR parity on **scoped saved-object / RBAC** assertions that used **cookie + custom role**—prefer **`samlAuth.asInteractiveUser(customRoleDescriptor)`** + **`cookieHeader`** so outcomes match FTR (e.g. **404** vs **200**).
- **Pattern B** + relative imports from `test/scout*/api/` into **`server/`** / **`public/`** (e.g. `server/saved_objects/...`). Fix by **Pattern A** (`test/scout/**/*` in the plugin `tsconfig` + Scout `kbn_references`) or duplicate constants in **`api/fixtures/constants.ts`** (step 6).
- **Pattern A** but forgetting to add **`test/scout/**/*`** to **`include`** or omitting **`@kbn/scout-oblt`** / synthtrace **`kbn_references`**—Scout files won't typecheck in **`check_types`**.
