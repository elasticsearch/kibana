---
name: ci-preflight
description: Run the same checks CI will run locally — type-check, eslint, i18n, and relevant test suites
---

# Run CI preflight checks locally

Use this skill when the user wants to run the **same** checks that Kibana CI runs, locally, before pushing (e.g. "run what CI runs", "preflight check", "validate like CI").

## Inputs

- **Scope (optional)** — specific packages or paths; if omitted, run the full set of checks that CI runs (or the subset documented in the repo for "full CI locally").

## Steps

1. **Type check.** Run the repo’s type-check command (e.g. `node scripts/type_check` from root). Do not push if it fails. Fix type errors and re-run until it passes.

2. **Lint.** Run the repo’s ESLint (e.g. `node scripts/eslint_all_files --no-cache`). If the repo supports `--fix`, run it and then re-run without fix to confirm no remaining violations. Fix any remaining issues.

3. **i18n.** Run the repo’s i18n check (e.g. `node scripts/i18n_check` or as in the repo docs). Fix any reported problems (missing keys, invalid default messages).

4. **Unit tests.** Run Jest for the scope the user cares about. For "full CI" locally, run the same Jest scope CI runs (e.g. all packages or affected packages). Use the repo’s script (e.g. `yarn test:jest` or `node scripts/jest`) and any `--filter`/`--select` options documented for CI. Fix failing tests.

5. **FTR API tests (if in scope).** If the change touches server or API code, run the FTR API test suite (or the subset that covers the changed area). Use the repo’s commands (e.g. start FTR server, then run functional_test_runner with the API config). Fix failures.

6. **FTR functional tests (if in scope).** If the change touches UI or user flows, run the relevant FTR functional suite. Same as above: use the repo’s config and grep/filter for the affected app. Fix failures.

7. **Bundle size (if applicable).** If the repo’s CI runs bundle size checks, run the same script locally and fix any over-limit bundles.

Document the commands used (or point to the repo’s "run CI locally" doc) so the user can re-run the same set.

## Validation

- All commands from steps 1–7 that were run must complete successfully. Re-run any step that failed after applying fixes until it passes.

After validation, report: list of checks run and their status (all passed), and the exact commands so the user can repeat the preflight.
