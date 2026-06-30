# Output Format

Canonical layouts for every report this skill produces.

The skill **always** starts with the `Scope of this run` block (defined below). The sections that follow are determined by `Mode` and whether `--summary-only` is set (see SKILL.md Inputs):

| Mode | `--summary-only` | Section order |
|---|---|---|
| `plan` | off | Scope of this run → Plan ↔ Requirements → Slack one-liner |
| `plan` | on | **rejected** at Phase 0 — no impl axis to summarize |
| `impl` | off | Scope of this run → Plan ↔ Tests → Slack one-liner |
| `impl` | on | Scope of this run → **Plan ↔ Tests — Summary (heatmap)** → Slack one-liner (summary variant) |
| `both` | off | Scope of this run → Plan ↔ Requirements → Plan ↔ Tests → Three-Way Merge → Slack one-liner |
| `both` | on | Scope of this run → Plan ↔ Requirements → **Plan ↔ Tests — Summary (heatmap)** → **Three-Way Merge (degraded — candidate-coverage only)** → Slack one-liner (mixed variant) |

The Three-Way Merge bucket (`NOT PLANNED, NOT IMPLEMENTED`) only exists in `both` mode — it requires both axes to be present. With `--summary-only` the bucket renders as `NOT PLANNED, NO CANDIDATE` and the section is labelled *degraded* to signal that `IMPLEMENTED, NOT PLANNED` cannot be detected by keyword overlap.

---

## Scope of this run

Mandatory header in every mode. Tells the reader exactly **which sources were resolved** for each axis, **which axes were analyzed**, and **which were not** — so a partial report can never be mistaken for a full one, and every result is reproducible from the disclosed sources.

Symbols: `✓` analyzed · `⊘` skipped (phase did not run) · `⚠` ran but produced empty/degraded input.

### Layout (always print every section)

```
============================================================
  TEST TRACER
============================================================
  Mode      : <plan | impl | both>

  Sources
    scenarios     : <count> .md file(s) from <origins>
    tests         : <N> scope path(s) — <origins>
    walk-up       : <applied | suppressed (<reason>)>
    requirements  : <crawled> crawled, <explicit> explicit --issue, <skipped if --no-crawl>

  Coverage axes
    [✓|⊘|⚠] Plan ↔ Requirements   (<status detail>)
    [✓|⊘|⚠] Plan ↔ Tests          (<status detail>)
    [✓|⊘]   Three-Way Merge       (<status detail>)
============================================================
```

The `Sources` block is what makes the run reproducible — list each origin (`PR #N` / `path/to/file.md` / `--impl-scope <path>` / `--issue <url>`) so the report can be re-run later and still mean the same thing.

The `walk-up` line is **mandatory** (always print, even in `plan` mode where it would say `not applicable`). Its purpose is to make scope expansion or suppression auditable: a consumer reading the report must always be able to tell whether the tests catalog included the automatic plugin + solution-test sibling, or only what the user passed explicitly. Possible values:
- `applied (<plugin path> + <solution test sibling>)` — auto walk-up expanded the scope.
- `applied via --with-walk-up (<paths>)` — user forced walk-up back on despite explicit impl signal.
- `suppressed (<reason>)` — auto walk-up was skipped because the user passed explicit impl signals. Example reason: `"--impl-pr #263662 resolved 6 test files"` or `"--impl-scope provided (3 paths)"`.
- `not applicable (mode = plan)` — tests axis is skipped entirely.

### Concrete examples — one per realistic invocation shape

**Shape 1: single PR for everything (no explicit impl signal → walk-up applied)**
```
  Mode      : both
  Sources
    scenarios     : 1 .md file from PR #259855
    tests         : 2 scope paths
                     — x-pack/solutions/security/plugins/security_solution/
                     — x-pack/solutions/security/test/
    walk-up       : applied (security_solution plugin + solutions/security/test/ sibling)
    requirements  : 5 crawled (PR #259855 body, .md content; depth ≤ 2), 0 explicit
  Coverage axes
    ⚠ Plan ↔ Tests          (catalog ~41K blocks / 11.7 MB — SIZE GUARD FIRES; user must narrow)
```
*Note*: this shape almost always trips the size guard against a large plugin like `security_solution`. The next two shapes show how users typically narrow.

**Shape 2: split plan PR + impl PR — walk-up SUPPRESSED by explicit impl signal**
```
  Mode      : both
  Sources
    scenarios     : 1 .md file from PR #259855
    tests         : 8 scope paths from --impl-pr #263662 (after test-file filter)
                     — plugins/security_solution/.../rule_deprecation/
                     — plugins/security_solution/.../prebuilt_rule_assets_client/methods/
                     — test/security_solution_cypress/.../prebuilt_rules/deprecation/
                     — test/security_solution_api_integration/.../prebuilt_rules/common/deprecation/
                     — test/security_solution_api_integration/.../prebuilt_rules/common/install_prebuilt_rules/
                     — test/security_solution_api_integration/.../prebuilt_rules/common/status/
                     — test/security_solution_api_integration/.../customization_enabled/upgrade_prebuilt_rules/
                     — test/security_solution_api_integration/.../utils/rules/prebuilt_rules/
    walk-up       : suppressed (--impl-pr #263662 resolved 14 test files —
                                 6 Jest/Cypress + 7 FTR + 1 utils;
                                 pass --with-walk-up to re-enable)
    requirements  : 5 crawled (PR #259855 body, PR #263662 body, .md content; depth ≤ 2),
                    0 explicit
  Coverage axes
    ✓ Plan ↔ Requirements   (8 requirements extracted from 6 issues)
    ✓ Plan ↔ Tests          (catalog: 614 blocks across 89 files in 8 scopes)
    ✓ Three-Way Merge       (8 requirements × 33 scenarios × 67 deprecation blocks)
```

**Shape 3: plan on disk + explicit scope — walk-up SUPPRESSED**
```
  Mode      : impl
  Sources
    scenarios     : 1 .md file on disk (path/to/prebuilt_rule_deprecation.md)
    tests         : 6 scope paths from --impl-scope
                     — plugins/security_solution/.../rule_deprecation/
                     — plugins/security_solution/.../prebuilt_rule_assets_client/methods/
                     — plugins/security_solution/.../prebuilt_rules/model/
                     — test/security_solution_cypress/.../prebuilt_rules/deprecation/
                     — security_solution_api_integration/.../deprecation/
                     — security_solution_api_integration/.../status/
    walk-up       : suppressed (--impl-scope provided, 6 paths;
                                 pass --with-walk-up to re-enable)
    requirements  : (skipped — mode = impl)
  Coverage axes
    ⊘ Plan ↔ Requirements   (skipped — mode = impl)
    ✓ Plan ↔ Tests          (catalog: 679 blocks across 68 files in 6 scopes)
    ⊘ Three-Way Merge       (skipped — requires Plan ↔ Requirements)
```

**Shape 3b: same as Shape 3 but user forced walk-up back on**
```
  Mode      : impl
  Sources
    scenarios     : 1 .md file on disk (path/to/prebuilt_rule_deprecation.md)
    tests         : 8 scope paths from --impl-scope + --with-walk-up
                     ... (6 explicit, as above) ...
                     — plugins/security_solution/                 (walk-up: plugin)
                     — x-pack/solutions/security/test/            (walk-up: solution sibling)
    walk-up       : applied via --with-walk-up (security_solution plugin + solutions/security/test/)
    requirements  : (skipped — mode = impl)
  Coverage axes
    ⚠ Plan ↔ Tests          (catalog ~41K blocks / 11.7 MB — SIZE GUARD FIRES;
                              drop --with-walk-up or narrow further)
```

**Shape 5: plan PR + extra issue not auto-discoverable**
```
  Mode      : plan
  Sources
    scenarios     : 1 .md file from PR #259855
    tests         : (skipped — mode = plan)
    walk-up       : not applicable (mode = plan)
    requirements  : 5 crawled (PR #259855 body, .md content; depth ≤ 2),
                    1 explicit (--issue elastic/security-team#9999)
  Coverage axes
    ✓ Plan ↔ Requirements   (24 requirements extracted from 6 issues)
    ⊘ Plan ↔ Tests          (skipped — mode = plan)
    ⊘ Three-Way Merge       (skipped — mode = plan)
```

**Shape 6: plan PR + --no-crawl**
```
  Mode      : plan
  Sources
    scenarios     : 1 .md file from PR #259855
    tests         : (skipped — mode = plan)
    walk-up       : not applicable (mode = plan)
    requirements  : 0 crawled (--no-crawl), 2 explicit
                    (--issue elastic/security-team#15791,
                     --issue elastic/security-team#15793)
  Coverage axes
    ✓ Plan ↔ Requirements   (8 requirements extracted from 2 issues)
    ⊘ Plan ↔ Tests          (skipped — mode = plan)
    ⊘ Three-Way Merge       (skipped — mode = plan)
```

**Degraded: both-mode, crawl returned nothing**
```
  Mode      : both
  Sources
    scenarios     : 1 .md file from PR #259855
    tests         : 2 scope paths
                     — x-pack/solutions/security/plugins/security_solution/
                     — x-pack/solutions/security/test/
    walk-up       : applied (security_solution plugin + solutions/security/test/ sibling)
    requirements  : 0 crawled (5 URLs found, all 403/404), 0 explicit
  Coverage axes
    ⚠ Plan ↔ Requirements   (no accessible issues — section reports NOT AVAILABLE)
    ✓ Plan ↔ Tests          (catalog: 1850 blocks across 198 files in 1 scope)
    ⊘ Three-Way Merge       (skipped — requires Plan ↔ Requirements to be present)
```

---

## Phase 4 — Plan ↔ Requirements section

Format (preserves the existing test-tracer console layout almost verbatim — your team already recognizes it):

```
============================================================
  TEST PLAN COVERAGE REPORT
============================================================
  Total requirements : <N>
  Covered            : <N> (<P>%)
  Missing            : <N>
  Unclear            : <N>
============================================================

  COVERED
    1. [FUNCTIONAL] A user with editor access can create and save a new test plan document
    2. [NEGATIVE] Submitting the form with a missing required field displays an inline validation error
    ...

  MISSING
    1. [EDGE CASE] Saving a test plan with a title at the maximum allowed character limit (255 chars)
    2. [ERROR] If the API is unavailable, the tool surfaces a user-friendly error
    ...

  UNCLEAR
    1. [EDGE CASE] Concurrent edits to the same test plan by two users
    ...

============================================================
```

Numbering resets per bucket. Categories preserved verbatim from the requirements prompt.

---

## Plan ↔ Tests section (`impl` mode, or the middle section of `both`)

For each scenario from Phase 1, lists matched test blocks from the Phase 6 catalog. The verdict per scenario is one of `IMPLEMENTED`, `NOT IMPLEMENTED`, `INCONCLUSIVE` (see SKILL.md Verdict Taxonomy). Numbering resets per bucket.

```
============================================================
  PLAN ↔ TESTS COVERAGE
============================================================
  Total scenarios     : <N>
  ─────────────────────────────────────────
  Implemented         : <N> (<P>%)
  Not implemented     : <N>  ← attention here
  Inconclusive        : <N>
============================================================

  IMPLEMENTED
    1. Scenario: User can delete a deprecated rule from its details page
         → test : x-pack/.../cypress/e2e/.../deprecated_rule_details_callout.cy.ts:174
                  "deletes a deprecated rule from its details page and navigates back to the rules list"

    2. Scenario: Review respects MAX_DEPRECATED_RULES_TO_RETURN limit
         → test : x-pack/.../fetch_deprecated_rules.test.ts:15
                  "passes MAX_DEPRECATED_RULES_TO_RETURN as perPage ..."

  NOT IMPLEMENTED
    1. Scenario: (none in this example)

  INCONCLUSIVE
    1. Scenario: (none in this example)

  DRIFT FLAGS   (the match is real, but something diverged)
    1. Scenario: Review returns empty when filtered id does not exist
         → drift : behavior mismatch
         → plan says  : "the response contains an empty rules array"
         → test does  : "returns 400 ... 'No rules found for bulk get'"
         → test ref   : deprecation_review.ts:224

    2. Scenario: Delete all button is disabled for read-only users
         → drift : test-layer drift
         → plan says  : E2E
         → test layer : jest (RTL unit)
         → test ref   : deprecated_rules_modal.test.tsx:54

============================================================
```

The `DRIFT FLAGS` block exists when the scenario has a validated match **but** the match diverges from the plan in one of these documented ways:
- **behavior mismatch** — the test's assertion differs semantically from the Gherkin's `Then` clause.
- **test-layer drift** — the plan's `**Automation**:` line says one layer (e.g., E2E) and the matched block is at a different layer (e.g., jest unit).
- **sub-assertion gap** — the matched block covers part of the scenario but does not cover named sub-asserts from the `And` lines.

A scenario can appear in both `IMPLEMENTED` (because it has a matched block) and `DRIFT FLAGS` (because the match diverges). That's intentional — the verdict and the drift are independent dimensions.

---

## Plan ↔ Tests — Summary (heatmap, `--summary-only` mode)

**Triage report, not a verdict report.** Produced by Phase 6.alt's deterministic keyword overlap. No LLM was called per scenario. Every line in this section must carry the disclaimer that candidate coverage ≠ implemented.

Anatomy:
1. **Header banner** declaring summary mode, the threshold, and the catalog size.
2. **Per-scope density** table.
3. **GAPS** — scenarios with zero candidate matches anywhere (the highest-confidence finding).
4. **HOTSPOTS** — scenarios with ≥5 candidate matches (likely covered but needs a verdict run to confirm).
5. **NEXT STEP** — explicit instruction for how to escalate to a verdict run.

```
============================================================
  PLAN ↔ TESTS — SUMMARY (heatmap, deterministic)
============================================================
  Method     : keyword-overlap scoring (Jaccard)
  Threshold  : 0.15  (--overlap-threshold)
  Catalog    : 26,134 blocks across 1,247 files in 1 scope (size guard waived)

  ⚠ This is candidate coverage, NOT a verdict.
    To get IMPLEMENTED / NOT IMPLEMENTED per scenario, re-run without
    --summary-only against a narrower --impl-scope.
  ─────────────────────────────────────────────────────────

  PER-SCOPE COVERAGE DENSITY

  Scope                                                  Scenarios w/ ≥1 candidate
  ─────────────────────────────────────────────────────────────────────────────────
  server/lib/detection_engine/prebuilt_rules/            22 / 33   (67%)
  public/detection_engine/rule_management/               18 / 33   (55%)
  test/security_solution_cypress/.../prebuilt_rules/     12 / 33   (36%)
  test/security_solution_api_integration/.../            14 / 33   (42%)
  ─────────────────────────────────────────────────────────────────────────────────
  Union (≥1 candidate in ANY scope)                      33 / 33  (100%)
============================================================

  GAPS — scenarios with zero candidate matches anywhere   (count: 0)
    (none)

  HOTSPOTS — scenarios with ≥5 candidate matches          (count: 2)
    1. Scenario: Callout appears when user has installed deprecated rules
         → 11 candidate blocks across 3 scopes
         → top candidates (by jaccard):
              0.42  cypress  e2e/.../deprecated_rules_management_callout.cy.ts:77
                            "displays the callout when the user has installed deprecated rules"
              0.31  jest     public/.../deprecated_rules_callout.test.tsx:23
                            "renders the title"
              0.27  jest     public/.../deprecated_rules_callout.test.tsx:28
                            "renders the description"

    2. Scenario: Modal lists all deprecated installed rules with links
         → 8 candidate blocks across 2 scopes
         → top candidates (by jaccard):
              0.39  cypress  e2e/.../deprecated_rules_management_callout.cy.ts:149
                            "lists all installed deprecated rules with links to their details pages"
              0.28  jest     public/.../deprecated_rules_modal.test.tsx:39
                            "DeprecatedRulesModal"

  NORMAL — scenarios with 1–4 candidate matches            (count: 31, omitted by default)

============================================================
  NEXT STEP

  • Pick a narrower scope (most relevant ones above):
        --impl-scope x-pack/.../security_solution/server/lib/detection_engine/prebuilt_rules/
        --impl-scope x-pack/.../security_solution_cypress/.../prebuilt_rules/deprecation/

  • Re-run WITHOUT --summary-only to get verdicts:
        test-tracer --plan-file <plan.md> --impl-scope <narrower> --mode impl

  • Heatmap output JSON saved to: <tmp path>  (re-usable by future runs)
============================================================
```

### Behaviour rules for the heatmap renderer

- **NORMAL bucket is suppressed by default.** A whole-plugin run produces ~30 NORMAL scenarios for a typical feature plan; printing them all swamps the report. A future `--verbose` flag may expose them.
- **Top candidates are capped at 3 per scenario** in the report (the full list lives in the JSON output). Three is enough to give the user a sense of where to look without trailing into noise.
- **The disclaimer banner is mandatory.** Never strip the *"candidate coverage, NOT a verdict"* line — it is the single most important sentence in the section.
- **Slack one-liner for `--summary-only` runs**:
  > Test Tracer (impl-summary) audit: 33/33 scenarios with ≥1 candidate, 0 hard gaps, 2 hotspots. _Heatmap only — re-run with narrower --impl-scope for verdicts._

### Behaviour in `--mode both --summary-only` (degraded three-way)

When both axes are requested but the impl axis is heatmap-only, the Three-Way Merge section labels itself accordingly and uses *candidate* instead of *implemented*:

| Verdict | Plan coverage (Phase 4) | Impl coverage (Phase 6.alt heatmap) |
|---|---|---|
| `PLANNED & CANDIDATE-COVERED` | covered | scenario has ≥1 candidate block |
| `PLANNED, NO CANDIDATE` | covered | zero candidates → strong negative signal |
| `NOT PLANNED, NO CANDIDATE` | missing | zero candidates → unambiguous gap |
| `INCONCLUSIVE` | unclear | any failure mode |

`IMPLEMENTED, NOT PLANNED` cannot exist in heatmap mode (the inverse direction needs a real verdict). The section explicitly says so to avoid the consumer reading silence as absence.

---

## Phase 8 — Three-Way Report

This is the new artifact. Five buckets, ordered by where attention is most needed.

```
============================================================
  THREE-WAY COVERAGE REPORT
============================================================
  Requirements                  : <N total>
  ─────────────────────────────────────────
  Planned & implemented          : <N> (<P>%)
  Planned, not implemented       : <N>  ← attention here
  Implemented, not planned       : <N>  ← positive signal
  Not planned, not implemented   : <N>  ← true gaps
  Inconclusive                   : <N>
============================================================

  PLANNED, NOT IMPLEMENTED   (the real gap — plan promised, code does not deliver)
    1. [NEGATIVE] Save fails for invalid YAML
         → scenario : "Saving a rule with invalid YAML rejects the request with a 400"
         → expected : test under x-pack/.../test/scout/api/
         → found    : no candidate test block

    2. [ERROR] ES timeout shows banner
         → scenario : "If ES is unavailable, the rule create flow shows an error banner"
         → expected : test under x-pack/.../test/scout/ui/
         → found    : no candidate test block

  NOT PLANNED, NOT IMPLEMENTED   (gaps the test plan also missed — surface for plan update)
    1. [EDGE CASE] Save with 10,000 rules
    2. [AUTH] API rejects requests with expired session token

  PLANNED & IMPLEMENTED   (the good path)
    1. [FUNCTIONAL] User can create rule
         → scenario : "A user with editor access can create and save a new detection rule"
         → tests    : x-pack/.../test/scout/api/tests/create_rule.spec.ts:17
                      "POST /api/detection_engine/rules creates a rule"
                      x-pack/.../test/scout/ui/parallel_tests/rule_creation.spec.ts:42
                      "creates a new query rule from the rules creation page"

    2. [AUTH] Read-only user cannot create rule
         → scenario : "Read-only role cannot reach the create form"
         → tests    : x-pack/.../test/scout/api/tests/auth.spec.ts:120
                      "POST /api/detection_engine/rules returns 403 for viewer role"

  IMPLEMENTED, NOT PLANNED   (engineering wrote tests the plan forgot — credit them)
    1. [AUTH] API requires a specific privilege beyond role
         → test     : x-pack/.../test/scout/api/tests/privileges.spec.ts:55
                      "POST /api/detection_engine/rules requires rules:create"
         → suggestion : add scenario to test plan

  INCONCLUSIVE   (validation gate failed — see warnings above)
    1. [EDGE CASE] Concurrent rule edits
         → reason : matching gate rejected 2 hallucinated block names
============================================================
```

### v1 vs v2 difference

In v1, every match is `IMPLEMENTED` without a quality dimension. In v2, `PLANNED & IMPLEMENTED — WEAK` becomes its own bucket between `PLANNED & IMPLEMENTED` and `PLANNED, NOT IMPLEMENTED`, with the assertion line quoted:

```
  PLANNED & IMPLEMENTED — WEAK ⚠   (a test exists but its assertions are fragile)
    1. [ERROR] ES timeout shows banner
         → scenario : "If ES is unavailable, the rule create flow shows an error banner"
         → tests    : x-pack/.../test/scout/ui/error_banner.spec.ts:88
                      "renders without crashing when ES errors"
                      assertion: expect(wrapper.find(EuiToolTip)).toHaveLength(0)
                      reason   : existence check, not behaviour check (per bug-fix Red Flags)
```

---

## Slack-paste summary

A single line at the very end of the output that the user can copy-paste into a team channel. Wording is **mode-specific** so a partial run is never misread as end-to-end:

### `plan` mode

> Test Tracer (plan) #<PR>: **<COVERED>/<total reqs>** requirements covered by scenarios. <MISSING> not covered, <UNCLEAR> unclear. _Implementation not validated in this run._

Example: *Test Tracer (plan) #259855: **18/22** requirements covered by scenarios. 3 not covered, 1 unclear. Implementation not validated in this run.*

### `impl` mode

> Test Tracer (impl) #<PR>: **<IMPLEMENTED>/<total scenarios>** scenarios have a matching test block. <NOT IMPLEMENTED> missing, <INCONCLUSIVE> inconclusive, <DRIFT> drift flags. _Requirements coverage not validated in this run._

Example: *Test Tracer (impl) #259855: **30/33** scenarios have a matching test block. 0 missing, 0 inconclusive, 3 drift flags. Requirements coverage not validated in this run.*

### `both` mode

> Test Tracer #<PR>: **<P&I>/<total>** requirements end-to-end. <PNI> planned-but-untested, <INP> tests-without-plan, <NPNI> true gaps.

Example: *Test Tracer #128456: **28/54** requirements end-to-end. 7 planned-but-untested, 5 tests-without-plan, 14 true gaps.*

Keep it dense; this is the line that travels furthest.

---

## GitHub comment template *(v2 only — gated behind explicit user approval)*

When the user approves posting, render the three-way report as Markdown with a hidden anchor comment so the skill can detect prior posts on re-run (mirrors the `<!-- test-plan-generated -->` pattern in `test-plan-generator`).

```markdown
<!-- test-tracer-report -->
<!-- generated-by: <model identifier> -->

## Test Tracer Report — PR #<N>

**End-to-end coverage**: <P&I>/<total> requirements (<P>%)

### Headline
- ✅ **Planned & implemented**: <N>
- ⚠ **Planned, not implemented**: <N>
- 💡 **Implemented, not planned**: <N> _(positive signal — consider adding to the plan)_
- ❌ **Not planned, not implemented**: <N>
- ❔ **Inconclusive**: <N>

<details>
<summary>Planned, not implemented (<N>)</summary>

| # | Category | Scenario | Suggested test location |
|---|---|---|---|
| 1 | NEGATIVE | Save fails for invalid YAML | `x-pack/.../test/scout/api/` |
| 2 | ERROR | ES timeout shows banner | `x-pack/.../test/scout/ui/` |

</details>

<details>
<summary>Implemented, not planned (<N>)</summary>

| # | Category | Existing test | Add to plan? |
|---|---|---|---|
| 1 | AUTH | `privileges.spec.ts:55` "requires rules:create" | yes |

</details>

<details>
<summary>Validation warnings</summary>

- 2 hallucinated block names for scenario "Concurrent rule edits" → reported as INCONCLUSIVE

</details>

---

_Generated by [test-tracer](https://github.com/elastic/kibana/tree/main/x-pack/solutions/security/plugins/security_solution/.agents/skills/test-tracer) — re-run on PR update with `Skill("test-tracer")`._
```

### Posting rules (lift verbatim from `kbn-github`)

- Always `gh api repos/{o}/{r}/issues/{N}/comments --input <file>`. Never inline `-f body=`.
- On re-run, look for an existing comment whose body starts with `<!-- test-tracer-report -->`. If found, `PATCH` the existing comment ID rather than posting a duplicate.
- Never include the `event` key in any review-creation payload — see the `strip-review-event.mjs` hook. Posting to `/issues/{N}/comments` is unaffected by that hook, but the discipline carries over: never create a review object with this skill.

---

## Console formatting conventions

- Use plain ASCII for divider lines: `=` for major, `─` for minor. Avoid unicode in console mode — terminals vary.
- In GitHub comment mode, use `<details>` collapsibles for any bucket with > 5 items.
- Always preserve the requirement's category prefix (`[FUNCTIONAL]` etc.) in every output.
- Always quote a scenario's source line range when the user asks for it (`<md-path>:<line>`).
- Never colorize the console output — assume the user pipes to a file or another tool.
