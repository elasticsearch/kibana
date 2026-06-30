---
navigation_title: Set up plugin
---

# Set up Scout in your plugin or package [scout-setup-plugin]

This page shows the **minimum setup** to add Scout tests to a plugin/package. For choosing the right import (`@kbn/scout` vs solution packages), see [Scout packages](./scout.md#scout-packages).

## Guided setup with the Scout CLI [scout-setup-cli]

:::::::::::{stepper}

::::::::::{step} Generate a working scaffold

Generate a working scaffold (folders, configs, and sample tests) by following the guided setup:

```bash
node scripts/scout.js generate
```

This command will also automatically enable your plugin or package's Scout tests in the CI by updating the `.buildkite/scout_ci_config.yml` file.

::::::::::

::::::::::{step} Write and run tests

Tweak the new Playwright config(s) and [write UI tests](./write-ui-tests.md) or [API tests](./write-api-tests.md).

::::::::::

::::::::::

:::::::::::

## Manual setup [scout-setup-manual]

:::::::::{stepper}

::::::::{step} Create the folder layout

Create `test/scout`:

```text
your-plugin/
└── test/
    └── scout/
        ├── ui/      # UI tests (optional)
        ├── api/     # API tests (optional)
        └── common/  # shared code (optional)
```

::::::::

::::::::{step} Create Playwright config(s)

Create a config under `test/scout/ui` and/or `test/scout/api`.

::::::::{tab-set}

:::::::{tab-item} Standard config (sequential test runs)

Create `playwright.config.ts`:

```ts
import { createPlaywrightConfig } from '@kbn/scout';

export default createPlaywrightConfig({
  testDir: './tests',
});
```

::::::{important}
Use the conventional name `playwright.config.ts` so Scout tooling can discover the config.
::::::

Then create the `tests/` directory next to the config.

If many files share one-time setup (archives/ingest/settings), add a [global setup hook](./global-setup-hook.md).

:::::::

:::::::{tab-item} Parallel config (parallel test runs)

If your UI suites can be isolated, add `parallel.playwright.config.ts` under `test/scout/ui` and point it at `parallel_tests/`:

```ts
import { createPlaywrightConfig } from '@kbn/scout';

export default createPlaywrightConfig({
  testDir: './parallel_tests',
  workers: 2,
});
```

::::::{important}
Use the conventional name `parallel.playwright.config.ts` so Scout tooling can discover the config.
::::::

Then create the `parallel_tests/` directory next to the config. For parallel suites, prefer defining test suites and test cases using `spaceTest` so each worker runs in an isolated Space (see [Parallelism](./parallelism.md)).

If many files share one-time setup (archives/ingest/settings), add a [global setup hook](./global-setup-hook.md).

:::::::

::::::::

::::::::

::::::::{step} Enable Scout runs in CI

Ensure your plugin or package is listed in `.buildkite/scout_ci_config.yml` so Scout tests run in CI. If not already in the list, add **one line** under the appropriate `enabled` list:

- **Plugins**: Add `- <plugin_name>` under `plugins.enabled`. The name is the path segment(s) after `plugins/` (the plugin folder name, or a slash-separated path for nested plugins).
- **Packages**: Add `- <package_name>` under `packages.enabled`. The name is the folder name after `packages/`.

```yaml
plugins:
  enabled:
    - <plugin_name>
  disabled:

packages:
  enabled:
    - <package_name>
  disabled:
```

::::::::

::::::::::{step} Write and run tests

Tweak the new Playwright config(s) and [write UI tests](./write-ui-tests.md) or [API tests](./write-api-tests.md).

::::::::::

:::::::::
