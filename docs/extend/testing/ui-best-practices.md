---
navigation_title: Best practices
---

# Best practices for Scout UI tests [scout-ui-best-practices]

Best practices specific to Scout **UI tests**.

:::::{tip}
For guidance that applies to both UI and API tests, see the [general Scout best practices](./scout-best-practices.md). Scout is built on Playwright, so the official [Playwright Best Practices](https://playwright.dev/docs/best-practices) also apply.
:::::

## Prefer parallel runs [run-tests-in-parallel-whenever-possible]

Default to [parallel UI suites](./parallelism.md) when possible. Parallel workers share the same Kibana/ES deployment, but run in isolated Spaces.

| Mode           | When to use                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Parallel**   | UI tests (most suites), suites that share pre-ingested data (often using the [global setup hook](./global-setup-hook.md)) |
| **Sequential** | API tests, suites that require a “clean” Elasticsearch state                                                              |

## Prefer realistic in-app navigation for user flows [prefer-realistic-in-app-navigation]

When a test asserts **user flow** (not just “land on a page”), prefer navigation the way a user would: follow links and buttons, and use browser history (`page.goBack()`) instead of direct URL jumps where it matters for the scenario. Reserve `page.goto` / deep links for cheap setup when the test is not about navigation.

## Prefer APIs for setup and teardown [prefer-kibana-apis-over-ui-for-setup-and-teardown]

Setup/teardown using UI is slow and brittle. Prefer Kibana APIs and fixtures.

:::::{dropdown} Examples
❌ **Don’t:** create test data through the UI:

```ts
test.beforeEach(async ({ page, browserAuth }) => {
  await browserAuth.loginAsAdmin();
  await page.testSubj.click('createDataViewButton');
  await page.testSubj.fill('indexPatternInput', 'logs-*');
  await page.testSubj.click('saveDataViewButton');
});
```

✔️ **Do:** use API fixtures:

```ts
test.beforeEach(async ({ uiSettings, kbnClient }) => {
  await uiSettings.setDefaultTime({ from: startTime, to: endTime });
  await kbnClient.importExport.load(DATA_VIEW_ARCHIVE_PATH);
});
```

:::::

## Use Playwright auto-waiting [leverage-playwright-auto-waiting]

Playwright actions and [web-first assertions](https://playwright.dev/docs/best-practices#use-web-first-assertions) already wait/retry. Don’t add redundant waits, and never use `page.waitForTimeout()` as it’s a hard sleep with no readiness signal and a common source of flakiness.

:::::{dropdown} Examples
❌ **Don’t:** add unnecessary waits before actions or assertions:

```ts
await page.testSubj.waitForSelector('myButton', { state: 'visible' });
await page.testSubj.click('myButton');
await page.testSubj.locator('successToast').waitFor();
await expect(page.testSubj.locator('successToast')).toBeVisible();
```

✔️ **Do:** let Playwright handle waiting automatically:

```ts
await page.testSubj.click('myButton');
await expect(page.testSubj.locator('successToast')).toBeVisible();
```

:::::

## Wait for UI updates after actions [wait-for-ui-updates-when-the-next-action-requires-it]

When an action triggers async UI work (navigation, saving, loading data), wait for the resulting state before your next step. This ensures the UI is ready and prevents flaky interactions with elements that haven’t rendered yet.

:::::{dropdown} Example

```ts
await page.gotoApp('sample/page/here');
await page.testSubj.waitForSelector('mainContent', { state: 'visible' });
```

:::::

## Don't use manual retry loops [dont-use-manual-retry-loops]

If an action fails, don't wrap it in a retry loop. Playwright already waits for actionability; repeated failures usually point to an app issue (unstable DOM, non-unique selectors, re-render bugs). Fix the component or make your waiting/locators explicit and stable.

:::::{dropdown} Examples
❌ **Don't:** retry actions in a loop:

```ts
for (let i = 0; i < 3; i++) {
  try {
    await page.testSubj.click('submitButton');
    break;
  } catch {
    await page.waitForTimeout(1000);
  }
}
```

✔️ **Do:** fix the root cause (for example, wait for a readiness signal):

```ts
await expect(page.testSubj.locator('formReady')).toBeVisible();
await page.testSubj.click('submitButton');
```

:::::

## Locate UI elements reliably [locate-ui-elements-reliably]

Prefer stable `data-test-subj` attributes accessed using `page.testSubj`. If `data-test-subj` is missing, prefer adding one to source code. If that’s not possible, use `getByRole` **inside a scoped container**.

:::::{dropdown} Examples
❌ **Don’t:** use raw CSS selectors or unscoped text matchers (searching the entire page for text is unreliable when duplicates exist):

```ts
await page.click('[data-test-subj="myButton"]');
await page.getByText('Delete').click();
```

❌ **Don’t:** select elements by index ([flagged by Playwright’s recommended ESLint rules](https://playwright.dev/docs/best-practices)), as they break on non-clean environments where tests run without server restart and extra data may exist:

```ts
await page.testSubj.locator('tableRow').nth(0).click();
```

✔️ **Do:** use `page.testSubj` or scoped `getByRole`:

```ts
await page.testSubj.click('myButton');
await page.testSubj.locator('confirmDeleteModal').getByRole('button', { name: 'Delete' }).click();
```

:::::

## Avoid unnecessary timeout overrides [use-scouts-default-timeouts]

Scout configures Playwright timeouts ([source](https://github.com/elastic/kibana/blob/main/src/platform/packages/shared/kbn-scout/src/playwright/config/create_config.ts)). Prefer defaults.

- Don’t override suite-level timeouts/retries with `test.describe.configure()` unless you have a strong reason.
- If you increase a timeout for one operation, keep it well below the test timeout and **add a short code comment** explaining why (slow first load, CI variance, known heavy view, etc.).
- After raising timeouts for flakiness, **re-run the flaky test runner** (or many local repeats) to confirm the new value is necessary.
- Keep in mind that an assertion timeout that exceeds the test timeout is ignored.
- Time spent in hooks (`beforeEach`, `afterEach`) counts toward the test timeout. If setup is slow, the test itself may time out even though its assertions are fast.

:::::{dropdown} Example

```ts
await expect(editor).toBeVisible(); // will use the default timeout

// justified: report generation can be slow
await expect(downloadBtn).toBeEnabled({ timeout: 30_000 });
```

:::::

## Wait for complex UI to finish rendering [wait-for-complex-components-to-fully-render]

Tables/maps/visualizations can appear before data is rendered. Prefer waiting on a component-specific **“loaded” signal** rather than global indicators like the Kibana chrome spinner (our data shows they are unreliable for confirming that a particular component has finished rendering).

**Do not rely on helpers that only wait for a global “loading” indicator to disappear.** Each view should have an explicit readiness wait (or removal of such helpers in favor of those waits).

:::::{dropdown} Example
In source code, use a dynamic `data-test-subj`:

```tsx
<EuiBasicTable
  data-test-subj={`myTable-${isLoading ? 'loading' : 'loaded'}`}
  loading={isLoading}
  items={items}
  columns={columns}
/>
```

In tests, wait for the loaded state:

```ts
await expect(page.testSubj.locator('myTable-loaded')).toBeVisible();
```

For Kibana Maps, `data-render-complete="true"` is often the right “ready” signal.
:::::

## Use existing page objects to interact with the Kibana UI [use-existing-page-objects-to-interact-with-the-kibana-ui]

Prefer existing page objects (and their methods) over rebuilding EUI interactions in test files.

- Prefer **`readonly` locator fields** assigned in the constructor for stable selectors, and **methods** for parameterized locators, multi-step actions, or flows. Thin getter-only methods for every field add noise; match the patterns used by built-in page objects (for example `DashboardApp`).

:::::{dropdown} Example

```ts
await pageObjects.datePicker.setAbsoluteRange({
  from: 'Sep 19, 2015 @ 06:31:44.000',
  to: 'Sep 23, 2015 @ 18:31:44.000',
});
```

:::::

## Keep mocks and non-UI setup out of page objects [keep-mocks-out-of-page-objects]

Page objects should focus on real UI interaction. Put HTTP mocks, interceptors, and similar setup in dedicated fixtures (for example `fixtures/mocks.ts`) so tests and reviewers can find them in one place.

## Abstract common operations in page object methods [abstract-common-operations-in-page-object-methods]

Create methods for repeated flows (and make them [wait for readiness](#wait-for-ui-updates-when-the-next-action-requires-it)).

:::::{dropdown} Example

```ts
async openNewDashboard() {
  await this.page.testSubj.click('newItemButton');
  await this.page.testSubj.waitForSelector('emptyDashboardWidget', { state: 'visible' });
}
```

:::::

## Avoid conditional logic in page objects and tests [avoid-conditional-logic-in-page-objects]

Playwright creates a fresh browser context for each test, so there is no cached state to work around. Both page object methods and test code should be explicit about the action they perform, not defensive about the current state. Conditional flows (like "if modal is open, close it first") hide bugs, waste time, and make failures harder to understand.

:::::{dropdown} Examples
❌ **Don’t:** add conditional logic to handle unknown state:

```ts
async switchToEditMode() {
  const isViewMode = await this.page.testSubj.locator('dashboardViewMode').isVisible();
  if (isViewMode) {
    await this.page.testSubj.click('dashboardEditMode');
  }
}
```

✔️ **Do:** make the action explicit, since the caller knows the expected state:

```ts
async openEditMode() {
  await this.page.testSubj.click('dashboardEditMode');
  await this.page.testSubj.waitForSelector('dashboardIsEditing', { state: 'visible' });
}
```

:::::

## Keep assertions explicit in tests, not hidden in page objects [keep-assertions-explicit-in-tests-not-hidden-in-page-objects]

Prefer explicit `expect()` in the test file so reviewers can see intent and failure modes. Also prefer `expect()` over manual boolean checks, as Playwright’s error output includes the locator, call log, and a clear message, which `if`/`throw` patterns lose.

**In page objects, avoid `expect()`.** Use `waitForSelector` / visibility waits to synchronize after navigation or actions (for example wait for a header to be visible). Assertions belong in specs.

:::::{dropdown} Examples
❌ **Don’t:** hide assertions inside page objects:

```ts
// inside page object
async createIndexAndVerify(name: string) {
  await this.page.testSubj.click('saveButton');
  await expect(this.page.testSubj.locator('indicesTable')).toContainText(name);
}
```

✔️ **Do:** keep assertions in the test file:

```ts
await pageObjects.indexManagement.clickCreateIndexSaveButton();
await expect(page.testSubj.locator('indicesTable')).toContainText(testIndexName);
```

:::::

## Use EUI wrappers as class fields in page objects [use-eui-wrappers-as-class-fields-in-page-objects]

If you must interact with EUI internals, use wrappers from Scout to keep that complexity out of tests.

:::::{dropdown} Example

```ts
import { EuiComboBoxWrapper, ScoutPage } from '@kbn/scout';

export class StreamsAppPage {
  public readonly fieldComboBox: EuiComboBoxWrapper;

  constructor(private readonly page: ScoutPage) {
    this.fieldComboBox = new EuiComboBoxWrapper(this.page, 'fieldSelectorComboBox');
  }

  async selectField(value: string) {
    await this.fieldComboBox.selectSingleOption(value);
  }
}
```

:::::

## Add accessibility checks at key UI checkpoints [add-a11y-checks]

Scout supports automated accessibility (a11y) scanning via `page.checkA11y`. Add checks at high-value points in your UI tests (landing pages, modals, flyouts, wizard steps) rather than on every interaction.

:::::{dropdown} Example

```ts
const { violations } = await page.checkA11y({ include: ['[data-test-subj="myPanel"]'] });
expect(violations).toHaveLength(0);
```

:::::

For the full guide (scoping, exclusions, handling pre-existing violations), see [Accessibility testing](./a11y-checks.md).

## Skip onboarding with `addInitScript` [skip-onboarding-flows-with-addinitscript]

If a page has onboarding/getting-started state, set `localStorage` before navigation.

:::::{dropdown} Example

```ts
test.beforeEach(async ({ page, browserAuth, pageObjects }) => {
  await browserAuth.loginAsViewer();
  await page.addInitScript(() => {
    window.localStorage.setItem('gettingStartedVisited', 'true');
  });
  await pageObjects.homepage.goto();
});
```

:::::

## Extend `browserAuth` for repeated roles [extend-browserauth-for-repeated-roles]

If the same custom role appears in many specs, extract it into a `browserAuth` fixture extension instead of repeating the role descriptor everywhere. Tests then read like intent.

:::::{dropdown} Example

```ts
// in your plugin's fixtures/index.ts
await use({
  ...browserAuth,
  loginAsPlatformEngineer: () =>
    browserAuth.loginWithCustomRole('platform_engineer', roleDescriptor),
});

// in specs
await browserAuth.loginAsPlatformEngineer();
```

For setup details, see [Reuse role helpers](./browser-auth.md#scout-browser-auth-extend).
:::::

## Related guides

- [General best practices](./scout-best-practices.md) — apply to both UI and API tests
- [Write UI tests](./write-ui-tests.md)
- [Browser authentication](./browser-auth.md)
- [Page objects](./page-objects.md)
- [Accessibility (a11y) checks](./a11y-checks.md)
- [Parallelism](./parallelism.md)
