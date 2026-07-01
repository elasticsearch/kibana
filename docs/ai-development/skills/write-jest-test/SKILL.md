---
name: write-jest-test
description: Generate a Jest unit test for a Kibana module with proper imports, mocks, describe/it structure, and assertions
---

# Write Jest test for a Kibana module

Use this skill when the user wants a unit test for a specific module, class, or function (e.g. "write a jest test for X" or "add tests for the Y module").

## Inputs

- **Target module** — file path or module name (e.g. `src/plugins/my_plugin/server/lib/calculator.ts` or "the route handler for /status")
- **Scope (optional)** — specific functions or behaviors to cover; if omitted, cover the main exported behavior and important edge cases

## Steps

1. **Read the target module.** Identify exported functions, classes, or hooks and their inputs/outputs. Note any dependencies (other modules, core services) that should be mocked.

2. **Choose test file location.** Place the test next to the module (e.g. `calculator.test.ts` beside `calculator.ts`) or in a `__tests__` directory, matching the package’s existing convention.

3. **Set up the test file:**
   - Use `describe('ModuleOrFileName', () => { ... })` for the top-level block
   - Use `describe('functionOrBehavior', () => { ... })` for logical groups
   - Use `it('does something specific', () => { ... })` for each case; descriptions should be clear and start with a verb

4. **Mock dependencies:**
   - Use `jest.mock('...')` for modules the target imports
   - Use `jest.spyOn()` when you need to restore or assert on calls
   - Follow existing patterns in the same package for mocking `@kbn/` and core (e.g. `core.savedObjects.getScopedClient`)

5. **Write tests:**
   - Happy path: typical inputs, assert expected return value or side effects
   - Edge cases: empty input, invalid input, error paths
   - Use `beforeEach` for common setup and clear mocks to avoid leakage between tests

6. **Assert:** Use `expect(...).toEqual(...)`, `expect(...).toHaveBeenCalledWith(...)`, etc. Prefer explicit assertions over large snapshots unless the repo relies on snapshots for this code.

## Validation (run these and fix any failures)

1. **Type check:** Run `node scripts/type_check` from repo root. Fix any type errors in the new test file.
2. **Lint:** Run `node scripts/eslint_all_files` for the test file. Fix any violations.
3. **Run the test:** Execute Jest for this test file (e.g. `yarn test:jest path/to/module.test.ts`). Ensure all tests pass.
4. **Coverage (if required):** If the repo enforces coverage, run coverage for the package and confirm the new test does not lower coverage for the target module.

After validation, report: test file path, number of test cases, and that type-check, lint, and Jest all pass.
