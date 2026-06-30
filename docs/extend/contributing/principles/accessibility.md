---
navigation_title: "Accessibility"
description: "How Kibana maintains accessibility quality, the tooling we use, and the pre-commit checklist."
---

# Accessibility

Did you know {{kib}} makes a public statement about our commitment to creating an accessible product for people with disabilities? [We do](../../../reference/kibana-accessibility-statement.md)! It's very important all of our apps are accessible.

- Learn how [EUI tackles accessibility](https://elastic.github.io/eui/#/guidelines/accessibility)
- If you don't use EUI, follow the same EUI accessibility standards

For the underlying commitment, see the [Build accessible software by default](./developer-principles.md#build-accessible-software-by-default) principle.

## Accessibility automation in Kibana

{{kib}} maintains accessibility quality using a layered, hybrid approach:

### 1. Code‑level checks
- **Tool:** `@elastic/eslint-plugin-eui` – custom rules for the ESLint library
- **Enforces:** Correct ARIA usage, required labels, prohibited patterns, and safer EUI practices
- **Action:** Resolve all warnings before committing (treat warnings as blockers)

### 2. Render‑level checks
- **CI tooling:** running `axe-core` check in `FTR`, `Scout` and `Cypress` tests.
- **Enforces:** Semantics, landmarks, contrast, focus order, interaction patterns.
- **Note:** All tests are based on the common configuration defined in `src/platform/packages/shared/kbn-axe-config/index.ts`.

- **Usage:**
  - **FTR a11y tests** (tests must be placed in the `test/accessibility` folder):
```ts
const a11y = getService('a11y');
...
it('has no detectable a11y violations on load', async () => {
  await common.navigateToApp('dashboard');
  await a11y.testAppSnapshot();
});
```

  - **Scout** using `page.checkA11y`. Run an accessibility check on a specific root element:
```ts
test('has no detectable a11y violations', async ({ page }) => {
  const { violations } = await page.checkA11y({ include: ['{CSS selector of root element you are testing}'] });
  expect(violations).toHaveLength(0);
});
```

  - **Cypress** using `cy.checkA11y`. A custom Cypress command is available to run accessibility checks:
```ts
it('has no detectable a11y violations on load', () => {
  cy.checkA11y();
});
```
- **Action:** Improve coverage — add or extend tests while developing features.

### 3. Ready check (execute before commit)
- Favor EUI components and honor their accessibility playbook
- Zero tolerance for a11y ESLint warnings
- No new axe violations in updated components — keep it clean
- VoiceOver sanity check: new or modified interactive areas should clearly announce their purpose
