---
name: test-tracer
description: >
  Validate that a Kibana PR's test plan (.md files) is actually implemented in
  test code, and that the plan covers the requirements from linked GitHub
  issues. Produces a three-way coverage report: requirements ↔ plan ↔ tests.
  Use when reviewing a PR that modifies test plan markdown, when asked to
  trace plan-to-implementation for a feature, or when asked whether a feature's
  scenarios are actually tested.
metadata:
  disable-model-invocation: true
---

# Test Tracer

Senior QA tool. Bridges three artifacts that drift independently:
1. **Requirements** — extracted from linked GitHub issues (`[FUNCTIONAL]` / `[NEGATIVE]` / `[EDGE CASE]` / `[AUTH]` / `[ERROR]`).
2. **Test plan scenarios** — extracted from `.md` files, sourced from a PR's diff (`--pr` / `--plan-pr`) and/or local files on disk (`--plan-file`).
3. **Test code** — `describe` / `it` / `test` / `apiTest` / `spaceTest` / `cy.it` blocks discovered by the deterministic catalog walker, covering Jest (`*.test.{ts,tsx,js,jsx,mjs}`), Scout, Cypress (`*.cy.*`), and Mocha-style FTR / API-integration suites (plain `.ts`/`.tsx`/`.js`/`.jsx`/`.mjs` under `test_suites/` or `tests/`), across any scope passed via `--pr` / `--impl-pr` / `--impl-scope` (or, when no explicit impl signal is given, auto-derived by walking up from the plan `.md` to the nearest `kibana.jsonc` *and* the solution-level test sibling — see [Source resolution rule 2](#source-resolution-rules)). Exact rule lives in [Source resolution rule 2](#source-resolution-rules); source of truth is `isTestFile` in `scripts/_parser.mjs`.

Produces a three-way report classifying every requirement and scenario across these three axes. Catches the gap that single-axis tools miss: a scenario marked "in the plan" with no real test, a test with no scenario, a requirement in neither.

The plan and the implementation are often in **separate PRs**, or one or both may not be in a PR at all — see [Inputs › Six realistic invocation shapes](#six-realistic-invocation-shapes).

**Scope & ownership.** This skill is owned by the Security Solution QA workflow and is curated against Security Solution test-plan conventions (the `docs/testing/test_plans/` directory structure, `[FUNCTIONAL]` / `[NEGATIVE]` / `[EDGE CASE]` / `[AUTH]` / `[ERROR]` requirement-category rubric, and the Detection Engine / Rule Management plan style). The deterministic catalog walker itself (`scripts/build_describe_catalog.mjs`, `scripts/_parser.mjs`) is repo-generic — it understands Jest, Scout, Cypress, and FTR Mocha test conventions used anywhere in Kibana — so the skill can be pointed at non-security plans, but the prompts, rubrics, and walk-up heuristics assume security conventions. Sits next to its upstream [`test-plan-generator`](../test-plan-generator/SKILL.md) (which authors the plans this skill validates) and its peer [`bug-validator`](../bug-validator/SKILL.md).

---

## Boundaries

- **Always**: build the describe/it catalog via `scripts/build_describe_catalog.mjs`. Never `Glob`/`Grep` test files in-context.
- **Always**: validate any test block name claimed in a match by checking it appears verbatim in the catalog. Reject and re-prompt unmatched quotes.
- **Always**: slice test bodies via `scripts/extract_test_block.mjs`. Never `Read` full test files.
- **Always**: self-investigate via `gh` before asking the user.
- **Always**: cap linked-issue crawl at depth 2 — hard limit, no exceptions.
- **Ask first**: before posting any GitHub comment, before adding a `[FUNCTIONAL]` requirement category that isn't in the rubric, before using a non-default scope.
- **Never**: post a verdict of `IMPLEMENTED` without quoting the assertion line.
- **Never**: classify partial coverage as `IMPLEMENTED`. Use `INCONCLUSIVE`.
- **Never**: classify a match as `IMPLEMENTED` when the quoted block name does not appear verbatim in the catalog. That is hallucination — downgrade to `INCONCLUSIVE` and report the failure.
- **Never**: modify the PR, the linked issues, or any local file. This is a read-only analysis tool. Output goes to stdout or (with explicit user approval) a single GitHub comment.

---

## Inputs

The skill compares three independent artifacts (**requirements ↔ scenarios ↔ tests**) that often live in different places — the test plan and the implementation are frequently in **separate PRs** (or no PR at all). Inputs are therefore decoupled per axis: each can be supplied independently.

### Source flags

| Flag | Axis it feeds | Repeatable | Default if omitted |
|---|---|---|---|
| `--pr <N>` | All three (shortcut) | no | — |
| `--plan-pr <N>` | scenarios + issues (PR body scanned) | yes | — |
| `--plan-file <path>` | scenarios + issues (.md file scanned for links) | yes | — |
| `--impl-pr <N>` | tests scope + issues (PR body scanned) | yes | — |
| `--impl-scope <path>` | tests scope (path may be a directory *or* a single test file) | yes | — |
| `--issue <url>` | requirements (added on top of crawled issues) | yes | — |
| `--no-crawl` | suppresses auto-crawl; requirements come only from `--issue` flags | flag | off |
| `--with-walk-up` | forces the auto walk-up from the scenarios `.md` into the tests scope even when explicit impl signals are present (see Source resolution rule 2) | flag | off |

### Mode + Report flags

| Flag | Format | Default |
|---|---|---|
| `--mode` | `plan` \| `impl` \| `both` | `both` |
| `--report` | `console` \| `comment` | `console` |
| `--summary-only` | flag | off |
| `--overlap-threshold` | float `0.0` – `1.0` (only with `--summary-only`) | `0.15` |

### `--summary-only` — triage mode for wide-scope audits

A second-class run mode for situations where the catalog is too large for per-scenario LLM matching (e.g., auditing a whole plugin against a high-level plan).

| | |
|---|---|
| **What it does** | Waives the catalog size guard. Replaces Phase 6's LLM matching with deterministic **keyword-overlap** scoring (Jaccard on tokenized `scenario` vs tokenized `blockName + parentChain`). Skips Phase 7 entirely. Renders a `Plan ↔ Tests — Summary` heatmap in Phase 8 instead of the verdict-grade Plan ↔ Tests section. |
| **What it does NOT do** | It does **not** produce `IMPLEMENTED` / `NOT IMPLEMENTED` verdicts — keyword overlap is suggestive, not conclusive. It does **not** detect drift flags (no per-match comparison). It does **not** bypass the verbatim-quote anti-hallucination gate — by construction, no LLM speaks block names in this mode. |
| **Use when** | (a) the size guard fires on a scope you can't or don't want to narrow, (b) you want a portfolio-level audit across many plans without LLM cost, (c) you want a first-pass triage of where coverage gaps probably are before a deeper run. |
| **Don't use when** | You need a verdict for any specific scenario. Re-run with a narrower `--impl-scope` and without `--summary-only`. |
| **Mode interactions** | `--summary-only --mode impl` → heatmap-only impl analysis (intended use). `--summary-only --mode both` → full LLM Plan ↔ Requirements + heatmap Plan ↔ Tests + degraded Three-Way Merge that flags candidate coverage instead of validated. `--summary-only --mode plan` → **rejected** (no impl phase to summarize). |

### Source resolution rules

1. **Scenarios source** (required): union of every `.md` file from `--pr` (its diff), every `--plan-pr` (their diffs), and every `--plan-file`. At least one `.md` must resolve, or the skill stops.
2. **Tests scope** (required for `impl` / `both` modes): union of:
   - directories of test files in every `--pr` / `--impl-pr` diff (filtered per the **test-file detection rule** below),
   - every `--impl-scope` — each one is either a directory (walked recursively) or a single test file (yielded directly, no siblings). Use a file scope to surgically pull in *one* test from a noisy parent directory; use a directory scope when you want the whole subtree.
   - the **conditional walk-up** from every scenarios-source `.md` path — see the walk-up rule below.

   **Test-file detection rule** (for PR-diff filtering — *must* match what the catalog walker accepts so dir resolution and content discovery agree; source of truth is `isTestFile` in `scripts/_parser.mjs`):
   - matches `\.(test|spec|cy)\.(ts|tsx|js|jsx|mjs)$` (Jest, Scout, Cypress, RTL spec) — OR —
   - lies under a path segment named `test_suites/` *or* `tests/` and ends in `.ts|.tsx|.js|.jsx|.mjs` (FTR / Mocha API-integration convention). `index.ts` and `ftr_provider_context.ts` are walked but contribute zero blocks (registration glue, no `describe`) and so are harmless to include.

   **Walk-up rule**: from a `.md` path, walk to the nearest `kibana.jsonc` (the plugin root). If the resolved plugin lives under `x-pack/solutions/<S>/plugins/<P>/`, *also* add `x-pack/solutions/<S>/test/` — the solution-level FTR / Cypress sibling root. By Kibana convention, FTR API-integration suites (`test/<solution>_api_integration/test_suites/...`) and Cypress E2E suites (`test/<solution>_cypress/...`) live one level above the plugin even though they exercise it. The walk does not cross solutions.

   **Walk-up is suppressed by default when any explicit tests-scope signal is present** — either `--impl-pr` resolves ≥ 1 test file, or any `--impl-scope` is given. Rationale: explicit user intent should win over auto-defaults, and an unconditional walk-up to a large plugin (e.g. `security_solution` ≈ 33K blocks) re-explodes scope the user just narrowed.

   To force walk-up back on, pass `--with-walk-up`. The decision (applied vs. suppressed) is always disclosed in the Scope-of-run block.
3. **Requirements source** (required for `plan` / `both` modes unless `--no-crawl`): crawled from issue URLs found in any of (PR bodies, `.md` content), depth ≤ 2, breadth ≤ 25 — see Phase 2. Explicit `--issue` URLs are always additive.
4. **`--pr` is a shortcut** for `--plan-pr <N> --impl-pr <N>`. It cannot be combined with explicit `--plan-pr` or `--impl-pr` flags (rejected as ambiguous; ask the user which split they meant).
5. **All source flags are additive across same-axis instances.** `--plan-pr 1 --plan-pr 2 --plan-file foo.md` resolves scenarios to the union of all .md files from PRs 1 and 2 plus `foo.md`. Dedupe by repo-relative path.

### Six realistic invocation shapes

| # | Situation | Invocation | What gets resolved |
|---|---|---|---|
| 1 | Single PR has plan + impl + linked issues (ideal case, rare) | `--pr 259855` | scenarios + tests + issues all from PR #259855 |
| 2 | Plan PR and impl PR are **separate** (the common reality) | `--plan-pr 259855 --impl-pr 263662` | scenarios from #259855 diff; tests scope = #263662's modified test dirs (walk-up suppressed — explicit impl signal); issues crawled from BOTH PR bodies + .md content |
| 3 | Plan on disk (no PR), validate against a known plugin | `--plan-file path/to/plan.md --impl-scope x-pack/.../security_solution/` | scenarios from file; tests scope = explicit `--impl-scope` only (walk-up suppressed); issues from .md content only |
| 4 | Plan on disk, no impl reference, auto-scope | `--plan-file path/to/plan.md` | scenarios from file; tests scope = walk-up (plugin root + solution-test sibling) — no explicit impl signal so walk-up applies; issues from .md content |
| 5 | Anything + extra non-discoverable issues (e.g., epic referenced only in Slack) | `... --issue https://github.com/elastic/security-team/issues/123` | explicit issues merged with crawl results |
| 6 | Anything + skip auto-crawl entirely (manual control) | `... --no-crawl --issue ...` | only `--issue` URLs feed requirements; nothing scraped |

### Conflict and ambiguity handling

| Situation | Behavior |
|---|---|
| `--pr` + (`--plan-pr` or `--impl-pr`) | Reject: ambiguous. Ask user which split they meant. |
| `--plan-pr` given, `--impl-pr` AND `--impl-scope` both omitted, mode is `impl` or `both` | Default tests scope to plan PR's `.md` walk-up (plugin root + solution-test sibling). **Disclose** in Scope-of-run: *"impl source defaulted from plan path; pass `--impl-pr` or `--impl-scope` for tighter scoping."* Expect the size guard to fire against large plugins (e.g. `security_solution`); the prompt will offer the same narrowing options. |
| `--plan-file <path>` and the file does not exist | Stop. List candidate test-plan directories from the repo (e.g., `x-pack/.../docs/testing/test_plans/`). |
| `--impl-pr` and `--impl-scope` both given | Use both (union). Disclose in Scope-of-run. |
| Scenarios source resolves to zero `.md` files | Stop and ask user to supply at least one of `--pr`, `--plan-pr`, `--plan-file`. |
| `--no-crawl` and zero `--issue` flags, mode is `plan` or `both` | Stop and tell user: *"Requirements axis has no source. Provide `--issue` URL(s) or drop `--no-crawl`."* |
| `--summary-only` with `--mode plan` | Reject. *"--summary-only has no effect with --mode plan (no impl phase to summarize). Drop one of the flags."* |
| `--overlap-threshold` outside `[0.0, 1.0]` or without `--summary-only` | Reject. The threshold only applies to heatmap mode. |
| `--impl-pr` resolves ≥ 1 test file OR `--impl-scope` is given, **without** `--with-walk-up` | Walk-up suppressed. **Disclose** in Scope-of-run: *"walk-up suppressed (explicit impl signal provided); pass --with-walk-up to re-enable."* |
| `--with-walk-up` and no scenarios source resolved (no `.md`) | Reject. *"--with-walk-up requires a scenarios source; nothing to walk up from."* |

### How to recognize the source split from a conversational ask

| User phrasing | Resolves to |
|---|---|
| *"validate the test plan in PR #X against the impl in PR #Y"* | `--plan-pr X --impl-pr Y` |
| *"validate `prebuilt_rule_deprecation.md` against the security_solution plugin"* | `--plan-file <path> --impl-scope <plugin>` |
| *"check this test plan file"* (file is in conversation context) | `--plan-file <path>` |
| *"run test-tracer on this PR"* | `--pr <current>` |
| *"also include issue #N in the crawl"* | append `--issue` |
| *"don't crawl issues, only use #N"* | `--no-crawl --issue ...` |

### Mode — what each one does

The skill always compares three artifacts (requirements ↔ plan ↔ tests), but the user picks **which axes are analyzed** for this run:

| Mode | Question it answers | Phases it runs | Phases it skips |
|---|---|---|---|
| `plan` | *"Does the test plan cover the product requirements from issues?"* (your original `test-tracer` CLI behavior) | 0, 1, 2, 3, 4, 8 | 5, 6, 7 |
| `impl` | *"Did the implementation actually deliver every scenario the plan calls for?"* | 0, 1, 5, 6, (7 v2), 8 | 2, 3, 4 |
| `both` *(default)* | Full three-way analysis including the silent-blind-spot bucket (requirement in issues → no scenario → no test). | 0 → 8 | — |

**How to recognize the mode from a user request** (when not passed as a flag):

| Phrasing in the user's ask | Mode |
|---|---|
| *"review the test plan"*, *"check the plan vs requirements"*, *"validate scenarios cover the issues"* | `plan` |
| *"validate the implementation matches the plan"*, *"are these scenarios actually tested"*, *"check the test code"* | `impl` |
| *"run test-tracer on PR #N"* with no further qualifier | `both` |
| Anything ambiguous | Ask the user once: *"Plan ↔ Requirements, Plan ↔ Tests, or both?"* |

**Mode does not weaken the per-phase guarantees.** A partial mode does not relax the verbatim-quote rule, the depth-2 crawl cap, or the catalog size guard. It only skips entire phases.

### Mode + sources — what the user must supply for each mode

| Mode | Required sources | Stop condition |
|---|---|---|
| `plan` | scenarios source (1+) AND requirements source (crawl or `--issue`) | zero `.md` resolved, OR `--no-crawl` with zero `--issue` |
| `impl` | scenarios source (1+) AND tests scope (auto from plan path is fine) | zero `.md` resolved |
| `both` | all of the above | zero `.md` resolved, OR (`--no-crawl` with zero `--issue`) |

If a required source is missing the skill stops; it never proceeds with a silent gap on a required axis.

---

## Red Flags — Stop and re-read the Phase

| If you're thinking this... | Reality |
|---|---|
| "I'll just `Glob` for test files myself — faster than running the script" | The script enforces consistent scope and emits a verifiable catalog. `Glob` results drift between runs; the script doesn't. The catalog is also the anti-hallucination guard for Phase 6. |
| "The `describe` name doesn't match exactly but it's obviously the same test" | If you cannot quote the block name verbatim from the catalog, treat as `NOT IMPLEMENTED`. Semantic match without a verbatim anchor is the most common way this skill produces a false `IMPLEMENTED`. |
| "The test calls a helper that probably covers the assertion" | Cross-file fixture coupling is a v2 problem. In v1, only the matched block's own assertions count. Document the blind spot in the report, do not paper over it. |
| "I read the whole test file — I have context now" | You blew the token budget and biased the next match. Always slice via the script. |
| "The plan said 'shows error banner' and the test has `expect(toast).toBeVisible()` — close enough" | Quote the assertion text and let the rubric decide (v2). In v1, this is `IMPLEMENTED` if the block name matches; quality judgment is deferred. |
| "Two scenarios look like the same test — I can merge them in the report" | Don't. Each scenario gets its own row. Many-to-one mapping is valid and informative; collapsing hides duplication signal. |
| "The issue crawl found 40 issues at depth 2 — I should add depth 3 for context" | No. The depth cap exists because epics fan out exponentially. If a requirement only appears at depth 3, it is too far from the change to be the test plan's responsibility. |
| "I'll post the report as a PR comment since the report is ready" | Posting is a side effect. Always ask the user before posting — see `Boundaries`. |
| "Mode is `plan` but the catalog is right there — I'll quickly add the implementation findings too" | Don't. The mode is a contract with the user about scope. Adding axes silently means a future read of the report cannot tell `plan` from `both`. If you believe `both` is needed, ask: *"You picked `plan`. Want me to re-run as `both`?"* |
| "Mode is `impl` and the crawl set is empty anyway, so I'll just call it `both`" | No. The user explicitly chose `impl`. The empty crawl set in `both` would still be **disclosed** in the Scope of this run block; silently relabeling it as `impl` hides that the user wanted requirements analysis but it produced nothing. |
| "The user gave `--plan-pr` but not `--impl-pr`; I'll just assume they want the same PR for impl too" | No. If they wanted that they'd have used `--pr`. The split is intentional. Default to the **plan PR's plugin walk-up** for tests scope and **disclose** that defaulting in Scope-of-run. |
| "The plan PR links to the impl PR in its body — I'll auto-discover and add it to `--impl-pr`" | No. PR-to-PR cross-references are *informational*, not source-of-truth. The user owns which PRs feed which axis. Silent expansion is the surest way to validate a plan against the wrong code. |
| "Sources are split across two PRs, but the plan PR diff has no `.md` — I'll use the impl PR's body as scenarios" | No. PR bodies are not scenarios. Scenarios come from `.md` files only. If no `.md` resolves, stop. |
| "The heatmap says 30/33 scenarios have ≥1 candidate match, so the plan is well covered" | The heatmap is **triage, not verdict**. A keyword-overlapping block name may or may not actually test the scenario's assertion. Always tell the consumer the heatmap is candidate coverage and a real run is needed for verdicts. Don't strip the "Next Step" block. |
| "The size guard fired — I'll just bump --overlap-threshold up so the heatmap finds fewer candidates" | Wrong dial. The threshold controls heatmap noise (false positives), not catalog size. If the size guard fires, narrow `--impl-scope` or pass `--summary-only` — don't paper over the budget issue with a tighter threshold. |
| "User asked for verdicts but I auto-promoted to --summary-only because the catalog was big" | Never silently downgrade. The size guard prompt explicitly offers `--summary-only` as a user choice. Wait for the user to choose. |
| "The user gave `--impl-scope` but I see relevant tests elsewhere in the plugin — I'll add walk-up implicitly" | No. `--impl-scope` (or `--impl-pr` with test files) is an explicit opt-out of walk-up. Re-adding it silently re-explodes the scope the user just narrowed and will usually trip the size guard. If you have evidence walk-up would catch real coverage, tell the user and ask them to pass `--with-walk-up`. |
| "Walk-up resolves to a plugin but I see the FTR tests live one directory up — I'll skip the FTR sibling for simplicity" | No. The solution-test sibling (`x-pack/solutions/<S>/test/`) is part of the walk-up rule by design. Dropping it produces silent under-coverage: the FTR API-integration suite that actually validates the impl PR will be invisible. If you don't want it, suppress the whole walk-up instead. |

---

## Phases

Execute the phases in order. Each phase produces evidence the next depends on. **Which phases run is determined by `Mode`** (see Inputs):

| Phase | `plan` | `impl` | `both` | with `--summary-only` |
|---|---|---|---|---|
| 0 — Resolve sources | ✅ | ✅ | ✅ | ✅ |
| 1 — Extract scenarios | ✅ | ✅ | ✅ | ✅ |
| 2 — Crawl linked issues | ✅ | ⊘ | ✅ | unchanged |
| 3 — Extract requirements | ✅ | ⊘ | ✅ | unchanged |
| 4 — Plan ↔ Requirements coverage | ✅ | ⊘ | ✅ | unchanged |
| 5 — Build test catalog | ⊘ | ✅ | ✅ | size guard waived |
| 6 — Match scenarios → test blocks (LLM) | ⊘ | ✅ | ✅ | **replaced by 6.alt** |
| 6.alt — Heatmap scoring (deterministic) | ⊘ | ⊘ | ⊘ | ✅ |
| 7 — Judge implementation quality *(v2)* | ⊘ | ✅ | ✅ | ⊘ |
| 8 — Render report | ✅ | ✅ | ✅ | section variant changes |

Skipped phases are **not** silently omitted — Phase 8 declares them in a `Scope of this run` block so the consumer never mistakes "no findings" for "fully validated".

### Phase 0 — Resolve sources

Resolve the three artifact sources per the rules in [Inputs › Source resolution rules](#source-resolution-rules). Every input flag (`--pr`, `--plan-pr`, `--plan-file`, `--impl-pr`, `--impl-scope`, `--issue`, `--no-crawl`) is processed here.

For each PR-bearing flag, fetch the PR metadata and diff in parallel:

```bash
gh pr view <N> --json number,title,body,headRefName,baseRefName
gh pr diff <N> --name-only
```

Build the resolution result — keep it in memory and surface it in Phase 8's `Scope of this run`:

| Resolved field | How it's built |
|---|---|
| `scenarios.md_paths` | Union of `.md` files from every `--pr`/`--plan-pr` diff + every `--plan-file`. Repo-relative. Deduped. |
| `scenarios.head_ref` | Per-file: the head ref of the PR it came from, or `HEAD` for `--plan-file`. Needed to fetch content at the right commit. |
| `tests.scope_paths` | Union of: (a) directories of test files in every `--pr` / `--impl-pr` diff (path → dirname, filtered to test-file patterns), (b) every `--impl-scope`, (c) **conditional** walk-up per [Source resolution rule 2](#source-resolution-rules) — suppressed by default when (a) or (b) is non-empty, unless `--with-walk-up`. When applied, walk-up resolves to nearest `kibana.jsonc` *and* the solution-test sibling (`x-pack/solutions/<S>/test/`) when the plugin lives under `solutions/<S>/plugins/`. Deduped. |
| `tests.walk_up` | Disclosure record for Scope-of-run: `{ applied: boolean, suppressed_reason: string \| null, sources: string[] }`. `suppressed_reason` is e.g. `"--impl-pr resolved 6 test files"` or `"--impl-scope provided"`. |
| `tests.modified_files` | For drift-flag detection (Phase 6): the exact test-file paths from `--impl-pr`/`--pr` diffs — used to flag scope mismatches separately from reuse. |
| `issues.crawl_seeds` | Bodies to scan for issue URLs: every fetched PR body + every fetched `.md` content. Empty if `--no-crawl`. |
| `issues.explicit_urls` | Every `--issue <url>` value, deduped against crawled URLs in Phase 2. |

**Fetch the `.md` files' contents** at the per-file head ref:
```bash
gh api repos/{owner}/{repo}/contents/<path>?ref=<head> -H "Accept: application/vnd.github.raw"
```
Local `--plan-file` paths are read directly from disk (no `gh api`).

**Stop conditions** (all mode-aware — see [Mode + sources](#mode--sources--what-the-user-must-supply-for-each-mode)):
- `scenarios.md_paths` is empty → stop regardless of mode. *"No test plan markdown resolved. Pass `--pr`, `--plan-pr`, or `--plan-file`."*
- mode is `plan` or `both`, `--no-crawl` is set, and `issues.explicit_urls` is empty → stop. *"Requirements axis has no source."*
- `--pr` is combined with `--plan-pr` or `--impl-pr` → stop. *"Ambiguous: use `--pr` alone for single-PR mode, or split with `--plan-pr` / `--impl-pr`."*
- `--summary-only` is combined with `--mode plan` → stop. *"`--summary-only` has no effect with `--mode plan` (no impl phase to summarize). Drop one of the flags."*

### Phase 1 — Extract scenarios

For each `.md` file: use the **scenarios prompt** from [`references/matching-rubric.md`](references/matching-rubric.md#scenarios-prompt). Output: a flat list of plain-English scenario strings, one per line, with the source `.md` path as metadata.

If a `.md` file contains no scenarios (e.g., it's a changelog), drop it from the list. Do not invent scenarios to pad the count.

### Phase 2 — Crawl linked issues (hard depth cap: 2)

**Skipped when `mode = impl` OR when `--no-crawl` is set** (in the latter case, requirements come only from explicit `--issue` URLs and Phase 3 still runs against those).

Extract every GitHub issue URL from each entry of `issues.crawl_seeds` (resolved in Phase 0 — every fetched PR body + every fetched `.md` content). Add every `issues.explicit_urls` value. Dedupe across sources.

Pattern: `https?://github\.com/[^/]+/[^/]+/(issues|pull)/\d+`

**Depth 1**: fetch the issues only (not PRs — the PR is the change itself). Use `gh issue view --repo <owner>/<repo> <N> --json title,body`.

**Depth 2**: scan the depth-1 issue bodies for more issue URLs. Fetch any not already seen. Dedupe by URL across depths. Hard stop at depth 2.

Maintain a single `fetched` set so the same URL is never fetched twice. If the set grows past 25, stop and ask the user: *"Crawl found 25+ issues at depth 2. This may exceed token budget. Continue, narrow scope, or stop?"*

**Empty result handling** (mode-dependent):
- `mode = plan` and zero issues fetched → stop and tell the user *"No public requirements found via crawl. Provide additional issue URLs, or re-run with `--mode impl` to validate plan ↔ tests only."* Do not proceed to Phase 3/4 with an empty input.
- `mode = both` and zero issues fetched → emit a warning, continue to Phase 5 (Plan ↔ Tests still runs), and mark the Plan ↔ Requirements section in Phase 8 as `not available`. Do not silently downgrade to `impl` mode without disclosure.

### Phase 3 — Extract requirements

**Skipped when `mode = impl`.**

For each fetched issue: use the **requirements prompt** from [`references/matching-rubric.md`](references/matching-rubric.md#requirements-prompt). Each requirement must carry exactly one category prefix: `[FUNCTIONAL]`, `[NEGATIVE]`, `[EDGE CASE]`, `[AUTH]`, `[ERROR]`.

### Phase 4 — Plan ↔ requirements coverage

**Skipped when `mode = impl`.** This is the only phase that consumes the requirements bucket — when `impl` is selected, the entire requirements axis is absent from the report.

Use the **coverage prompt** from [`references/matching-rubric.md`](references/matching-rubric.md#coverage-prompt). Generous `COVERED` bar — a scenario covers a requirement if it would catch a regression in it, regardless of wording.

Output bucket counts: `covered` / `missing` / `unclear`. Enforce single-bucket membership: `covered > missing > unclear`. Anything not classified falls into `unclear` — never silently drop.

This phase reproduces the current `elastic/test-tracer` CLI behaviour. Output format: see [`references/output-format.md`](references/output-format.md#plan--requirements-section).

### Phase 5 — Build test catalog (deterministic, scripted)

**Skipped when `mode = plan`.** This phase (and 6, 7) only runs for `impl` and `both`.

The scope is `tests.scope_paths` as resolved in Phase 0 — do not re-derive it here. It is the union of:
- directories of test files modified by `--pr` / `--impl-pr` diffs (filtered to test-file patterns),
- every explicit `--impl-scope`,
- the **conditional walk-up** — suppressed by default when explicit impl signals are present (force back on with `--with-walk-up`). When applied, walk-up adds the plugin root (nearest `kibana.jsonc`) *and* the solution-test sibling (`x-pack/solutions/<S>/test/`). The latter catches FTR API-integration and Cypress E2E suites that exercise the plugin but live one level up by Kibana convention — this is exactly the gap that turned up in the retest on PR #259855, where the FTR `deprecation_review` and `get_prebuilt_rules_status` suites would otherwise be invisible.

Run the catalog script with one `--scope` flag per resolved path:
```bash
node x-pack/solutions/security/plugins/security_solution/.agents/skills/test-tracer/scripts/build_describe_catalog.mjs --scope <root1> --scope <root2> ...
```

Output: JSON array of `{ path, line, blockName, framework, parentChain }` for every `describe`/`it`/`test`/`apiTest`/`spaceTest`/`cy.it` in scope.

**You may not search for test files any other way in this phase.** No `Glob`. No `Grep`. The catalog is the universe of valid test blocks for Phase 6.

**Size guard (mandatory unless `--summary-only`)**: if the catalog exceeds 500 KB or 1,000 blocks, **stop and ask the user to narrow scope**:

> *"Catalog scope `<root>` produced N blocks (<size> KB) — too large for a single matching prompt without truncation. Narrow the scope to one of: [list one-level-down subdirs of the auto-detected plugin]. Alternatively, re-run with `--summary-only` for a deterministic heatmap that accepts the wider scope."*

Do not truncate the catalog silently. Truncation invalidates the anti-hallucination gate — the model would be asked to match against a list that does not represent the full universe of test blocks, and any "NOT IMPLEMENTED" verdict would be unreliable.

**With `--summary-only` the guard is waived** — Phase 6 will no longer feed the catalog to an LLM, so token budget is irrelevant. The full catalog is required for accurate per-scope coverage density.

Empirical reference (Security Solution, retest June 2026 on PR #259855):

| Scope | Blocks | Size | Guard verdict |
|---|---|---|---|
| Plugin only (`plugins/security_solution/`) | ~33K | 9.4 MB | fires 33× over |
| Plugin + solution-test sibling (`+ test/`) — full auto walk-up | **~41K** | 11.7 MB | fires 41× over |
| `--plan-pr 259855 --impl-pr 263662`, walk-up suppressed (8 dirs auto-resolved from corrected test-file filter) | **614** | 230 KB | passes ✓ |
| `--impl-scope <6 narrow paths>`, walk-up suppressed | **679** | 249 KB | passes ✓; verbatim-matched 33 / 33 scenarios |

A single PR's affected directories with walk-up suppressed reliably narrow to **50–900 blocks / 15–250 KB**, comfortably inside the 1,000-block / 500 KB guard.

### Phase 6 — Match scenarios → test blocks

**Skipped when `mode = plan`.**

**Replaced by deterministic keyword-overlap scoring when `--summary-only` is set** — see [Phase 6.alt](#phase-6alt--summary-only-heatmap-scoring). The rest of this section describes the standard (LLM-based) matching path.

For each scenario from Phase 1, prompt with the **matching prompt** from [`references/matching-rubric.md`](references/matching-rubric.md#matching-prompt), passing the bounded catalog from Phase 5 as input.

Required output shape per scenario:
```json
{
  "scenario": "<verbatim from Phase 1>",
  "matches": [
    { "path": "<from catalog>", "blockName": "<verbatim from catalog>", "confidence": "high|medium|low" }
  ]
}
```

**Validation gate** (mandatory):
- For each `(path, blockName)` claimed: confirm the exact `blockName` string appears as the `blockName` field for the same `path` in the catalog JSON.
- If a claimed block does not appear: drop it and log a `HALLUCINATION` warning naming the scenario. **Do not retry more than once per scenario** — a second hallucination means the scenario is `INCONCLUSIVE`.
- If a scenario ends with zero validated matches: it is `NOT IMPLEMENTED`.

**Drift flags** (per [`references/output-format.md`](references/output-format.md#plan--tests-section-impl-mode-or-the-middle-section-of-both)):
- **test-layer drift** — compare the scenario's `**Automation**:` line (E2E / API integration / Unit) against the matched block's framework (`cypress` / `scout-*` for E2E; jest-style `.test.ts` for unit; FTR `test_suites/.../*.ts` for API integration). Mismatch → flag.
- **scope-only-via-walk-up** *(disclosure, not drift)* — if **all** validated matches for a scenario lie outside `tests.modified_files`, the scenario relies on tests **not** added by the impl PR(s). Surface in a `tests outside impl PR` annotation under the scenario; this is informational (the test exists, just not in this PR). Use it to spot when the impl PR claims to deliver scenarios it didn't actually code.

### Phase 6.alt — Summary heatmap scoring

**Only runs when `--summary-only` is set** (in place of Phase 6). Deterministic, no LLM, no token budget.

**v1 status: the companion script `scripts/compute_coverage_heatmap.mjs` is specified but not yet implemented.** When `--summary-only` is passed in v1, stop and tell the user:

> *"`--summary-only` requires `scripts/compute_coverage_heatmap.mjs`, which is not yet implemented in v1. For a verdict-grade run, narrow `--impl-scope` until the size guard passes. The flag's design is documented in SKILL.md for v2."*

Do not attempt to substitute an LLM-driven shortcut. The flag's value is *deterministic* coverage density; an ad-hoc LLM approximation would defeat the anti-hallucination guarantee that justifies its existence.

Algorithm (for the v2 implementation):

1. **Tokenize each scenario**: lowercase the scenario string; split on non-alphanumeric; split camelCase identifiers; drop tokens shorter than 4 chars; drop the stopword set (`given`, `when`, `then`, `user`, `the`, `with`, `and`, `for`, `that`, `from`, `does`, `should`, `will`).
2. **Tokenize each catalog block**: same rules over `blockName + ' ' + parentChain.join(' ')`.
3. **Score**: per `(scenario, block)` pair, compute `jaccard = |intersection| / |union|`. A pair counts as a *candidate match* iff `jaccard >= overlap-threshold` (default `0.15`, configurable via `--overlap-threshold`).
4. **Aggregate per scope**: for each scope path passed in Phase 0, count `scenarios with ≥1 candidate match in this scope` and emit `<count> / <total scenarios>` plus the percentage.
5. **Aggregate per scenario**: classify into one of three buckets:
   - `GAPS` — zero candidate matches anywhere in the catalog
   - `HOTSPOTS` — five or more candidate matches anywhere (likely covered, but worth verifying with a real run)
   - `NORMAL` — one to four candidate matches (omitted from the report by default; available with a future `--verbose` flag)

**Anti-hallucination is structurally guaranteed** here: no LLM ever names a block. The deterministic script emits a list of candidate `(scenario, path:line, blockName, jaccard)` tuples, and the report quotes them verbatim from that list.

**This phase does not produce verdicts.** Every scenario's status is `CANDIDATE COVERAGE` or `NO CANDIDATE`. To get `IMPLEMENTED` / `NOT IMPLEMENTED`, the user must re-run without `--summary-only`.

Output is rendered per [`references/output-format.md`](references/output-format.md#plan--tests--summary-heatmap-only).

### Phase 7 — Judge implementation quality *(v2 — skipped in v1)*

**Skipped when `mode = plan` OR `--summary-only` is set, regardless of v1/v2.**

**v1 cut**: Skip this phase. Every validated match from Phase 6 is `IMPLEMENTED`. Move to Phase 8.

**v2 behaviour**: For each validated match, run `node scripts/extract_test_block.mjs --file <path> --block <blockName>` to slice the test body. Judge per [`references/quality-rubric.md`](references/quality-rubric.md). Verdict per match: `strong` / `medium` / `weak` / `none`. Require the model to quote the assertion line; if the quote is not in the slice, downgrade to `INCONCLUSIVE`.

### Phase 8 — Render report (mode-aware)

Always runs. The sections rendered depend on `Mode` and whether `--summary-only` is set:

| Mode | `--summary-only` | Sections emitted |
|---|---|---|
| `plan` | off | `Scope of this run` + `Plan ↔ Requirements` + Slack one-liner |
| `plan` | on | **rejected** at Phase 0 — no impl axis to summarize |
| `impl` | off | `Scope of this run` + `Plan ↔ Tests` + Slack one-liner |
| `impl` | on | `Scope of this run` + `Plan ↔ Tests — Summary (heatmap)` + Slack one-liner (summary variant) |
| `both` | off | `Scope of this run` + `Plan ↔ Requirements` + `Plan ↔ Tests` + `Three-Way Merge` + Slack one-liner |
| `both` | on | `Scope of this run` + `Plan ↔ Requirements` + `Plan ↔ Tests — Summary (heatmap)` + `Three-Way Merge (degraded)` + Slack one-liner (mixed variant) |

The `Scope of this run` block is **mandatory** in every mode — it lists which axes were analyzed, which were skipped, and whether the impl axis used full matching or summary scoring. Format: see [`references/output-format.md`](references/output-format.md#scope-of-this-run).

The Three-Way Merge section (the only place `NOT PLANNED, NOT IMPLEMENTED` blind spots surface) is **only emitted in `both` mode** — it requires both axes to be present. With `--summary-only` it degrades to *candidate-coverage* instead of *validated-coverage*, and the section is labeled accordingly.

Detailed formats: [`references/output-format.md`](references/output-format.md#three-way-report).

After printing the report: if the user requested `comment` mode, present the report content and ask: *"Ready to post this report as a comment on PR #N? (yes / no / edit first)"*. Never post without an explicit yes.

---

## Verdict Taxonomy

### Per scenario, verdict-grade run (Phases 5–7, no `--summary-only`)

| Verdict | Condition |
|---|---|
| `IMPLEMENTED` | At least one validated match from Phase 6; in v2: at least one match with quality `strong` or `medium` |
| `IMPLEMENTED — WEAK` *(v2 only)* | All matches have quality `weak` or `none`; flag for human review |
| `NOT IMPLEMENTED` | Zero validated matches |
| `INCONCLUSIVE` | Validation gate failed (hallucination detected); or v2 quality judgment failed quote check |

A scenario may additionally carry `DRIFT FLAGS` (test-layer drift, behavior mismatch, sub-assertion gap) as an annotation — independent of the verdict.

**Never use `LIKELY IMPLEMENTED`** — either confirm with a validated match (`IMPLEMENTED`) or acknowledge uncertainty (`INCONCLUSIVE`). This mirrors the `bug-validator` skill's anti-hedging rule.

### Per scenario, summary run (Phase 6.alt, `--summary-only`)

| Status | Condition |
|---|---|
| `CANDIDATE COVERAGE` | At least one catalog block with Jaccard token overlap ≥ `--overlap-threshold` |
| `NO CANDIDATE` | Zero blocks above threshold anywhere in the catalog |

Summary-mode statuses are **not verdicts**. They never claim a test actually exercises the scenario — only that some block name overlaps in keywords. See [Phase 6.alt](#phase-6alt--summary-heatmap-scoring) and the Red Flag *"The heatmap says 30/33 scenarios have ≥1 candidate match, so the plan is well covered"*.

### Per requirement (Phase 8 three-way merge, verdict-grade)

| Verdict | Plan coverage (Phase 4) | Implementation coverage (Phase 6) |
|---|---|---|
| `PLANNED & IMPLEMENTED` | covered | scenario(s) implemented |
| `PLANNED & IMPLEMENTED — WEAK` ⚠ *(v2)* | covered | only weak matches |
| `PLANNED, NOT IMPLEMENTED` | covered | scenario(s) not implemented |
| `IMPLEMENTED, NOT PLANNED` | missing | a test block exists for the requirement directly |
| `NOT PLANNED, NOT IMPLEMENTED` | missing | no scenario, no test |
| `INCONCLUSIVE` | unclear, or any side failed validation |

`IMPLEMENTED, NOT PLANNED` is a **positive** signal — surface it with positive framing in the report. See output format.

### Per requirement (Phase 8 three-way merge, degraded — `--mode both --summary-only`)

| Verdict | Plan coverage (Phase 4) | Impl coverage (Phase 6.alt heatmap) |
|---|---|---|
| `PLANNED & CANDIDATE-COVERED` | covered | scenario has ≥1 candidate block |
| `PLANNED, NO CANDIDATE` | covered | zero candidates → strong negative signal |
| `NOT PLANNED, NO CANDIDATE` | missing | zero candidates → unambiguous gap |
| `INCONCLUSIVE` | unclear, or any failure mode |

`IMPLEMENTED, NOT PLANNED` cannot exist in the degraded merge — surfacing it requires verdict-grade matching. The report explicitly states this so silence is not misread as absence.

---

## Information Gathering

**Self-investigate first** — do not ask the user for things you can determine:

| Information | How |
|---|---|
| Modified `.md` files in a PR | `gh pr diff <N> --name-only` |
| `.md` file contents in a PR | `gh api .../contents/{path}?ref={head}` |
| `.md` file contents on disk | Read directly via the file tool |
| Modified test files in an impl PR | `gh pr diff <N> --name-only`, filter to test patterns |
| Linked issues | regex over PR bodies + `.md` contents, deduped against `--issue` explicits |
| Issue bodies | `gh issue view --json title,body` (or `gh api repos/.../issues/<N>` for cross-org issues) |
| Plugin walk-up for scope default | walk up from `.md` path to nearest `kibana.jsonc`; if it lives under `x-pack/solutions/<S>/plugins/`, also add `x-pack/solutions/<S>/test/`. Skip entirely when explicit `--impl-pr`/`--impl-scope` is given, unless `--with-walk-up` is set. |
| Test catalog | `scripts/build_describe_catalog.mjs` |
| Test block bodies *(v2)* | `scripts/extract_test_block.mjs` |
| Team ownership | `kibana.jsonc` `owner` field |

**Ask the user only for**:
- Which split was intended when `--pr` is combined with `--plan-pr` / `--impl-pr` (ambiguous — see Conflict and ambiguity handling).
- Additional issue URLs not discoverable via crawl (e.g., genuinely-private epic mentioned only in Slack — pass via `--issue`).
- Scope narrowing when the catalog size guard fires.
- Approval to post a GitHub comment.
- Approval to continue after a 25+ issue crawl warning.

---

## Output

Default: print the report to the chat in the format defined in [`references/output-format.md`](references/output-format.md). The first block is always `Scope of this run` (see Phase 8 — Render report). Subsequent sections are mode-dependent:

| Mode | `--summary-only` | Section order |
|---|---|---|
| `plan` | off | Scope of this run → Plan ↔ Requirements → Slack one-liner |
| `plan` | on | **rejected** — flag has no effect with `--mode plan` |
| `impl` | off | Scope of this run → Plan ↔ Tests → Slack one-liner |
| `impl` | on | Scope of this run → **Plan ↔ Tests — Summary (heatmap)** → Slack one-liner (summary variant) |
| `both` | off | Scope of this run → Plan ↔ Requirements → Plan ↔ Tests → Three-Way Merge → Slack one-liner |
| `both` | on | Scope of this run → Plan ↔ Requirements → **Plan ↔ Tests — Summary (heatmap)** → **Three-Way Merge (degraded)** → Slack one-liner (mixed variant) |

### Slack one-liner — mode-specific wording

The one-liner must match the mode's scope. Never claim end-to-end coverage from a partial run. Summary-mode one-liners must use the word *candidate* and avoid any verdict noun (`implemented` / `not implemented` / `covered`).

| Mode | `--summary-only` | Format |
|---|---|---|
| `plan` | off | *"Test Tracer (plan) #\<PR\>: \<COVERED\> / \<total requirements\> requirements covered by scenarios. \<MISSING\> not covered, \<UNCLEAR\> unclear. Implementation not validated in this run."* |
| `impl` | off | *"Test Tracer (impl) #\<PR\>: \<IMPLEMENTED\> / \<total scenarios\> scenarios have a matching test block. \<NOT IMPLEMENTED\>, \<INCONCLUSIVE\>. Requirements coverage not validated in this run."* |
| `impl` | on | *"Test Tracer (impl, summary) \<scope\>: \<WITH CANDIDATES\> / \<total scenarios\> scenarios have ≥1 candidate block (heatmap, threshold \<X\>). \<NO CANDIDATE\> gaps. Triage only — re-run without --summary-only for verdicts."* |
| `both` | off | *"Test Tracer #\<PR\>: \<PLANNED & IMPLEMENTED\> / \<total requirements\> requirements covered end-to-end. \<PLANNED, NOT IMPLEMENTED\> planned but not tested, \<NOT PLANNED, NOT IMPLEMENTED\> gaps."* |
| `both` | on | *"Test Tracer (both, summary) \<scope\>: \<COVERED\> / \<total\> reqs covered by scenarios; \<WITH CANDIDATES\> scenarios with ≥1 candidate block (heatmap). Triage only — verdicts require a narrower verdict-grade run."* |

---

## v1 vs v2 — Scope

| Phase / capability | v1 | v2 |
|---|---|---|
| 0–6 (verdict-grade path) | ✅ ship | ✅ ship |
| 6.alt (`--summary-only` heatmap) | ❌ spec only — `scripts/compute_coverage_heatmap.mjs` is not yet implemented; flag rejects with a clear message | ✅ ship — full deterministic heatmap |
| 7 (quality judgment) | ❌ skip — all validated matches are `IMPLEMENTED` | ✅ ship — `strong`/`medium`/`weak`/`none` + quoted assertion |
| 8 (report) | ✅ ship — without weak/strong distinction, no degraded-merge variant | ✅ ship — full taxonomy + degraded merge under `--summary-only` |
| GitHub comment posting | ❌ console only | ✅ via `kbn-github` |
| Cypress framework | ✅ catalog walker already handles `.cy.ts` | ✅ + Cypress-specific drift flags |
| Cross-file fixture detection | ❌ documented blind spot | ❌ still a blind spot, with mitigation TBD |
| Rule-management-specific variant | ❌ generic only | ✅ ship `test-tracer-rule-management` plugin-local skill that defaults scope to the `domain.json` paths and layers detection-engine quality patterns |

---

## Continuous Learning

When you identify a recurring pattern not yet documented, tell the user:

> *"I noticed a pattern not yet in the test-tracer skill: **[description]**. Want me to add it?"*

Add to:
- `references/matching-rubric.md` — new requirement category, new framework name, new scenario shape.
- `references/quality-rubric.md` — new strong/weak assertion pattern.
- `references/output-format.md` — new report column or section.

Never edit references without user confirmation.

---

## Reference Files

- [`references/matching-rubric.md`](references/matching-rubric.md) — all four LLM prompts (scenarios, requirements, plan↔requirements coverage, scenarios↔tests matching) with validation rules and worked examples.
- [`references/quality-rubric.md`](references/quality-rubric.md) — *v2 only*. Assertion-quality classification with anchored examples lifted from the `bug-fix` Red Flags table.
- [`references/output-format.md`](references/output-format.md) — Phase 4 console report, Phase 8 three-way report, GitHub comment template, and the canonical Markdown layout.

## Scripts

- `scripts/build_describe_catalog.mjs` — *shipped*. Inputs: one or more `--scope <path>` flags. Each scope is either a directory (walked recursively) or a single test file (yielded directly, no siblings). Output: JSON array of `{ path, line, blockName, framework, parentChain }`. Frameworks: `jest`, `scout-api`, `scout-ui`, `scout-space`, `cypress`. Frameworks recognized via call-name regex over file contents. No deps beyond Node.
- `scripts/extract_test_block.mjs` — *shipped, used by v2*. Inputs: `--file <path> --block <name>`. Output: the slice from `describe(name, ...) {` to its matching closing brace. Pure deterministic.
- `scripts/compute_coverage_heatmap.mjs` — *to be built, for `--summary-only`*. Inputs: `--catalog <path-to-catalog.json> --scenarios <path-to-scenarios.json> [--threshold <float>]`. Output: JSON `{ perScope: [{ scope, scenariosWithCandidates, total, pct }], perScenario: [{ scenario, candidates: [{ path, line, blockName, jaccard }] }] }`. Tokenization rules per [Phase 6.alt](#phase-6alt--summary-only-heatmap-scoring). Pure deterministic, zero LLM, zero npm deps.
