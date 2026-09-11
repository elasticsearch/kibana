# Output Formats

This file defines the format of summaries and structured outputs that the agent produces in the chat after completing key operations. Read this file whenever the skill instructs you to output a Sources Summary.

---

## Contents

- [Verbosity levels](#verbosity-levels)
- [Scenario format](#scenario-format)
- [Gherkin self-review](#gherkin-self-review--run-before-saving-any-draft)
- [Issue Clarity Assessment section](#issue-clarity-assessment-section)
- [Footer format](#footer-format)
- [Token usage marker](#token-usage-marker)
- [Sources Summary](#sources-summary)

---

## Verbosity levels

Three levels, orthogonal to section selection: `lean`, `standard` (default), `detailed`. The level controls **prose density and per-scenario metadata rendering only** — it never affects which sections exist, which scenarios are written, or which ⚠️ entries are flagged.

### Non-negotiable constraint

Verbosity must never change:
- The number of scenarios, their priorities, or their tags.
- Which testing types are covered per feature area (see [`optional-scenarios.md`](optional-scenarios.md) coverage guidance).
- The always-evaluated coverage decisions (upgrade / CRUD per persisted object / dependency data lifecycle — see [`optional-scenarios.md#always-evaluated-coverage`](optional-scenarios.md#always-evaluated-coverage)).
- The presence of any ⚠️ entry in *Known Limitations*.
- The one-clause reason on every *Out of scope* bullet.

If a lower verbosity level would require dropping a ⚠️ flag or a reason clause, the flag/clause wins and the text stays.

### Invocation grammar and keyword detection

Only the **keyword** is captured from the user's invocation here — resolution to `VERBOSITY_LEVEL` happens once per flow and is defined in one place per flow (do not resolve it in this file). Same matching applies to `generate`, `create`, `write`, `update`, and `regenerate`:

| Invocation matches (case-insensitive) | `INVOCATION_VERBOSITY_KEYWORD` |
|---|---|
| `<verb> a lean test plan …` / `<verb> lean test plan …` | `lean` |
| `<verb> a standard test plan …` / `<verb> standard test plan …` | `standard` |
| `<verb> a detailed test plan …` / `<verb> detailed test plan …` | `detailed` |
| Anything else (no level keyword at all) | *unset* |

Flow-based resolution of `VERBOSITY_LEVEL` from `INVOCATION_VERBOSITY_KEYWORD`:

- **Fresh draft** (fresh `generate` / `create` / `write`, or `update` / `regenerate` when no published plan exists) — keyword if set; otherwise `standard`. Resolved before Step 1 per [`../SKILL.md` § Modes of operation](../SKILL.md#modes-of-operation) and not revisited.
- **Update against an existing published plan** — keyword if set; otherwise the published `<!-- verbosity: … -->` marker if present; otherwise `standard`. Resolved in [`mode-update.md`](mode-update.md) Step 1, which parses `PUBLISHED_VERBOSITY_LEVEL` unconditionally first.
- **Publish** — level-independent; neither the keyword nor `VERBOSITY_LEVEL` is consulted.

### What each level renders

| Section | `lean` | `standard` (default) | `detailed` |
|---|---|---|---|
| `Overview` | One sentence covering the feature name + validation scope. | Full paragraph per the [`document-structure.md`](document-structure.md) template. | Same as `standard`. |
| `Feature Background` | One sentence stating the problem this feature solves. | 2–4 sentences per template. | Same as `standard`. |
| `Assumptions` | **Only bullets whose value was confirmed from a concrete source in Step 1** (issue body, PR description, Figma, sub-issue). Rendered as a single-line, `; `-separated inline form: `<value 1>; <value 2>.` If no bullet was confirmed, keep the `## Assumptions` heading and emit a one-liner `See _Known Limitations_ for open assumptions.` Do not repeat any ⚠️ from *Known Limitations* here. | Four labelled bullets per template; each unconfirmed bullet is flagged with ⚠️ inline and mirrored in *Known Limitations*. | Same as `standard`, plus a provenance suffix on each confirmed value: `Enterprise (#1234 body)`, `at least one active alert (Figma flow "Alert list")`. |
| Scenario `**Automation coverage**:` line | Single tag: `🤖 automated (N tests)` when at least one matching test exists in the coverage catalog, or `🧪 manual only` when no matching test exists. `N` is the total count of matching tests across all types. Never list individual test names or file paths under `lean`. | Full itemised list per the *Automation coverage rules* under *Scenario format* below. | Same as `standard`. |
| Scenario `**Source:**` line (new) | Omitted. | Omitted. | A line placed **immediately after `**Priority:**`** and **before `**Automation coverage**:`**, citing the specific sources the scenario derives from. Four allowed categories: consolidated AC (`AC1 (#1234)`), PR artifact (`PR #5678 (endpoint POST /rules)`), Always-evaluated coverage (`Always-evaluated coverage (upgrade — new SO type)`), and Code-derived (`Code-derived (new endpoint … in <path>)`). Never invent an AC number or fabricate any source; if the scenario has no traceable input in any of the four categories, apply the Core rule and stop. Multiple sources are `; `-separated on the same line. Full rules under [Scenario format § Source line rules](#scenario-format). |

### Draft-save marker

At draft-save time (see [`SKILL.md` § Step 3 saving-the-draft](../SKILL.md#saving-the-draft) sub-step 7 or [`mode-update.md`](mode-update.md) Step 6), always prepend `<!-- verbosity: <level> -->` as the top marker of the draft file. This marker is **always emitted regardless of level** — absent markers on already-published plans are handled by the *Update against an existing published plan* bullet in *Flow-based resolution* above (fall back to `standard` when neither an invocation keyword nor a published marker is present).

### AC/⚠️ safeguard

`Known Limitations` ⚠️ entries for unspecified `Assumptions` values are **non-negotiable and identical across levels**. Under `lean`, they exist only in *Known Limitations* (the compact inline form shows only confirmed values). Under `standard`/`detailed`, they exist in both places. Never drop a ⚠️ from *Known Limitations* to comply with a level.

---

## Scenario format

Every scenario in the test plan must follow this structure exactly. The structure below shows the `standard`-level baseline; per-level modifications live in [Verbosity levels](#verbosity-levels) above.

````markdown
#### Scenario: <title>

**Priority:** <P0|P1|P2>

**Automation coverage**: <see rules below>

```gherkin
Given ...
When ...
Then ...
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._
````

**Automation coverage rules (`standard` / `detailed` levels):**
- Cross-reference the test coverage catalog built in Step 1. Find all tests whose describe blocks or test names match the behaviour described in the scenario.
- List every matching test individually with its type and file path. Example: `2 unit tests (alerts.test.ts — "should render alert row", "should filter by status"), 1 e2e test (alerts.cy.ts — "displays alert in table")`.
- If tests of multiple types cover the scenario, list each type separately.
- If no tests cover the scenario, write: `No existing tests found covering this scenario.`
- Never aggregate counts without naming the specific tests — the goal is full traceability, not a summary number.
- The count in the summary (e.g. `2 unit tests`) must equal the number of test names listed. Count the names you write before finalising the number.

**Automation coverage rules (`lean` level):**
- Emit a single tag on the `**Automation coverage**:` line: `🤖 automated (N tests)` when at least one matching test exists in the coverage catalog, or `🧪 manual only` when no matching test exists.
- `N` is the total count of matching tests across all types — same denominator as the itemised list would have produced.
- Never emit test names, file paths, or per-type breakdowns under `lean`. The tag is intentionally opaque; the `Automated` / `Manual only` columns of the *Test Coverage Summary* remain the itemised source of truth regardless of level (they are populated identically across levels).
- The Test Coverage Summary counts (populated per [`document-structure.md#test-coverage-summary--filling-in-the-table`](document-structure.md#test-coverage-summary--filling-in-the-table)) are not affected by `lean` — the summary is not a rendering of per-scenario lines, it is derived directly from the catalog.

**Source line rules (`detailed` level only):**
- Emit a `**Source:**` line **immediately after `**Priority:**`** and **before `**Automation coverage**:`**.
- Cite the specific inputs the scenario derives from. Multiple sources are `; `-separated on the same line. Allowed source categories:

  | Category | Format | When to use |
  |---|---|---|
  | Consolidated AC | `AC<n> (#<issue>)` — e.g. `AC1 (#1234)` | Scenario maps to a numbered item in the consolidated AC list built in Step 2. Never invent an AC number: if the scenario has no matching AC row, fall through to one of the other categories below rather than fabricate one. |
  | PR artifact | `PR #<n> (<artifact type> <name>)` — e.g. `PR #5678 (endpoint POST /rules)`, `PR #5678 (component RuleForm)`, `PR #5678 (saved object type alert-notes)` | Scenario covers a PR artifact from the inventory built in Step 1 (new API route, service method, UI component, saved object type, feature flag, schema, etc.). |
  | Always-evaluated coverage | `Always-evaluated coverage (<trigger> — <one-clause justification>)` — e.g. `Always-evaluated coverage (upgrade — new SO type alert-notes)`, `Always-evaluated coverage (CRUD — persisted rule object)`, `Always-evaluated coverage (dependency data lifecycle — referenced index deletion)` | Scenario was required by the [Always-evaluated coverage](optional-scenarios.md#always-evaluated-coverage) rule (upgrade / CRUD per persisted object / dependency data lifecycle) rather than by any explicit AC or PR artifact. The justification must name the trigger so a reader can trace it back to the rule. |
  | Code-derived | `Code-derived (<what was found> in <path>)` — e.g. `Code-derived (new endpoint POST /rules in escalation_service.ts)` | Scenario covers a fact discovered only in code (a route registered outside the PR description, a schema change surfaced in a `.gen.ts` file consumers rely on, etc.). Used sparingly; if the same fact is also cited in a PR body, prefer the PR-artifact category. |

- Never invent a source. If a scenario has no traceable AC, PR artifact, always-evaluated trigger, or code-derived fact, apply the Core rule and stop — do not fabricate a `**Source:**` value. This is a hard failure of `detailed` traceability, not a soft downgrade to `standard`.
- The `Source` line derives from the corpus already gathered in Step 1 and consolidated in Step 2 (and, for Always-evaluated coverage, the trigger rule in `optional-scenarios.md`). It never triggers new fetches.

**Execution block rules:**
- Render exactly the three task-list items shown above, in that order, with the leading emoji on each line. The italic instruction line is part of the canonical block — do not reword or omit it.
- The block must be present in **every** scenario, regardless of priority or automation coverage. Devs need a consistent place to record execution status across the whole plan.
- All three checkboxes start empty (`- [ ]`) at draft time. They become clickable in the published GitHub comment for any user with write access to the repo.
- Marking a checkbox is technically an edit of the comment by the user who clicked it; GitHub records the action with timestamp and actor in the comment edit history. That is the audit trail — do not invent a separate "Executed by"/"Executed on" line.
- The three states (`Pass`/`Fail`/`Blocked`) are mutually exclusive by convention. Markdown does not enforce this; rely on the visible labels and the instruction line to communicate intent. Do not add a fourth state.
- **In update mode only**, this block participates in the preserve-on-match strategy defined in [`mode-update.md`](mode-update.md). Update mode may insert an additional italic callout (`_Scenario updated on YYYY-MM-DD, please re-execute_`) immediately above the three checkboxes when a scenario's Gherkin substantively changed since the last publication. Do not emit this callout in fresh `generate` mode.

---

## Gherkin self-review — run before saving any draft

Before saving the draft to `.agents/tmp/`, review every scenario in the test plan against this checklist. Do not skip this step — it is the last quality gate before the draft is handed to the user.

**Per-scenario checks:**
- [ ] Describes behaviour and intent, not UI steps or button clicks
- [ ] Tests exactly one thing — one `When` and one `Then` maximum
- [ ] Has a `Given` that establishes the pre-condition clearly
- [ ] Has 7 steps or fewer (all `Given`, `When`, `Then`, `And` lines combined)
- [ ] Uses plain language — a non-technical person must understand it without knowing the codebase
- [ ] Uses third person ("user", never "I")
- [ ] Title is descriptive and unique — it conveys what is tested without reading the steps
- [ ] Is independent — does not rely on state left by a previous scenario
- [ ] Is not redundant — covers something not already covered by another scenario in this plan or in a sub-issue test plan
- [ ] **Execution block** is present at the end of the scenario, after the Gherkin block, in the canonical shape defined under *Scenario format*: three checkboxes (`✅ Pass` / `❌ Fail` / `🚫 Blocked`) plus the italic instruction line. All three boxes are unchecked. No `_Scenario updated on..._` callout is present in fresh `generate` mode
- [ ] **Automation coverage line matches `VERBOSITY_LEVEL`.** Under `lean`: single tag `🤖 automated (N tests)` or `🧪 manual only`. Under `standard`/`detailed`: itemised list per *Automation coverage rules*.
- [ ] **`**Source:**` line — `detailed` only.** Present between `**Priority:**` and `**Automation coverage**:`; cites verifiable sources from the four allowed categories in *Source line rules* (consolidated AC, PR artifact, always-evaluated coverage trigger, or code-derived fact); never fabricated. Absent under `lean` and `standard`.

**Per-section checks (after writing all scenarios in a section):**
- [ ] Scenarios are coherent as a set — they collectively cover the acceptance criteria for this area
- [ ] Each required testing type from the coverage guidance in `references/optional-scenarios.md` is represented — explicitly list which types are present (positive, negative, edge case, state-based, error handling) and which are missing. If a required type is missing, either add a scenario or document the reason in Known Limitations — do not leave required types silently uncovered
- [ ] No two scenarios test the same thing with different wording
- [ ] No scenario tests something not described in the issue, sub-issues, linked PRs, or Figma designs
- [ ] Scenarios are ordered by priority: P0 first, then P1, then P2
- [ ] The owning team's critical-workflows map was consulted per [`critical-workflows.md`](critical-workflows.md) before finalizing priorities — either a matching map was loaded and its P0 / P1 tables informed the per-scenario priority assignments, or the [no-map fallback](critical-workflows.md#lookup-precedence) fired and Known Limitations contains the note `⚠️ No team critical-workflows map was applied — priority was derived from abstract impact rules only.` verbatim

**Across the full test plan:**
- [ ] All acceptance criteria listed in the Acceptance Criteria section are covered by at least one scenario
- [ ] Walk the **consolidated AC list** (built in Steps 1–2) item by item — every criterion from every sub-issue must map to at least one scenario. If a criterion has no matching scenario, either add one or document it in Known Limitations with a justification
- [ ] Walk the **PR artifacts inventory** (built in Step 1) item by item — every new API route, service method, UI component, saved object type, and feature flag must be covered by at least one scenario. Missing coverage is a gap
- [ ] Every claim in Known Limitations about a scenario being included or excluded matches reality — verify the referenced scenario exists by name
- [ ] No optional section (RBAC, upgrade, CCS, multi-space, multi-tenant) is included without a clear justification from the issue content
- [ ] Test Execution Notes lists every scenario by name under its priority level — not just generic descriptions
- [ ] **Test Coverage Summary — sum checks.** Three mechanical checks (do not skip — eyeballing produced a multi-scenario undercount in dry-run validation):
  - For each feature-area row: `P0 + P1 + P2 = Scenarios` **and** `Automated + Manual only = Scenarios`.
  - For each column: the **Total** cell equals the column-wise sum of all feature-area rows (Scenarios, P0, P1, P2, Automated, Manual only).
  - **Total Scenarios** equals the actual number of `#### Scenario:` headings rendered in the document — count them.
- [ ] **Issue Clarity Assessment section** is present immediately before the footer, wrapped in `<details><summary>📊 Issue Clarity Assessment</summary>…</details>`:
  - One row per issue read in Step 1 (target, parent, every sub-issue) — none omitted, even those scoring 5/5.
  - Per-issue scores follow the rubric and tie-breakers in [`issue-clarity-assessment.md`](issue-clarity-assessment.md) (AC ❌ → max 2; AC ❌ and Scope ❌ → 1).
  - **Combined readability** is computed from the union of the corpus, not as an average of per-issue scores; rationale sentence is present.
  - **Issue Coverage Ratio** denominator equals **Total Scenarios** from the Test Coverage Summary above — they must match.
  - **Actionable feedback** bullets present iff at least one issue scored ≤ 3 or Coverage Ratio &lt; 60%; otherwise the block is omitted.
- [ ] Footer is present at the end of the file with the correct model identifier and today's date
- [ ] **Verbosity invariants hold across levels.** Same scenario count, same priorities, same set of ⚠️ entries in *Known Limitations*, same *Out of scope* reasons, same always-evaluated coverage decisions as would be produced at any other level. Verbosity is prose-density-only. See [Verbosity levels § Non-negotiable constraint](#non-negotiable-constraint).
- [ ] **Level-appropriate prose sections.** `Overview` and `Feature Background` render at the length prescribed for `VERBOSITY_LEVEL`. `Assumptions` under `lean` uses the compact inline form (or the *See Known Limitations* one-liner when no bullet was confirmed); under `detailed` every confirmed value carries a provenance suffix.
- [ ] **Verbosity marker present.** `<!-- verbosity: <level> -->` is the top marker in the draft file, immediately above `<!-- tokens: … -->` (when tokens is captured) or as the only top marker (when tokens is not captured).

If any item fails, fix the scenario before saving. If fixing requires information that is not available, apply the Core rule: stop and ask the user.

---

## Issue Clarity Assessment section

The full rubric and procedure live in [`issue-clarity-assessment.md`](issue-clarity-assessment.md). This section defines the **canonical markdown format** to render in the test plan. Append the assembled block immediately before the footer, after running the procedure in `issue-clarity-assessment.md`.

### Format

```markdown
<details>
<summary>📊 Issue Clarity Assessment</summary>

| Issue | Type | Score | Critical gaps |
|---|---|---|---|
| #<number> (<role>) | <Target / Epic / Parent epic / Sub-issue> | <n>/5 | <1–2 clause note, or "None"> |

**Combined readability: <n>/5** — <one-sentence rationale; explain why combined differs from per-issue scores when it does>.

**Issue Coverage Ratio: <X> / <Y> scenarios (<Z>%)** are derivable from issue text alone. <breakdown of fact categories that required PR analysis, or "All scenarios derivable from issue text — no PR-only facts." when Z = 100>.

<!--
  Include the next two lines (heading + bullets) ONLY when at least one
  per-issue score is ≤ 3 OR the Coverage Ratio is below 60%.
  When both conditions fail, OMIT the heading and the bullets entirely —
  do not emit "**Actionable feedback:**" as an empty header.
-->
**Actionable feedback:**
- <Specific feedback: which issue, which dimension, what to add. Generic recommendations are not allowed.>

</details>
```

### Rules

- **Always present.** Render this block in every test plan, regardless of scores. The audience (PMs/writers) gets value from seeing the 5/5 results too.
- **One row per issue read** in Step 1 — target, parent (if any), every sub-issue. Do not omit any.
- **`Type` values** are exactly one of: `Target` (when target is not an epic), `Epic` (when the target is itself the epic), `Parent epic`, `Sub-issue`. The role in parentheses next to the issue number (`(target)`, `(parent)`, `(sub)`) is a hint for readers and is always present.
- **Score format** is exactly `<n>/5` — never `<n>` or `<n>/5.0` or `<n>%`. No emojis next to the score.
- **Critical gaps** is `None` when score = 5, otherwise a 1–2 clause note. Examples: *"UI flow not described; edge cases missing"*, *"No numbered ACs, prose only"*. Do not exceed two clauses.
- **Combined rationale sentence is required.** When combined matches the lowest per-issue score, write a short sentence such as *"All issues are equally weak — combined matches the worst per-issue score."* — do not leave the rationale empty.
- **Coverage Ratio denominator** must equal the **Total Scenarios** in the Test Coverage Summary table. If they do not match, recount the scenarios before saving.
- **Actionable feedback block is conditional:** include the bullets only when at least one issue scored ≤ 3 or the Coverage Ratio is below 60%. When omitted, do not leave an empty `**Actionable feedback:**` header.
- **Wrap in `<details>`** so the section is collapsed by default in the GitHub comment.

---

## Footer format

Every test plan draft must end with this footer. Replace `[model-identifier — e.g. claude-sonnet-4-6, gpt-5]` with your exact model string and `[YYYY-MM-DD]` with today's date. Models do not always know their own exact identifier — the examples are anchors, not the literal string to write.

```markdown
---

*🤖 Generated by [model-identifier — e.g. claude-sonnet-4-6, gpt-5] on [YYYY-MM-DD]*
```

---

## Token usage marker

Records the token count of the run that produced the current test plan comment. Two artifacts, one source of truth:

- A machine-readable HTML comment marker in the published GitHub comment.
- A human-readable line rendered in the chat after the Sources Summary.

Both are produced from `x-pack/solutions/security/plugins/security_solution/.agents/scripts/session-token-usage.py`. If the script exits non-zero — non-Claude-Code harness, missing transcript, or transcript without `usage` blocks — both artifacts fall back to their "not available" form.

### Comment marker format

Prepended near the **top** of the draft file at draft-save time, *before* `<!-- test-plan-generated -->` and `<!-- generated-by: … -->`, and *below* `<!-- verbosity: … -->`. Step 4 (publish) does not invoke the script or modify this marker — its presence is set at draft-save time, and its absence is a legitimate signal that the generation ran on a harness without a session transcript.

```
<!-- tokens: input=X output=Y cache_create=W cache_read=Z total=T -->
```

- Field order matches the script output (`input`, `output`, `cache_create`, `cache_read`, `total`).
- Values are non-negative integers (raw token counts, no thousand separators).
- **Absence is meaningful** — if the marker is missing from a published comment, the generation run had no measurable token usage available.
- **Refreshed on each publish.** Always reflects the current run; no historical delta.

Final marker order in the published comment after Step 4 publish:
```
<!-- test-plan-generated -->
<!-- generated-by: <model-identifier> -->
<!-- verbosity: <lean | standard | detailed> -->
<!-- tokens: input=… output=… cache_create=… cache_read=… total=… -->
```

Step 4 prepends `<!-- test-plan-generated -->` and `<!-- generated-by: … -->` above the verbosity and tokens markers — preserve both unmodified. The verbosity marker is always present (see [Verbosity levels § Draft-save marker](#verbosity-levels)); the tokens marker may be absent (see *Absence is meaningful* above).

### Chat line format

Rendered right after the Sources Summary and Issue Clarity Assessment blocks in [`SKILL.md` Step 3 sub-step 8](../SKILL.md#saving-the-draft) for generate mode, and [`mode-update.md` Step 8](mode-update.md) for update mode.

**On script success:**
```
**Token usage:** input=X, output=Y, cache_create=W, cache_read=Z, **total=T**
```

Note: commas between fields, bold on the `**Token usage:**` label and on the `**total=T**` tail. Field order matches the marker.

**On script failure (fallback):**
```
**Token usage:** not available for this session
```

Never emit `total=0` — this string is the only valid fallback.

---

## Sources Summary

Output this table in the chat immediately after saving a draft — whether generating from scratch, checking and updating an existing plan, or running an incremental update.

The goal is to give the user full traceability of what the agent read, what it used, and what it could not access.

### Format
```markdown
### 📋 Sources used to generate this test plan

| Source | Status |
|---|---|
| Issue #<number> — <title> | ✅ Read |
| Parent issue #<number> — <title> | ✅ Read / ⛔ No parent |
| Sub-issue #<number> — <title> | ✅ Read |
| PR #<number> — <title> | ✅ Read / ✅ Re-read (activity since plan published) / ➖ Skipped (no activity since plan published) / ⚠️ Partially read (N files skipped — too large) / ⛔ Not found |
| Figma — <file or node name> | ✅ Metadata read (N fetchable elements catalogued) / ✅ Metadata read + K opened PNGs for visual verification / ✅ Metadata read + K opened PNGs for visual verification (cap raised from 8 by user) / ✅ Metadata read (M of N children catalogued — narrowed by user selection) / ✅ Design context read (Figma Make — code-only; no screenshot support) / ✅ K opened PNGs (Slides — <node name>) / ✅ K opened PNGs (Slides — <node name>) (cap raised from 8 by user) / ✅ FigJam read / ⚠️ Screenshot budget reached (K PNGs opened — remaining scenarios verified from metadata only) / ⚠️ Screenshot budget reached (Slides link catalogued without screenshot; no Figma-derived context) / ⚠️ get_metadata budget reached (3 fetched — remaining Figma links not inspected; scenarios derived from non-Figma sources) / ⚠️ get_design_context budget reached (2 fetched — remaining escape-hatch calls skipped; affected scenarios fall back to metadata and any screenshot already gathered) / ⚠️ get_design_context budget reached (2 fetched — remaining Make links catalogued without design context) / ⚠️ Read with errors / ⚠️ Node not found in file / ⛔ Inaccessible |
| Image — <url or description> | ✅ Analyzed / ⛔ Could not fetch |
| Google Doc — <title or url> | ✅ Read / ⛔ MCP not available |
| Parent test plan (issue #<number>) | ✅ Found and used as reference / ➖ Not found |
| Sub-issue test plan (issue #<number>) | ✅ Found and used as reference / ➖ Not found |

> ⚠️ Items marked ⛔ were not available and may have affected the completeness of the test plan.
```

### Rules

- Include a row for **every source encountered**, whether successfully read or not. Do not omit sources that failed — they are the most important ones to surface.
- Use exactly one status per row — pick the most accurate one from the options shown.
- If there are multiple sub-issues or PRs, include one row per item.
- If there is no parent issue, include the row anyway with status `⛔ No parent` so the user can see it was checked.
- If a source was partially read (e.g. a PR with skipped files), use `⚠️` and describe what was skipped in parentheses.
- For **Figma links**, the status cell reflects the metadata-first flow defined in [`gathering-context.md`](gathering-context.md#figma):
  - Metadata only (no screenshot opened): `✅ Metadata read (N fetchable elements catalogued)`, replacing N with the total count from the fetchable-element filter defined in [`gathering-context.md`](gathering-context.md#figma) Step 2 — the case-normalized types `frame` / `instance` / `section` / `component` / `component_set`, counted across **the root itself (when the root is one of those types) plus every direct or nested descendant of those types**. Including the root matters for URLs that point directly at a single `component` / `component_set` whose children are only leaf shapes; without counting the root the cell would report `N = 0` even though a real UI element was linked.
  - Metadata + targeted screenshots (typical case for UI features): `✅ Metadata read + K opened PNGs for visual verification`, replacing K with the number of PNGs actually **opened** (i.e. downloaded and inspected — the vision-token cost the session budget is measured in). `get_screenshot` calls that only returned a URL and were never opened do not count. For **URL responses**, include the returned screenshot URL inline in the status cell so a reader can preview it — Figma expires them after ~15 minutes, so treat them as a preview, not a stable reference. For **inline-base64 responses** (no shareable URL exists), reference the node by name/id instead — do not fabricate a URL. See [`gathering-context.md`](gathering-context.md#step-3--add-visual-verification-with-get_screenshot-only-where-needed) Step 3 for the two response shapes.
  - Canvas or oversized section narrowed by user selection (`stop and ask` fired in Step 2): `✅ Metadata read (M of N children catalogued — narrowed by user selection)`. Also add a Known Limitations entry naming the un-catalogued children — status `✅` alone would mask the partial coverage.
  - Figma Make link (`/make/` URL). `get_metadata` is not supported for Make, so the flow catalogues the link during main Step 1 and defers the `get_design_context` call to main Step 3 — see [`gathering-context.md`](gathering-context.md#figma) Step 1 (URL routing) and Step 4 (Figma Make branch). Use `✅ Design context read (Figma Make — code-only; no screenshot support)`. This status is intentionally narrower than the standard `✅` cases: `get_screenshot` supports Figma Design, FigJam, and Slides — **not Make** — so this row alone does **not** attest to any visual verification. A ⚠️ Known Limitations entry **is required** when the Make link produced scenarios that would normally rely on `get_screenshot` (layout / order / CTA assertions, or any name-anchored assertion — see the Step 3 triggers in [`gathering-context.md`](gathering-context.md#step-3--add-visual-verification-with-get_screenshot-only-where-needed)); the KL entry names the scenarios that could not be visually verified. Add a further ⚠️ entry when `get_design_context` itself failed or returned insufficient detail. When every Make-derived scenario is code-only and needs no visual verification, no KL entry is required — the status stays `✅` on its own.
  - **FigJam link** (`/board/` URL). Call `get_figjam` at Step 1 (Step 1 exception in the phase map — FigJam has no metadata equivalent and doesn't drive scenarios). Use `✅ FigJam read`. No Known Limitations entry unless the call itself failed.
  - **Slides link** (`/slides/…?node-id=…` URL). `get_metadata` and `get_design_context` are unsupported for Slides; only `get_screenshot` works. The Step 1 handler catalogues the link and defers `get_screenshot` to main Step 3 — see [`gathering-context.md`](gathering-context.md#figma) Step 1 (URL routing) and the *Figma Slides branch* in Step 3. Use `✅ K opened PNGs (Slides — <node name>)`, replacing K with the number of PNGs opened for that link and `<node name>` with the recorded Slides node. Follow the same URL-vs-inline-base64 attribution rules as the design-file screenshot case above. No Known Limitations entry unless the response itself fails.
  - **Session `get_screenshot` cap reached** — declined / user-unavailable branch of [Step 5](gathering-context.md#step-5--session-budget). Two variants depending on which link tripped the cap:
    - Design-file link (the link has a metadata inventory from Figma Step 2; only the screenshot was missed): `⚠️ Screenshot budget reached (K PNGs opened — remaining scenarios verified from metadata only)`, using the same "opened PNGs" unit as the budget itself. Add a KL entry naming the scenarios that lacked visual verification. Metadata-only fallback is valid here because the link's metadata is available.
    - Slides link (Step 1 catalogued the link but the mandatory Step 3 screenshot could not run — Slides has **no** metadata equivalent, so no fallback context exists): `⚠️ Screenshot budget reached (Slides link catalogued without screenshot; no Figma-derived context)`. Add a KL entry naming the un-inspected Slides link and any scenarios that depended on it. Do **not** attempt metadata-only reasoning — Slides never has metadata.
  - **Session `get_metadata` cap reached** — declined / user-unavailable branch. Applies to Design-file links only — FigJam, Slides, and Make do not call `get_metadata` at all, so the cap cannot leave them un-inspected. Use `⚠️ get_metadata budget reached (3 fetched — remaining Figma links not inspected; scenarios derived from non-Figma sources)` on every un-catalogued Design link (one row per link — not one row for the session). Metadata-only fallback is **not** valid here because the un-catalogued Design links have no metadata at all; scenarios must come from non-Figma sources (issue text, PR diff, other Design links whose inventory was built before the cap fired). Add a Known Limitations entry naming the un-inspected links.
  - **Session `get_design_context` cap reached** — declined / user-unavailable branch. Two variants depending on which link tripped the cap:
    - Design-file escape-hatch miss (the link has metadata from Figma Step 2, and may also have a screenshot if a Step 3 visual-anchoring trigger fired earlier; only the escape hatch could not run): `⚠️ get_design_context budget reached (2 fetched — remaining escape-hatch calls skipped; affected scenarios fall back to metadata and any screenshot already gathered)`. Add a KL entry naming the scenarios that would have benefited from the pixel-precise identifiers `get_design_context` would have supplied.
    - Figma Make miss (no metadata, no screenshot, no design-context — nothing was fetched for the link): `⚠️ get_design_context budget reached (2 fetched — remaining Make links catalogued without design context)`. Add a KL entry naming the un-inspected Make links and any scenarios that depended on them.
  - **Cap raised via the Step 5 overage path (approved by user).** Only `get_screenshot` has a per-link raised-cap indicator because opened PNGs is countable per link — use `✅ Metadata read + K opened PNGs for visual verification (cap raised from 8 by user)` (or the Slides equivalent `✅ K opened PNGs (Slides — <node name>) (cap raised from 8 by user)`) on the link(s) that consumed the raised budget. For `get_metadata` and `get_design_context` raised caps, the per-link rows keep their standard `✅` status — the increased overall count is implicit in the number of `✅ Metadata read` or `✅ Design context read` rows. Approved-overage rows must **not** have a paired Known Limitations entry: approved overage is complete coverage.
  - Root node missing (deleted, restructured): `⚠️ Node not found in file`. Also flag in Known Limitations.
- In **update mode**, PRs are checked for activity since the plan was published. Use `✅ Re-read (activity since plan published)` for PRs that were re-read because new commits or review activity was detected. Use `➖ Skipped (no activity since plan published)` for PRs that had no activity and were not re-read. If the user ran `update including PRs`, all PRs will show `✅ Re-read` regardless of activity.
