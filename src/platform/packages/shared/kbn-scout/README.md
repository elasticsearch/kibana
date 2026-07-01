# @kbn/scout

`kbn-scout` is a modern test framework for Kibana. It uses Playwright for UI integration tests. Its primary goal is to enhance the developer experience by offering a lightweight and flexible testing solution to create UI tests next to the plugin source code. This README explains the structure of the `kbn-scout` package and provides an overview of its key components.

### Table of Contents

1. Overview
2. Folder Structure
3. Key Components
4. How to Use
5. Contributing
6. Running tests on CI

### Overview

The `kbn-scout` framework provides:

- **Ease of integration:** a simplified mechanism to write and run tests closer to plugins.
- **Deployment-agnostic tests:** enables the testing of Kibana features across different environments (e.g., Stateful, Serverless).
- **Fixture-based design:** built on Playwright's fixture model to modularize and standardize test setup.
- **Focus on Developer Productivity:** faster test execution and minimal boilerplate for writing tests.

### Folder Structure

The `kbn-scout` structure includes the following key directories and files:

```
src/platform/packages/shared/kbn-scout/
├── src/
│   ├── cli/
│   ├── common/
│   │   ├── services/
│   │   ├── utils/
│   │   └── constants.ts
│   ├── config/
│   │   ├── discovery/
│   │   ├── loader/
│   │   ├── schema/
│   │   ├── serverless/
│   │   ├── stateful/
│   │   ├── utils/
│   │   ├── config.ts
│   │   └── constants.ts
│   ├── execution/
│   ├── playwright/
│   │   ├── config/
│   │   ├── fixtures/
│   │   │   └── scope/
│   │   │       ├── test/
│   │   │       └── worker/
│   │   ├── global_hooks/
│   │   ├── page_objects/
│   │   ├── runner/
│   │   │   ├── config_loader.ts
│   │   │   ├── config_validator.ts
│   │   │   ├── flags.ts
│   │   │   └── run_tests.ts
│   │   ├── test/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── expect.ts
│   │   └── tags.ts
│   ├── servers/
│   │   ├── flags.ts
│   │   ├── run_elasticsearch.ts
│   │   ├── run_kibana_server.ts
│   │   └── start_servers.ts
│   └── types/
└── README.md
```

### Key Components

The `kbn-scout` package has been updated with a new structure to better organize components by their scope and functionality. Here's an overview of the key components:

1. **src/cli/**

Contains the logic to start servers, with or without running tests. It is accessed through the `scripts/scout` script.

2. **src/common/**

The `services` directory includes test helpers used across UI and API integration tests, such as Kibana and Elasticsearch `clients`, `esArchiver`, and `samlSessionManager`. These services are used to initialize instances and expose them to tests via Playwright worker fixtures. The `utils` directory contains shared utilities, while `constants.ts` defines common constants used throughout the framework.

3. **src/config/**

The `config` directory holds configurations for running servers locally. The `serverless` and `stateful` directories contain deployment-specific configurations. Configuration attributes are defined in the `schema` directory. The `discovery` directory contains logic for finding and validating test configurations, while `utils` provides configuration-related utilities. The `Config` class in `config.ts` serves as the main entry point. It is instantiated using the config loader in the `loader` directory. This instance is compatible with the `kbn-test` input format and is passed to functions for starting servers.

4. **src/execution/**

Contains CI execution-related logic to group tests into lanes that run efficiently within time constraints.

5. **src/playwright/**

#### Config

The `playwright` directory manages the default Playwright configuration. It exports the `createPlaywrightConfig` function, which is used by Kibana plugins to define Scout playwright configurations and serves as the entry point to run tests.

```ts
import { createPlaywrightConfig } from '@kbn/scout';

export default createPlaywrightConfig({
  testDir: './tests',
  workers: 2,
  runGlobalSetup: true, // to trigger setup hook before the tests (e.g. to ingest ES data)
});
```

Scout relies on configuration to determine the test files and opt-in [parallel test execution](https://playwright.dev/docs/test-parallel) against the single Elastic cluster.

When `runGlobalSetup: true` is set, Scout also auto-discovers an optional `global.teardown.ts` next to `global.setup.ts`. Use `globalTeardownHook(...)` in that file to reset shared cluster/Kibana state once after all workers finish (even on failure) — for example, dropping legacy/hand-indexed data ingested by `global.setup.ts` or reverting feature-flag overrides. The teardown surface intentionally excludes `esArchiver`; use `esClient`/`kbnClient`/`apiServices` instead. See [`docs/extend/scout/global-setup-hook.md`](../../../../docs/extend/scout/global-setup-hook.md#global-teardown-hook) for the contract and examples.

The Playwright configuration should only be created this way to ensure compatibility with Scout functionality. For configuration verification, we use a marker `VALID_CONFIG_MARKER`, and Scout will throw an error if the configuration is invalid.

#### Fixtures

The `fixtures/scope` directory contains core Scout capabilities required for testing the majority of Kibana plugins. [Fixtures](https://playwright.dev/docs/test-fixtures) can be scoped to either `test` or `worker`. Scope decides when to init a new fixture instance: once per worker or for every test function. It is important to choose the correct scope to keep test execution optimally fast: if **a new instance is not needed for every test**, the fixture should be scoped to **worker**. Otherwise, it should be scoped to **test**.

**Core `worker` scoped fixtures:**

- `log`
- `config`
- `esClient`
- `kbnClient`
- `esArchiver`
- `samlAuth`
- `linkedProject` (Cross-Project Search only -- provides `esClient` and `esArchiver` for the linked cluster)

Synthetic APM / logs / infra data via [`@kbn/synthtrace`](https://github.com/elastic/kibana/tree/main/src/platform/packages/shared/kbn-synthtrace) is **not** part of `@kbn/scout`. Use the optional add-on [`@kbn/scout-synthtrace`](../kbn-scout-synthtrace/README.md) and merge its Playwright fixtures where you need `apmSynthtraceEsClient`, `infraSynthtraceEsClient`, or `logsSynthtraceEsClient`. `@kbn/scout-oblt`, `@kbn/scout-search`, and `@kbn/scout-security` do not bundle or re-export it.

#### Optional: wiring Synthtrace

1. **Register the dependency** in your plugin or package `tsconfig.json` (`kbn_references`), then run Moon regeneration if your project uses it:

```jsonc
"kbn_references": [
  "@kbn/scout",
  "@kbn/scout-synthtrace"
]
```

For Observability plugins that normally use `@kbn/scout-oblt`, include both `@kbn/scout-oblt` and `@kbn/scout-synthtrace`.

2. **UI tests (platform)** — merge `synthtraceFixture` into the Scout `test` object, then extend with your plugin fixtures. Use `mergeTests` from `@kbn/scout` (not `playwright/test`) so Scout ESLint rules stay satisfied:

```ts
// e.g. test/scout/ui/fixtures/index.ts
import type { ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout';
import { mergeTests, test as scoutTest } from '@kbn/scout';
import type { SynthtraceFixture } from '@kbn/scout-synthtrace';
import { synthtraceFixture } from '@kbn/scout-synthtrace';

const base = mergeTests(scoutTest, synthtraceFixture);

export const test = base.extend<MyTestFixtures, ScoutWorkerFixtures & SynthtraceFixture>({
  // …plugin-specific fixtures
});
```

Specs should import `test` from your **local** `fixtures` entry (so they see synthtrace), and `tags` / `expect` from `@kbn/scout` or `@kbn/scout/ui` as usual.

3. **Parallel / `spaceTest`** — same pattern with `spaceTest` from `@kbn/scout`:

```ts
import { mergeTests, spaceTest as scoutSpaceTest } from '@kbn/scout';
import { synthtraceFixture } from '@kbn/scout-synthtrace';

export const spaceTest = mergeTests(scoutSpaceTest, synthtraceFixture).extend(/* … */);
```

4. **Observability (`@kbn/scout-oblt`)** — merge `synthtraceFixture` with the Oblt `test` (or `spaceTest`) you already extend:

```ts
import type { ScoutPage, ScoutTestFixtures, ScoutWorkerFixtures } from '@kbn/scout-oblt';
import { mergeTests, test as obltTest } from '@kbn/scout-oblt';
import type { SynthtraceFixture } from '@kbn/scout-synthtrace';
import { synthtraceFixture } from '@kbn/scout-synthtrace';

const base = mergeTests(obltTest, synthtraceFixture);

export const test = base.extend<MyTestFixtures, ScoutWorkerFixtures & SynthtraceFixture>({
  // …
});
```

Import `test` from `../fixtures` (or your fixtures barrel) in specs that need synthtrace clients; keep importing `tags` from `@kbn/scout-oblt` if you use Oblt tags.

5. **Parallel `global.setup.ts`** — `@kbn/scout`’s `globalSetupHook` does not include synthtrace. Either use the pre-merged helper from `@kbn/scout-synthtrace`, or merge manually:

```ts
// Option A — equivalent worker stack (core + esArchiver + synthtrace + apiServices)
import { globalSetupHookWithSynthtrace } from '@kbn/scout-synthtrace';

globalSetupHookWithSynthtrace('Load data', async ({ logsSynthtraceEsClient, esArchiver, log }) => {
  await logsSynthtraceEsClient.clean();
  // …
});
```

```ts
// Option B — you already use a wrapper hook (e.g. @kbn/scout-oblt globalSetupHook)
import { mergeTests, globalSetupHook as obltGlobalSetupHook } from '@kbn/scout-oblt';
import { synthtraceFixture } from '@kbn/scout-synthtrace';

const globalSetupHook = mergeTests(obltGlobalSetupHook, synthtraceFixture);

globalSetupHook('Load data', async ({ apmSynthtraceEsClient, log }) => {
  // …
});
```

6. **Setup only (no synthtrace in `test` fixtures)** — if you only need clients inside global setup, import `getSynthtraceClient` from `@kbn/scout-synthtrace` and call it with `esClient`, `log`, `config`, and optional `kbnUrl` (see that package’s README). You do not need to merge `synthtraceFixture` into `test` unless specs use the `*SynthtraceEsClient` fixtures directly.

More detail and edge cases: [kbn-scout-synthtrace README](../kbn-scout-synthtrace/README.md).

```ts
test.beforeAll(async ({ kbnClient }) => {
  await kbnClient.importExport.load(testData.KBN_ARCHIVES.ECOMMERCE);
});
```

**Core `test` scoped fixtures:**

- `browserAuth`
- `pageObjects`
- `page`

```ts
test.beforeEach(async ({ browserAuth }) => {
  await browserAuth.loginAsViewer();
});
```

If a new fixture depends on a fixture with a `test` scope, it must also be `test` scoped.

#### Global Hooks and Test Utilities

The `global_hooks` directory contains setup and teardown logic that applies globally across test executions. It is a crucial feature for parallel tests, as it is required to ingest Elasticsearch data before any test runs. The `test` directory provides test-specific utilities, while `types` contains TypeScript type definitions. The `utils` directory includes various utility functions for test execution.

#### Page Objects

The `page_objects` directory contains all the Page Objects that represent Platform core functionality such as Discover, Dashboard, Index Management, etc.

##### Where should a Page Object live?

`@kbn/scout` is a critical package for Scout: any change to it triggers a full Scout test run. To keep CI fast, only add Page Objects here when they are shared across plugins. Use the following guidance to decide where a Page Object belongs:

- If it is used by a single plugin, keep it in that plugin under `test/scout/ui/fixtures/page_objects/` and register it locally (see ["Registering a plugin-local Page Object"](#registering-a-plugin-local-page-object)). Changes are then scoped to that plugin's tests instead of the whole suite.
- If it is used by a few plugins that already depend on the owning plugin, keep it in the owning plugin and import it from the others as a test helper (see ["Reusing a Page Object from another plugin"](#reusing-a-page-object-from-another-plugin)).
- If it represents a core Platform surface with no natural owner (Discover, Dashboard, etc.), add it here so other teams can reuse it.

Page Objects must be registered with the `createLazyPageObject` function, which guarantees its instance is lazy-initialized. This way, we can have all the page objects available in the test context, but only the ones that are called will be actually initialized:

```ts
export function createCorePageObjects(page: ScoutPage): PageObjects {
  return {
    dashboard: createLazyPageObject(DashboardApp, page),
    discover: createLazyPageObject(DiscoverApp, page),
    // Add new page objects here
  };
}
```

All registered Page Objects are available via the `pageObjects` fixture:

```ts
test.beforeEach(async ({ pageObjects }) => {
  await pageObjects.discover.goto({ queryMode: 'classic' });
});
```

###### Registering a plugin-local Page Object

For a Page Object used by a single plugin, keep it next to the tests in `test/scout/ui/fixtures/page_objects/` and extend the base `test` (or `spaceTest`) to add it to the `pageObjects` fixture:

```ts
import type { PageObjects, ScoutParallelTestFixtures, ScoutParallelWorkerFixtures } from '@kbn/scout';
import { spaceTest as spaceBaseTest, createLazyPageObject } from '@kbn/scout';
import { MyPluginPage } from './page_objects';

export interface MyPluginTestFixtures extends ScoutParallelTestFixtures {
  pageObjects: PageObjects & { myPluginPage: MyPluginPage };
}

export const spaceTest = spaceBaseTest.extend<MyPluginTestFixtures, ScoutParallelWorkerFixtures>({
  pageObjects: async ({ pageObjects, page }, use) => {
    await use({
      ...pageObjects,
      myPluginPage: createLazyPageObject(MyPluginPage, page),
    });
  },
});
```

Tests then import `spaceTest` (or `test`) from the plugin's own fixtures instead of `@kbn/scout`.

###### Reusing a Page Object from another plugin

When a Page Object is owned by one plugin but needed by another that already depends on it, keep it in the owning plugin and import it as a test helper, rather than moving it to `@kbn/scout`. Two prerequisites:

1. The owning plugin exports the Page Object from its `page_objects` barrel, e.g. `unified_search/test/scout/ui/fixtures/page_objects/index.ts`:

```ts
export { SavedQueryManagementMenu } from './saved_query_management_menu';
export type { SaveQueryOptions } from './saved_query_management_menu';
```

2. The consuming plugin already lists the owner in its `tsconfig.json` `kbn_references` (true whenever there is a real plugin dependency, e.g. `discover` → `@kbn/unified-search-plugin`).

The consumer then imports the Page Object via the owner's `@kbn/<plugin>` subpath and registers it on its own `pageObjects` fixture:

```ts
import type {
  PageObjects,
  ScoutParallelTestFixtures,
  ScoutParallelWorkerFixtures,
} from '@kbn/scout';
import { spaceTest as spaceBaseTest, createLazyPageObject } from '@kbn/scout';
// Page Object owned by the unified_search plugin, reused here as a test helper:
import { SavedQueryManagementMenu } from '@kbn/unified-search-plugin/test/scout/ui/fixtures/page_objects';

export interface DiscoverTestFixtures extends ScoutParallelTestFixtures {
  pageObjects: PageObjects & {
    savedQueryManagementMenu: SavedQueryManagementMenu;
  };
}

export const spaceTest = spaceBaseTest.extend<DiscoverTestFixtures, ScoutParallelWorkerFixtures>({
  pageObjects: async ({ pageObjects, page }, use) => {
    await use({
      ...pageObjects,
      savedQueryManagementMenu: createLazyPageObject(SavedQueryManagementMenu, page),
    });
  },
});
```

6. **src/servers/**

Here we have logic to start Kibana and Elasticsearch servers using `kbn-test` functionality in Scout flavor. The instance of the `Config` class is passed to start servers for the specific deployment type. The `flags.ts` file contains server-related command-line flags and options. The `loadServersConfig` function not only returns a `kbn-test` compatible config instance, but also converts it to `ScoutServiceConfig` format and saves it on disk to `./scout/servers/local.json` in the Kibana root directory. Scout `config` fixture reads it and exposes it to UI tests.

### Test Types and Directory Structure

Scout supports two distinct types of tests: UI and API, each with their own directory structure and import patterns:

#### Setting up Test Directory

To get started with Scout testing for your plugin, you need to create the appropriate directory structure in your plugin's root directory:

```
your-plugin/
├── test/
│   └── scout/
│       ├── ui/
│       │   ├── playwright.config.ts
│       │   ├── parallel.playwright.config.ts
│       │   └── parallel_tests/               # Your UI test specs (*.spec.ts), that are run in parallel
│       │   └── tests/                        # Your UI test specs (*.spec.ts), that are run sequentially
│       ├── api/
│       │   ├── playwright.config.ts
│       │   └── tests/                        # Your API test specs (*.spec.ts), that are run sequentially
│       └── common/                           # For shared code across UI and API tests
│           ├── constants.ts
│           └── fixtures/
```

#### UI Tests

UI tests are designed for browser-based integration testing and provide access to browser fixtures like `page`, `pageObjects`, and `browserAuth`.

**Test Imports for UI Testing:**

```ts
// For sequential UI tests
import { test, expect } from '@kbn/scout';

// For parallel UI tests that can be space-isolated
import { spaceTest as test, expect } from '@kbn/scout';
```

**When to use each:**

- **`spaceTest`**: Use for parallel tests that can be isolated by Kibana spaces, allowing faster execution
- **`test`**: Use for sequential tests that cannot run in parallel

If you need **synthtrace** worker fixtures (`apmSynthtraceEsClient`, `logsSynthtraceEsClient`, etc.), add `@kbn/scout-synthtrace` and follow [Optional: wiring Synthtrace](#optional-wiring-synthtrace) under **Fixtures** above—your specs should import `test` from a local `fixtures` module that merges `synthtraceFixture`, not directly from `@kbn/scout` alone.

**Example UI Test:**

```ts
import { spaceTest as test, expect } from '@kbn/scout';

test('should display dashboard', async ({ pageObjects, page }) => {
  await pageObjects.dashboard.goto();
  await expect(page.testSubj.locator('dashboardLandingPage')).toBeVisible();
});
```

#### API Tests

API tests are designed for server-side testing and provide fixtures focused on API interactions without browser-related fixtures.

**Test Import for API Testing:**

```ts
// For API integration tests (server-side only, no browser fixtures)
import { apiTest as test, expect } from '@kbn/scout';
```

**Example API Test:**

```ts
import { apiTest, expect } from '@kbn/scout';

apiTest('POST api/painless_lab/execute is disabled', async ({ apiClient, log }) => {
  const response = await apiClient.post('api/painless_lab/execute', {
    headers: {
      ...COMMON_HEADERS,
      ...adminApiCredentials.apiKeyHeader,
    },
    responseType: 'json',
    body: TEST_INPUT.script,
  });
  expect(response.statusCode).toBe(404);
});
```

**Key Differences:**

- **UI tests** include browser fixtures (`page`, `pageObjects`, `browserAuth`) for UI interactions
- **API tests** exclude browser fixtures and focus on server-side operations (`kbnClient`, `esClient`, `log`, etc.)

#### Testing Guidelines for Plugin Development

When writing tests for your plugin, consider the following guidelines to ensure comprehensive coverage:

**Focus on Plugin Functionality:**

- Tests should primarily cover the specific functionality exposed by your plugin
- Focus on plugin-specific user workflows, configurations, and integrations

**API Testing Coverage:**

- Test all API endpoints exposed by your plugin
- Verify endpoints work correctly in both **serverless** and **stateful** deployments
- Include tests for scenarios where functionality should be **disabled** or **restricted**
- Test different user roles and permissions for your endpoints
- Cover both success and error scenarios (validation, authentication, authorization failures)

### How to Use

Scout uses Playwright's [projects concept](https://playwright.dev/docs/test-projects) to define the environment where tests are executed. The following projects are supported:

- **`local`**: Tests are executed against servers started locally. Configuration is auto-generated by Scout and saved to `KIBANA_REPO_ROOT/.scout/servers/local.json`.
- **`ech`**: Tests are executed against a Stateful deployment created in Elastic Cloud. Configuration is **manually** defined in `KIBANA_REPO_ROOT/.scout/servers/cloud_ech.json`.

```json
{
  "serverless": false,
  "isCloud": true,
  "cloudHostName": "elastic_cloud_hostname_qa_staging_prod",
  "cloudUsersFilePath": "/path_to_your_cloud_users/role_users.json",
  "hosts": {
    "kibana": "https://my.cloud.deployment.kb.co",
    "elasticsearch": "https://my.cloud.deployment.es.co"
  },
  "auth": {
    "username": "deployment_username",
    "password": "deployment_password"
  }
}
```

- **`mki`**: Tests are executed against a Serverless project created in Elastic Cloud (MKI). Configuration is **manually** defined in `KIBANA_REPO_ROOT/.scout/servers/cloud_mki.json`.

```json
{
  "serverless": true,
  "projectType": "es",
  "isCloud": true,
  "cloudHostName": "elastic_cloud_hostname_qa_staging_prod",
  "cloudUsersFilePath": "/path_to_your_cloud_users/role_users.json",
  "hosts": {
    "kibana": "https://my.es.project.kb.co",
    "elasticsearch": "https://my.es.project.es.co"
  },
  "auth": {
    "username": "operator_username",
    "password": "operator_password"
  }
}
```

For `security` and `oblt` MKI projects, `productTier` is **required** (one of `complete | essentials | logs_essentials | search_ai_lake`). Example for an Observability "logs essentials" project:

```json
{
  "serverless": true,
  "projectType": "oblt",
  "productTier": "logs_essentials",
  "isCloud": true,
  "cloudHostName": "elastic_cloud_hostname_qa_staging_prod",
  "cloudUsersFilePath": "/path_to_your_cloud_users/role_users.json",
  "hosts": {
    "kibana": "https://my.oblt.project.kb.co",
    "elasticsearch": "https://my.oblt.project.es.co"
  },
  "auth": {
    "username": "operator_username",
    "password": "operator_password"
  }
}
```

#### Cloud config validation

`cloud_ech.json` and `cloud_mki.json` are validated when Scout loads them; errors are reported in a single message with the file path and `'<field>'` paths. Use the examples above as the source of truth for required fields. A few rules worth calling out:

- `projectType` (serverless only) must be one of `es | oblt | security | workplaceai`.
- Stateful configs (`serverless: false`) must not set `projectType`, `productTier`, `organizationId`, or `linkedProject`.
- `license` is optional and defaults to `"trial"`.
- You don't need to set `uiam` or `http2` — Scout manages them; the schema rejects inconsistent values.

#### Starting Servers Only

To start the servers locally without running tests, use the following command:

```bash
node scripts/scout start-server --arch <arch> --domain <domain>
```

- **`--arch`**: `stateful` or `serverless`.
- **`--domain`**: e.g. `classic`, `search`, `observability_complete`, `security_complete`. Use `node scripts/scout start-server --help` for the full list.
- **`--preserveEsData`**: Reuse existing serverless ES object store data on startup instead of cleaning it (useful when restarting after crashes).

This command is useful for manual testing or running tests via an IDE.

#### Cross Project Search (CPS) Support

Scout supports testing Cross Project Search by starting a second ("linked") Elasticsearch cluster alongside the origin. The linked cluster runs on a separate port, shares the same UIAM identity provider as the origin, and is intended exclusively for **reading data from** -- it has no Kibana instance.

Important: When running tests locally, make sure your Docker Memory Allocation resources are set to **15 GB RAM** or above.

To start servers with CPS enabled, use the `cps_local` server config set:

```bash
node scripts/scout start-server --arch serverless --domain security_complete --serverConfigSet cps_local
```

This starts:

- **Origin ES cluster** (3 nodes, port `9220`) with UIAM
- **Linked ES cluster** (3 nodes, port `9230`) connected to the same UIAM
- **Kibana** (port `5620`)

The linked cluster port is derived from the origin ES port plus `LINKED_CLUSTER_PORT_OFFSET` (defined in `kbn-es`). If the origin port changes, the linked port adjusts automatically via the config set.

**Ingesting data into the linked cluster**

Use the `linkedProject` worker fixture in your tests:

```ts
import { test } from '@kbn/scout';

test.beforeAll(async ({ linkedProject }) => {
  // Load data archive into the linked ES cluster
  await linkedProject.esArchiver.loadIfNeeded('path/to/data/archive');
});

test('query across projects', async ({ linkedProject, page }) => {
  // Access the linked ES client directly if needed
  const result = await linkedProject.esClient.search({ index: 'my-index' });
  // ...
});
```

The `linkedProject` fixture provides:

- `esArchiver` -- data-only archiver that rejects `.kibana*` indices (use `kbnArchiver` for saved objects)
- `esClient` -- Elasticsearch client connected to the linked cluster

#### HTTP/2 Mode

Scout can start Kibana with **HTTP/2 over TLS** enabled. From 9.0 onward Kibana defaults to HTTP/2 whenever TLS is configured, so production-like deployments increasingly run on HTTP/2 rather than HTTP/1.1. Some behaviors differ between the two protocols (e.g. search strategies and other streaming response paths), so use this mode to validate plugin behavior under HTTP/2 or to reproduce TLS-only issues locally.

Enable it via the `http2` server config set; tests don't need any changes.

```bash
node scripts/scout start-server --arch stateful --domain classic --serverConfigSet http2
node scripts/scout run-tests --arch stateful --domain classic --serverConfigSet http2 \
  --config <plugin-path>/test/scout/ui/playwright.config.ts
```

Supported `--arch`/`--domain` combinations are the ones defined under `src/servers/configs/config_sets/http2/`.

#### Running Servers and Tests Locally

To start the servers locally and run tests in one step, use:

```bash
node scripts/scout run-tests --location local --arch stateful --domain classic --config <plugin-path>/test/scout/ui/playwright.config.ts
```

To start the servers locally and run a single test file, use:

```bash
node scripts/scout run-tests --location local --arch stateful --domain classic --testFiles <plugin-path>/test/scout/ui/tests/your_test_spec.ts
```

To start the servers locally and run a tests sub-directory, use:

```bash
node scripts/scout run-tests --location local --arch stateful --domain classic --testFiles <plugin-path>/test/scout/ui/tests/test_sub_directory
```

- **`--arch`** and **`--domain`**: Specify the test target (e.g. stateful classic, serverless search).
- **`--config`**: Path to the Playwright configuration file for the plugin.

This command starts the required servers and automatically executes the tests using Playwright.

#### Running Tests Separately

If the servers are already running, you can execute tests independently using one of the following methods:

1. **Playwright Plugin in IDE**: Run tests directly within your IDE using Playwright's integration.
2. **Command Line**: Use the following command:

```bash
node scripts/playwright test --config <plugin-path>/test/scout/ui/playwright.config.ts --project local
```

- **`--project`**: Specifies the test target as `local` ( `ech` or `mki` for Cloud targets, see below).

#### Running Tests Against Cloud

To run tests against a Cloud deployment, you can use either the Scout CLI or the Playwright CLI.

**Using Scout CLI:**

```bash
node scripts/scout run-tests \
  --location cloud \
  --arch stateful \
  --domain classic \
  --config <plugin-path>/test/scout/ui/playwright.config.ts
```

```bash
node scripts/scout run-tests \
  --location cloud \
  --arch serverless \
  --domain observability_complete \
  --config <plugin-path>/test/scout/ui/playwright.config.ts
```

- **`--location cloud`**: Run tests against a Cloud deployment (ECH or MKI).

**Using Playwright CLI:**

```bash
node scripts/playwright test \
  --project=ech \
  --grep=stateful-classic \
  --config <plugin-path>/test/scout/ui/playwright.config.ts
```

```bash
node scripts/playwright test \
  --project=mki \
  --grep=serverless-observability_complete \
  --config <plugin-path>/test/scout/ui/playwright.config.ts
```

- **`--project`**: Specifies the test target (`ech` for Stateful or `mki` for Serverless).
- **`--grep`**: Filters tests by tags (e.g., `serverless-search` for Elasticsearch or `serverless-observability_complete` for Observability).

By following these steps, you can efficiently run tests in various environments using Scout.

### Contributing

We welcome contributions to improve and extend `kbn-scout`. This guide will help you get started, add new features, and align with existing project standards.

Make sure to run unit tests before opening the PR:

```bash
node scripts/jest --config src/platform/packages/shared/kbn-scout/jest.config.js
```

#### Setting Up the Environment

Ensure you have the latest local copy of the Kibana repository.

Install dependencies by running the following commands:

- `yarn kbn bootstrap` to install dependencies.
- `node scripts/build_kibana_platform_plugins.js` to build plugins.

Move to the `src/platform/packages/shared/kbn-scout` directory to begin development.

### Adding or Modifying Components

Contributions to shareable `Fixtures`, `API services` and `Page Objects` are highly encouraged to promote reusability, stability, and ease of adoption. Follow these steps:

#### Adding Page Objects

1. **Create a New Page Object:** Add a new file to the `src/playwright/page_objects` directory. For instance:

```ts
export class NewPage {
  constructor(private readonly page: ScoutPage) {}
  // implementation
}
```

2. **Register the Page Object:** Update the index file to include the new Page Object:

```ts
export function createCorePageObjects(page: ScoutPage): PageObjects {
  return {
    ...
    newPage: createLazyPageObject(NewPage, page),
  };
}
```

#### Adding API service

1. **Create a New API service:** Add your service to the `src/platform/packages/shared/kbn-scout/src/playwright/fixtures/scope/worker/apis` directory, organized by functionality (e.g., `/fleet` or `/alerting`). For instance:

```ts
export interface FleetApiService {
  integration: {
    install: (name: string) => Promise<void>;
    delete: (name: string) => Promise<void>;
  };
}

export const getFleetApiHelper = (log: ScoutLogger, kbnClient: KbnClient): FleetApiService => {
  return {
    integration: {
      install: async (name: string) => {
        // implementation
      },
      delete: async (name: string) => {
        // implementation
      },
    },
  };
};
```

2. **Register the API service:** Update the index file to include the new service:

```ts
export const apiServicesFixture = coreWorkerFixtures.extend<
  {},
  { apiServices: ApiServicesFixture }
>({
  apiServices: [
    async ({ kbnClient, log }, use) => {
      const services = {
        // add new service
        fleet: getFleetApiHelper(log, kbnClient),
      };
      ...
  ],
});
```

#### Adding Fixture

1. **Determine Fixture Scope:** Decide if your fixture should apply to the `test` (per-test) or `worker` (per-worker) scope.

2. **Implement the Fixture:** Add the implementation to `src/playwright/fixtures/scope/test` or `src/playwright/fixtures/scope/worker`.

```ts
export const newTestFixture = base.extend<ScoutTestFixtures, ScoutWorkerFixtures>({
  newFixture: async ({}, use) => {
    const myFn = // implementation
      await use(myFn);
    // optionally, cleanup on test completion
  },
});
```

3. **Register the Fixture:** Add the fixture to the appropriate scope:

```ts
export const scoutTestFixtures = mergeTests(coreFixtures, newTestFixture);
```

#### Best Practices

- **Reusable Code:** When creating Page Objects, API services or Fixtures that apply to more than one plugin, ensure they are added to the `kbn-scout` package. Single-consumer Page Objects should instead live in the consuming plugin (see ["Where should a Page Object live?"](#where-should-a-page-object-live)), since any change to `kbn-scout` re-runs the whole Scout suite.
- **Adhere to Existing Structure:** Maintain consistency with the project's architecture.
- **Keep the Scope of Components Clear** When designing test components, keep in mind naming conventions, scope, maintainability and performance.
  - `Page Objects` should focus exclusively on UI interactions (clicking buttons, filling forms, navigating page). They should not make API calls directly.
  - `API Services` should handle server interactions, such as sending API requests and processing responses.
  - `Fixtures` can combine browser interactions with API requests, but they should be used wisely, especially with the `test` scope: a new instance of the fixture is created for **every test block**. If a fixture performs expensive operations (API setup, data ingestion), excessive usage can **slow down** the test suite runtime. Consider using `worker` scope when appropriate to reuse instances across tests within a worker.
- **Add Unit Tests:** Include tests for new logic where applicable, ensuring it works as expected.
- **Playwright documentation:** [Official best practices](https://playwright.dev/docs/best-practices)

### Running tests on CI

#### Enabling tests for execution

Scout is still in active development, which means frequent code changes may sometimes cause test failures. To maintain stability, we currently do not run Scout tests for every PR and encourage teams to limit the number of tests they add for now.

If a test is difficult to stabilize within a reasonable timeframe, we reserve the right to disable it or even all tests for particular plugin.

To manage Scout test execution, we use the `.buildkite/scout_ci_config.yml` file, where Kibana plugins with Scout tests are registered. If you're unsure about the stability of your tests, please add your plugin under the `disabled` section.

You can check whether your plugin is already registered by running:

```bash
node scripts/scout discover-playwright-configs --validate
```

On CI we run Scout tests only for `enabled` plugins:

For PRs, Scout tests run only if there are changes to registered plugins or Scout-related packages.
On merge commits, Scout tests run in a non-blocking mode.

#### Scout exit codes

| Exit code | Description                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| 0         | All tests passed                                                                                              |
| 1         | Missing configuration (e.g. SCOUT_CONFIG_GROUP_KEY and SCOUT_CONFIG_GROUP_TYPE environment variables not set) |
| 2         | No tests in Playwright config                                                                                 |
| 10        | Tests failed                                                                                                  |

### AI prompts to help you migrate from FTR

The `@kbn/scout-info` package contains [AI prompts](https://github.com/elastic/kibana/tree/main/src/platform/packages/private/kbn-scout-info/llms) to help you migrate FTR test files.
