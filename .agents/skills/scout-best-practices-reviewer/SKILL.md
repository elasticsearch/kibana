---
name: scout-best-practices-reviewer
description: Review Scout UI/API tests (including Scout test migrations) for best practices, reuse, and parity.
---

# Scout Best Practices Reviewer

## Overview

Perform a static PR review of Scout UI and API test files (`*.spec.ts`) against Scout best practices and existing Scout abstractions (fixtures, page objects, API helpers). Produce actionable, PR-review-ready feedback that pushes for reuse over one-off implementations.

**Solution-specific skills may extend this skill** with additional review criteria. Check if one exists for your solution (e.g., Security Solution has one at `<plugin>/.agents/skills/scout-best-practices-reviewer/`). Run the general review first, then apply solution-specific checks.

Important: Do not post GitHub comments unless explicitly stated.

### Inputs

1. Changed `*.spec.ts` files (and imported helpers/fixtures).
   - UI Tests: Use `test` / `spaceTest` (usually in `**/test/scout/ui/**`).
   - API Tests: Use `apiTest` (usually in `**/test/scout/api/**`).
2. Neighboring Scout code in the same plugin/solution (existing specs + `test/scout/**/fixtures/**`) to spot reuse opportunities and avoid duplicating helpers.
3. Removed/previous tests (if this is a migration) to verify behavior parity.
4. Scout docs (open only what you need — best practices are split by test type so you can skip the irrelevant half):

   - **General best practices** (always relevant): `docs/extend/scout/best-practices.md`
   - **UI-only best practices** (open when reviewing UI tests): `docs/extend/scout/ui-best-practices.md`
   - **API-only best practices** (open when reviewing API tests): `docs/extend/scout/api-best-practices.md`
   - Core concepts & fixtures: `docs/extend/scout/core-concepts.md`, `docs/extend/scout/fixtures.md`
   - Reuse surfaces: `docs/extend/scout/page-objects.md`, `docs/extend/scout/api-services.md`
   - Type-specific guides: `docs/extend/scout/write-ui-tests.md`, `docs/extend/scout/write-api-tests.md`
   - As needed: `docs/extend/scout/api-auth.md`, `docs/extend/scout/browser-auth.md`, `docs/extend/scout/parallelism.md`, `docs/extend/scout/deployment-tags.md`, `docs/extend/scout/a11y-checks.md`, `docs/extend/scout/debugging.md`, `docs/extend/scout/run-tests.md`

   **Rule of thumb:** always read the general best practices, then open **only** the UI-specific file for UI reviews or the API-specific file for API reviews. If a PR mixes UI and API specs, open both.

## Scope (be comprehensive)

- Don’t limit the review to the diff. Look for duplication and missed reuse by scanning:
  - existing Scout specs in the same area (and similar suites elsewhere in the repo)
  - available fixtures (`docs/extend/scout/fixtures.md` + local `test/scout/**/fixtures`)
  - existing page objects, API services, and fixtures (in `@kbn/scout`, solution Scout packages, and plugin-local `test/scout/**`) before suggesting brand-new helpers

### Quick checklist

Checklist items are tagged with the document they're detailed in:

- **[general]** → `docs/extend/scout/best-practices.md` (applies to both UI and API tests)
- **[ui]** → `docs/extend/scout/ui-best-practices.md`
- **[api]** → `docs/extend/scout/api-best-practices.md`

Open only the docs relevant to the test type(s) under review.

- **[general]** **Reuse-first**: prefer existing `pageObjects`, fixtures, and `apiServices`; if adding helpers/page objects, place them in the right scope (plugin vs solution vs `@kbn/scout`) and register via fixtures.
- **[general]** **No unused constants**: flag constants that are unused or used in only one place — prefer inlining them.
- **[api]** **Fixture boundaries**: `apiClient` for the endpoint under test; `apiServices`/`kbnClient` for setup/teardown only; correct auth + common headers.
- **[api]** **Correctness**: guardrail assertions before dereferencing response fields; validate contract + side effects; stable error assertions.
- **[ui]** **UI scope**: UI tests should focus on user interactions and rendering; avoid “data correctness” assertions (for example exact API response shapes or exact table cell values) unless the UI behavior depends on them. Prefer Scout API tests (or unit/integration) for data correctness coverage.
- **[general]** **Isolation**: parallel-safe data and resilient cleanup in hooks; no reliance on file ordering or shared mutable state.
- **[general]** **RBAC / realism**: minimal permissions (avoid `admin` unless required); space-aware behavior covered or explicitly out of scope.
- **[ui]** **Flake traps**: avoid `waitForTimeout()` and time-based assertions/retries; rely on auto-waiting + explicit readiness signals. Some locators are restricted by `@kbn/eslint/scout_no_locators` (e.g. `globalLoadingIndicator`).
- **[general]** **Cost**: avoid repeating expensive setup; consider a global setup hook for shared one-time operations.
- **[general]** **Global teardown** (when `global.teardown.ts` is present): cleanup must use `esClient`/`kbnClient`/`apiServices`. `esArchiver` isn't on the teardown fixture surface — Scout intentionally never exposed archive-unloading (slow and unnecessary; leftover indexes don't break tests with idempotent `loadIfNeeded`). Flag teardowns that try to use `esArchiver` at all, that **load** new data (teardown is for state reset only), or that duplicate work belonging in `afterAll`/per-test cleanup.
- **[general]** **Tags / environment**: validate deployment tags and avoid assumptions that only hold in specific environments.

### Files to skip

Do not review or comment on:

- **`.meta` manifest files** (e.g., `**/.meta/**/*.json`): these are auto-generated for CI test planning and lane distribution. No manual regeneration is needed.

### Severity classification

Use these definitions when assigning severity:

- **Blocker**: Will cause test failures, breaks CI, missing required coverage (migration parity gaps), security or data leak risks
- **Major**: Likely to cause flakiness, incorrect test coverage, permission/auth errors, violates core best practices in ways that affect correctness
- **Minor**: Suboptimal patterns, missed reuse opportunities, efficiency improvements, style inconsistencies that don't affect correctness
- **Nit**: Cosmetic issues, naming suggestions, optional improvements, "nice to have" changes

When in doubt, prefer a lower severity. Optimization suggestions (efficiency improvements) should be `minor` or `nit`, not `major`.

### Migration parity analysis (required when migration is detected)

- **Detect migration** when the PR removes/changes FTR tests (for example `test/functional/**`, `loadTestFile()`, FTR configs) alongside new/changed Scout specs.
- **If migration is detected**:
  - Treat parity gaps as `blocker` unless explicitly de-scoped.
  - Confirm the suite is the right **test type** (UI vs API): if the old FTR suite is primarily “data correctness”, prefer migrating it to a Scout API test (or unit/integration) rather than a Scout UI test.
  - Build a parity map from old scenarios → new Scout coverage (roles, setup/teardown, assertions, cleanup).
  - Call out missing behaviors (including error paths) and recommend exactly where to add coverage.
  - Escalate meaningful **Scout vs FTR deltas** when they could change what’s actually being tested, weaken coverage, or increase flake risk. Treat these as parity issues that require action (code change or explicit de-scope/sign-off), and include them in the “Migration parity” output section.
    - auth/roles used (e.g., `admin` vs viewer), spaces behavior, and permission realism
    - headers/internal origin/REST versioning and any other request shaping differences
    - retries and error handling differences (e.g., helper methods with `ignoreErrors`, automatic retries)
    - parallelism/isolation differences (worker-scoped fixtures, shared state, cleanup semantics)
    - classic vs serverless coverage changes (suite removed from one environment but not the other)
    - assertion strength changes (weaker/stronger checks, removal of side-effect validation)
  - Verify suite wiring/discovery (new specs are picked up by Scout/Playwright config; no orphaned `loadTestFile()`).
  - Ensure any intentional de-scopes are explicit, and that tags/permissions remain equivalent and cloud/serverless compatible where applicable.
- **Output**: include the “Migration parity” section only when action is required; otherwise omit it.

## Output

This skill does not prescribe an output format. The caller decides how findings are reported:

- **Automation (macroscope, Bugbot, CI bots, etc.)**: follow the output instructions provided by the calling config.
- **Local / direct invocation**: use the default format in [`OUTPUT.md`](./OUTPUT.md).

## Follow-up

Offer to generate the updated code, fully incorporating the suggested improvements and resolving any parity gaps.
