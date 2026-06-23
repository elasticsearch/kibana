---
name: SIEM Readiness
slug: siem-readiness
owner: JordanSh
kibana_paths:
  - x-pack/solutions/security/packages/siem-readiness/**
  - x-pack/solutions/security/plugins/security_solution/public/siem_readiness/**
  - x-pack/solutions/security/plugins/security_solution/server/lib/siem_readiness/**
  - x-pack/solutions/security/plugins/security_solution/server/agent_builder/tools/siem_readiness/**
  - x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/siem_readiness/**
  - x-pack/solutions/security/plugins/security_solution/public/common/lib/telemetry/events/siem_readiness/**
last_updated: 2026-06-18
source_prs:
  - https://github.com/elastic/kibana/pull/269284
  - https://github.com/elastic/kibana/pull/252902
  - https://github.com/elastic/kibana/pull/251583
  - https://github.com/elastic/kibana/pull/255891
  - https://github.com/elastic/kibana/pull/272394
  - https://github.com/elastic/kibana/pull/270871
---

# Domain: SIEM Readiness

## What every reviewer must know

SIEM Readiness assesses security data health across four dimensions: **Coverage** (which of the five main categories — Endpoint, Identity, Network, Cloud, Application/SaaS — have data flowing in), **Quality** (ECS field compatibility), **Continuity** (ingest pipeline health), and **Retention** (data retained for ≥365 days per FedRAMP). Both a UI dashboard and an AI agent (via Agent Builder) surface the same four dimensions — they must always agree: the agent must never return data that differs from what the UI shows for the same underlying state.

The domain has two parallel consumers of the same orchestration layer — HTTP routes (for the UI) and agent tools (for the LLM) — both calling the same server-side dimension functions. Category filtering happens at the edges (agent tools and UI tabs), not inside the orchestrators. All shared types, threshold constants, status functions, and filtering predicates live in the `@kbn/siem-readiness` package and are the single source of truth for all consumers. The Quality dimension is a known exception to parity: the ECS quality check must be triggered from the frontend; the server-side agent reads whatever results exist and may therefore return stale data if no UI-triggered check has run recently.

**Data accuracy is a first-class reviewer concern.** Before asking "does the code look clean?", ask "is the data this code produces actually correct?" For every computed value surfaced to the UI or agent, trace backward and ask whether the inputs could be incomplete, partial, stale, or incorrectly aggregated. A clean implementation that surfaces wrong numbers is a bug, not a feature.

The five main categories and their `event.category` mappings (defined in `fetchers/fetch_categories.ts` as `MAIN_CATEGORY_MAPPING`):

| Category | Maps from `event.category` values |
|---|---|
| Endpoint | endpoint, file, process, registry, malware, driver, host, vulnerability |
| Identity | authentication, iam, session, user |
| Network | network, firewall, intrusion_detection, dns |
| Cloud | cloud, configuration |
| Application/SaaS | application, web, database, package, api |

Any `event.category` value not in this table is **uncategorized** and excluded from all views. An index that ingests multiple `event.category` values appears in multiple category groups simultaneously — this is expected and correct.

## Architectural invariants

- **UI/agent parity must be preserved.** Both the HTTP route and the agent tool for each dimension call the same orchestrator (`getCoverage`, `getContinuity`, `getQuality`, `getRetention`). If you add logic to a tool that is not also in the route (or vice versa), or if you bypass the shared orchestrator, the agent and UI will return different answers. Users lose trust in both surfaces when they disagree.

- **Never inline category filtering predicates.** `filterPipelinesByCategories` (exact-match on backing index name) and `filterRetentionItemsByCategories` (contains-match: data stream name ⊆ backing index name) are the canonical predicates in `@kbn/siem-readiness`. If you duplicate their logic inline (e.g., a local closure), the inline copy will silently diverge if the shared predicate changes its match strategy. Both the agent tool and the UI tab for each dimension call the same shared function.

- **Recompute `status` and `summary` after filtering items.** Orchestrators compute status and summary over ALL items (including uncategorized). When an agent tool or UI tab filters `items` to categorized-only, it must recompute `status` and `summary` from the filtered count. Spreading `{ ...payload, items: categorizedItems }` without recomputing leaves stale totals — "8 of 20" when 3 categorized items were actually returned.

- **Threshold and status functions must be single-sourced.** `isCriticalFailureRate`, `isRetentionNonCompliant`, and the `get*Status` functions live in `@kbn/siem-readiness`. Every consumer (status cards, tab tables, case detail generators, agent tools) must import them from there. Never re-implement the threshold check inline.

- **Count unique indices, not category-index pairs.** An index (e.g., `logs-cloud_asset_inventory.asset_inventory-2`) can appear in multiple category groups because it ingests documents with multiple `event.category` values. When computing "how many indices", deduplicate first. Counting per-category-item pair gives inflated totals.

- **New metrics extend existing fetchers — they do not add new ES calls.** If an existing fetcher already queries the right data, add a field to the existing type (`PipelineStats`, `RetentionInfo`, etc.) and compute the metric in the dimension orchestrator. A new fetcher, route, or agent tool is only justified for a genuinely new entity type. This is both a performance constraint (fewer cluster-wide ES calls) and an architecture constraint (the "enrich, don't multiply" principle).

- **Warning prompts must use the same threshold as status computation.** Show the continuity warning prompt only when at least one pipeline has a failure rate ≥ `CRITICAL_FAILURE_RATE_THRESHOLD` (1%), not when `failedDocsCount > 0`. The UI warning state must be consistent with the server-side status verdict.

- **Category-filtered items in the agent tools must also filter `actionableFindings`.** When a tool filters `items` to categorized-only, it must also filter `actionableFindings` to exclude findings for uncategorized resources. Unfiltered findings reference system indices (e.g., `.workflows-events`) that the agent should not surface.

- **Coverage items require no additional category filtering — they already are the categories data.** Unlike Continuity, Quality, and Retention (whose orchestrators return all raw items), the Coverage orchestrator returns `CategoryGroup[]` — items already grouped by category. There is no `filterXByCategories` step for Coverage; the grouping is the data.

- **`retentionDays: null` means data is kept forever and is compliant.** A `null` value in `RetentionInfo.retentionDays` means no explicit delete policy exists — not that retention is unknown. Treating it as non-compliant or as zero days is wrong. Only indices with an explicit retention period shorter than 365 days are flagged.

- **On serverless, ingest pipeline stats are unavailable.** `PipelineStats.statsAvailable` will be `false` for all pipelines in serverless mode. Pipelines are still listed (they exist), but `docsCount` and `failedDocsCount` cannot be reported. ILM is also unavailable on serverless — retention is DSL-only; standalone indices don't exist. Any code path that branches on `isServerless` must respect both of these constraints.

- **When a pipeline spans multiple data streams, aggregate all health entries — do not use `.find()`.** `fetchPipelines` maps each pipeline over `indexHealth` entries. If the pipeline is attached to multiple backing indices, `.find()` silently discards all but the first health signal. Use `.filter()` to collect all matched entries, then aggregate: `silenceMs` → max (worst), `lastEventMs` → min (most stale), `isSilent` → any, `last24hDocs`/`baseline7dAvg` → sum, `volumeDropPct` → recomputed from aggregated totals.

- **Do not export a field your function structurally cannot compute correctly.** If computing a field requires information only available at a different layer (e.g., `isSilent` requires per-category thresholds that only `fetchPipelines` has), either compute it at the correct layer, move the field to that layer's type, or omit it from the exported type entirely. A function that returns `isSilent: false` always — because it lacks the category context to compute the real value — is wrong for every caller that does not apply downstream correction.

- **Silent-catch must not make "fetch failed" indistinguishable from "genuinely empty".** Blast radius fields (`affectedRules`, `affectedTactics`) should only be empty when the lookup genuinely found nothing. If a map-build step (pipeline map, category map, rule pagination) fails and its catch returns `[]`, callers receive a false negative — "no affected rules" when the fetch never ran. On failure: log `logger.warn(err, 'siem_readiness: failed to build X map')` and surface a typed status (`blastRadiusStatus: 'unavailable'` or `'partial'`) so callers know the result is unreliable.

- **Per-request WeakMap caches must evict themselves on rejection.** The shared-context cache (`getSiemReadinessSharedContext`) uses a `WeakMap<KibanaRequest, Promise<...>>`. If the first call for a request rejects, a naive implementation permanently stores the rejected Promise — every subsequent tool call for that request re-rejects immediately with no chance of recovery. Chain `.catch((err) => { cache.delete(request); throw err; })` before storing the Promise so a failed first attempt allows retry.

- **`blastRadiusStatus` and similar status unions must use named values for all states — no `undefined` for "ok".** Returning `undefined` from `deriveBlastRadiusStatus` to signal "complete and trustworthy" forces every caller to check for both `undefined` and named values. Use a consistent named value (e.g., `'complete'`) for the healthy state so callers can switch on a full enum.

- **All `z.string()` fields in attachment schemas must have `.max()` constraints.** Every `z.string()` in `actionableFindingSchema`, `siemReadinessContinuityDataSchema`, and related schemas must include `.max(N)`. Use context-appropriate limits (IDs ≤ 100, labels ≤ 500, messages ≤ 5000, summaries ≤ 8000). This is enforced by CodeQL "Unbounded string in schema validation" and aligns with existing conventions in the file.

- **Never duplicate the `toDataStreamName` conversion logic inline.** The regex that converts a backing index name to its parent data stream name (`.ds-{name}-YYYY.MM.DD-NNNNNN` → `{name}`) is defined once and exported. Import it; do not inline the regex at a call site. Two copies will diverge silently if the index naming convention changes.

- **Use domain types (not primitives) for per-category maps and constants.** Per-category threshold maps (e.g., `SILENCE_THRESHOLD_MS`) must use `Record<MainCategories, T>` rather than `Record<string, T>`. A string key accepts any value and gives no compile-time error when a category is missing or misspelled.

- **Consolidate recommended-action builders — no per-finding-type duplication.** Do not write separate `getSilenceActions`, `getVolumeDropActions`, etc. functions that each inline a nearly-identical set of actions. Build a single dispatch over `(dimension, findingType)` that spreads shared actions and injects type-specific ones. Extract common action builders as named consts; never inline the same action object in two places.

- **"View affected rules" href must use an index name, not a pipeline name.** The `?index=<finding.resource>` URL parameter expects a data stream or index name. For continuity findings, `finding.resource` is an ingest pipeline name — passing it as the index filter produces a broken link. Guard on `ctx.dimension` (or `finding.type`) before building the href; for continuity findings, use the pipeline's backing indices instead, or omit the filter.

## Common review patterns (learned from real PRs)

**Prefer simple for loops over complex method chaining** — When logic requires conditional branching or multiple passes, use a for loop with if statements rather than `.filter().reduce().map()` chains. Reviewed in #252902: reviewer asked for simpler loop; author agreed.

**Derive category assignment from already-filtered items (single-pass)** — After calling `filterRetentionItemsByCategories` or `filterPipelinesByCategories`, derive the category label from the already-filtered items rather than traversing the categories response again. The filter step guarantees the item is categorized, so the category is extractable from the same data. Avoids O(n²) traversal. Reviewed in #269284 as optional fix; now the established pattern.

**Conditional rendering → prefer const derivation over multiple branches** — When rendering a button or element that varies by a condition (e.g., `retentionType`), derive the variant values (`label`, `href`) as consts at the top of the render function and render a single element with those consts, rather than three separate elements with duplicate structure. Reviewed in #252902.

**Hook composition over duplication** — If two hooks share data from the same source, make the dependent hook a built-in part of the source hook rather than calling the same API in two places. "We don't want to maintain two sources of truth." — @JordanSh, #255891.

**"Open case" recommended action should always be last** — Dimension-specific and resource-specific recommended actions come first; the "Open case" action is always the last entry in the list. Reviewed in #272394.

**Use descriptive names for context-parameter objects** — Avoid short abbreviations like `ctx` for rich context objects. Use names like `enrichmentContext` or `reverseMapContext`. Reviewed in #270871 (nit).

**Scope ES index patterns to the minimal needed set** — Do not default to `*` for ES queries. Restrict to the indices that actually contain the relevant ECS fields (e.g., `['logs-*', 'metrics-*']`) and justify the scope explicitly when asked. Reviewed in #270871: @JordanSh challenged the scope; author explained the performance rationale and it was accepted.

## Security considerations

**All `z.string()` fields in attachment schemas must have `.max()` constraints** — See Architectural Invariants. This is enforced by CodeQL static analysis. Any new string field in `siem_readiness.ts` attachment schemas (or any schema in the agent builder layer) without `.max(N)` will be flagged. Standard Kibana route authorization applies to routes. No domain-specific RBAC, encryption, or data-access restrictions beyond what any Security Solution route enforces.

## Performance constraints

- **Minimize ES calls when expanding coverage.** The retention and pipelines endpoints each perform multiple cluster-wide ES API calls (`_nodes/stats/ingest`, `_data_stream/*`, `_ilm/policy`, `_settings`). As the feature expands to cover more resource types, derive new metrics from existing fetcher results rather than adding parallel ES calls. One field added to `PipelineStats` in the fetcher serves the route, the agent tool, and any UI column simultaneously.

- **Quality check is triggered on every tab visit.** The `use_auto_check_indices.ts` hook triggers the ECS compatibility check on every Quality tab render. On environments with many indices, this is expensive. The tab uses a trigger borrowed from the `ecs_data_quality_dashboard` plugin (not a clean public API). This is a known trade-off, not a bug, but reviewers should be aware of the cost when modifying Quality tab behavior.

- **Polling interval for live dimensions.** Continuity and Retention refetch every 30 seconds (`REFETCH_INTERVAL = 30000`). These endpoints involve cluster-wide ES calls. Changes that make the server-side computation heavier should consider whether 30-second polling remains appropriate.

## Historical catches

**PR #269284 — Stale status/summary after filtering (caught by @niros1):** The initial `getQualityTool` implementation spread `{ ...payload, items: categorizedItems }` without recomputing `status` and `summary`. The orchestrator had computed "8 of 20 indices have incompatible fields"; after filtering to 3 categorized items, the summary still said "8 of 20". A generic reviewer would have missed this because the types all passed and the logic looked correct — the bug was that `status` and `summary` are pre-computed by the orchestrator over all items, not derived from the `items` array at read time.

**PR #251583 — Any-failure warning vs. critical-threshold warning (caught by @JordanSh):** The initial continuity tab showed a warning prompt whenever `failedDocsCount > 0` (any failure), while the status computation used the 1% critical threshold. This meant a table full of "healthy" rows could still show a warning banner. A generic reviewer would have missed it because the condition `failedDocsCount > 0` looks reasonable in isolation — you have to know that the server-side critical threshold is 1%, not 0%.

**PR #252902 — Double-counting indices across categories (caught by @JordanSh):** The initial retention tab counted items per category-group, so an index appearing in 3 categories was counted 3 times. The "Total non-compliant" count was inflated. A generic reviewer would have missed this because it requires knowing that indices can appear in multiple categories (a property of SIEM Readiness's multi-valued `event.category` model).

**PR #272394 — `.find()` discards multi-stream health signals (caught by @JordanSh):** The initial `fetchPipelines` enrichment used `.find(h => h !== undefined)` to look up health data for a pipeline's backing indices. For pipelines attached to multiple data streams, all but the first match were silently discarded — so a pipeline that was silent on stream B (but healthy on stream A, which was found first) would appear healthy. A generic reviewer would have missed this because the code looks correct: it reads a health entry and uses it.

**PR #270871 — WeakMap cache permanently stores rejected Promises (caught by @JordanSh):** The per-request shared-context cache stored a Promise without a rejection handler. If the first fetch failed, the rejected Promise stayed in the cache — every subsequent tool call for the same request re-rejected immediately. A generic reviewer would have missed this because the pattern looks like standard lazy initialization; the failure mode only manifests when the first call errors.

## Documentation

- `x-pack/solutions/security/packages/siem-readiness/CLAUDE.md` — in-repo architecture guide: data flow diagram, layer responsibilities, category mapping table, threshold definitions, "enrich, don't multiply" principle, when to add a dimension vs. extend an existing one
- GitHub issue #265839: https://github.com/elastic/kibana/issues/265839 — M2 architecture review: agent skill design options (internal APIs vs ES|QL vs snapshot index), rationale for current approach, open questions for M3

## Who to contact

- Architecture / data model questions: @JordanSh
- Performance / ES query questions: @JordanSh
- Security questions: @JordanSh
