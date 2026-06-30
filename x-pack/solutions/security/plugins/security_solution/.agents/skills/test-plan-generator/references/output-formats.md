# Output Formats

This file defines the format of summaries and structured outputs that the agent produces in the chat after completing key operations. Read this file whenever the skill instructs you to output a Sources Summary.

---

## Contents

- [Scenario format](#scenario-format)
- [Gherkin self-review](#gherkin-self-review--run-before-saving-any-draft)
- [Issue Clarity Assessment section](#issue-clarity-assessment-section)
- [Footer format](#footer-format)
- [Sources Summary](#sources-summary)

---

## Scenario format

Every scenario in the test plan must follow this structure exactly:

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

**Automation coverage rules:**
- Cross-reference the test coverage catalog built in Step 1. Find all tests whose describe blocks or test names match the behaviour described in the scenario.
- List every matching test individually with its type and file path. Example: `2 unit tests (alerts.test.ts — "should render alert row", "should filter by status"), 1 e2e test (alerts.cy.ts — "displays alert in table")`.
- If tests of multiple types cover the scenario, list each type separately.
- If no tests cover the scenario, write: `No existing tests found covering this scenario.`
- Never aggregate counts without naming the specific tests — the goal is full traceability, not a summary number.
- The count in the summary (e.g. `2 unit tests`) must equal the number of test names listed. Count the names you write before finalising the number.

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

**Per-section checks (after writing all scenarios in a section):**
- [ ] Scenarios are coherent as a set — they collectively cover the acceptance criteria for this area
- [ ] Each required testing type from the coverage guidance in `references/optional-scenarios.md` is represented — explicitly list which types are present (positive, negative, edge case, state-based, error handling) and which are missing. If a required type is missing, either add a scenario or document the reason in Known Limitations — do not leave required types silently uncovered
- [ ] No two scenarios test the same thing with different wording
- [ ] No scenario tests something not described in the issue, sub-issues, linked PRs, or Figma designs
- [ ] Scenarios are ordered by priority: P0 first, then P1, then P2

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
| Figma — <file or node name> | ✅ Read / ⚠️ Read with errors / ⛔ Inaccessible |
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
- In **update mode**, PRs are checked for activity since the plan was published. Use `✅ Re-read (activity since plan published)` for PRs that were re-read because new commits or review activity was detected. Use `➖ Skipped (no activity since plan published)` for PRs that had no activity and were not re-read. If the user ran `update including PRs`, all PRs will show `✅ Re-read` regardless of activity.