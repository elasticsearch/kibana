# Example Test Plan

This file is a worked example of a correctly-formed test plan for a **UI feature with a linked PR**. Use it as a reference when generating plans — it shows the correct structure, scenario format, automation coverage lines, and summary table for a realistic Security Solution feature. For a backend / parser feature without UI or a linked PR, see [`example-test-plan-backend.md`](example-test-plan-backend.md).

The example is **abbreviated** (6 scenarios, 2 feature areas) but **complete** — every required section is present, optional sections are omitted because the fictional issue does not warrant them, and all self-review checks pass.

---

## What this example demonstrates

- All required sections from `references/document-structure.md`, in order
- The two HTML marker lines that must open every published plan
- Scenarios written in terms of user intent, not UI clicks (see Gherkin rules in `references/optional-scenarios.md`)
- Scenario 1 ("User successfully adds a note") covers both display and persistence in a single `And` step — intentional for brevity; a real plan could split these into two P0 scenarios if independent verification is needed
- Automation coverage lines that name specific test files and test descriptions — not aggregate counts
- A case where no tests exist (`Manual only`)
- A `Known Limitations` entry for an inaccessible source (no Figma)
- A `Known Limitations` entry for a coverage gap (no API integration tests)
- Optional sections (RBAC, upgrade, CCS, multi-space) omitted — the fictional issue does not mention them
- An *Issue Clarity Assessment* section showing the canonical layout for a single-issue plan, with combined readability matching the per-issue score and no Actionable feedback bullets (the issue scored 4/5 and the Coverage Ratio is above 60%, so the bullets are intentionally omitted per the rules in [`output-formats.md`](output-formats.md#issue-clarity-assessment-section))
- The footer with model identifier and date

---

## Full example

The content below is exactly what would be saved to `.agents/tmp/test-plan-#12345.md` and posted to GitHub.

---

```markdown
<!-- test-plan-generated -->
<!-- generated-by: claude-sonnet-4-6 -->

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
