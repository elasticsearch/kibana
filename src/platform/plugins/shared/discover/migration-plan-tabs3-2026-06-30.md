# FTR to Scout Migration Plan

| Field              | Value                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source             | `src/platform/test/functional/apps/discover/tabs3`                                                                                                  |
| Target module root | `src/platform/plugins/shared/discover`                                                                                                              |
| Generated          | `2026-06-30`                                                                                                                                        |
| Deployment targets | `stateful`                                                                                                                                          |
| FTR config chain   | `src/platform/test/functional/apps/discover/tabs3/config.ts` > `src/platform/test/functional/config.base.js` > `src/platform/test/common/config.js` |

---

## 1. Test inventory

Sorted by estimated complexity (simple to complex).

| #   | FTR file (relative)                                                | Type   | Description                                                                                                                                     | `it` count | Complexity | Decision | Justification                                                                                                                        |
| --- | ------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `src/platform/test/functional/apps/discover/tabs3/config.ts`       | config | Reuses the platform functional config and points `testFiles` at the local `index.ts` suite.                                                     | -          | -          | split    | Keep the remaining config only until all `tabs3` FTR files are migrated; remove `_tab_preview` from `loadTestFile` during execution. |
| 2   | `src/platform/test/functional/apps/discover/tabs3/index.ts`        | index  | Shared Discover tabs setup: viewport, roles, Discover saved objects, logstash and other ES archives, default data view, and default time range. | -          | medium     | split    | Shared setup currently applies to both `_tab_preview` and `_time_range`; port only the subset needed by `_tab_preview`.              |
| 3   | `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` | test   | Builds four tabs, verifies preview title/query/label before and after refresh and after saving/loading a Discover session.                      | 1          | medium     | UI test  | This is a real user-flow test for hover preview rendering and saved Discover session restoration.                                    |
| 4   | `src/platform/test/functional/apps/discover/tabs3/_time_range.ts`  | test   | Verifies tab time-range persistence with store-time-range disabled/enabled.                                                                     | 2          | complex    | defer    | Out of scope for this request; keep FTR coverage and its `loadTestFile` entry.                                                       |

### Proposed file splits (omit if none)

Files that test multiple roles or unrelated flows and should become separate specs:

- `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` is one sequential journey, but the closed PR `274176` showed a cleaner Scout shape by splitting the journey checkpoints into three independent Scout tests in one spec:
  - `should show the correct content`: build four tabs and assert preview content immediately.
  - `should preserve content after refresh`: build four tabs, reload the page, then assert preview content.
  - `should preserve content after saving and loading`: build four tabs, save the session, start a new search, load the saved session, then assert preview content.
- Keep these in one Scout spec because they share the same tab-building helper and expected preview data, but each test should build its own state.
- After this Scout spec is migrated and passing, remove `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` and remove only its `loadTestFile(require.resolve('./_tab_preview'))` entry from `src/platform/test/functional/apps/discover/tabs3/index.ts`.

### Tests to defer (omit if empty)

- `src/platform/test/functional/apps/discover/tabs3/_time_range.ts`: not requested in this batch; keep existing FTR coverage until migrated separately.

---

## 2. Test type routing

### UI tests

| FTR file                                                           | Proposed spec path                                                   | Key flows covered                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` | `test/scout/ui/parallel_tests/core/unified_tabs/tab_preview.spec.ts` | Rename tab labels, create KQL/data-view/ES | QL tabs, read tab-preview title/query/label, verify after refresh, verify after save/load. |

### API tests

| FTR file | Proposed spec path | Why API not UI |
| -------- | ------------------ | -------------- |

### Unit tests (RTL/Jest)

| FTR file | Component under test | Proposed test path | What to test |
| -------- | -------------------- | ------------------ | ------------ |

---

## 3. Parallelism plan

### Parallel-safe (can be space-isolated)

| Proposed spec                                                        | Why parallel-safe                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/scout/ui/parallel_tests/core/unified_tabs/tab_preview.spec.ts` | Uses space-scoped Discover saved objects and UI settings through `discoverScoutSpace.setupDiscoverDefaults`; creates only a data view/session in the worker space; reads shared pre-ingested `logstash_functional` ES data. |

### Must be sequential

| Proposed spec | Why sequential |
| ------------- | -------------- |

---

## 4. Test data and setup

### Archives inventory

| Archive path                                                                                  | Contents                                                      | Size                | Used by (files)                           | Verdict                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `src/platform/test/functional/fixtures/kbn_archiver/discover`                                 | Discover saved objects, including the `logstash-*` data view. | NEEDS VERIFICATION  | `index.ts:23-25`, `_tab_preview.ts:24-50` | Keep via `discoverScoutSpace.setupDiscoverDefaults`, already used in Scout fixtures. |
| `src/platform/test/functional/fixtures/es_archiver/logstash_functional`                       | `logstash-*` index data used by KQL and ES                    | QL preview content. | NEEDS VERIFICATION                        | `index.ts:26-28`, `_tab_preview.ts:24-50`, `_tab_preview.ts:61-85`                   | Keep; Scout global setup already loads it with `loadIfNeeded`. |
| `src/platform/test/functional/fixtures/es_archiver/index_pattern_without_timefield`           | Data for no-time-field data-view coverage.                    | NEEDS VERIFICATION  | `index.ts:29-31`                          | Not needed by `_tab_preview`; leave for `_time_range` FTR if still required.         |
| `src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights`                | Flights sample data.                                          | NEEDS VERIFICATION  | `index.ts:32-34`                          | Not needed by `_tab_preview`; do not port for this spec.                             |
| `src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_flights_index_pattern` | Flights data view saved object.                               | NEEDS VERIFICATION  | `index.ts:35-37`                          | Not needed by `_tab_preview`; do not port for this spec.                             |

### UI settings mutations

| FTR call                                                          | Semantics                                                            | Files         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- | ------------- |
| `kibanaServer.uiSettings.replace({ defaultIndex: 'logstash-*' })` | Wipes all settings, then sets the default data view.                 | `index.ts:38` |
| `timePicker.setDefaultAbsoluteRangeViaUiSettings()`               | Sets the default Discover time range to cover logstash fixture data. | `index.ts:39` |

Scout target:

- Reuse `discoverScoutSpace.setupDiscoverDefaults`, which loads the Discover saved objects and sets `defaultIndex` plus `timepicker:timeDefaults` in the worker space.
- Reuse `discoverScoutSpace.teardownDiscoverDefaults`, which unsets the UI settings and cleans standard saved objects.

### Shared constants to extract (omit if empty)

| Value                                     | Occurrences                                                             | Current locations                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `'tab preview test'`                      | FTR save/load flow only; closed PR extracted to `DISCOVER_SESSION_NAME` | `_tab_preview.ts:20`, `_tab_preview.ts:101-105`   |
| `'FROM logstash-\*                        | WHERE extension.raw == "png" and bytes > 10000'`                        | ES                                                | QL setup and expected preview query | `_tab_preview.ts:48-50`, `_tab_preview.ts:82-85` |
| Expected preview title/query/label tuples | Repeated before refresh, after refresh, and after save/load             | `_tab_preview.ts:24-51`, `_tab_preview.ts:88-111` |

### Fresh server required (omit if none)

---

## 5. Auth and roles

### Role inventory

| Role name              | Source                                            | Privileges (summary)                                 | Used by (files)                     | Scout role target                    | Notes                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------- | ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kibana_admin`         | `index.ts:22`, inherited from platform FTR config | Broad Kibana admin privileges.                       | `_tab_preview.ts`, `_time_range.ts` | `loginAsViewer()` for `_tab_preview` | FTR used admin broadly, but the Scout migration should start with the least-privileged built-in role and only escalate if the user-run test proves save/data-view creation requires it. |
| `test_logstash_reader` | `index.ts:22`, `config.base.js`                   | ES `read` and `view_index_metadata` for `logstash*`. | `_tab_preview.ts`, `_time_range.ts` | Covered by viewer role expectations  | The migrated tab-preview spec only needs to read the shared logstash data.                                                                                                              |

### Over-privileged tests

Tests running as `superuser` that likely don't need it:

| File                                                               | What it actually exercises                                                      | Suggested minimum privilege                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` | Creates ad hoc data view, edits tab labels, saves and loads a Discover session. | Start with `loginAsViewer()`; escalate only if the user-run Scout test proves data-view creation or session save requires more privileges. |

### Roles deserving shared helpers (used in >=3 files)

### Special auth patterns (omit if none)

---

## 6. Reusability audit

### FTR services and page objects in use

| FTR name                  | What it does                                                                   | Used by (files)                                | Scout equivalent exists?                       | Hidden assertions?               | Recommended scope                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageObjects.discover`    | Waits for Discover loading, switches to ES                                     | QL, saves/loads searches, starts new searches. | `_tab_preview.ts:14`, `_tab_preview.ts:55-106` | yes                              | no                                                                                                                                       | Use existing shared Scout `DiscoverApp`; it already has `writeAndSubmitEsqlQuery`, `saveSearch`, `clickNewSearch`, `loadSavedSearch`, and data-view creation helpers. |
| `PageObjects.unifiedTabs` | Creates tabs, edits labels, opens previews, returns preview title/query/label. | `_tab_preview.ts:14`, `_tab_preview.ts:24-91`  | partial                                        | FTR methods use retry internally | Extend shared Scout `UnifiedTabs` with `editTabLabel` and tab-preview helpers.                                                           |
| `getService('queryBar')`  | Sets and submits KQL query.                                                    | `_tab_preview.ts:15`, `_tab_preview.ts:61-62`  | yes                                            | no                               | Use existing Scout `queryBar.setQuery` plus `discover.submitQuery` or equivalent current local pattern.                                  |
| `getService('esql')`      | Sets and submits ES                                                            | QL editor query.                               | `_tab_preview.ts:16`, `_tab_preview.ts:82-85`  | yes                              | no                                                                                                                                       | Prefer `discover.writeAndSubmitEsqlQuery` so editor setup and submission stay in the Discover page object.                                                            |
| `getService('dataViews')` | Creates an ad hoc data view from the Discover search bar.                      | `_tab_preview.ts:17`, `_tab_preview.ts:69-73`  | yes                                            | no                               | Use `discover.createDataViewFromSearchBar({ name: 'logs', adHoc: true })`; the current helper includes the auto-wildcard validation fix. |
| `getService('browser')`   | Refreshes the page.                                                            | `_tab_preview.ts:18`, `_tab_preview.ts:93`     | yes                                            | no                               | Use Scout `page.reload()` and `discover.waitUntilTabIsLoaded()`.                                                                         |

### EUI components interacted with directly

| Component               | Interaction pattern                                                                 | Files                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Unified tabs            | Click new tab, double-click tab label, fill label input, hover tab to show preview. | `_tab_preview.ts:54-91`, FTR helper `unified_tabs.ts:94-117`, `unified_tabs.ts:165-197`, `unified_tabs.ts:260-299` |
| Data view editor flyout | Create ad hoc data view with auto-wildcard title.                                   | `_tab_preview.ts:69-73`                                                                                            |
| ES                      | QL code editor                                                                      | Set and submit query.                                                                                              | `_tab_preview.ts:80-85` |

### Brittle locator strategies

Locators that need `data-test-subj` added to source code:

| File                                                        | Line    | Current locator                                                     | Target component                                                                                             |
| ----------------------------------------------------------- | ------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/platform/test/functional/page_objects/unified_tabs.ts` | 167-172 | CSS prefix lookup for `unifiedTabs_editTabLabelInput_`              | Existing `data-test-subj` prefix is available; Scout can use a locator with `waitFor({ state: 'visible' })`. |
| `src/platform/test/functional/page_objects/unified_tabs.ts` | 267-295 | CSS prefix lookups for select-tab button and preview content fields | Existing `data-test-subj` prefixes are available; no source addition expected.                               |

### Page objects with hidden assertions

FTR helpers that contain assertions internally (page objects should return state, not assert):

| FTR helper                | Method             | Assertion                                                                    | File:line                                                           |
| ------------------------- | ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `PageObjects.unifiedTabs` | `createNewTab`     | `retry.waitFor` asserts tab count and active index.                          | `src/platform/test/functional/page_objects/unified_tabs.ts:94-104`  |
| `PageObjects.unifiedTabs` | `selectTab`        | `retry.waitFor` asserts selected index.                                      | `src/platform/test/functional/page_objects/unified_tabs.ts:107-117` |
| `PageObjects.unifiedTabs` | `enterNewTabLabel` | `retry.waitFor` asserts label input readiness, empty value, and final label. | `src/platform/test/functional/page_objects/unified_tabs.ts:165-183` |
| `PageObjects.unifiedTabs` | `openTabPreview`   | `retry.waitFor` asserts preview visibility.                                  | `src/platform/test/functional/page_objects/unified_tabs.ts:260-273` |

Execution note:

- Use Playwright/Scout locator waiting (`locator.waitFor({ state: 'visible' })`, `locator.waitFor({ state: 'hidden' })`, click/hover actionability, and spec-level `expect`) rather than manual retry loops.
- Do not copy the closed PR's `expect(...).toPass` wrapper for tab-preview hover. Borrow the helper shape, constants, and test split, but implement preview opening with a direct `tab.hover()` followed by the preview panel `waitFor({ state: 'visible' })`, then validate stability by running the migrated test.

---

## 7. Server configuration

### FTR server args (full chain)

| Arg                                                                                      | Source config                                      | Category                                         | Notes                                                                             |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `--server.port=...`                                                                      | `src/platform/test/common/config.js`               | already in Scout default/local server management | Scout controls test server ports.                                                 |
| `--status.allowAnonymous=true`                                                           | `src/platform/test/common/config.js`               | already in Scout default/local server management | No tab-preview-specific action.                                                   |
| `--elasticsearch.hosts=...`                                                              | `src/platform/test/common/config.js`               | already in Scout default/local server management | No tab-preview-specific action.                                                   |
| `--elasticsearch.username=...` / `--elasticsearch.password=...`                          | `src/platform/test/common/config.js`               | already in Scout default/local server management | No tab-preview-specific action.                                                   |
| `--data.search.aggs.shardDelay.enabled=true`                                             | `src/platform/test/common/config.js`               | NEEDS VERIFICATION                               | Likely inherited broadly; tab-preview does not intentionally test delayed search. |
| `--data.query.timefilter.minRefreshInterval=1000`                                        | `src/platform/test/common/config.js`               | already covered or irrelevant                    | Not required for tab-preview.                                                     |
| `--security.showInsecureClusterWarning=false`                                            | `src/platform/test/common/config.js`               | already covered or irrelevant                    | Not required for tab-preview.                                                     |
| `--telemetry.banner=false`, `--telemetry.optIn=false`, `--telemetry.sendUsageTo=staging` | `src/platform/test/common/config.js`, Scout config | already in Scout default                         | Discover Scout config already disables telemetry opt-in.                          |
| `--server.maxPayload=1679958`                                                            | `src/platform/test/common/config.js`               | irrelevant                                       | Not required for tab-preview.                                                     |
| `--plugin-path=...newsfeed`, `--newsfeed.service.*`                                      | `src/platform/test/common/config.js`               | irrelevant                                       | Not required for tab-preview.                                                     |
| `--plugin-path=...otel_metrics`                                                          | `src/platform/test/common/config.js`               | irrelevant                                       | Not required for tab-preview.                                                     |
| logging appenders/loggers                                                                | `src/platform/test/common/config.js`               | irrelevant                                       | Test logging only.                                                                |

### ES server args

| Arg                             | Source config                                 | Notes                                                                            |
| ------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| `xpack.security.enabled=false`  | `src/platform/test/common/config.js`          | Platform FTR base default; Scout stateful runs with its own security/auth model. |
| `xpack.security.enabled=${...}` | `src/platform/test/functional/config.base.js` | FTR functional base override; Scout handles security via `browserAuth`.          |

### Custom server config needed? (omit if all args are covered)

---

## 8. Deployment targets

| Proposed spec                                                        | Where it should run       | Reasoning                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/scout/ui/parallel_tests/core/unified_tabs/tab_preview.spec.ts` | stateful classic local/CI | Existing FTR config is listed only in platform stateful CI, and current branch convention for Discover tabs migrations is `@local-stateful-classic`. |

### Coverage gaps (omit if none)

- `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` currently runs through `.buildkite/ftr-manifests/ftr_platform_stateful_configs.yml`; this plan preserves stateful coverage only. Serverless/Cloud expansion is out of scope for this branch because existing Discover tabs Scout specs use `@local-stateful-classic`.

### Cloud portability issues (omit if none)

Non-portable assumptions found in FTR tests:

| File                                                        | Line  | Issue                                                                                                                                                             |
| ----------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/platform/test/functional/apps/discover/tabs3/index.ts` | 20-39 | Shared setup relies on local FTR archiver services and role mutation; Scout should replace this with space fixtures and global setup, not a custom server config. |

---

## 9. FTR test smells

| Smell                         | File                                                               | Lines                    | Description                                                                                           | Context                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Sequential journey            | `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` | 23-112                   | One `it` builds tabs, verifies initial state, refreshes, verifies again, saves/loads, verifies again. | Split into independent Scout tests that each build their own tabs and assert one checkpoint.                                     |
| Shared suite setup over-fetch | `src/platform/test/functional/apps/discover/tabs3/index.ts`        | 23-37                    | Loads multiple archives, including data that `_tab_preview` does not use.                             | Port only Discover saved objects and logstash data for this spec.                                                                |
| UI-based setup                | `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` | 54-85                    | Builds all tab states through UI interactions.                                                        | Keep because the flow under test is UI state and preview rendering; do not move to API setup.                                    |
| Retry wrapper                 | `src/platform/test/functional/page_objects/unified_tabs.ts`        | 94-117, 165-183, 260-273 | FTR page object uses `retry.waitFor` around tab creation, label editing, and preview visibility.      | Scout implementation should use locator `waitFor`, Playwright actionability, and spec assertions. No manual retry loops.         |
| Brittle selector              | `src/platform/test/functional/page_objects/unified_tabs.ts`        | 167-172, 267-295         | CSS prefix selectors for tab label input and preview fields.                                          | Existing `data-test-subj` prefixes are stable enough for Scout locators; no source changes expected.                             |
| Over-privileged               | `src/platform/test/functional/apps/discover/tabs3/index.ts`        | 22                       | Uses `kibana_admin` for all loaded suites.                                                            | Use `loginAsViewer()` for the migrated tab-preview spec; escalate only if the user-run Scout test proves the full flow needs it. |
| Missing cleanup               | `src/platform/test/functional/apps/discover/tabs3/index.ts`        | 23-39                    | Shared `before` loads archives/settings without a matching `after` in this file.                      | Scout fixture has teardown for space-scoped settings and saved objects; global ES data is shared and loaded with `loadIfNeeded`. |

---

## 10. Migration batches

### Batch 1: Tab preview Scout port

Simple tests, all dependencies exist or are small extensions to shared page objects.

| #   | Proposed spec                                                        | From FTR file                                                      | Complexity | Notes                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `test/scout/ui/parallel_tests/core/unified_tabs/tab_preview.spec.ts` | `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` | medium     | Borrow the closed PR's three-test split and constants; use clean helper implementation with `waitFor`, not `expect.toPass` or loops; delete the migrated FTR file and its `loadTestFile` entry after the Scout test passes. |

- **Human involvement**: `autopilot` after approval.
- **Dependencies**: add shared `UnifiedTabs` page-object helpers for `editTabLabel`, `openTabPreview`, `getTabPreviewContent`, and a reusable tab-index guard; reuse existing `DiscoverApp`, query bar, and data-view helpers.
- **Blockers**: none expected.

### Batch 2: Keep remaining FTR coverage

| #   | Proposed spec | From FTR file                                                     | Complexity | Notes                                                          |
| --- | ------------- | ----------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| 2   | deferred      | `src/platform/test/functional/apps/discover/tabs3/_time_range.ts` | complex    | Not requested; leave FTR file and `loadTestFile` entry intact. |

- **Human involvement**: `guided` later because this file uses time-picker/refresh state and retry-based assertions.
- **Dependencies**: a separate plan or explicit approval for the time-range migration.
- **Blockers**: out of scope.

---

## 11. Effort summary

| Metric                                    | Value                                                     |
| ----------------------------------------- | --------------------------------------------------------- |
| Total FTR test files analyzed             | `4`                                                       |
| > UI tests                                | `1`                                                       |
| > API tests                               | `0`                                                       |
| > Unit tests (RTL/Jest)                   | `0`                                                       |
| > Dropped                                 | `0`                                                       |
| > Deferred                                | `1`                                                       |
| New page objects needed                   | `0` new, `1` shared page object extension (`UnifiedTabs`) |
| New API services needed                   | `0`                                                       |
| `data-test-subj` additions to source code | `0` expected                                              |
| Custom server config sets                 | `0` new / `0` reuse existing                              |
| Migration batches                         | `2`                                                       |

### Risks and open questions

- Validate during execution: run the migrated Scout test with direct `tab.hover()` followed by preview-panel `waitFor({ state: 'visible' })`. If that is unstable, prefer a source-level readiness signal or deterministic Playwright actionability/readiness pattern over retry loops.
- User-run verification: confirm `loginAsViewer()` is sufficient for ad hoc data-view creation and saved Discover session save/load; escalate only if the test proves a privilege gap.
- Execution requirement: after migrating `_tab_preview.ts`, remove `src/platform/test/functional/apps/discover/tabs3/_tab_preview.ts` and remove only its `loadTestFile` entry from `src/platform/test/functional/apps/discover/tabs3/index.ts`; keep `_time_range.ts` and the config in FTR until its coverage moves.
