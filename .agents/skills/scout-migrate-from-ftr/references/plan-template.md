# Migration Plan Output Template

The planner must produce a Markdown file following this structure exactly. Every section is required unless marked `(omit if empty)`. Use the headings, table formats, and bullet styles shown here so the executor skill can parse sections programmatically.

**Guiding principle**: be thorough on what was found in FTR. Reference Scout concepts when they inform a decision (e.g. "no Scout equivalent exists"), but leave implementation specifics to the executor.

---

## Template starts below

````markdown
# FTR to Scout Migration Plan

| Field | Value |
|-------|-------|
| Source | `<FTR directory path>` |
| Target module root | `<Scout module root>` |
| Generated | `<date>` |
| Deployment targets | `<stateful / serverless / both>` |
| FTR config chain | `<config.ts>` > `<base.config.ts>` > ... |

---

## 1. Test inventory

Sorted by estimated complexity (simple to complex).

| # | FTR file (relative) | Type | Description | `it` count | Complexity | Decision | Justification |
|---|---------------------|------|-------------|-----------|------------|----------|---------------|
| 1 | `group1/feature_controls.ts` | test | Tests feature-control visibility for viewer, editor, and admin roles | 8 | simple | UI test | User-flow test gated by roles |
| 2 | `group1/index.ts` | index | Loads 4 sub-suites; shared `before` loads dashboard archive | - | - | split | Each `loadTestFile` target becomes its own spec |
| 3 | `group2/data_counts.ts` | test | Asserts exact document counts in data table cells | 12 | medium | API test | Data-correctness assertions don't need a browser |
| 4 | `group2/tooltip_hover.ts` | test | Tests tooltip appears on hover over chart point | 3 | simple | unit test (RTL) | Isolated component behavior, no server needed |
| ... | | | | | | | |

### Proposed file splits (omit if none)

Files that test multiple roles or unrelated flows and should become separate specs:

- `feature_controls.ts` (8 `it` blocks across 3 roles), split into:
  - `feature_controls_viewer.spec.ts` (viewer flow, 3 `it` blocks)
  - `feature_controls_editor.spec.ts` (editor flow, 3 `it` blocks)
  - `feature_controls_admin.spec.ts` (admin-only checks, 2 `it` blocks)

### Tests to drop (omit if empty)

- `<file>`: <why this test is no longer needed, and what coverage is lost (if any)>

### Tests to defer (omit if empty)

- `<file>`: blocked by <specific missing capability with detail>

---

## 2. Test type routing

### UI tests

| FTR file | Proposed spec path | Key flows covered |
|----------|--------------------|-------------------|
| `feature_controls.ts` | `ui/tests/dashboard/feature_controls_viewer.spec.ts` | Viewer sees read-only dashboard, cannot edit |

### API tests

| FTR file | Proposed spec path | Why API not UI |
|----------|--------------------|----------------|
| `data_counts.ts` | `api/tests/dashboard/data_counts.spec.ts` | Asserts exact ES doc counts; no UI interaction needed |

### Unit tests (RTL/Jest)

| FTR file | Component under test | Proposed test path | What to test |
|----------|---------------------|-------------------|-------------|
| `tooltip_hover.ts` | `DashboardTooltip` | `src/.../dashboard_tooltip.test.tsx` | Hover state, conditional rendering |

---

## 3. Parallelism plan

### Parallel-safe (can be space-isolated)

| Proposed spec | Why parallel-safe |
|--------------|------------------|
| `feature_controls_viewer.spec.ts` | Only reads space-scoped saved objects; no global mutations |

### Must be sequential

| Proposed spec | Why sequential |
|--------------|---------------|
| `cluster_settings.spec.ts` | Mutates cluster-level ILM policy shared by all spaces |

---

## 4. Test data and setup

### Archives inventory

| Archive path | Contents | Size | Used by (files) | Verdict |
|-------------|----------|------|-----------------|---------|
| `fixtures/es_archiver/dashboard/current/data` | `logstash-*` index, 14k docs | ~2MB | 6 files | Keep (shared, load once) |
| `fixtures/es_archiver/empty_kibana` | Empty `.kibana` index | <1KB | 1 file | Drop (no longer needed) |
| `fixtures/kbn_archiver/dashboard/current/kibana` | 3 dashboards, 2 data views | ~50KB | 4 files | Keep (load per space for parallel tests) |

### UI settings mutations

| FTR call | Semantics | Files |
|----------|-----------|-------|
| `kibanaServer.uiSettings.replace({...})` | Wipes all settings, then sets new values | `index.ts:15` |
| `kibanaServer.uiSettings.update({timepicker: ...})` | Merges into existing settings | `time_filter.ts:8` |

### Shared constants to extract (omit if empty)

Values reused across ≥2 files **where extracting removes real duplication** (multi-file occurrence alone isn't enough — prefer inline). Exclude deployment tags and values already exported from a plugin's `common/`/`server/` (import those instead):

| Value | Occurrences | Current locations |
|-------|-------------|-------------------|
| `'logstash-*'` | 6 files | `feature_controls.ts:12`, `data_counts.ts:5`, ... |
| `'Sep 22, 2015 @ 00:00:00.000'` | 4 files | `time_filter.ts:3`, `panel_actions.ts:7`, ... |
| `'fixtures/es_archiver/dashboard/current/data'` | 3 files | `index.ts:8`, `group2/index.ts:10`, ... |

### Fresh server required (omit if none)

- `<test>`: <what about this test requires a clean server>

---

## 5. Auth and roles

### Role inventory

| Role name | Source | Privileges (summary) | Used by (files) | Scout role target | Notes |
|-----------|--------|---------------------|-----------------|-------------------|-------|
| `superuser` (default) | `config.base.ts` | Full cluster + all Kibana features | 12 files | `loginAsAdmin()` (downgrade where possible) | Over-privileged for most tests |
| `dashboard_only_user` | `config.base.ts` | `feature: { dashboard: ['read'] }, spaces: ['*']` | 4 files | `loginAsViewer()` | Matches a built-in viewer role |
| `custom_analyst` | `data_counts.ts:20` | `indices: [{ names: ['logs-*'], privileges: ['read'] }]` | 1 file | `loginAsViewer()` unless scoping is under test | Custom scope looks incidental; keep `loginWithCustomRole` only if the test validates the index limitation |

### Over-privileged tests

Tests running as `superuser` that likely don't need it:

| File | What it actually exercises | Suggested minimum privilege |
|------|---------------------------|----------------------------|
| `feature_controls.ts` (viewer section) | Reads dashboard | `dashboard: read` |
| `panel_actions.ts` | Edits panels | `dashboard: all` |

### Roles deserving shared helpers (used in ≥3 files)

- `dashboard_only_user`: used in 4 files
- `superuser`: used in 12 files (but most should be downgraded)

### Special auth patterns (omit if none)

- `run_as` usage in `<file:line>`: <what it does and why>

---

## 6. Reusability audit

### FTR services and page objects in use

| FTR name | What it does | Used by (files) | Scout equivalent exists? | Hidden assertions? | Recommended scope |
|----------|-------------|-----------------|-------------------------|-------------------|-------------------|
| `PageObjects.dashboard` | Navigate to dashboards, create, edit, delete | 8 files | yes (Scout package) | no | use existing |
| `PageObjects.header` | Wait for loading, check breadcrumbs | 10 files | yes (Scout package) | yes (`waitUntilLoadingHasFinished` asserts internally) | use existing, note assertion |
| `getService('filterBar')` | Add/remove/pin filters | 5 files | no | no | shared (used across many plugins) |
| `getService('dashboardCustomizations')` | Plugin-specific panel config | 2 files | no | no | plugin-local |

### EUI components interacted with directly

| Component | Interaction pattern | Files |
|----------|-------------------|-------|
| `EuiComboBox` | Type + select option | `filter_bar.ts:45`, `data_view_picker.ts:12` |
| `EuiDataGrid` | Click cell, sort column, resize | `data_table.ts:20-80` |

### Brittle locator strategies

Locators that need `data-test-subj` added to source code:

| File | Line | Current locator | Target component |
|------|------|----------------|-----------------|
| `panel_actions.ts` | 34 | `find.byCssSelector('.euiPanel .euiButtonIcon')` | Panel action button |
| `filter_bar.ts` | 52 | `find.byClassName('globalFilterItem')` | Filter pill |

### Page objects with hidden assertions

FTR helpers that contain assertions internally (page objects should return state, not assert):

| FTR helper | Method | Assertion | File:line |
|-----------|--------|-----------|-----------|
| `PageObjects.dashboard` | `expectOnDashboard(title)` | `expect(await header()).to.be(title)` | `dashboard_page.ts:120` |
| `getService('testSubjects')` | `existOrFail(selector)` | throws if not found | (FTR built-in) |

---

## 7. Server configuration

### FTR server args (full chain)

| Arg | Source config | Category | Notes |
|-----|-------------|----------|-------|
| `--xpack.security.authc.api_key.enabled=true` | `config.base.ts:45` | already in Scout default | no action needed |
| `--xpack.maps.showMapsInspectorAdapter=true` | `config.base.ts:52` | runtime-settable | setting key: `maps:showInspector` |
| `--xpack.fleet.registryUrl=http://localhost:1234` | `config.base.ts:60` | requires server config | no matching Scout config set found |
| `--xpack.encryptedSavedObjects.encryptionKey=...` | `config.base.ts:48` | already in Scout default | no action needed |

### ES server args

| Arg | Source config | Notes |
|-----|-------------|-------|
| `path.repo=/tmp/` | `config.base.ts:30` | Snapshot repo, only used by `snapshot_restore.ts` |

### Custom server config needed? (omit if all args are covered)

- **Reason**: `<which args aren't covered by existing Scout configs>`
- **Closest existing config set**: `<name>` or none
- **Args that require it**: `<list>`

---

## 8. Deployment targets

| Proposed spec | Where it should run | Reasoning |
|--------------|--------------------|-----------| 
| `feature_controls_viewer.spec.ts` | everywhere | Feature exists in stateful and all serverless projects |
| `cluster_settings.spec.ts` | stateful only | Cluster-level settings API not available in serverless |

### Coverage gaps (omit if none)

- `<test>` currently runs only in `<env>` but the feature also exists in `<env>` (should be expanded)

### Cloud portability issues (omit if none)

Non-portable assumptions found in FTR tests:

| File | Line | Issue |
|------|------|-------|
| `snapshot_restore.ts` | 15 | Hardcoded `path.repo=/tmp/` (local filesystem path) |
| `api_keys.ts` | 42 | Assumes single-node cluster topology |

---

## 9. FTR test smells

| Smell | File | Lines | Description | Context |
|-------|------|-------|------------|---------|
| Hardcoded timeout | `dashboard_grid.ts` | 45-47 | `await new Promise(r => setTimeout(r, 3000))` | Waits for panel resize animation |
| Shared mutable state | `panel_actions.ts` | 12, 30, 55 | `panelId` set in first `it`, read in subsequent `it` blocks | These `it` blocks form a single journey |
| Sequential journey | `create_edit_delete.ts` | all | 6 `it` blocks forming one CRUD flow, each depends on previous | Create, edit, verify, delete sequence |
| try/catch swallowing | `error_handling.ts` | 80-85 | Empty catch block hides cleanup failures | Cleanup for temp saved objects |
| Retry wrapper | `slow_render.ts` | 22-30 | `retry.try(() => testSubjects.existOrFail('chart'))` | Waiting for chart to render after data load |
| Global loading wait | `navigation.ts` | 15 | `await PageObjects.header.waitUntilLoadingHasFinished()` | Used after every navigation to wait for page ready |
| UI-based setup | `create_dashboard.ts` | 8-20 | `before` hook navigates to UI and clicks "Create" button | Creates test dashboard via UI instead of API |
| Onboarding dismissal | `home_page.ts` | 5 | `browser.setLocalStorageItem('home:welcome:show', 'false')` | Dismisses welcome screen before test starts |
| Brittle selector | `filter_bar.ts` | 52 | `find.byClassName('globalFilterItem')` | No `data-test-subj` on filter pill component |
| Conditional assertion | `feature_flag.ts` | 40-50 | `if (isEnabled) { ... } else { ... }` inside `it()` | Branches on experimental feature flag at runtime |
| Duplicate tests | `filter_basic.ts` | 20-60 | 3 `it` blocks test same filter behavior with different field names | Only the field name varies; logic is identical |
| Over-privileged | `read_only_view.ts` | all | Tests read-only dashboard view but runs as `superuser` | Only exercises `dashboard: read` |
| Missing cleanup | `saved_objects.ts` | 15 | Creates index pattern in `before`, no `after` to delete it | Orphaned index pattern accumulates across runs |

---

## 10. Migration batches

### Batch 1: Quick wins

Simple tests, all dependencies exist, no new abstractions needed.

| # | Proposed spec | From FTR file | Complexity | Notes |
|---|--------------|--------------|------------|-------|
| 1 | `feature_controls_viewer.spec.ts` | `feature_controls.ts` | simple | Built-in viewer role, existing page objects |
| 2 | `preserve_url.spec.ts` | `preserve_url.ts` | simple | Pure navigation test |

- **Human involvement**: `autopilot` (executor can handle end-to-end)
- **Dependencies**: none
- **Blockers**: none

### Batch 2: Needs new abstractions

| # | Proposed spec | From FTR file | Complexity | Notes |
|---|--------------|--------------|------------|-------|
| 3 | `panel_actions.spec.ts` | `panel_actions.ts` | medium | Needs new panel page object |
| 4 | `filter_bar.spec.ts` | `filter_bar.ts` | medium | Needs `data-test-subj` added to filter pills in source |

- **Human involvement**: `guided` (source code changes needed for `filter_bar`)
- **Dependencies**: panel page object (created in this batch)
- **Blockers**: `data-test-subj` additions to source

### Batch N: Complex / blocked

| # | Proposed spec | From FTR file | Complexity | Notes |
|---|--------------|--------------|------------|-------|
| N | `snapshot_restore.spec.ts` | `snapshot_restore.ts` | complex | Needs custom server config for `path.repo` |

- **Human involvement**: `hands-on` (new server config set, infrastructure decisions)
- **Dependencies**: custom server config set
- **Blockers**: `path.repo` not supported in any existing Scout config set

---

## 11. Effort summary

| Metric | Value |
|--------|-------|
| Total FTR test files analyzed | `<N>` |
| > UI tests | `<N>` |
| > API tests | `<N>` |
| > Unit tests (RTL/Jest) | `<N>` |
| > Dropped | `<N>` |
| > Deferred | `<N>` |
| New page objects needed | `<N>` (`<N>` shared, `<N>` plugin-local) |
| New API services needed | `<N>` |
| `data-test-subj` additions to source code | `<N>` |
| Custom server config sets | `<N>` new / `<N>` reuse existing |
| Migration batches | `<N>` |

### Risks and open questions

- <Items marked `NEEDS VERIFICATION`>
- <Decisions that need human sign-off>
- <Missing Scout capabilities that block deferred tests>
````
