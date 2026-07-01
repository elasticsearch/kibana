---
name: debug-server
description: Systematically debug Kibana server-side issues — stack trace, locate code, analyze cause, suggest fix
---

# Debug server-side Kibana issue

Use this skill when the user reports a server error, failed request, or stack trace from Kibana (e.g. "this route returns 500", "error when starting plugin", "stack trace from logs").

## Inputs

- **Error message or stack trace** — from logs, browser dev tools, or CI
- **Context (optional)** — what action triggered it (e.g. "calling POST /api/foo", "loading Security app")

## Steps

1. **Identify plugin and module from the stack trace.** Look for paths like `x-pack/plugins/...`, `src/plugins/...`, or `packages/...`. The top frames usually point to the throwing code; frames below show the call chain. Note the **file path** and **line number** of the throw and the first few callers.

2. **Locate the source code.** In the repo, open the file and line from the stack trace. Read the surrounding function and the call sites (call stack) to understand control flow. Check for: missing null/undefined checks, wrong argument types, async/await misuse, or missing error handling (e.g. unhandled rejection).

3. **Classify the cause.** Common categories:
   - **Contract/schema** — Request body or response doesn’t match the expected shape; fix validation or types.
   - **Missing dependency** — A required plugin or service isn’t available in the context; fix plugin dependencies or optional handling.
   - **Resource** — Missing or invalid saved object, index, or config; fix the data or add a guard.
   - **Async/order** — Operation used before it’s ready or race condition; fix lifecycle or await.
   - **Permission/auth** — Insufficient privileges or unauthenticated request; fix auth check or return 401/403 with a clear message.
   - **Configuration** — Wrong env, missing config, or feature flag; document or fix config.

4. **Suggest a concrete fix.** Propose a code change: add a null check, fix the type, add try/catch and return a proper HTTP status, fix the async flow, or return a clear error message. Prefer fixing the root cause over masking the error. If the error message is unclear, suggest improving it so future failures are easier to debug.

5. **Optionally suggest a test.** If the failure is reproducible, suggest a unit test or FTR API test that would have caught it (e.g. invalid input, missing dependency).

## Validation (run these after applying the fix)

1. **Type check:** Run `node scripts/type_check`. Fix any new type errors.
2. **Lint:** Run `node scripts/eslint_all_files` for the changed file(s).
3. **Re-run the scenario** — Reproduce the original action (e.g. call the endpoint, load the app) and confirm the error is resolved or replaced by a correct response or a clearer error.

After validation, report: cause category, file and change made, and that the scenario now passes or fails with an expected error.
