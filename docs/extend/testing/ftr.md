---
navigation_title: Functional Test Runner (legacy)
---

# Functional Test Runner (FTR) [ftr]

The Functional Test Runner (FTR) is Kibana's legacy end-to-end test framework. It bootstraps a full Elastic Stack (Elasticsearch + Kibana) and runs test suites against it.

::::{note}
New tests should use [Scout](./scout.md) instead of FTR. Scout is faster, easier to debug, and supports parallel execution. Existing FTR tests continue to run, and teams can migrate to Scout incrementally.
::::

## When to use FTR [ftr-when-to-use]

Use FTR when:

- You are maintaining or extending an **existing FTR test suite**
- Your test scenario is not yet supported by Scout

For new tests, prefer [Scout](./scout.md).

## How FTR works [ftr-how-it-works]

FTR starts Elasticsearch and Kibana from a config file, then runs test files against the running servers. Tests use a service-based API (`getService('supertest')`, `getService('security')`, etc.) to interact with the stack.

**Development workflow:**

```bash
# Start servers once, keep them running
yarn test:ftr:server --config path/to/config.ts

# In a second terminal, run tests against the running servers
yarn test:ftr:runner --config path/to/config.ts
```

**Useful flags:**

```bash
# Run a specific test by name
yarn test:ftr:runner --config path/to/config.ts --grep "test name"

# Debug with browser open, stop on first failure
yarn test:ftr --config path/to/config.ts --debug --bail

# Run against serverless Elasticsearch
yarn test:ftr --config path/to/config.ts --esFrom serverless
```

**Pros:**

- Runs the full Elastic Stack
- Tests cross-plugin integration
- Supports complex server configuration

**Cons:**

- Slow startup (full stack boot on every run)
- Hard to debug
- Brittle tests due to shared state and timing sensitivity
- No parallel execution

## FTR config manifests [ftr-config-manifests]

The {{kib}} repo contains many FTR config files which use slightly different configurations for the {{kib}} server or {{es}}, have different test files, and potentially other config differences. FTR config files are organised in manifest files under `.buildkite/ftr-manifests/`, grouped by testing area and type of distribution:

- serverless:
  - `.buildkite/ftr-manifests/ftr_base_serverless_configs.yml`
  - `.buildkite/ftr-manifests/ftr_oblt_serverless_configs.yml`
  - `.buildkite/ftr-manifests/ftr_security_serverless_configs.yml`
  - `.buildkite/ftr-manifests/ftr_search_serverless_configs.yml`
- stateful:
  - `.buildkite/ftr-manifests/ftr_platform_stateful_configs.yml`
  - `.buildkite/ftr-manifests/ftr_oblt_stateful_configs.yml`
  - `.buildkite/ftr-manifests/ftr_security_stateful_configs.yml`
  - `.buildkite/ftr-manifests/ftr_search_stateful_configs.yml`

If you're writing a plugin outside the {{kib}} repo, you will have your own config file. See [Functional Tests for Plugins outside the {{kib}} repo](/extend/tutorials/external-plugin-functional-tests.md) for more info.

## Adding an FTR test [ftr-add-test]

You can reuse the existing [api_integration](https://github.com/elastic/kibana/blob/main/src/platform/test/api_integration/config.js) setup by registering a test file in the [test loader](https://github.com/elastic/kibana/blob/main/src/platform/test/api_integration/apis/index.ts).

```typescript
// src/platform/test/api_integration/apis/my_plugin/something.ts
export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');

  describe('myPlugin', () => {
    it('stores text', async () => {
      const response = await supertest
        .post('/myPlugin/formatter/text')
        .set('content-type', 'application/json')
        .send({ text: 'hello' })
        .expect(200);

      expect(response.body).to.have.property('id');
    });
  });
}
```

See the [CONTRIBUTING guide](https://github.com/elastic/kibana/blob/main/CONTRIBUTING.md#running-specific-kibana-tests) for more detail on running specific FTR suites.

## Migrating from FTR to Scout [ftr-migration]

Scout provides equivalent capabilities for most FTR use cases:

| FTR concept                | Scout equivalent                                 |
| -------------------------- | ------------------------------------------------ |
| `getService('supertest')`  | `apiClient` fixture                              |
| `getService('security')`   | `samlAuth` / `apiKey` auth options               |
| `getService('esArchiver')` | Data setup in `global.setup.ts` via API services |
| Page object pattern        | [Scout page objects](./page-objects.md)          |
| Browser interaction        | Playwright `page` fixture                        |

Start with [Set up Scout in your plugin](./setup-scout.md) to add Scout alongside your existing FTR tests, then follow the [Migrate tests to Scout](./migrate-tests.md) guide to port your existing suites.

## Writing stable FTR tests [ftr-stable-tests]

Consistently writing functional tests that aren't flaky is impossible. There are too many variables that can't be reproduced reliably, and those variables change over time, so instead we have to focus on how we can reduce the flakiness in our tests as much as possible, making them more resilient to changing conditions.

When you watch tests execute locally it can be tempting to think "after I click this button I can click this other button" but this assumes that the first button click will always execute its click handler immediately, or that the render of the second button will be done immediately. The reality is that user interfaces are super complex and these types of assumptions are by far the most common cause of flakiness in tests.

We also have to remember that we can't assume a test passing locally will mean it will pass in CI. The two environments are different. There is a lot we could mention, but at a high level, most functional tests are run on 4 core 16 GB machines, and these machines are virtualized, which means neighbors can cause modest but variable levels of performance. Additionally, end-to-end tests in CI are run against Kibana distributions, using default memory configurations, while we run the tests under the `--dev` flag locally with, most likely, a different memory configuration.

There are all sorts of things that can happen to delay a click handler, or react render, and we need to be prepared for those in our tests. We can do this using appropriate timeouts for specific actions, retry logic, and validating our assumptions with code.

### Become familiar with the retry/timing logic of each common service method [ftr-stable-tests-retry-timing]

Services like the `testSubjects` or `find` service will usually do some amount of retries/timeouts based on the intention of a specific method. Check the documentation of the method to understand how the method is supposed to be used, for instance:

:::{warning}
The intended usage/retry/timeout behavior of each method in all services is not well documented. Things in these common services have grown very stable now, so if you spend the time to analyze how a method works please help others by improving the method description. Thank you!
:::

- `testSubjects.exists()`: this method is intended to quickly answer the question about if something exists and has a default timeout of 2.5 seconds. This is ideal for determining, based on the current state of Kibana, if something should be done or not.

```ts
if (await testSubjects.exists('someModal')) {
  // close the modal if it is open
}
```

- `testSubjects.existsOrFail()`: this method is intended to be used as a success or fail point, where a specific element is expected to be visible and if it isn't an error will be thrown. This is ideal for when you click a button and want to make sure the success state is reached.

```ts
await testSubjects.click('mySubmitButton');
await testSubjects.existsOrFail('mySuccessMessage');
```

### Use services for reusing functionality and implementing it correctly once [ftr-stable-tests-services]

When you are writing functional tests for your application or feature it is probably appropriate to create a new service for the specific component of Kibana that you will be interacting with. Additionally, there are many other services which you might be able to reuse based on what you're trying to do.

Your service should define the proper way to interact with your components/app and prevent people from needing to encode specific testSubjects, or success criteria, into their apps.

### Service methods which trigger an async process should verify success or failure [ftr-stable-tests-async]

Many service methods will be used for reading the state of specific elements in the Kibana UI so that tests can understand what's going on and assert functionality, but some of the methods in our services will trigger asynchronous actions in the UI. Examples of such service methods are:

- `SettingsPage.toggleAdvancedSettingCheckbox()`
- `CommonPage.navigate()`
- `LoginPage.login()`

All of these methods interact with the UI and start an async process (a process which takes some time to complete). All of them should do more than just interact with the UI, they should encode validation of the success/failure of the action they started and only resolve when the action is
completed successfully, or reject when it's unable to be completed for some reason.

### Never use a "sleep" or rely on a timer to wait for something to complete [ftr-stable-tests-no-sleep]

Using methods like `sleep()` or `setTimeout()` to pause test execution for some amount of time is an appropriate tool when used sparingly, but it should never be used to wait for some action to complete. Instead, a method like `retry.waitFor()` should be used to define the success state we are waiting for.

**_Don't_** do this:

```ts
await myService.clickSave();
// wait for the save to complete and redirect to the detail page
await sleep();
```

Do this instead:

```ts
await myService.clickSave();
await testSubjects.existsOrFail('savedItemDetailPage');
```

### Do as little work in the UI as possible to validate your test case [ftr-stable-tests-minimal-ui]

Even if you are very careful, the more UI automation you do the more likely you are to make a mistake and write a flaky test. If there is any way to do setup work for your test via the Kibana or Elasticsearch APIs rather than interacting with the UI, then take advantage of that opportunity to write less UI automation.

### Incorrect usage of EUI components in React code will cause a functional test failure [ftr-stable-tests-eui]

For EUI to support theming and internationalization, EUI components in your React application must be wrapped in `EuiProvider` (more preferably, use the `core.rendering.addContext()`) wrapper. The functional test runner treats EUI as a first-class citizen and will throw an error when incorrect usage of EUI is detected. However, experiencing this type of failure in a test run is unlikely: in dev mode, a toast message alerts developers of incorrect EUI usage in real-time.

### Do you really need a functional test for this? [ftr-stable-tests-necessity]

Once you've invested a lot of time and energy into figuring out how to write functional tests well it can be tempting to use them for all sorts of things which might not justify the cost of a functional test. Make sure that your test is validating something that couldn't be validated by a series of unit tests on a component+store+API.

API integration tests can test many integrations with Elasticsearch in a way that's far more efficient and also is far less likely to be flaky.

Unit tests are the cheapest tests and can even be run locally by people with a normal amount of patience!

If you could write your test using either Jest Unit, Jest Integration, or API Integration tests (in that order) then it is definitely best to write those instead of a functional test.
