---
navigation_title: API and E2E tests
description: Learn about Scout, Kibana's modern UI and API test framework built on Playwright
---

# Scout [scout]

Scout is Kibana's **modern UI and API test framework** built on [Playwright](https://playwright.dev). It focuses on **fast test execution**, a good **developer experience**, and **reusable** test building blocks (e.g., [fixtures](./fixtures.md), [page objects](./page-objects.md) and [API services](./api-services.md)).

## Start here [scout-start-here]

- [Set up Scout in your plugin](./setup-scout.md)
- [Run Scout tests](./run-scout-tests.md)
- [Best practices](./scout-best-practices.md) (see also [UI](./ui-best-practices.md) and [API](./api-best-practices.md) test best practices)
- [UI testing](./ui-testing.md)
- [API testing](./api-testing.md)
- [Migrate tests to Scout](./migrate-tests.md)

## Scout benefits [scout-main-features]

- **Parallel execution**: run UI suites in [parallel](./parallelism.md) against the same deployment.
- **Selective testing**: PR builds run only the Scout tests scoped to changed modules, cutting CI time.
- **Co-located tests**: keep tests close to [plugin code](./setup-scout.md) for easier iteration and maintenance.
- **Deployment-agnostic**: write tests once, then use [tags](./deployment-tags.md) to declare where they should run (stateful/serverless).
- **Fixture-based**: [fixtures](./fixtures.md) cover auth, data setup, clients, and common workflows.
- **Better debugging**: use Playwright [UI Mode](https://playwright.dev/docs/test-ui-mode).
- **Reporting**: we provide you with dashboards to track skipped tests, flaky tests, and more.
- **Reusability**: reuse or write reusable fixtures, page objects and API helpers to reduce duplication.
- **Follows modern best practices**: see [Best practices](./scout-best-practices.md).

## Scout packages [scout-packages]

**Import the right Scout package in your Scout tests:**

- **Platform-owned tests** → `@kbn/scout`

| Package      | Use in tests               |
| ------------ | -------------------------- |
| `@kbn/scout` | Platform (shared baseline) |

- **Solution-owned tests** → your solution Scout package (it builds on `@kbn/scout`)

| Package               | Use in tests                                      |
| --------------------- | ------------------------------------------------- |
| `@kbn/scout-oblt`     | {icon}`logo_observability` Observability solution |
| `@kbn/scout-security` | {icon}`logo_security` Security solution           |
| `@kbn/scout-search`   | {icon}`logo_elasticsearch` Search solution        |

::::::{note}
Fixtures, page objects, and API helpers defined in `@kbn/scout` can be imported by solution-specific Scout packages. When they are defined in a solution package or a plugin they will only be available to that solution or plugin.
::::::

## Contribute to Scout when possible [contribute-to-scout-when-possible]

We welcome contributions to one of the Scout packages.

| If your helper/code…                  | Put it…                                                                                                   | Examples                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Is reusable across many plugins/teams | In `@kbn/scout`                                                                                           | Generic fixtures, page objects, and API helpers    |
| Is reusable but scoped to a solution  | In the solution Scout package (for example `@kbn/scout-security`, `@kbn/scout-oblt`, `@kbn/scout-search`) | Solution workflows and domain-specific helpers     |
| Is specific to one plugin or package  | In your plugin or package's `test/scout` directory                                                        | Components specific to your plugin or package only |

## Need help? [need-help]

- **Internal (Elasticians)**: reach out to the AppEx QA team for guidance.

- **External contributors**: open an issue in the Kibana repository and label it with `Team:QA`.

## FAQ [scout-faq]

#### Q: Does Scout prevent flaky tests? [scout-faq-flakes]

No, good test design still matters.

#### Q: Is Scout designed to be _just_ a Playwright UI test runner? [scout-faq-ui-only]

No. Scout supports both [UI](./ui-testing.md) and [API](./api-testing.md) testing with Playwright.

#### Q: Are test runs going to be faster? [scout-faq-faster]

Often yes, especially with [parallel test execution](./parallelism.md) and selective testing.

#### Q: What is selective testing? [scout-faq-selective-testing]

In PR builds, Scout automatically detects which modules changed and runs only the relevant tests, reducing CI time. You can confirm your tests ran by looking for the `affected Scout:` prefix on Buildkite steps. See PR [#261510](https://github.com/elastic/kibana/pull/261510) for details.

#### Q: Why is it a good idea for tests to be close to the plugin code? [scout-faq-colocation]

It’s easier to iterate and maintain, and it enables selective testing: PR builds automatically run only the Scout tests for affected modules.

#### Q: Can I use FTR services in Scout (for example, `esArchiver`)? [scout-faq-ftr-services]

Not directly—use Scout [fixtures](./fixtures.md) instead.

#### Q: What happens to FTR tests? [scout-faq-ftr-tests]

Existing FTR tests continue to run, and teams can migrate them to Scout incrementally over time.

#### Q: Should I migrate every FTR test to Scout? [scout-faq-migrate-ftr-to-scout]

_It depends_: [pick the right test type](./scout-best-practices.md#pick-the-right-test-type) before migrating a test. Refer to our [Migrate tests to Scout](./migrate-tests.md) guide.

#### Q: Does Scout support feature flags? [scout-faq-feature-flags]

Yes. See [Feature flags](./feature-flags.md) for details on enabling flags at runtime with `apiServices.core.settings()` or using custom server configurations.
