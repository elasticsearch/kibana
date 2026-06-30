---
navigation_title: A11y checks
---

# Accessibility testing (a11y) with Scout [scout-a11y-checks]

Scout includes built-in support for automated accessibility (a11y) checks in UI tests via `page.checkA11y`.

:::::{warning}
Use automated a11y checks to augment, not replace, manual accessibility reviews and assistive technology testing.
:::::

## Automated a11y checks with `page.checkA11y` [scout-checkA11y]

Behind the scenes, `page.checkA11y` runs an [axe-core](https://github.com/dequelabs/axe-core) scan of the current page state. It analyzes the DOM for accessibility violations and returns `{ violations: string[] }` you can assert on. Configuration is unified with Cypress and FTR.

### When to run a11y checks [scout-a11y-when]

We recommend adding `page.checkA11y` to:

- Key happy-path flows (for example, landing pages, dashboards, wizards)
- Important interaction states (for example, flyouts, modals, menus, toasts)
- Pages with frequent UI changes where regressions are likely

:::::{tip}
Avoid running a11y checks on every interaction. Pick a few high-value checkpoints per test or suite to keep runs fast and reduce flakiness.
:::::

### Run a full-page a11y check [scout-a11y-full-page]

Run `page.checkA11y()` once the page is fully loaded and the UI has settled:

```ts
import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test(
  'Discover has no basic accessibility violations',
  { tag: tags.deploymentAgnostic },
  async ({ browserAuth, pageObjects, page }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });

    const { violations } = await page.checkA11y();
    expect(violations).toHaveLength(0);
  }
);
```

### Check specific elements [scout-a11y-specific-elements]

:::::{note}
Prefer running `checkA11y` with `include` set to the root element you are testing. This keeps the scan isolated and reduces runtime.
:::::

```ts
import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test(
  'Modal dialog is accessible',
  { tag: tags.deploymentAgnostic },
  async ({ browserAuth, page }) => {
    await browserAuth.loginAsViewer();
    await page.gotoApp('my-plugin');
    await page.testSubj.click('open-modal');

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    const { violations } = await page.checkA11y({
      include: ['[role="dialog"]'],
    });
    expect(violations).toHaveLength(0);
  }
);
```

### Use `test.step` to “box” checks [scout-a11y-boxing]

```ts
import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test(
  'should load Discover',
  { tag: tags.deploymentAgnostic },
  async ({ browserAuth, pageObjects, page }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });

    await test.step('no basic accessibility violations', async () => {
      const { violations } = await page.checkA11y();
      expect(violations).toHaveLength(0);
    });

    // continue with the flow...
  }
);
```

### Troubleshooting flaky or failing checks [scout-a11y-troubleshooting]

If a failure isn’t caused by your change and there isn’t a quick fix, don’t disable the entire a11y check. Prefer excluding the specific problematic element so the suite still provides coverage:

```ts
import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test(
  'Form components are accessible',
  { tag: tags.deploymentAgnostic },
  async ({ browserAuth, page }) => {
    await browserAuth.loginAsViewer();
    await page.gotoApp('my-plugin');

    const { violations } = await page.checkA11y({
      exclude: ['[data-test-subj="problematic-element"]'],
    });

    expect(violations).toHaveLength(0);
  }
);
```

## Understanding a11y violations in reports [scout-a11y-reporting]

When `page.checkA11y` detects violations, `violations` is a list of **formatted strings** (one per violation) that includes the rule id, impact, help URL, page URL, and node details. This keeps failure output readable in CI logs.

Violations appear in the Scout HTML report.

## Best practices [scout-a11y-best-practices]

- Use `include` to target specific regions
- Wait for page readiness before scanning
- Focus on critical paths and key interaction states
- Assert `violations.length === 0`
- Combine with manual testing
