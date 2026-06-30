---
navigation_title: Run tests
---

# Run Scout tests [scout-run-tests]

:::::::{tip}
The commands below work the same way for both UI and API tests.
:::::::

## Local runs [scout-run-tests-local]

Scout requires Kibana and Elasticsearch to be running before running tests against a **local deployment**.

::::::{stepper}

:::::{step} Start servers once

Start the Kibana and Elasticsearch servers once:

```bash
node scripts/scout.js start-server \
  --arch <stateful|serverless> \
  --domain <classic|search|observability_complete|observability_logs_essentials|security_complete|security_essentials|security_ease|workplaceai>
```

:::::

:::::{step} Run tests as often as you'd like (in a separate terminal)

And then run tests how often you'd like against the same test servers:

```bash
node scripts/playwright test --config <plugin-path>/test/scout/ui/playwright.config.ts \
  --project local \
  --grep @<location>-<arch>-<domain>
```

- Use `--project local` to target your locally running Kibana/Elasticsearch processes.
- Use `--grep` to filter by tag (for example `@local-stateful-classic`). If you omit `--grep`, Playwright will run all suites in the config, including ones that may not be compatible with your target.

We recommend checking out Playwright's [**UI mode**](./debugging.md#playwright-ui-mode) (use `--ui`).

:::::
::::::::

### Alternative: one command to start servers + run tests [scout-run-tests-cli]

```bash
node scripts/scout.js run-tests \
  --arch <stateful|serverless> \
  --domain <classic|search|observability_complete|observability_logs_essentials|security_complete|security_essentials|security_ease|workplaceai> \
  --config <plugin-path>/test/scout/ui/playwright.config.ts
```

When Scout starts Kibana and Elasticsearch locally, it saves the server configuration to `.scout/servers/local.json` and later reads it when running tests.

### Run a subset with `--testFiles` [scout-run-tests-testFiles]

Directory:

```bash
node scripts/scout.js run-tests \
  --arch <stateful|serverless> \
  --domain <domain> \
  --testFiles <plugin-path>/test/scout/ui/tests/some_dir
```

Comma-separated file list:

```bash
node scripts/scout.js run-tests \
  --arch <stateful|serverless> \
  --domain <domain> \
  --testFiles <path/to/one.spec.ts>,<path/to/two.spec.ts>
```

:::::::{warning}
All `--testFiles` paths must fall under the same Scout root (for example, `scout/ui/tests` vs `scout/ui/parallel_tests`) so Scout can discover the right config.
:::::::

### Custom server configuration [scout-run-tests-server-config-set]

By default, Scout starts Kibana and Elasticsearch using the built-in `default` configuration set. This works for most tests and requires no extra flags. Because all suites that use the default config share the same servers, they can be grouped together in CI, saving both time and resources.

If your tests need specific server-level settings that must be present at boot time (for example, feature flags that cannot be toggled at runtime), you can point Scout at a **custom configuration set** with `--serverConfigSet`. Each custom config set requires its own dedicated server instance, so prefer [runtime feature flags](./feature-flags.md#scout-feature-flags-runtime) whenever possible.

```bash
node scripts/scout.js start-server \
  --arch stateful \
  --domain classic \
  --serverConfigSet evals_entity_analytics
```

Or with `run-tests`:

```bash
node scripts/scout.js run-tests \
  --arch stateful \
  --domain classic \
  --serverConfigSet evals_entity_analytics \
  --config <plugin-path>/test/scout/ui/playwright.config.ts
```

See [Feature flags](./feature-flags.md#scout-feature-flags-custom-servers) for more details on when and how to use custom server configurations.
