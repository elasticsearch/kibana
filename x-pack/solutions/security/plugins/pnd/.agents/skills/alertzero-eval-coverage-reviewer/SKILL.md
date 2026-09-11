---
name: alertzero-eval-coverage-reviewer
description: >
  Use when reviewing changes under x-pack/solutions/security/plugins/pnd/ (the AlertZero plugin),
  AlertZero managed workflow definitions, or AlertZero workflow step types — to judge whether the
  change introduces enforcing behavior that no test actually bites.
---

# AlertZero — Eval & Coverage Reviewer

**Judges one thing: does this change add behavior that decides an outcome, without a test that fails when the behavior is wrong?**

AlertZero ships autonomous investigation workers whose decisions are enforced by three
different mechanisms — YAML workflow definitions, workflow step types, and TypeScript
guards. A test that only asserts a value was *read* does not bite. This skill exists
because several merged AlertZero PRs pass CI with the enforcing branch untested, and at
least three such gaps have been demonstrated by mutation (invert the guard, tests stay
green).

Naming: the product is **AlertZero** (`ALERTZERO_*` constants, `Alert Zero Agent`). The
plugin directory and config key are still `pnd` (`@kbn/pnd-plugin`, `xpack.pnd.enabled`).
Use AlertZero in prose; use `pnd` only when naming a real path.

## The enforcing surface

A file is **enforcing** if changing it can change what an autonomous worker does, what a
human is asked to approve, or what gets written to a user's cluster.

| Layer | Where | What it enforces |
|---|---|---|
| **1 — Workflow definitions** | `src/platform/packages/shared/kbn-workflows/managed/definitions/pnd/*.yaml` | Approval gates, step order, which actions are gated. A YAML edit changes autonomous behavior with no TypeScript review surface. **This is a shared platform package, not the plugin** — a behavior change here is easy to miss in a security-scoped review. |
| **2 — Step types** | `security_solution/{common,server,public}/workflows/step_types/**` — note these sit **directly** under `workflows/`, with no directory in between | `security.createRule`, note/attack mutation steps. These write to the user's cluster. |
| **3 — TS guards** | `x-pack/solutions/security/plugins/pnd/server/**` (e.g. `managed_workflows/watches/watch_settings.ts`, `managed_workflows/watch_registry.ts`) and `x-pack/solutions/security/packages/kbn-pnd-common/**` | Patch validation, watch registration, which settings a worker may change. |

**The AlertZero UI (`plugins/pnd/public/**`) is not an enforcing layer.** It renders state;
it does not decide what a worker does or what reaches a cluster. A large UI-only PR is
correctly reviewed in silence by this skill — that is the single most common false
positive, and the reason `public/**` is excluded rather than merely deprioritized.

**Not enforcing** — do not raise coverage findings on these: `**/samples/**`,
`**/fixtures/**`, `**/*.mock.ts`, `**/mocks/**`, storybook, i18n, icons, type-only
re-exports. A PR touching only these needs no new tests. Treating a sample-data edit as
an enforcing change is the most common false positive; check the path before commenting.

## Reading the pull request

Read files **from the pull request diff**, not from the branch you are checked out on.
This workflow runs on `pull_request_target`, which checks out the *base* branch — every
file the pull request adds is therefore absent from disk. A `File not found` for a path
listed as `added` in the pull request means the file exists only in the diff; read it
there and continue. Do not treat it as a missing file, and do not conclude the change is
untested because you could not open its test.

Only consult the checked-out tree for files the pull request does **not** touch — the
fingerprint guard table and sibling step types you are comparing against.

## Critical checks (do these first)

### 1. YAML behavior change without a fingerprint guard

`src/platform/packages/shared/kbn-workflows/managed/managed_workflow_definitions.test.ts`
pins workflow definitions by version so a silent behavior edit fails CI. **Its guard table
is hand-enumerated**, and hand-enumerated tables go stale: workflows imported as raw YAML
(see `definitions/pnd/rule_workflows.ts`) have been missing from it while the generic
schema test still passed.

- **Check the file's git status first.** This finding is about *modified* YAML — a
  behavior edit to a workflow that already ships. If the file is **added**, the workflow
  is new and unreleased; a missing guard row is worth at most one line in a summary, never
  a per-file comment.
- If the PR **modifies** any `definitions/pnd/*.yaml`, confirm the workflow is **named in
  the guard table**, not merely covered by the generic schema test. Schema coverage proves
  structure, never behavior.
- If the PR changes a gate, order, or condition, the pinned version must change too.
- **Comment once per PR, not once per file.** A PR adding twelve workflow definitions gets
  a single comment naming the pattern — twelve identical comments is why reviewers mute a
  bot. If more than three files trigger the same finding, say so in one comment on the
  first file and give the count.
- **POC and spike PRs** (title contains `[POC]`, or the PR is draft and adds a new watch
  family) are exploring a design. Report the guard-table gap as a merge-blocker only if
  the workflow is reachable in a shipping configuration; otherwise note it once and move
  on.

State the consequence plainly: *an inverted approval gate in an already-shipping workflow
currently passes CI green.*

### 2. Enforcing change with a thin or absent test delta

Count enforcing source files changed against test files changed **in the same PR**. This
check does not care whether files are added or modified — a brand-new watch that ships
with almost no tests is exactly as untested as an edited one.

- **Zero test files with any enforcing source change** — always comment.
- **A ratio worse than roughly one test file per four enforcing source files** — comment
  once, naming the count (e.g. *"7 enforcing files, 1 test file"*), and point at the
  specific behavior you believe is unbitten rather than demanding tests in general.
- Do not apply this to a PR whose enforcing changes are pure moves or renames; check the
  diff before counting.

A large PR with a proportional test delta needs no comment here, however large. A small
PR that adds one gate and no test does.

### 3. Gate and guard branches with no failing-side test

For any added conditional that rejects, gates, or refuses:

- Is there a test that asserts the **rejection**, not just the happy path?
- Patch validation is the repeat offender: `applyPatch`-style functions often test one
  rejection reason and leave the rest asserted only by a shared "is rejected" shape.
- The bar is per-branch. Five rejection reasons need five assertions, or one table-driven
  test that enumerates all five.

### 4. Fail-closed claims must be traced, not assumed

Gated actions read a condition and proceed only on `=== true`. This is genuinely
fail-closed, but *because* the KQL evaluator returns false for an absent intermediate
segment — not because of the `=== true` alone. If a PR changes condition strings, gate
paths, or the evaluator, require a test asserting the **absent/missing** case, not only
true and false.

### 5. Cluster-writing steps must assert the full payload

For `security.createRule` and other layer-2 steps, a test that asserts the call happened
is not enough. Require assertions on fields the step **removes or defaults**, and on
space scoping. Known asymmetry worth checking: some rule steps template
`{{ workflow.spaceId }}` while sibling steps omit space entirely — if the PR touches one,
ask whether the omission is deliberate.

### 6. Worker/LLM behavior changes

AlertZero workers are LLM-driven; prompt, skill-projection, and callable-set changes are
behavior changes that unit tests cannot judge. If the PR changes what a worker is told or
what it may call, ask whether an eval suite covers it, and say plainly if none exists.
Do not demand an eval suite for a typo fix.

## Review method

1. Classify every changed file into layer 1/2/3 or non-enforcing. If **nothing** is
   enforcing, post nothing.
2. For each enforcing file, find the test that would fail if the new behavior were
   inverted. Read the test — do not infer coverage from a filename or from a nearby
   `describe` block.
3. Before commenting, ask: *if I deleted this branch, would any test go red?* Only raise
   the finding when the honest answer is no.
4. Prefer one specific finding with the exact missing assertion over a list of general
   coverage advice.

## Every comment must tell the author what to do next

A finding that names a gap without naming the fix is a complaint. Each comment carries
three things: the untested behavior, the concrete remedy, and what "done" looks like.
Point at the existing example in the repository rather than describing code in prose —
authors trust a working file more than a reviewer's snippet.

Use the remedy that matches the finding.

**Finding 1 — YAML behavior change with no fingerprint row.** The guard's fingerprint
table is in `managed_workflow_definitions.test.ts` (the `it.each` block titled *requires
bumping … together with the imported YAML fingerprint*). The fix is two edits in one
change: bump `version` in the workflow's module under `definitions/pnd/`, and add or
update that workflow's `'<version>:<hash>'` row in the table. Copy the shape of the
existing `PND_WATCH_*` rows. Done means: revert only the YAML edit locally and the guard
test goes red.

This one has a consequence worth stating every time, because it is not obvious and it is
not cosmetic — **without the version bump, already-installed spaces keep running the old
workflow.** The edit ships to new installs only. Say that; do not just ask for a bump.

**Finding 2 — thin or absent test delta.** Do not ask for "more tests". Name the single
behavior you believe is unbitten and the assertion that would bite it. For a new watch,
the highest-value first test is usually the one asserting the gate refuses, not the one
asserting the happy path succeeds. Done means: invert that one branch and a named test
fails.

**Finding 3 — gate or guard with no failing-side test.** Ask for one table-driven test
enumerating every rejection reason, not five near-duplicate cases. Point at the sibling
step's test file as the pattern. Done means: each rejection reason has a distinct
assertion, so deleting any single reason turns exactly one case red.

**Finding 4 — fail-closed claim not traced.** Ask for the *absent* case specifically:
a test where the intermediate segment is missing entirely, not merely false. Done means:
the test fails if the evaluator ever starts returning true for a missing path.

**Finding 5 — cluster-writing step without full payload assertions.** Ask for assertions
on the fields the step removes or defaults, and on space scoping. `create_rule_step`'s
unit test is the reference for payload shape. Done means: changing a defaulted field in
the handler turns a test red.

**Finding 6 — worker or LLM behavior change.** A unit test cannot judge whether a worker
behaves correctly, and asking for one wastes the author's time. Say plainly whether an
eval suite covers this worker today. If none exists, that is a gap to record — link the
tracking issue rather than blocking the PR on building a suite from scratch.

## When an eval is the right answer, and when it is not

Reviewers get this wrong in both directions, so be explicit in the comment about which
one you are asking for.

**A unit or integration test is right** when the behavior is deterministic: a gate that
refuses, a payload field that is dropped, a version that must move with a YAML edit, a
rejection reason. Anything you can invert and watch go red belongs here. Most findings
this skill produces are in this category — ask for the test, not an eval.

**An eval is right** when the behavior is model-mediated and has no single correct output:
what a worker decides to do, which skill it selects, whether a prompt change degrades
judgement, whether a tuning proposal is sound. These cannot be pinned by assertion, only
measured across a set of examples.

What an eval must cover to be worth adding, in this order: the decision the worker is
actually trusted to make; at least one example where the correct behavior is to *refuse
or escalate* rather than act; and a baseline recorded before the change so a later
regression is visible as a movement, not just a number. An eval with only happy-path
examples measures nothing useful — it will stay green through exactly the failures that
matter.

Say plainly when no suite exists. "No eval covers this worker's tuning decision today"
is a more useful review comment than a vague request for coverage, and it is the sentence
that gets a gap tracked instead of forgotten.

## What not to say

- Do not ask for coverage on non-enforcing paths.
- Do not ask for an eval suite where a unit test would bite.
- Do not restate the diff back to the author.
- Do not claim a gap you have not traced to a specific untested branch. A wrong coverage
  finding costs more trust than a missed one.
