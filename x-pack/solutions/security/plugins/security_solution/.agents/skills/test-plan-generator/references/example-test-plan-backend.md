# Example Test Plan — backend / parser feature

This file is a worked example of a correctly-formed test plan for a **pure-backend feature with no UI, no PR linked yet, and no `TARGET_VERSION` available**. Use it as a reference alongside [`example-test-plan.md`](example-test-plan.md), which covers the UI-feature case.

The example is **abbreviated** (6 scenarios, 1 feature area) but **complete** — every required section is present, optional sections are omitted because the feature has no upgrade / RBAC / space / tenant / CCS surface, and all self-review checks pass.

---

## What this example demonstrates (differently from the UI example)

- A target that has **no linked PR and no orphan PR** — the plan is generated from issue text plus existing parser code only. The Coverage Ratio computation honours the *Boundary case: no PR linked* rule from [`issue-clarity-assessment.md`](issue-clarity-assessment.md#boundary-case-no-pr-linked) — existing-code facts are classified as `pr` for the ratio
- A `TARGET_VERSION` that **cannot be resolved** from milestone, labels, or project fields, and a user who is unavailable to answer — applies the *User-unavailable fallback* table from `SKILL.md` Step 2 (mark `⚠️`, omit upgrade scenarios)
- Two dimensions marked **N/A** in the Issue Clarity Assessment — `UX/UI` (no UI surface) and `Data & Roles` (purely backend with the data shape fully described in the issue body, per the B3 reword)
- A parent epic that scores **2/5** while the target scores **4/5** — the combined readability stays at 4/5 (target carries the corpus) and *Actionable feedback* bullets are included because at least one issue scored ≤ 3
- One scenario flagged in *Known Limitations* and the Coverage Ratio breakdown as **code-derived** (an implementation detail not in any issue body)
- Optional sections (RBAC, Multi-space, Multi-tenant, Upgrade, CCS) **explicitly omitted** with a brief justification in *Known Limitations* — never include them speculatively
- `Automation coverage` lines that name the **existing test file for the function being extended**, marked `partial` because the existing tests cover the prior behaviour but not the new variants

---

## Full example

The content below is exactly what would be saved to `.agents/tmp/test-plan-#90201.md` and posted to GitHub. Issue numbers (`#90100`, `#90201`) are synthetic — do not match any real Kibana or planning issue.

---

```markdown
<!-- test-plan-generated -->
<!-- generated-by: claude-sonnet-4-6 -->

# Test Plan: Parser support for FooBar helper variants

## Overview

This test plan covers the extension of a vendor-specific KQL resource identifier to recognise two new helper functions, `_FooBarSingle(...)` and `_FooBarMulti(dynamic([...]))`. The expected outcome is that aliases referenced from these helpers are extracted as `{ type: 'lookup', name: '<alias>' }` resource dependencies, alongside the pre-existing `_FooBar(...)` support, with deterministic dedupe / order behaviour preserved.

## Feature Background

The migration intake pipeline parses vendor rule sources to identify dependencies before translation. Today the parser only recognises the single-alias helper `_FooBar(...)`. The new ASIM-style helpers `_FooBarSingle('Alias')` and `_FooBarMulti(dynamic(['A', 'B']))` cover a small but important slice of rule sources; without parser support, those dependencies are missed at intake and downstream translation can be incomplete.

## Scope

**In scope:**
- Extend the resource identifier to detect `_FooBarSingle("...")` and `_FooBarMulti(dynamic([...]))`.
- Extract every alias and emit it as a resource dependency with `type: 'lookup'`.
- Preserve deterministic dedupe and ordering behaviour across all helpers.
- Cover quote and whitespace variants for both new helpers.
- Verify non-regression of the existing `_FooBar(...)` extraction.

**Out of scope:**
- Runtime evaluation of alias variables not expressed as string literals.
- Retrieval of watchlist content (this issue is dependency identification only).

## Assumptions

- **License level:** Enterprise (parent epic #90100 indicates the migration capability is Enterprise-tier).
- **User role:** Not user-facing — the parser runs server-side during migration intake; no end-user role applies.
- **Data setup:** Input is a single KQL query string; no fixtures or persisted state are required.
- **Deployment type:** Applies equally to self-managed, serverless, and ECH — the parser is a pure function with no deployment-specific behaviour.
- **Target version:** ⚠️ Not specified — no milestone, labels, or project fields on the target issue. Please confirm `TARGET_VERSION` before publishing.

## Acceptance Criteria

1. Single alias extraction from `_FooBarSingle(...)` works for quote and whitespace variants.
2. Multi-alias extraction from `_FooBarMulti(dynamic([...]))` works for literal arrays.
3. Returned resource type is `lookup`.
4. Duplicates are deduplicated.
5. Existing `_FooBar(...)` behaviour is not regressed.

## Known Limitations

- ⚠️ `TARGET_VERSION` is unknown — no milestone or version label on the target issue. Upgrade scenarios are intentionally omitted per the *User-unavailable fallback* table in `SKILL.md` Step 2. Re-evaluate once the version is confirmed.
- ⚠️ No PR is linked to the target issue at the time of writing. The plan is derived from the issue body and the existing parser code at `<path>/foobar_identifier.ts`. When the implementation PR is opened, re-run the skill in `update` mode to capture exact symbol names, error strings, and any unanticipated artifacts.
- One scenario in this plan (*"Parser regex state does not leak across repeated invocations"*) is sourced from the existing parser implementation, not from the issue text. It is included because regex state leakage is a real-world failure mode for the existing global-regex pattern that will be extended by this work. Flagged accordingly in the Coverage Ratio breakdown below.
- Optional sections (RBAC, Multi-space, Multi-tenant, Upgrade, CCS) do not apply: the feature is a pure server-side parser with no user-facing surface, no persisted state, no space / tenant scoping, and no Elasticsearch cluster interactions.

## Test Scenarios

<details>
<summary><strong>FooBar helper identification</strong> — 6 scenarios (P0: 3, P1: 2, P2: 1)</summary>

#### Scenario: Single alias extraction from `_FooBarSingle` returns a `lookup` resource for both quote styles

**Priority:** P0

**Automation coverage**: No existing tests found covering this scenario.
```gherkin
Given a KQL query that references `_FooBarSingle("AccountsA")` and `_FooBarSingle('AccountsB')`
When the resource identifier parses the query
Then the result contains two resources of type "lookup", named "AccountsA" and "AccountsB"
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

#### Scenario: Multi-alias extraction from `_FooBarMulti(dynamic([...]))` returns one `lookup` resource per alias

**Priority:** P0

**Automation coverage**: No existing tests found covering this scenario.
```gherkin
Given a KQL query that references `_FooBarMulti(dynamic(["AliasA", "AliasB"]))`
When the resource identifier parses the query
Then the result contains two resources of type "lookup", named "AliasA" and "AliasB"
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

#### Scenario: Existing `_FooBar(...)` extraction is not regressed when new helpers are absent

**Priority:** P0

**Automation coverage**: 5 unit tests (`foobar_identifier.test.ts` — "extracts a single reference with double quotes", "extracts a single reference with single quotes", "extracts multiple distinct references", "deduplicates repeated references", "tolerates whitespace around the function arguments"), partial — these cover the existing function in isolation; this scenario verifies the behaviour is unchanged after the new helpers are added.
```gherkin
Given a KQL query that only uses `_FooBar('A')` and `_FooBar('B')`
When the resource identifier parses the query
Then the result contains exactly two resources of type "lookup", named "A" and "B", with no extra entries
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

---

#### Scenario: Duplicate aliases across helpers are deduplicated into a single resource

**Priority:** P1

**Automation coverage**: No existing tests found covering this scenario.
```gherkin
Given a KQL query that references "Shared" through `_FooBar('Shared')`, `_FooBarSingle('Shared')`, and `_FooBarMulti(dynamic(['Shared']))`
When the resource identifier parses the query
Then the result contains exactly one resource with name "Shared" and type "lookup"
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

#### Scenario: Whitespace around `_FooBarSingle` arguments does not prevent extraction

**Priority:** P1

**Automation coverage**: No existing tests found covering this scenario.
```gherkin
Given a KQL query that references `_FooBarSingle  (   'Spaced'   )`
When the resource identifier parses the query
Then the result contains a single resource with name "Spaced" and type "lookup"
```

**Execution:**
- [ ] ✅ Pass
- [ ] ❌ Fail
- [ ] 🚫 Blocked

_If Fail or Blocked, reply to this comment with details (env, build, repro steps)._

---

#### Scenario: Parser regex state does not leak across repeated invocations on the same input

**Priority:** P2

**Automation coverage**: 1 unit test (`foobar_identifier.test.ts` — "does not retain regex state across invocations"), partial — covers the existing function only; this scenario asserts the property holds for the extended parser as well.
```gherkin
Given a KQL query that references `_FooBarSingle('Accounts')`
When the resource identifier parses the same query twice in succession
Then both invocations return the same single resource with name "Accounts" and type "lookup"
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
| FooBar helper identification | 6 | 3 | 2 | 1 | 2 (unit, partial) | 4 |
| **Total** | **6** | **3** | **2** | **1** | **2** | **4** |

**Automated coverage notes:**
- Unit tests (Jest) at `<path>/foobar_identifier.test.ts`.
- Key existing test file: `foobar_identifier.test.ts` (8 tests covering `_FooBar(...)` only — used as partial coverage for the two regression / shared-behaviour scenarios in this plan).
- Gaps: No tests yet exist for `_FooBarSingle` or `_FooBarMulti` — all 4 new-helper scenarios are uncovered until the implementation PR lands. No integration, API integration, or e2e tests apply — the parser is a pure unit-level function with no UI or API surface.

## Test Execution Notes

**P0 — run first, block release if failing:**
- Single alias extraction from `_FooBarSingle` returns a `lookup` resource for both quote styles
- Multi-alias extraction from `_FooBarMulti(dynamic([...]))` returns one `lookup` resource per alias
- Existing `_FooBar(...)` extraction is not regressed when new helpers are absent

**P1 — run before release, high-impact regressions:**
- Duplicate aliases across helpers are deduplicated into a single resource
- Whitespace around `_FooBarSingle` arguments does not prevent extraction

**P2 — run as capacity allows, limited blast radius:**
- Parser regex state does not leak across repeated invocations on the same input

---

<details>
<summary>📊 Issue Clarity Assessment</summary>

| Issue | Type | Score | Critical gaps |
|---|---|---|---|
| #90201 (target) | Sub-issue | 4/5 | Edge cases limited to quote/whitespace/dedup; no error paths (malformed dynamic array, empty alias) or limits enumerated |
| #90100 (parent) | Parent epic | 2/5 | ACs read as marketing copy ("with high degree of accuracy"); no explicit Scope / Out-of-scope sections; roles/permissions not enumerated |

**Combined readability: 4/5** — Target #90201 carries the corpus with explicit numbered ACs and explicit Scope / Out-of-scope sections; the parent's vagueness does not degrade the combined grade.

**Issue Coverage Ratio: 5 / 6 scenarios (83%)** are derivable from issue text alone. One scenario (*"Parser regex state does not leak across repeated invocations"*) relies on a fact about the existing parser implementation (the regex `lastIndex` failure mode) that is not present in any issue body — classified as `pr` per the *Boundary case: no PR linked* rule.

**Actionable feedback:**
- Parent #90100: replace marketing-style success criteria such as *"high degree of accuracy"* with measurable thresholds (e.g. percentage of supported rule types, accepted KQL constructs per category) and add explicit `Scope` / `Out of scope` sections at the epic level.
- Parent #90100: enumerate the user roles required to drive the migration capability (uploader, reviewer, deployer) and the Subscription Tier per role, so individual sub-issues can inherit role context instead of leaving it implicit.

</details>

---

*🤖 Generated by claude-sonnet-4-6 on YYYY-MM-DD*
```
