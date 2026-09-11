# Example Test Plan

This file is a worked example of a correctly-formed test plan for a **UI feature with a linked PR**. Use it as a reference when generating plans — it shows the correct structure, scenario format, automation coverage lines, and summary table for a realistic Security Solution feature. For a backend / parser feature without UI or a linked PR, see [`example-test-plan-backend.md`](example-test-plan-backend.md).

> **This example is rendered at `VERBOSITY_LEVEL = standard`.** Do **not** copy the prose length of `Overview` / `Feature Background`, the four-bullet shape of `Assumptions`, or the itemised `**Automation coverage**:` lines when `VERBOSITY_LEVEL` is `lean` or `detailed`. Under `lean` / `detailed` the shape changes — follow [`output-formats.md` § Verbosity levels](output-formats.md#verbosity-levels) and the *Automation coverage rules* / *Source line rules* in [`output-formats.md` § Scenario format](output-formats.md#scenario-format), not the shape of this example. Everything else (section order, scenario Gherkin body, Execution block, Test Coverage Summary, Issue Clarity Assessment, footer) is level-independent and can be copied as-is.

The example is **abbreviated** (6 scenarios, 2 feature areas) but **complete** — every required section is present, optional sections are omitted where the fictional issue does not warrant them, and all self-review checks pass. (Upgrade coverage does apply here — see *Known Limitations* — but the concrete scenarios are abbreviated for brevity.)

---

## What this example demonstrates

- All required sections from `references/document-structure.md`, in order
- The HTML marker lines that must open every published plan — three always required (`<!-- test-plan-generated -->`, `<!-- generated-by: … -->`, `<!-- verbosity: … -->`) and one conditional (`<!-- tokens: … -->` when the session-token script captured a value); see [`output-formats.md` § Token usage marker](output-formats.md#token-usage-marker) for the canonical order
- Scenarios written in terms of user intent, not UI clicks (see Gherkin rules in `references/optional-scenarios.md`)
- Scenario 1 ("User successfully adds a note") covers both display and persistence in a single `And` step — intentional for brevity; a real plan could split these into two P0 scenarios if independent verification is needed
- Automation coverage lines that name specific test files and test descriptions — not aggregate counts
- A case where no tests exist (`Manual only`)
- A `Known Limitations` entry for an inaccessible source (no Figma)
- A `Known Limitations` entry for a coverage gap (no API integration tests)
- Optional sections (RBAC, CCS, multi-space) omitted — the fictional issue does not mention them. Upgrade coverage would be **in scope** per the always-evaluated rule in [`optional-scenarios.md`](optional-scenarios.md#always-evaluated-coverage) (the feature ships a new `alert-notes` saved-object type), but the concrete `@upgrade` scenarios are abbreviated out of this example — see *Known Limitations*
- An *Issue Clarity Assessment* section showing the canonical layout for a single-issue plan, with combined readability matching the per-issue score and no Actionable feedback bullets (the issue scored 4/5 and the Coverage Ratio is above 60%, so the bullets are intentionally omitted per the rules in [`output-formats.md`](output-formats.md#issue-clarity-assessment-section))
- The footer with model identifier and date

---

## Full example

The content below is the **published form** of the plan — the shape of the comment on GitHub after Step 4 runs. The draft file `.agents/tmp/test-plan-#12345.md` written by Step 3 sub-step 7 differs only in the top markers: at draft-save time the file begins with `<!-- verbosity: standard -->` (and, when captured, `<!-- tokens: … -->`) as the top marker(s); Step 4 prepends `<!-- test-plan-generated -->` and `<!-- generated-by: … -->` above those on publish. Marker order is defined in [`output-formats.md` § Token usage marker](output-formats.md#token-usage-marker).

---

```markdown
<!-- test-plan-generated -->
<!-- generated-by: claude-sonnet-4-6 -->
<!-- verbosity: standard -->

# Test Plan: Alert Notes

## Overview

This test plan covers the alert notes feature introduced in issue #12345. It validates that users can add, view, and delete plain-text notes on individual security alerts, and that notes persist across sessions and are visible to all users with access to the alert.

## Feature Background

Security analysts often need to record observations or hand-off context on an alert without resolving or closing it. This feature adds a collapsible Notes panel to the alert detail flyout, backed by a new `alert-notes` saved object type.

## Scope

**In scope:**
- Adding a note to an alert via the alert detail flyout
- Viewing existing notes on an alert
- Deleting a note created by the current user
- Note persistence across browser sessions

**Out of scope:**
- Editing an existing note (deferred — not in this issue)
- Note export or reporting
- Notes on cases (separate feature)

## Terminology

| Term | Definition |
|---|---|
| Alert detail flyout | The side panel that opens when a user clicks an alert row in the Alerts table |
| Note | A free-text annotation attached to a single alert, stored as a saved object |

## Assumptions

- **License level:** Enterprise (notes are an Enterprise feature per the issue)
- **User role:** Editor, unless a scenario specifies otherwise
- **Data setup:** At least one active alert in the Alerts table; at least one existing note for scenarios that test viewing or deleting
- **Deployment type:** Stateful (self-managed); serverless behaviour is the same unless noted

## Acceptance Criteria

1. A user can add a plain-text note to any alert from the alert detail flyout.
2. Notes are visible to all users with read access to the alert.
3. A user can delete a note they created; they cannot delete notes created by others.
4. Notes persist across browser sessions.
5. The notes panel shows the author and timestamp for each note.

## Known Limitations

- ⚠️ No Figma designs were available — scenarios are based on the issue description and PR diff only. UI layout details (e.g. character limit enforcement in the UI vs. the API) were inferred from the PR code.
- ⚠️ No error handling scenarios are included for the `alert-notes` write path (e.g. save object store unavailable). This is intentional to keep the example concise — a real test plan for a write/modify feature must include at least one error handling scenario per the coverage guidance in `references/optional-scenarios.md`. No integration or API integration tests exist for this API; all API-level coverage is at the unit level only.
- ⚠️ Upgrade scenarios are abbreviated out of this example for brevity. In a real plan for the Alert Notes feature, `@upgrade` scenarios from `PREVIOUS_MAJOR_LAST_MINOR` and `CURRENT_MAJOR_LAST_MINOR` to `TARGET_VERSION` are **in scope** per the always-evaluated rule (the feature introduces a new `alert-notes` saved-object type) — see the Upgrade template and version-resolution rules in [`optional-scenarios.md`](optional-scenarios.md#upgrade-scenarios).

## Test Scenarios

<details>
<summary><strong>Adding a note</strong> — 3 scenarios (P0: 1, P1: 1, P2: 1)</summary>

#### Scenario: User successfully adds a note to an alert

**Priority:** P0

**Automation coverage**: 1 unit test (`alert_notes_service.test.ts` — "createNote should persist note to saved objects"), 1 e2e test (`alert_notes.cy.ts` — "can add a note from the alert detail flyout")

```gherkin
Given an active alert exists in the Alerts table
And the user has Editor role
When the user opens the alert detail flyout and submits a non-empty note
Then the note appears in the Notes panel with the user's name and the current timestamp
And the note persists after the user refreshes the page
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

---

#### Scenario: User cannot submit an empty note

**Priority:** P1

**Automation coverage**: 1 unit test (`alert_notes_form.test.tsx` — "submit button is disabled when input is empty")

```gherkin
Given the user has the alert detail flyout open
When the user attempts to submit a note with no text entered
Then the submit action is unavailable
And no note is created
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

---

#### Scenario: Note text at the maximum character limit is accepted

**Priority:** P2

**Automation coverage**: No existing tests found covering this scenario.

```gherkin
Given the user has the alert detail flyout open
When the user enters a note of exactly 10 000 characters and submits
Then the note is saved and displayed in full in the Notes panel
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

</details>

---

<details>
<summary><strong>Viewing and deleting notes</strong> — 3 scenarios (P0: 1, P1: 2)</summary>

#### Scenario: Notes from all users are visible to any user with read access

**Priority:** P0

**Automation coverage**: 1 unit test (`alert_notes_panel.test.tsx` — "renders all notes regardless of author"), 1 e2e test (`alert_notes.cy.ts` — "notes created by other users are visible in the panel")

```gherkin
Given User A and User B both have read access to the same alert
And User A has added a note to that alert
When User B opens the alert detail flyout
Then User B sees User A's note with the correct author name and timestamp
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

---

#### Scenario: User can delete their own note but not another user's note

**Priority:** P1

**Automation coverage**: 1 unit test (`alert_notes_panel.test.tsx` — "delete button renders only for notes owned by current user")

```gherkin
Given an alert has two notes: one created by the current user and one by another user
When the current user views the Notes panel
Then a delete control is visible only on the current user's note
And selecting delete removes their note from the panel
And the other user's note remains unchanged
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

---

#### Scenario: Notes panel shows an empty state when no notes exist

**Priority:** P1

**Automation coverage**: 1 unit test (`alert_notes_panel.test.tsx` — "renders empty state when notes array is empty")

```gherkin
Given an alert has no notes
When the user opens the alert detail flyout
Then the Notes panel shows an empty state message
And no note rows are rendered
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

</details>

---

## Test Coverage Summary

**Total scenarios:** 6

| Feature area | Scenarios | P0 | P1 | P2 | Automated | Manual only |
|---|---|---|---|---|---|---|
| Adding a note | 3 | 1 | 1 | 1 | 2 (unit, e2e) | 1 |
| Viewing and deleting notes | 3 | 1 | 2 | 0 | 3 (unit, e2e) | 0 |
| **Total** | **6** | **2** | **3** | **1** | **5** | **1** |

**Automated coverage notes:**
- Unit tests (Jest) in `x-pack/solutions/security/plugins/security_solution/public/detections/components/alert_notes/`
- Key test files: `alert_notes_service.test.ts`, `alert_notes_panel.test.tsx`, `alert_notes_form.test.tsx`
- E2e coverage (Cypress) in `x-pack/solutions/security/plugins/security_solution/public/detections/cypress/e2e/alert_notes.cy.ts`
- No integration or API integration tests exist for the `alert-notes` saved object API

## Test Execution Notes

**P0 — run first, block release if failing:**
- User successfully adds a note to an alert
- Notes from all users are visible to any user with read access

**P1 — run before release, high-impact regressions:**
- User cannot submit an empty note
- User can delete their own note but not another user's note
- Notes panel shows an empty state when no notes exist

**P2 — run as capacity allows, limited blast radius:**
- Note text at the maximum character limit is accepted

---

<details>
<summary>📊 Issue Clarity Assessment</summary>

| Issue | Type | Score | Critical gaps |
|---|---|---|---|
| #12345 (target) | Target | 4/5 | UI described in text but no Figma mockup available |

**Combined readability: 4/5** — Single-issue plan with no parent or sub-issues; combined readability matches the per-issue score.

**Issue Coverage Ratio: 5 / 6 scenarios (83%)** are derivable from issue text alone. The 10 000-character maximum was sourced from the PR diff; all other scenario facts derive from the issue body and its acceptance criteria.

</details>

---

*🤖 Generated by claude-sonnet-4-6 on 2026-05-13*
```

---

## Variant — Figma metadata-first flow

The worked example above uses "no Figma available" as its Known Limitations entry. When a Figma URL **is** available, the skill follows the metadata-first flow in [`gathering-context.md`](gathering-context.md#figma): one `get_metadata` call to catalogue the structure, then targeted `get_screenshot` calls only for scenarios that assert on visual layout. The Sources Summary and Known Limitations sections change to reflect what was actually fetched.

**Common case — metadata + a few opened PNGs.** Most UI plans need visual anchoring for the P0 flyout and a handful of state variations. Sources Summary (the count `3` reflects **opened PNGs** — the vision-token cost the Step 5 budget in [`gathering-context.md`](gathering-context.md#figma) is measured in — not raw `get_screenshot` calls):

```markdown
| Figma — Alert flyout redesign (frame) | ✅ Metadata read + 3 opened PNGs for visual verification |
```

If the `get_screenshot` responses returned URLs, include those (short-lived) URLs inline in the status cell so the reviewer can open them without re-running the skill; drop them if they have already expired. If the responses came back as inline base64 (no shareable URL), reference the node by name/id instead of a link — see [`output-formats.md`](output-formats.md#sources-summary) and [`gathering-context.md`](gathering-context.md#step-3--add-visual-verification-with-get_screenshot-only-where-needed) for the rule. Either way, no Known Limitations entry is needed for this case — coverage is complete.

**Metadata-only case — small feature, no visual assertion needed.** When every scenario can be written from named components alone (e.g. *"the User flyout opens when clicking the user avatar"* without asserting on its internal layout), no screenshots are needed:

```markdown
| Figma — User avatar interactions (frame) | ✅ Metadata read (4 fetchable elements catalogued) |
```

Again, no Known Limitations entry is required — the intent was structural coverage and it was met.

**Narrowed case — canvas root, or oversized section root (>20 fetchable children).** When the linked node is a `canvas` (regardless of size) or a `section` root with more than 20 fetchable children, Step 2 stops and asks the user which children are in scope (see [`gathering-context.md`](gathering-context.md#figma)). The un-selected children are then out of coverage and must be surfaced. Two entries appear together:

Sources Summary row:

```markdown
| Figma — 🌈 Design Concepts (canvas) | ✅ Metadata read (3 of 40 children catalogued — narrowed by user selection) |
```

Known Limitations entry (added alongside any other limitations):

```markdown
- ⚠️ Figma canvas "🌈 Design Concepts": 3 of 40 direct-child frames catalogued (narrowed by user selection). The remaining 37 frames were out of scope for this test plan and may cover behaviour not represented in scenarios.
```

Both entries must appear together — the Sources Summary row on its own is not enough. Step 3 scenario writing and the Issue Clarity Assessment UX / UI dimension read Known Limitations to decide whether the Figma context is complete, and would otherwise treat a `✅` status as full coverage.

**Budget-reached case.** When the session's screenshot budget bites mid-draft — usually on very large multi-flyout epics — the remaining scenarios have to be written from metadata alone. Surface it so the reader knows which parts lack visual anchoring. Both entries use the same "opened PNGs" unit as the budget itself in [`gathering-context.md`](gathering-context.md#figma):

```markdown
| Figma — 9.5 Flyouts overhaul (section) | ⚠️ Screenshot budget reached (8 PNGs opened — remaining scenarios verified from metadata only) |
```

```markdown
- ⚠️ Figma section "9.5 Flyouts overhaul": the 8 opened PNGs covered the P0 Alert / User / Host / Attack flyouts and their default states. The expanded-state variants (nodes named `Alert - expanded`, `User - expanded`, `Host - expanded`, `Attack - expanded`) were not opened because the per-session opened-PNGs budget was reached; the corresponding scenarios were written from metadata names only and may miss visual-layout details.
```

Unlike the narrowed case, the budget-reached case is fully recoverable — bumping the session budget or splitting the plan into per-flyout runs completes the coverage in a subsequent iteration without changing the plan's design intent.

**Name-vs-content mismatch case.** Figma layer names are authored by designers and can drift from what the layer actually renders (a frame labelled `Analyzer` that ends up showing a Notes flyout, an `Alert v2` frame that still holds the old design, etc.). When `get_screenshot` reveals such a mismatch — per the rules in [`gathering-context.md`](gathering-context.md#figma) — the affected node retains a successful Sources Summary status (the fetch worked), but a Known Limitations entry must record the mismatch so downstream reviewers do not treat the metadata inventory as authoritative for that node:

```markdown
| Figma — Flyout-design-per-release, "New system" (section) | ✅ Metadata read + 3 opened PNGs for visual verification |
```

```markdown
- ⚠️ Figma metadata node names are not fully reliable for the "New system" section. The frame named `Analyzer` (id `6918:7103`) rendered as a Notes flyout when screenshotted; its 4 sibling `Analyzer` frames were not screenshotted and may share the same mismatch. Any analyzer-specific scenarios in this plan therefore rely on the target-issue text and prior Timeline behaviour rather than on a verified visual reference from this Figma section.
```

Unlike the narrowed and budget-reached cases (where the coverage gap is quantitative), the name-mismatch case is a qualitative signal that the *inventory step alone* is insufficient — a lesson that applies to how the plan cites the Figma node, not to how many nodes were fetched.
