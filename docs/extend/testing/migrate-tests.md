---
navigation_title: Migrate tests
---

# Migrate tests to Scout [scout-migrate-tests]

This guide covers migrating existing FTR and Cypress tests to [Scout](./scout.md).

## Don't migrate blindly [dont-migrate-blindly]

Treat migration as a chance to revisit your tests and make them more robust, not a 1-to-1 port:

:::::::::{stepper}

::::::::{step} Do your UI tests _really_ need to be UI tests?
UI tests (the slowest, most expensive, and most brittle kind) should be reserved for full end-to-end user flows.<br><br> • UI tests that assert **backend behavior** (is a given feature available for the user? Is the table rendering the right number of items?) should be rewritten as **API tests**. <br> • Tests that only verify a **component** renders correctly belong as **RTL component tests**.

See [Pick the right test type](./scout-best-practices.md#pick-the-right-test-type) for complete guidance.

::::::::

::::::::{step} Can your tests reuse Scout's _default_ servers config?

Scout's [`default` server configuration](https://github.com/elastic/kibana/tree/main/src/platform/packages/shared/kbn-scout/src/servers/configs/config_sets/default) mirrors the Cloud (MKI/ECH) setup and is shared across many suites in CI.

**Don't modify it:** changes apply only to local CI servers and are silently ignored when provisioning Cloud projects or deployments (your test will behave differently in the two environments).

A **[custom server config](./feature-flags.md#scout-feature-flags-custom-servers)** is the alternative: it boots test servers with custom settings for your suite alone, overriding Kibana's server args. It adds CI cost and only runs in local pipelines (no Elastic Cloud support), so **stick with the default config whenever possible**.

::::::{tip}
Most FTR-era setups don't need a custom config in Scout:

- **To enable a feature conditionally** (no Kibana restart needed): use [runtime feature flags](./feature-flags.md#scout-feature-flags-runtime) via `apiServices.core.settings()` in a test spec or [global setup hook](./global-setup-hook.md). Works locally and on Cloud.
- **To ingest data**: load via `apiServices`, `kbnClient`, or `esArchiver` in `beforeAll`, or in a [global setup hook](./global-setup-hook.md).
- **To set UI or advanced settings**: use the `uiSettings` [fixture](./fixtures.md).

  Reach for a custom server config only when a setting must be present at Kibana boot (for example, registering HTTP routes at plugin-`setup` time).
  ::::::

::::::::

::::::::{step} Be the driver: review and _understand_ your new tests

We provide AI tooling to take most of the toil out of migration, but **always review the AI-generated output manually**. Understanding the decisions the AI made on your behalf will help you troubleshoot flaky tests down the road.

::::::{tip}
Some helpful questions to ask while reviewing:

- Did we lose or gain any test coverage with the migration?
- Should the new tests really be UI tests? Should they run in [parallel](./parallelism.md)?
- Do the [deployment tags](./deployment-tags.md) look right? See [Pick the right tags](./deployment-tags.md#scout-deployment-tags-pick).
- Can the tests reuse Scout's default test servers config?
  ::::::

::::::::

:::::::::

## Let your AI agent help [ai-assist]

Agentic skills in Kibana can take most of the toil out of migration. Your coding agent should pick up the skills below automatically. As always, **review the AI-generated output manually**.

### FTR → Scout

The [`scout-migrate-from-ftr`](https://github.com/elastic/kibana/blob/main/.agents/skills/scout-migrate-from-ftr/SKILL.md) skill analyzes your FTR tests and drafts a **migration plan**. Review it, and the skill executes the migration.

### Cypress → Scout

The [`cypress-to-scout-migration`](https://github.com/elastic/kibana/tree/main/x-pack/solutions/security/plugins/security_solution/.agents/skills/cypress-to-scout-migration) skill, maintained by the Security Engineering Productivity team, ports Cypress tests to Scout.

### Best practices review

Run the [`scout-best-practices-reviewer`](https://github.com/elastic/kibana/blob/main/.agents/skills/scout-best-practices-reviewer/SKILL.md) skill on the migrated tests to make sure they follow our [Scout best practices](./scout-best-practices.md). The Security solution created their own version of the skill [here](https://github.com/elastic/kibana/tree/main/x-pack/solutions/security/plugins/security_solution/.agents/skills/scout-best-practices-reviewer).
