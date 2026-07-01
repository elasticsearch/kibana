---
name: write-ftr-api-test
description: Generate an FTR or Scout API test for a Kibana API endpoint; aligns with existing .agent/skills (ftr-testing, scout-api-testing)
---

# Write FTR or Scout API test for a Kibana endpoint

Use this skill when the user wants an API integration test for a specific HTTP endpoint (e.g. "add an FTR test for GET /api/my_plugin/status" or "write API test for the new export route").

## Coordination with existing Kibana skills

If the Kibana repo (or worktree) has **`.agent/skills/`** (e.g. under `agent-builder-planning-mode` or a branch that ships them), **prefer those skills** for full conventions:

- **ftr-testing** — FTR structure, loadTestFile, configs, services, `.buildkite/ftr_*_configs.yml`.
- **scout-api-testing** — Scout API tests: `apiTest`, `apiClient`, `requestAuth`/`samlAuth`, `apiServices`; paths `test/scout*/api/{tests,parallel_tests}/**/*.spec.ts`; package by module (`@kbn/scout`, `@kbn/scout-oblt`, etc.); assertions from `@kbn/scout/api`; tags required for CI.

**When to use which:** For **new** API test configs (new suite or new module), **default to Scout**: use the **scout-api-testing** skill and run **scout-create-scaffold** if needed (`node scripts/scout.js generate --path <moduleRoot> --type api`). Use **FTR** only when adding to or modifying **existing** FTR API tests (plugin already has tests under `test/api_integration/` or `x-pack/.../test/api_integration/` and no `test/scout*/api/`). When in doubt, prefer Scout for new configs.

## Inputs

- **Endpoint** — method and path (e.g. `GET /api/my_plugin/status`, `POST /internal/my_plugin/jobs`)
- **Plugin or test suite** — which FTR config/suite this test belongs to (e.g. `test/api_integration/apis/my_plugin`)
- **Scenarios to cover** — e.g. 200 success, 400 validation, 404, auth required; and any setup/teardown (e.g. create a saved object then delete it)

## Steps (FTR API — use only when extending existing FTR API tests)

1. **Locate the right FTR config and test layout.** Find the API integration tests for this plugin or area (e.g. under `test/api_integration/` or `x-pack/test/api_integration`). Note the config file (e.g. `config.js`) and how services are loaded.

2. **Create or open the test file** for this endpoint (e.g. `status.ts` or `my_plugin/status.js`). Use the same extension (ts/js) as the surrounding tests.

3. **Use FTR services:** In the test file, get services via the test runner’s API (e.g. `getService('supertest')`, `getService('es')`). Do not hard-code base URLs or ports.

4. **Structure the test:**
   - Top-level `describe('Plugin name or API group', () => { ... })`
   - Nested `describe('Endpoint path or method', () => { ... })`
   - Use `it('returns 200 when ...', async () => { ... })` for each scenario. Use async/await for HTTP calls.

5. **Implement each scenario:**
   - **Success:** Send the request with valid params/body; assert status (e.g. 200) and relevant body fields
   - **Validation/error:** Send invalid input; assert status (e.g. 400) and optionally error message shape
   - **Auth/forbidden:** If the endpoint requires auth, test unauthenticated request and assert 401/403 if that’s the contract
   - Use supertest’s API (e.g. `.get(...).expect(200)`, `.post(...).send(...).expect(400)`)

6. **Setup and cleanup:** If the test creates data (e.g. saved objects, indices), create them in `beforeEach` or at the start of the relevant `it`, and delete or reset in `afterEach` or at the end so runs are repeatable.

## Validation (run these and fix any failures)

1. **Type check:** Run `node scripts/type_check` from repo root. Fix any errors in the new test file.
2. **Lint:** Run `node scripts/eslint_all_files` for the test file. Fix any violations.
3. **Run the FTR API suite:** Execute the API integration suite that includes this test (e.g. `node scripts/functional_tests_server.js` and `node scripts/functional_test_runner.js --config test/api_integration/config.js --grep '...'` or the repo’s documented command). Ensure the new test passes.
4. **Stability:** Run the new test twice (or in a small batch) to reduce the chance of flakiness; fix any intermittent failures.

After validation, report: test file path, scenarios covered, and that type-check, lint, and FTR API run pass.

## If using Scout API instead

- Follow the **scout-api-testing** skill in `.agent/skills/scout-api-testing/SKILL.md`: paths under `test/scout*/api/tests/`, `apiTest.describe`, `requestAuth`/`samlAuth` for auth, `apiClient` for requests, `expect` from `@kbn/scout/api` (or module Scout package), `apiServices` for setup/teardown. Run with `node scripts/scout.js run-tests --stateful --testFiles <path>`.
