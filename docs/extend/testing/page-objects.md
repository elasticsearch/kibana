---
navigation_title: Page objects
---

# Page objects [scout-page-objects]

Page objects wrap UI interactions (navigation, clicking, filling forms) so tests read like user workflows and stay maintainable as the UI evolves.

::::::{tip}
Keep page objects focused on **UI interactions**. Don’t hide API setup/teardown inside page objects—use [API services](./api-services.md) or [fixtures](./fixtures.md) instead.
::::::

For practical tips, see the page object guidelines in [UI test best practices](./ui-best-practices.md#use-existing-page-objects-to-interact-with-the-kibana-ui).

## Usage [scout-page-objects-usage]

Page objects are exposed through the `pageObjects` fixture and are lazy-initialized:

```ts
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test.describe('My suite', { tag: tags.deploymentAgnostic }, () => {
  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });
  });
});
```

## Where they live [scout-page-objects-where]

- Core page objects: `@kbn/scout` (available as `pageObjects.<name>`)
- Solution Scout packages may provide additional page objects (their internal folder layout varies—search within the package for `page_objects` if you need the source).
- Plugin-local page objects: `<plugin-root>/test/scout/ui/fixtures/page_objects`

To make your page object available as `pageObjects.newPage`, register it in your plugin fixtures.

## Create and register a new page object in your plugin

::::::::::{stepper}

:::::::::{step} Create a plugin page object

Create a class that takes `ScoutPage` and exposes locators + actions:

```ts
import { ScoutPage } from '@kbn/scout';

export class NewPage {
  constructor(private readonly page: ScoutPage) {}

  async goto() {
    await this.page.gotoApp('myPlugin'); // replace with your app id
  }
}
```

`gotoApp` accepts an optional second argument with `params` (query string) and `hash` (URL hash):

```ts
// Navigate to '/app/myPlugin?_g=(time:(from:now-15m,to:now))'
await this.page.gotoApp('myPlugin', { params: { _g: '(time:(from:now-15m,to:now))' } });

// Navigate to '/app/dashboards#/view/abc-123'
await this.page.gotoApp('dashboards', { hash: '/view/abc-123' });
```

:::::::::

:::::::::{step} Register a plugin page object

Register it in `fixtures/page_objects/index.ts`

```ts
import type { PageObjects, ScoutPage } from '@kbn/scout';
import { createLazyPageObject } from '@kbn/scout';
import { NewPage } from './new_page';

export type MyPluginPageObjects = PageObjects & {
  newPage: NewPage;
};

export function extendPageObjects(pageObjects: PageObjects, page: ScoutPage): MyPluginPageObjects {
  return {
    ...pageObjects,
    newPage: createLazyPageObject(NewPage, page),
  };
}
```

:::::::::

:::::::::{step} Wire it into your plugin `test` fixture

In `<plugin-root>/test/scout/ui/fixtures/index.ts`, extend Scout’s `test` so `pageObjects` has your extended type:

```ts
import { test as base } from '@kbn/scout';

import type { MyPluginPageObjects } from './page_objects';
import { extendPageObjects } from './page_objects';

export const test = base.extend<{ pageObjects: MyPluginPageObjects }>({
  pageObjects: async ({ pageObjects, page }, use) => {
    await use(extendPageObjects(pageObjects, page));
  },
});
```

Now your specs can use `pageObjects.newPage` without importing the page object class directly.

:::::::{note}
If your page object constructor needs extra arguments, pass them after `page`:

`createLazyPageObject(NewPage, page, extraArg1, extraArg2)`.

If you use `spaceTest` (parallel UI suites), extend it the same way: import `spaceTest as base` from `@kbn/scout`, then `export const spaceTest = base.extend<{ pageObjects: MyPluginPageObjects }>(...)`.
:::::::

:::::::::

::::::::::
