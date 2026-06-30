---
navigation_title: Write UI tests
---

# Write Scout UI tests [scout-write-ui-tests]

Scout UI tests are Playwright tests that use Scout fixtures and page objects for readable, maintainable flows.

:::::{important}
[Set up your plugin or package](./setup-scout.md) first.
:::::

## The building blocks [scout-write-ui-tests-building-blocks]

- **Tags**: every suite needs one or more [deployment tags](./deployment-tags.md) (use `tags.*`). Scout validates tags at runtime.
- **[Authentication](./browser-auth.md)**: use `browserAuth` in `beforeEach` for a clean, readable flow.
- **Navigation + actions**: use `pageObjects` (preferred) or `page.gotoApp(...)`.
- **Selectors**: use `page.testSubj` for `data-test-subj`-based locators/actions.
- **Assertions**: import `expect` from your Scout package’s UI entrypoint (for example `@kbn/scout/ui` or `@kbn/scout-<solution>/ui`).

## Starter template (sequential UI test) [scout-write-ui-tests-template]

This pattern is a good default:

```ts
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

test.describe('My feature', { tag: tags.deploymentAgnostic }, () => {
  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });
  });

  test('shows the main table', async ({ page }) => {
    await expect(page.testSubj.locator('discoverDocTable')).toBeVisible();
  });
});
```

::::::{tip}
Prefer APIs for setup/cleanup (for example `apiServices`, `kbnClient`) in `beforeAll`/`afterAll` instead of doing expensive setup through the UI. If the same one-time setup is shared across many suites (archives, ingest, settings), move it to a [global setup hook](./global-setup-hook.md).
::::::

## Parallel UI tests (recommended) [scout-write-ui-tests-parallel]

If your suite can be isolated, put it under `parallel_tests/` and use `spaceTest` to get one Space per worker via `scoutSpace`. See [Parallelism](./parallelism.md) and the [global setup hook](./global-setup-hook.md).

## Save the test file [scout-write-ui-tests-save]

- Sequential UI tests: `<plugin-root>/test/scout/ui/tests`
- Parallel UI tests: `<plugin-root>/test/scout/ui/parallel_tests`

Spec files must end with `.spec.ts`.

## Next steps [scout-write-ui-tests-next]

- [Browser authentication](./browser-auth.md)
- [Deployment tags](./deployment-tags.md)
- [UI test best practices](./ui-best-practices.md)
- [Page objects](./page-objects.md)
- [Fixtures](./fixtures.md)
- [Accessibility (a11y) checks](./a11y-checks.md)
- [Run tests](./run-scout-tests.md) and [Debugging](./debugging.md)
