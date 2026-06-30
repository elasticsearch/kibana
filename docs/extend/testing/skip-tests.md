---
navigation_title: Skip tests
---

# Skip tests in Scout [scout-skip-tests]

There are multiple ways to ensure a Scout test or test suite does not run at all, or runs only in certain environments.

:::::{tip}
Best practices when skipping tests:

- Skipping is usually temporary—re-enable as soon as possible.
- Create a tracking issue in the Kibana repo (label: `skipped-test`) and link it in a comment next to the skip.
:::::

## Skip tests in all test runs [skip-tests-everywhere]

Scout uses Playwright, which provides `test.skip()` and `test.describe.skip()` to skip tests or suites in **all** environments.

If you prefer to control which environments your tests run in, use [deployment tags](./deployment-tags.md) instead.

### Skip a test suite [skip-suite]

```ts
import { test, tags } from '@kbn/scout';

// Add a comment to explain why this suite is skipped
test.describe.skip('test suite', { tag: tags.stateful.classic }, () => {
  test('test', async ({ page }) => {
    // this test will be skipped
  });
});
```

### Skip a single test [skip-test]

```ts
import { test, tags } from '@kbn/scout';

test.describe('test suite', { tag: tags.stateful.classic }, () => {
  // Add a comment to explain why this test is skipped
  test.skip('first test', async ({ page }) => {
    // this test will be skipped
  });

  test('second test', async ({ page }) => {
    // this test will run
  });
});
```

### Using `test.fixme()` [skip-fixme]

Playwright also provides `test.fixme()` as an alternative to `test.skip()`. It behaves the same way but semantically indicates the test is broken and needs to be fixed:

```ts
import { test, tags } from '@kbn/scout';

test.describe('test suite', { tag: tags.stateful.classic }, () => {
  // Add a comment to explain what needs to be fixed
  test.fixme('broken test', async ({ page }) => {
    // this test will be skipped and marked as "fixme"
  });
});
```

## Skip tests by location, architecture, or domain [skip-tests-by-env]

Instead of skipping entirely, control which environments suites run in using deployment tags (`@{location}-{arch}-{domain}`).

For example, to run only on stateful classic environments:

```ts
import { test, tags } from '@kbn/scout';

test.describe('Stateful classic feature', { tag: tags.stateful.classic }, () => {
  test('my test', async ({ page }) => {
    // this test only runs in stateful classic environments
  });
});
```

See [Deployment tags](./deployment-tags.md) for shortcuts and patterns.
