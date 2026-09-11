---
name: gate-test-quality
description: >
  Authoring/review discipline for Kibana workflow gates (`can_apply_*`, `if`-expressions)
  and their Jest tests. Use when writing, editing, or reviewing a Security/PND managed
  workflow gate, a `can_apply_*` decision step, or the test that guards one. Catches
  vacuous substring assertions, gate-vs-schema contract drift, and guard-coverage gaps via
  a mutation-testing loop. Origin: PR hannahbrooks/kibana#9 (four surviving gate mutations
  M1–M4, a suppression rule-type gap, a fingerprint coverage gap).
---

# Workflow Gate Test Quality

Every bug this catches is **one meta-bug in three costumes**: a check existed, and someone
trusted the check without verifying the check actually *bites*. Run this whenever you write
or edit a gate (a workflow `if`-expression, a `can_apply_*` flag, a validation condition)
or the test that guards it.

---

## The one habit that catches all three

**Before you trust a gate, guard, or test — prove it can fail.**

Deliberately break the thing it protects and confirm the test goes red:

```
1. Mutate: delete or invert the condition your test asserts on
2. Run the test file:  node scripts/jest <path-to-test>
3. Does it FAIL?
   - No  → the test is vacuous. It never pinned that behavior. Fix the test, not the gate.
   - Yes → the test bites. Restore the gate. Move on.
```

That's the whole loop. ~2 minutes per clause, fully local, no stack, no LLM. PR
hannahbrooks/kibana#9 shipped **four** gate mutations (M1–M4) that survived a green suite
because nobody ran this loop.

> **Rule of thumb:** if you can delete a condition and the test still passes, you don't
> have a test for that condition — you have a comment.

---

## Pattern 1 — Vacuous assertions (the substring trap)

Four gate mutations survived because tests asserted on **source text**, not **parsed
behavior**. Each passed whether or not the gate actually fired.

### ❌ The trap (what PR #9 found)

```js
// Asserts the WORD exists in the YAML/source — not that the gate is wired in.
expect(yamlSource).toContain('can_apply');
expect(ifExpression).toContain('classify_apply_failures');
```

Drop the approval clause from `apply_disable_tuning`'s `if`, flip a null check in
`can_apply_exception`, remove a failure clause from `mark_alerts_applied`, drop
`tags_to_remove` — all four still pass, because the *string* is still somewhere in the file.

### ✅ The fix (biting assertions)

Assert on the **parsed structure** — the specific step's condition, the specific flag's
binding — not on raw source. This is the shape that now lives in
`server/services/watches/project_watch.test.ts` (`@kbn/pnd-plugin`):

```js
// Pin the STEP's condition, not the file's text.
it('requires analyst approval in every apply step condition', () => {
  for (const name of APPLY_STEPS) {
    const step = tuningSteps.find((s) => s.name === name);
    expect(step).toBeDefined();
    expect(String(step!.if)).toContain(
      'steps.review_tuning.output.response.approved == true'
    );
  }
});

// Pin each FLAG to its own gate — a dropped pairing can't hide.
it('pairs every failure flag with its own apply step gate', () => {
  const withEntries = failuresStep.with as Record<string, string>;
  for (const name of APPLY_STEPS) {
    const flag = name.replace('apply_', '').replace('_tuning', '') + '_failed';
    expect(withEntries[flag]).toContain(`steps.${name}.error != null`);
  }
});
```

The difference: the first form still finds `can_apply` after you delete the gate; the
second **fails** the moment the binding is dropped. Parse the workflow source into steps and
assert against `step.if` / `step.with` — never against the un-parsed file.

**Catch it yourself:** grep your test for `toContain` / `toMatch` applied to a source string
or a whole YAML file. Substring-on-source is almost always vacuous. Then run the mutation
loop on every clause in the gate.

---

## Pattern 2 — Gate vs. schema contract mismatch

The `can_apply_suppression` gate proposed an `alert_suppression` payload without checking
the rule type — but `alert_suppression` is only a valid PATCH payload for the rule types
the schema wires it into. Any other rule type sailed through approval and then **failed at
the apply step, after a human already approved it.**

### The check (no execution needed)

When a gate produces a payload, the payload's **validator is the spec** for what the gate
must pre-check:

```
Gate proposes payload X for a rule
  → what schema validates X?            (e.g. rule_schemas.schema.yaml)
  → does that schema restrict WHICH rule types accept X?
  → if yes: does the gate assert fetch_rule.output.type against that set
    BEFORE proposing X?
```

For `alert_suppression`, the validator is
`security_solution/common/api/detection_engine/model/rule_schema/rule_schemas.schema.yaml`
— it wires `alert_suppression` into the typed rule variants that accept it (query-family
rules; not every type). The gate must read `fetch_rule.output.type` and refuse suppression
for a rule type the schema would reject. Gate and validator drifting apart = bug.

**Catch it yourself:** list every `can_apply_*` gate. For each, name the schema that
validates its payload, and ask "does my gate assert the payload's preconditions?" If the
gate proposes something a schema restricts, the gate must check the restriction first.

---

## Pattern 3 — Guard-coverage gap (the trusted guard that doesn't cover you)

A fingerprint table guards managed workflow YAML so a silent edit without a version bump
fails the suite. `rule_tuning.yaml` was the only managed workflow YAML **not** in the table
— so a silent edit passed green, and installed spaces never picked up the change (no version
bump → no re-import).

### The check

The trap is assuming "there's a fingerprint/snapshot/allow-list guard" means "my file is
guarded." For any **guard-of-a-set**, the question is *coverage*, not *existence*:

```
Guard exists (fingerprint table / snapshot list / CODEOWNERS / allowed-lists)
  → is the thing I just added actually IN the set?
  → is there a test that fails when a managed file exists on disk
    but is absent from the table?
```

**Catch it yourself:** one grep — is your new file in the guard's set? Better: add a test
that enumerates the managed-YAML directory and fails on any file missing from the
fingerprint table. That turns "did you remember" into "the suite enforces it."

---

## Quick checklist (run before opening the PR)

- [ ] **Mutation loop** on every clause of every new/changed gate — each one kills the suite when broken.
- [ ] **No substring-on-source assertions** for behavior (`toContain` on raw YAML/if-expr text). Assert on parsed step structure.
- [ ] **Gate ↔ schema contract** — every `can_apply_*` gate asserts its payload's preconditions from the validating schema.
- [ ] **Guard coverage** — new managed file is actually in every guard-of-a-set that should cover it.
- [ ] Each new gate failure would **name itself** (which clause, which step), not surface as a bare red/green.

## Why this matters

In PR #9 the worker gates were *correct* the whole time — every zero/failure was a
test-quality artifact. Biting tests are how you prove the gate works, and how a reviewer
trusts it without re-deriving your evidence from scratch.
