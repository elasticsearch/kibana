# Quality Rubric *(v2 — not used in v1)*

Classifies an individual test block's assertion quality after Phase 6 matching.

**v1 cut**: This file is not consulted in v1. Every validated match from Phase 6 is `IMPLEMENTED` with no quality dimension. Ship Phase 7 in v2 once Phase 6 matching is proven reliable on real PRs.

Read this file only when Phase 7 is enabled.

---

## Why a quality dimension matters

Block-name matching is necessary but not sufficient. The `bug-fix` skill in this repo explicitly warns that some assertion patterns are *fragile and misrepresentative* — they pass the test runner but do not catch the behaviour they claim to. Surfacing a `weak` verdict tells the QA *"there is a test here, but it would not catch a regression in this scenario"* — strictly more useful than `IMPLEMENTED`.

The anchoring source is `bug-fix/SKILL.md` lines 33–44 (Red Flags) and `bug-fix/SKILL.md` line 111 (the EuiToolTip removal anti-pattern). Quote those rules verbatim in the prompt; do not re-author them.

---

## Quality levels

| Level | Definition |
|---|---|
| `strong` | The assertion would fail if the scenario regressed. It asserts a user-visible behaviour, a returned value, an emitted event, or a state transition that maps directly to the scenario's described outcome. |
| `medium` | The assertion touches the right surface but indirectly: asserts a side effect (DOM structure, query shape, spy invocation count) without verifying the user-visible outcome. Would catch *some* regressions in the scenario; would miss others. |
| `weak` | The assertion is tautological, fragile, or asserts the opposite of what the scenario describes. Common patterns: `expect(spy).toHaveBeenCalled()` without argument matching; `expect(wrapper.find(X)).toHaveLength(0)` to assert element removal; `expect(thing).toBeDefined()` for a value the framework would error on if undefined; assertions on rendered text that copy the implementation's literal string instead of the user-facing label. |
| `none` | No `expect` / assertion call in the matched block, or the block contains only setup code. |

---

## Quality prompt

**Used in:** Phase 7 (v2).
**Input:** one validated match `{path, blockName}` + the test block slice from `scripts/extract_test_block.mjs`.
**Output:** a verdict + a quoted assertion line.

### Instructions to issue to the model

> You are a Senior QA Engineer assessing whether a specific test's assertions would catch a regression in a given scenario.
>
> **Scenario:** `<verbatim from Phase 1>`
> **Test block:** `<blockName from catalog>` at `<path>:<line>`
> **Block source:**
> ```ts
> <slice from extract_test_block.mjs>
> ```
>
> Classify the assertion quality as one of: `strong`, `medium`, `weak`, `none`.
>
> Rules (these are non-negotiable — they come from the `bug-fix` skill's Red Flags):
>
> 1. An existence check for a removed element is **weak**. Example: `expect(wrapper.find(EuiToolTip)).toHaveLength(0)`. It is fragile (any future tooltip in the tree breaks it) and asserts presence, not behaviour.
> 2. `expect(spy).toHaveBeenCalled()` without arguments is **weak**. The fix may call the spy with wrong args and still pass.
> 3. `expect(value).toBeDefined()` on a value that would have thrown if undefined is **none** — it asserts nothing.
> 4. Assertions on internal state values (component state, Redux store) are **medium** unless the scenario explicitly describes the state transition.
> 5. Assertions on user-visible text, returned API payload, or emitted event arguments are **strong**.
> 6. If the block calls a helper whose body is not in the slice, classify based only on what is visible. Cross-file fixture chasing is out of scope.
>
> Return JSON:
> ```json
> {
>   "verdict": "strong|medium|weak|none",
>   "assertionQuote": "<verbatim line from the slice — must appear in the source above>",
>   "reasoning": "<one sentence>"
> }
> ```
>
> If you cannot find an assertion to quote: `verdict: "none"`, `assertionQuote: ""`, `reasoning: "no assertion in block"`.

### Validation gate

1. The `assertionQuote` field must appear verbatim in the slice. If not: downgrade `verdict` to `INCONCLUSIVE` and surface a warning. One retry maximum.
2. A `verdict: "strong"` paired with an assertion that matches any pattern in the "weak" rules above is a contradiction — downgrade to `weak` and log.
3. A `verdict: "none"` with a non-empty `assertionQuote` is also a contradiction — downgrade to `INCONCLUSIVE`.

---

## Examples

### Strong — user-visible behaviour

**Scenario:** *"Saving an invalid rule shows a validation error toast."*
**Slice:**
```ts
it('shows an error toast when the YAML is invalid', async () => {
  await page.getByRole('textbox').fill(invalidYaml);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid YAML');
});
```
**Verdict:** `strong`. The assertion asserts the user-visible toast text matches the scenario's described outcome.

---

### Medium — side effect, not outcome

**Scenario:** *"Saving a valid rule persists it to Elasticsearch."*
**Slice:**
```ts
apiTest('POST /api/detection_engine/rules creates a rule', async ({ supertest }) => {
  const { body } = await supertest.post('/api/detection_engine/rules').send(rule).expect(200);
  expect(body.id).toBeDefined();
});
```
**Verdict:** `medium`. The 200 status and presence of `id` are necessary but not sufficient evidence of persistence — a subsequent GET would prove it. Reasonable, but not the strongest assertion possible.

---

### Weak — existence check for a removed element

**Scenario:** *"After the bug fix, the tooltip is no longer shown on the action button."*
**Slice:**
```ts
it('does not render a tooltip on the action button', () => {
  const wrapper = mount(<ActionButton />);
  expect(wrapper.find(EuiToolTip)).toHaveLength(0);
});
```
**Verdict:** `weak`. Per `bug-fix/SKILL.md` line 111: this is fragile (any future tooltip anywhere in the tree breaks it) and asserts presence, not the behaviour the bug was about. The QA should be told.

---

### None — no assertion

**Slice:**
```ts
it('initializes the rule form', () => {
  render(<CreateRuleForm />);
});
```
**Verdict:** `none`. Render-without-throwing is implicit; no `expect` call.

---

## Cross-cutting

- **Do not invoke the model with a slice larger than 4K tokens.** If the slice is bigger, the block is too large to judge meaningfully; ask the user to narrow the scenario, do not silently truncate.
- **Do not pass the scenario's expected verdict in the prompt.** Quality assessment must be independent of whether the scenario was previously classified as `IMPLEMENTED`.
- **Quality verdicts never modify Phase 4 (Plan ↔ Requirements).** That phase is about test plan completeness, not test code quality. The two reports must remain orthogonal — combining them creates verdict ambiguity.
