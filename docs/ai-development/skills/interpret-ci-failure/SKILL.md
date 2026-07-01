---
name: interpret-ci-failure
description: Parse CI failure output, identify root cause (type, lint, test, bundle), and suggest a fix
---

# Interpret Kibana CI failure and suggest fix

Use this skill when the user shares a **CI failure** (Buildkite, GitHub Actions, or local run of CI scripts) and wants to understand the cause and how to fix it.

## Inputs

- **Failure output** — log snippet, error message, or stack trace from the failing job (type check, lint, Jest, FTR, bundle, i18n, etc.)
- **Branch/PR context (optional)** — what changed recently so fixes can target the right area

## Steps

1. **Classify the failure.** From the log, determine which check failed:
   - **Type check** — Look for "Type error", "TS2xxx", or `node scripts/type_check` in the log. The message usually includes file path and line.
   - **Lint (ESLint)** — Look for "error" or "warning" with a rule name and file:line. Note the rule id (e.g. `@typescript-eslint/...`) and the message.
   - **Jest** — Look for "FAIL" and the test file, describe/it title, and assertion message (e.g. "Expected X to equal Y").
   - **FTR (API or functional)** — Look for failing test name, "AssertionError", or timeout. Note the config and test file.
   - **i18n** — Look for missing translation key or invalid default message and the referenced file.
   - **Bundle size** — Look for "bundle size" or "limit exceeded" and the package or chunk name.

2. **Extract location.** From the failure message, get the **file path** (relative to repo root) and **line number** (and column if present). For tests, also note the test name and the assertion that failed.

3. **Infer root cause.**
   - **Type error:** Missing or wrong type (e.g. property doesn’t exist, wrong argument type). Suggest adding/correcting the type or fixing the value.
   - **Lint:** Rule violation (e.g. unused var, missing return type, import order). Suggest the code change that satisfies the rule (or a targeted disable with a comment if justified).
   - **Jest:** Assertion or setup wrong (e.g. expected value, mock not applied). Suggest correcting the test or the implementation so behavior and test align.
   - **FTR:** Flakiness (timeout, element not found), wrong assertion, or missing fixture. Suggest adding a wait, fixing the selector (e.g. data-test-subj), or correcting the assertion/fixture.
   - **i18n:** Missing key or invalid default. Suggest adding the key to the JSON or fixing the default message.
   - **Bundle size:** New or growing dependency or chunk. Suggest code-splitting, lazy load, or removing unused code to get under the limit.

4. **Suggest a concrete fix.** Provide a short, actionable change: "In file X at line Y, do Z." Include a code snippet or diff when helpful. Prefer fixing the root cause over disabling the check.

5. **Remind about re-triggering CI.** If the fix is pushed to a draft PR, remind the user that they may need to comment `/ci` to re-run the pipeline.

## Validation (after the user applies the fix)

- The same CI check that failed should be run again (locally or via CI). It should pass. If a different error appears, repeat the steps for the new failure.

After interpretation, report: (1) failure type and location, (2) root cause in one sentence, (3) suggested fix with file/line and code, (4) reminder to re-run the check or re-trigger CI.
