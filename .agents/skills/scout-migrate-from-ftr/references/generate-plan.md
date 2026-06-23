# Migration planning

Detailed step-by-step instructions for the **Plan** step of the parent skill ([`SKILL.md`](../SKILL.md)). Produce a single Markdown file capturing every architectural decision the executor needs.

The plan answers _what_ and _why_; [`execute-plan.md`](execute-plan.md) answers _how_.

## Required sub-skill

- **REQUIRED SUB-SKILL:** ftr-testing — to understand FTR structure, `loadTestFile`, configs, services, and page objects while analyzing the source suite.

## Inputs

Before starting, collect or confirm:

1. **FTR directory path**: the root of the FTR suite(s) to analyze (e.g. `x-pack/platform/test/functional/apps/dashboard`).
2. **FTR config path(s)**: the config file(s) that wire these tests (e.g. `x-pack/platform/test/functional/config.base.ts`). Walk up from the test directory if not provided.
3. **Target Scout module root**: where the Scout tests will live (e.g. `x-pack/platform/plugins/shared/dashboard`). If unknown, infer from the plugin that owns the FTR tests.
4. **Deployment targets**: stateful, serverless, or both. Default: both.

## Output filename convention

Write the plan to `migration-plan-<source-dir-slug>-<YYYY-MM-DD>.md` in the target Scout module root, where `<source-dir-slug>` is the basename of the FTR source directory and the date is the day the plan was generated. Examples:

- FTR source `x-pack/platform/test/functional/apps/painless_lab` → `migration-plan-painless_lab-2026-05-06.md`
- FTR source `x-pack/solutions/observability/test/api_integration/apm` → `migration-plan-apm-2026-05-06.md`

The shared `migration-plan-` prefix makes plans easy to identify and group; the source-dir slug + date together prevent collisions across multiple migrations under the same plugin while still allowing intentional re-runs on the same source/day to overwrite cleanly.

## Approach

Go deep on FTR analysis (read every file, understand every pattern, flag every issue). Stay at the decision level for Scout — the executor step already knows Scout's APIs, fixtures, and patterns. The planner's job is to say _what_ was found and _what_ should happen, not _how_ to implement it in Scout code.

## Steps

### 1. Deep-read and index every FTR file

Recursively read the FTR directory. For each file, record:

- File path (relative to repo root)
- Type: `index` (has `loadTestFile`), `test` (has `describe`/`it`), `config`, `page_object`, `service`, `helper`, `archive`, or `fixture`
- Short description (one sentence: what does this file test or provide?)
- Number of `it(...)` / `describe(...)` blocks

Also read thoroughly:

- The FTR config(s): capture every `kbnTestServer.serverArgs`, `esTestCluster.serverArgs`, `security.roles`, `security.defaultRoles`, `apps`, `testFiles`, and any `services`/`pageObjects` registrations. Note config inheritance chains (which base config does it extend?).
- Every `index.ts` file that uses `loadTestFile`: capture shared `before`/`after` hooks and their setup logic. Note what state they create and whether downstream tests depend on it.
- Every FTR service and page object referenced: note which files use them, what they do, and whether they contain hidden assertions (`existOrFail`, `missingOrFail`, `expect` inside helpers).

### 2. Triage (what should exist, what should change)

For every test file, decide UI test / API test / unit test (RTL/Jest) / drop / defer using the criteria in [`pick-correct-test-type.md`](pick-correct-test-type.md). For each decision, write a one-line justification.

**File splitting**: when a single FTR file tests multiple roles or unrelated flows, recommend splitting it into separate specs (one role + one flow per file). List the proposed splits.

### 3. Complexity estimation

Rate each test file:

- **Simple**: single describe, ≤5 `it` blocks, no custom roles, no archives, straightforward page objects
- **Medium**: multiple describes or >5 `it` blocks, custom roles, archive loading, moderate page object usage
- **Complex**: custom server args, multi-step journeys with shared state, custom services, non-trivial data setup, FTR config overrides

Sort the full inventory by complexity (simple first).

### 4. Parallelism and isolation

For each test (or group), decide whether it can run in parallel or must run sequentially:

- **Parallel-safe**: all state is scoped to a Kibana space (saved objects, UI settings, index patterns), no global mutations, can share pre-ingested ES data
- **Must be sequential**: needs clean cluster state, mutates global settings, writes to shared indices, or modifies cluster-level resources (ILM policies, transforms, etc.)

Document which tests can share the same parallel pool and which need isolation. Explain why, referencing the specific state or mutation that drives the decision.

### 5. Test data and setup strategy

For each archive, data fixture, or setup pattern found:

1. **Inventory every archive**: path, what it contains (ES indices, Kibana saved objects, their sizes), and which test files use it
2. **Flag underused archives**: loaded by the suite but consumed by ≤1 test (candidates for removal or replacement with programmatic setup)
3. **Classify setup timing**: can data be loaded once (shared across all tests) or does each test need fresh data?
4. **Flag fresh-server tests**: tests that require a completely clean ES/Kibana state (candidates for a dedicated server config)
5. **Catalog UI settings mutations**: list every `kibanaServer.uiSettings.replace`, `uiSettings.update`, `uiSettings.delete` call, which tests use them, and whether they use replace-all semantics (wipes all settings) vs selective set
6. **Catalog repeated magic values**: archive paths, index names, time ranges, saved object IDs that appear in multiple files. Be conservative: only propose a constant when the value is genuinely reused and extracting it removes real duplication; prefer inline otherwise. Avoid proposing constants for deployment tags unless the same tag set is reused across multiple suites.

### 6. Auth and roles

1. **Catalog every role**: list every FTR role from configs and test files, with the full privilege definition (ES cluster/index privileges, Kibana feature/space privileges)
2. **Note usage frequency**: how many test files use each role
3. **Flag over-privileged tests**: tests that run as `superuser` or the FTR default role when a narrower role would suffice. For each, note what privileges the test actually exercises
4. **Recommend a target Scout role**: for each role, recommend the least-privileged Cloud-compatible built-in role (`viewer` → privileged/`editor` → `admin`) unless the test specifically validates permission-scoped behavior (e.g. a user limited to index X can see Y but not Z) that no built-in role expresses — only then keep a custom role. Many FTR suites scoped custom roles needlessly; flag those as candidates for a default role rather than a 1:1 custom-role port.
5. **Flag roles used widely** (≥3 files): these warrant a shared auth helper rather than inline definitions
6. **Flag special auth patterns**: `run_as`, API-key-based auth, certificate auth, or any non-standard FTR auth

The execution step picks the specific Scout auth method (`loginAsViewer`, `loginWithCustomRole`, etc.); the plan provides the role inventory, privilege definitions, usage context, and the default-vs-custom recommendation.

### 7. Reusability and abstraction audit

1. **Catalog every FTR service and page object** used by the tests: name, what it does, which files use it, and whether it contains hidden assertions (`existOrFail`, `missingOrFail`, or `expect` calls that should move to specs)
2. **Check for existing Scout equivalents**: does a matching page object or API service already exist in the Scout packages or in other plugins' `test/scout` trees? Note: exists / exists-but-in-wrong-scope / missing
3. **For missing equivalents**, recommend scope (shared Scout package vs solution-scoped vs plugin-local) based on how many plugins would benefit
4. **Catalog EUI component interactions**: list every EUI component the tests interact with directly (combo boxes, data grids, selectable lists, etc.) so the executor knows where to use Scout's EUI wrappers
5. **Flag brittle locator strategies**: `find.byCssSelector(...)`, `find.byClassName(...)`, or text-based lookups. Note where `data-test-subj` attributes are missing in source code and need to be added
6. **Flag FTR page objects with hidden assertions**: these need restructuring since page objects should return state, with assertions belonging in the spec

### 8. Server configuration and feature flags

**Prefer Scout's default servers config.** It mirrors the Elastic Cloud (MKI/ECH) setup and is batched with other default-config suites in CI, so tests that pass locally on it are likely to pass on Cloud. A custom server config set runs only in local pipelines (no Cloud) and adds CI cost — treat it as a last resort, used only when a setting must be present at Kibana boot (e.g. registering HTTP routes at plugin `setup`). See [Can your tests reuse Scout's default servers config?](../../../../docs/extend/scout/migrate-tests.md#dont-migrate-blindly).

1. **List every server arg** from `kbnTestServer.serverArgs` and `esTestCluster.serverArgs` across all relevant configs (including inherited base configs)
2. **Classify each arg**:
   - **Already in Scout's default server config**: no action needed
   - **Runtime-settable** (can be changed via API/UI settings without restarting servers): note which API or setting key. Most FTR server args land here — map them to `apiServices.core.settings()` runtime feature flags, the `uiSettings` fixture, or data ingestion rather than a custom config
   - **Requires a custom server config set**: only when the arg must apply at Kibana boot. Check if a matching one already exists under `src/platform/packages/shared/kbn-scout/src/servers/configs/config_sets/`
3. **Flag experimental feature flags** and note whether they're compile-time or runtime-settable

### 9. Deployment targets and Cloud portability

Scout is deployment-agnostic — the goal is "write once, run locally and on Elastic Cloud." Reference [Design tests with a cloud-first mindset](../../../../docs/extend/scout/best-practices.md#design-tests-with-a-cloud-first-mindset) for the underlying principles.

For each test group, answer all four:

1. **Where do the FTR tests run today?** Cross-reference existing FTR tags (`@skipServerless`, `@skipStateful`, etc.) and `.buildkite/ftr-manifests/ftr_*_configs.yml` so CI coverage is preserved.
2. **Where should they ideally run in Scout?**
   - **Platform tests** (`src/platform/**`, `x-pack/platform/**`): use `tags.deploymentAgnostic` when the original intent was "run everywhere."
   - **Solution tests** (`x-pack/solutions/observability|security|search/...`): use explicit `tags.stateful.*` + `tags.serverless.<solution>.*` rather than `tags.deploymentAgnostic`.
   - Flag tests that currently run in only one environment but could run in both.
3. **Can they run on Cloud out-of-the-box?** Flag any blockers:
   - Hardcoded `localhost` URLs or local file paths
   - Node topology assumptions (single-node, specific port)
   - Cluster settings unavailable on Elastic Cloud
   - Custom server args / feature flags set in FTR configs (these need to become runtime settings or move to a Scout server config set)
4. **Custom servers config or default?** Default to Scout's default test servers config (see step 8 for why); only call for a [custom servers config](../../../../docs/extend/scout/feature-flags.md#scout-feature-flags-custom-servers) when a server arg must apply at Kibana boot. If custom, list which args force the choice and whether a matching config set already exists.

### 10. FTR test smells

Scan every test file for patterns that need attention during migration:

| Smell | What to flag |
|-------|-------------|
| **try/catch swallowing errors** | `try { ... } catch { }` or catch blocks that don't rethrow |
| **Conditional test logic** | `if/else` inside `it()` blocks that change assertions based on runtime state |
| **Global loading indicator waits** | `waitForSelector('globalLoadingIndicator')` or similar global spinners |
| **Hardcoded timeouts** | `await new Promise(r => setTimeout(r, ...))`, `browser.sleep(...)` |
| **Shared mutable state** | Variables mutated across `it()` blocks relying on execution order |
| **Sequential journey as separate `it` blocks** | Multiple `it()` blocks that form a single user journey (shared browser state) |
| **Duplicate test cases** | Multiple `it()` blocks testing the same behavior with minor variations |
| **Missing cleanup** | Setup in `before`/`beforeEach` without corresponding teardown |
| **Retry wrappers** | `retry.try(...)`, `retry.waitFor(...)` around assertions |
| **UI-based setup/teardown** | `before`/`after` hooks that navigate pages or click through UI to create/delete test data instead of using APIs |
| **Onboarding/tour dismissals** | `browser.setLocalStorageItem(...)`, manual tour-dismiss clicks, getting-started bypasses |
| **Brittle CSS selectors** | `find.byCssSelector(...)`, `find.byClassName(...)`, text-based lookups without `data-test-subj` |
| **Over-privileged execution** | Tests running as `superuser` that don't need elevated privileges |

For each smell, note the file and relevant context.

### 11. Propose migration batches

Group tests into ordered batches that can be migrated independently:

1. **Batch 1**: simplest tests, no new abstractions needed, all dependencies already exist
2. **Batch 2**: medium tests, may need new page objects or auth helpers (which batch 1 didn't require)
3. **Batch N**: complex tests, require new server config sets or depend on Scout capabilities that don't exist yet

For each batch:

- List the files included
- Human involvement: `autopilot` (executor can handle end-to-end), `guided` (needs a few human decisions or source code changes), or `hands-on` (significant manual work or missing infrastructure)
- Dependencies on previous batches (e.g. "needs the page object created in batch 2")
- Any blockers (missing Scout features, missing `data-test-subj` in source code)

### 12. Write the migration plan

Output the plan to `migration-plan-<source-dir-slug>-<YYYY-MM-DD>.md` (see **Output filename convention** above) in the target Scout module root. Follow [`plan-template.md`](plan-template.md) exactly for section structure, table formats, and bullet styles so the executor and any reviewers can parse sections programmatically.

## Guardrails

- **Read-only**: do not create, modify, or delete any test files during planning.
- **Deep on FTR, light on Scout**: every FTR finding must reference concrete file paths and line numbers. Scout recommendations stay at the decision level; the executor knows the APIs.
- **No guessing**: if you can't determine something (e.g. whether a feature flag is runtime-settable), flag it as `NEEDS VERIFICATION` rather than guessing.
- **Preserve intent**: when recommending dropping or converting a test, explain what coverage is lost and where it moves.

## References

- Plan output structure (every section, table, and bullet format): [`plan-template.md`](plan-template.md)
- Test-type downgrade catalog (UI vs API vs RTL/Jest): [`pick-correct-test-type.md`](pick-correct-test-type.md)
- Cloud-first mindset (rationale for step 9): [`docs/extend/scout/best-practices.md#design-tests-with-a-cloud-first-mindset`](../../../../docs/extend/scout/best-practices.md#design-tests-with-a-cloud-first-mindset)
