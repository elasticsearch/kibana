# Page objects in Scout

Tests can use page objects to interact with a page or component. From the Playwright [page object model documentation](https://playwright.dev/docs/pom):

> A page object represents a part of your web application. An e-commerce web application might have a home page, a listings page and a checkout page. Each of them can be represented by page object models.

Page objects can be used to interact with common UI components and application-specific screens.

> **Note:** Page objects should focus exclusively on **UI interactions** (e.g., clicking buttons, filling forms, navigating the page). They should **not** make API calls directly (use API services or fixtures for that instead).

## Usage

All page objects are available via the `pageObjects` fixture, but only the ones that are actually used in a test will be initialized.

```ts
test.describe('My test suite', { tag: tags.deploymentAgnostic }, () => {
  test.beforeEach(async ({ pageObjects }) => {
    // Navigate to the Discover screen.
    // The `pageObjects.discover` page object is provided by the core test package.
    await pageObjects.discover.goto({ queryMode: 'classic' });
  });

  test('sample test', async ({ pageObjects }) => {
    // Page objects can also help interact with common UI components like the date picker.
    await pageObjects.datePicker.setAbsoluteRange(testData.RANGE_DATES);
    // ...
  });
});
```

## Create a new page object

First, create a new page object class.

```ts
// `ScoutPage` extends the Playwright `Page` interface with methods specific to the application.
import { ScoutPage } from '@kbn/scout';

export class NewPage {
  constructor(private readonly page: ScoutPage) {
    // Define page elements in the constructor.
    this.sampleFlyout = this.page.testSubj.locator('sampleFlyout');
    this.sampleEditor = this.page.testSubj.locator('sampleEditor');
  }

  // Define a function to navigate to a specific page.
  async goto() {
    this.page.gotoApp('sample/app/name');
  }

  // Create a function that waits for the page to be fully loaded to help prevent flaky tests.
  async waitForRenderComplete() {
    // First, wait for the editor to be present.
    await this.sampleEditor.waitFor({ state: 'visible' });

    // Then, wait for another element to be fully rendered. You can optionally specify a `timeout`.
    return this.page.locator('div[data-dom-id][data-render-complete="true"]').waitFor();
  }

  async getFlyoutInnerText() {
    return this.sampleFlyout.innerText();
  }

  // ...
}
```

> **Where should I create the page object file?**
>
> - Shared page objects for a solution are typically defined in a central package (e.g., `<scout_package>/src/playwright/page_objects`).
> - Plugin-specific page objects should be added within the plugin's test directory (e.g., `<plugin_path>/test/scout/ui/fixtures/page_objects`).

---

## Register the page object in a plugin

After creating a page object class, make it available in your tests by registering it with the `createLazyPageObject` function.

In the same directory as your page object class, create an `index.ts` file (if it doesn't already exist) to register it.

```ts
// `createLazyPageObject` guarantees that page objects are lazy-initialized.
import { PageObjects, ScoutPage, createLazyPageObject } from '@kbn/scout';
// `NewPage` is the page object class we defined previously.
import { NewPage } from './new_page';

export interface MyPluginPageObjects extends PageObjects {
  // This allows access via `pageObjects.newPage` in tests.
  newPage: NewPage;
}

// This function will be called to register the page object.
export function extendPageObjects(pageObjects: PageObjects, page: ScoutPage): MyPluginPageObjects {
  return {
    ...pageObjects,
    newPage: createLazyPageObject(NewPage, page),
  };
}
```

Finally, in your plugin's fixtures directory (e.g., `<plugin_path>/test/scout/ui/fixtures`), register the page object.

```ts
import { test as base } from '@kbn/scout';
import type { ScoutPage, ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout';

// Import the `extendPageObjects` function and `MyPluginPageObjects` type defined earlier.
import { extendPageObjects, MyPluginPageObjects } from './page_objects';

export interface MyPluginTestFixtures extends ScoutTestFixtures {
  // `pageObjects` is a fixture. This interface can be used to define additional fixtures.
  pageObjects: MyPluginPageObjects;
}

export const test = base.extend<MyPluginTestFixtures, ScoutWorkerFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: MyPluginPageObjects;
      page: ScoutPage;
    },
    use: (pageObjects: MyPluginPageObjects) => Promise<void>
  ) => {
    // `extendPageObjects` returns your plugin-defined page objects and the default ones.
    const extendedPageObjects = extendPageObjects(pageObjects, page);
    // Register the extended page objects.
    await use(extendedPageObjects);
  },
});
```

Page objects are available to tests via the `pageObjects` fixture, which is why `ScoutTestFixtures` was extended above.

The `NewPage` page object is now available in your tests as `pageObjects.newPage`. You can access it directly in your test function without any imports.

```ts
test('sample test', async ({ pageObjects }) => {
  await pageObjects.newPage.goto();
  await pageObjects.newPage.waitForRenderComplete();
  // ...
});
```
