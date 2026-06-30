## Lighthouse Fixture

### Overview

`lighthouseFixture` integrates Lighthouse with Playwright, allowing automated performance and accessibility audits for Kibana and other web applications. It leverages persistent browser sessions to ensure authenticated audits and automatically attaches reports as artifacts in Playwright test reports.

### How it works

- Dynamically imports Lighthouse (ES module)
- Uses `persistentContext` fixture to launch a new browser context on the specified debugging port, preserving authentication state across sessions.
- Loads the provided Kibana URL inside this persistent context and runs the Lighthouse audit, using the same debug port and ensuring the session remains active (otherwise Lighthouse will be redirected to login page)
- Automatically attaches Lighthouse report as html artifact in test reports, making them available in the `Playwright HTML report`.

### Usage: running report on Kibana page

```ts
import { lighthouseTest, tags } from '@kbn/scout';

lighthouseTest.describe(
  'Discover App - Lighthouse Performance Audit',
  { tag: [...tags.deploymentAgnostic, ...tags.performance] },
  () => {
    lighthouseTest.beforeAll(async ({ esArchiver, kbnClient, uiSettings }) => {
      // loading the data
    });

    lighthouseTest.afterAll(async ({ kbnClient, uiSettings }) => {
      // unloading the data
    });

    lighthouseTest(
      'runs audit on Discover Page',
      async ({ browserAuth, lighthouse, page, pageObjects }) => {
        await browserAuth.loginAsAdmin();
        await pageObjects.discover.goto({ queryMode: 'classic' });
        await pageObjects.discover.waitForHistogramRendered();
        const currentUrl = page.url();

        // Run the Lighthouse audit on the current page and attach the report
        await lighthouse.runAudit(currentUrl);
      }
    );
  }
```
