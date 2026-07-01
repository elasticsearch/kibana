---
name: prepare-pr
description: Prepare code changes for Kibana CI — run type-check, eslint, i18n, affected tests, and format commit message
---

# Prepare PR for Kibana CI

Use this skill when the user wants to get their changes ready for push or PR (e.g. "prepare for CI", "run pre-push checks", "get this ready for review").

## Inputs

- **Scope (optional)** — specific packages or paths to check; if omitted, run repo-wide checks (or the subset the repo recommends before a full CI run)

## Steps

1. **Type check.** Run the repo’s type-check command (e.g. `node scripts/type_check` from root). If it fails:
   - List the errors and the files/lines
   - Propose or apply fixes (e.g. add missing types, fix imports). Re-run until it passes.

2. **Lint.** Run the repo’s ESLint (e.g. `node scripts/eslint_all_files --no-cache`). If there are fixable issues, run with `--fix` and then re-run to confirm no remaining violations. Fix any unfixable violations manually.

3. **i18n.** Run the repo’s i18n check (e.g. `node scripts/i18n_check` or as documented). Fix any reported issues (e.g. missing translation keys, invalid default messages).

4. **Unit tests.** Run Jest for the affected packages or the paths the user changed (e.g. `yarn test:jest packages/kbn-my-package` or the repo’s affected-test command). Fix any failing tests or code.

5. **FTR (if relevant).** If the user changed server or API code, run the related FTR API tests; if they changed UI, run the related functional tests. Use the repo’s docs for the exact commands and configs. Fix any failures.

6. **Commit message.** Suggest or format a commit message that follows the repo’s conventions (e.g. conventional commits or Kibana format). Include a short subject line and, if needed, a body explaining the change and any follow-ups.

## Validation (run these and fix any failures)

1. **Re-run type check** after any fixes. It must pass.
2. **Re-run lint** after any fixes. It must pass with no violations.
3. **Re-run i18n** after any fixes. It must pass.
4. **Re-run the unit (and if applicable FTR) tests** that were executed in the steps. They must pass.

After validation, report to the user: (1) all checks that were run and their status (passed), (2) any fixes that were applied, (3) suggested commit message, and (4) reminder that on draft PRs they may need to comment `/ci` to trigger CI.
