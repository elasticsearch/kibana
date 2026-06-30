---
navigation_title: Testing
---

# Testing Kibana plugins [testing-kibana-plugins]

Kibana plugins are tested at three levels. Each level has a different scope, speed, and tooling:

| Level | Scope | Tools | When to use |
| --- | --- | --- | --- |
| **Unit** | A single function, class, or component in isolation | Jest + mocks | Fast, exhaustive coverage of logic and edge cases |
| **Integration** | Interactions between systems (HTTP APIs, Elasticsearch, plugin contracts) | Jest + TestUtils or FTR | Verifying real behavior without full browser |
| **End-to-end (E2E)** | User-facing behavior through the browser or HTTP | Scout (Playwright) | Validating complete user flows and UI interactions |

Follow the [testing pyramid](https://martinfowler.com/articles/practical-test-pyramid.html): many unit tests, fewer integration tests, and a small number of E2E tests.

## Unit and integration tests

Use **Jest** for unit and integration tests:

- [Unit tests](./unit-tests.md) — test logic in isolation with mocks
- [Integration tests](./integration-tests.md) — test against real Kibana or Elasticsearch instances

## End-to-end tests with Scout

**Scout** is Kibana's modern E2E test framework built on [Playwright](https://playwright.dev). Use it for UI and API tests.

- [What is Scout](./scout.md) — overview, packages, and FAQ
- [Set up Scout in your plugin](./setup-scout.md) — add Scout to your plugin or package
- [Run Scout tests](./run-scout-tests.md) — start servers and run tests locally

**Core concepts:**
- [Fixtures](./fixtures.md)
- [Page objects](./page-objects.md)
- [API services](./api-services.md)
- [Parallelism](./parallelism.md)
- [Deployment tags](./deployment-tags.md)
- [Global setup hook](./global-setup-hook.md)

**How-to guides:**
- [Write UI tests](./write-ui-tests.md)
- [Write API tests](./write-api-tests.md)
- [Debug test runs](./debugging.md)
- [Browser authentication](./browser-auth.md)
- [API authentication](./api-auth.md)
- [Accessibility checks](./a11y-checks.md)
- [Skip tests](./skip-tests.md)
- [Feature flags in tests](./feature-flags.md)

## Legacy functional tests (FTR)

The **Functional Test Runner (FTR)** is Kibana's legacy E2E framework. Existing FTR tests continue to run, and teams can migrate incrementally to Scout.

- [Functional Test Runner](./ftr.md) — when to use FTR, how it works, and migration guidance

## External plugins

If you're testing a plugin developed outside the Kibana repository, see [Testing Kibana plugins](../tutorials/testing-kibana-plugin.md) in the Tutorials section.
