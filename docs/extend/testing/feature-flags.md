---
navigation_title: Feature flags
---

# Feature flags [scout-feature-flags]

Some Kibana features are gated behind feature flags or experimental configuration. Scout provides two ways to enable them: **at runtime** via feature flags (without restarting the server) and **at server startup** (via custom server configurations). The table below compares the two approaches.

## When to use runtime versus server-level flags [scout-feature-flags-when-to-use]

|                        | Runtime flags                 | Custom server configs                                |
| ---------------------- | ----------------------------- | ---------------------------------------------------- |
| **API**                | `apiServices.core.settings()` | `ScoutServerConfig` config set                       |
| **Restart required**   | No — applied while running    | Yes — must be present at boot                        |
| **Elastic Cloud (QA)** | Supported                     | Not supported — local only                           |
| **CI cost**            | Low — shares default servers  | Higher — dedicated server instance                   |
| **Toggle per suite**   | Yes                           | No — fixed at server start                           |
| **When to use**        | **Preferred** for most flags  | Settings required at boot (e.g., route registration) |

For custom server configs, reach out to the AppEx QA team before creating one (see [below](#scout-feature-flags-custom-servers)).

## Enabling feature flags at runtime [scout-feature-flags-runtime]

Use `apiServices.core.settings()` to toggle feature flags while the server is running. Under the hood, this calls Kibana's [config overrides API](https://github.com/elastic/kibana/blob/main/src/core/packages/feature-flags/README.mdx#config-overrides), which forces flag values directly — bypassing the feature flag provider — so the same test code works locally and on Elastic Cloud (QA).

::::::{note}
Feature flag overrides are **server-wide**: they apply to the entire Kibana instance, not to a single space or worker. In [parallel suites](./parallelism.md) all workers share the same server, so a flag set by one worker is visible to every other worker. For parallel tests, enable flags in the **[global setup hook](./global-setup-hook.md)** so they are set once before any worker starts.
::::::

### In a global setup hook (recommended for parallel suites) [scout-feature-flags-global-setup]

Enable the flag once in `global.setup.ts` before any worker starts:

```ts
import { globalSetupHook } from '@kbn/scout';

globalSetupHook('Enable feature flags', async ({ apiServices, log }) => {
  log.info('[setup] Enabling my-feature-flag...');
  await apiServices.core.settings({
    'feature_flags.overrides': {
      'my-plugin.my-feature-flag': 'true',
    },
  });
});
```

Because feature-flag overrides are server-wide, they survive past your suite and would leak into other Scout configs sharing the same Kibana. Pair the setup with a [global teardown hook](./global-setup-hook.md#global-teardown-hook) in `global.teardown.ts` to revert the override after the suite finishes:

```ts
import { globalTeardownHook } from '@kbn/scout';

globalTeardownHook('Revert feature flags', async ({ apiServices, log }) => {
  log.info('[teardown] Reverting my-feature-flag...');
  await apiServices.core.settings({
    'feature_flags.overrides': {
      'my-plugin.my-feature-flag': false,
    },
  });
});
```

### In a test suite (sequential tests) [scout-feature-flags-test-suite]

For sequential suites you can enable flags in `beforeAll` and reset them in `afterAll`:

```ts
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test.describe('Browse integration', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ apiServices }) => {
    await apiServices.core.settings({
      'xpack.fleet.experimentalFeatures': { newBrowseIntegrationUx: true },
    });
  });

  test.afterAll(async ({ apiServices }) => {
    await apiServices.core.settings({
      'xpack.fleet.experimentalFeatures': { newBrowseIntegrationUx: false },
    });
  });

  test('loads the page', async ({ pageObjects, browserAuth }) => {
    await browserAuth.loginAsPrivilegedUser();
    // ...
  });
});
```

When using `feature_flags.overrides`, the keys must match the feature flag IDs registered by the owning plugin. Overrides bypass variation and type validation, so ensure the values match what the consuming code expects.

## Custom server configs [scout-feature-flags-custom-servers]

Some settings — such as those used during the plugin `setup` lifecycle (e.g., HTTP route registration) — cannot be changed at runtime and must be present when Kibana starts. For these cases Scout supports **custom server configuration sets** that manage a local Kibana process.

::::::{warning}
⚠️ Each custom config set requires its own dedicated local server instance, which adds CI cost. **Reach out to the AppEx QA team before creating one** to make sure it is the right approach for your use case. If the flag you need can be toggled at runtime, prefer the [runtime approach](#scout-feature-flags-runtime) instead — it works everywhere, including Cloud.
::::::

### How custom configs work [scout-feature-flags-custom-configs-how]

By default, Scout starts a local server using the `default` configuration set. Custom configs live under:

```text
src/platform/packages/shared/kbn-scout/src/servers/configs/config_sets/<name>/
```

Inside that directory, create one config file per architecture + domain combination your tests target. Files follow the naming convention `<domain>.<arch>.config.ts` and must export `servers: ScoutServerConfig`.

Scout detects a custom config in two ways:

1. **Path convention**: name your test directory `test/scout_<name>/` instead of `test/scout/` and Scout automatically maps it to the `<name>` config set.
2. **Explicit flag**: pass `--serverConfigSet <name>` when starting the local server.

### Example [scout-feature-flags-custom-config-example]

The `uiam_local` config set extends the default serverless config to enable UIAM authentication with a mock IdP:

```ts
import { servers as defaultConfig } from '../../default/serverless/security_complete.serverless.config';
import type { ScoutServerConfig } from '../../../../../types';

export const servers: ScoutServerConfig = {
  ...defaultConfig,
  esServerlessOptions: { uiam: true },
  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    serverArgs: [
      ...defaultConfig.kbnTestServer.serverArgs,
      '--xpack.security.uiam.enabled=true',
      '--xpack.security.uiam.url=<mock-idp-url>',
      // ... additional UIAM-specific args
    ],
  },
};
```

[Start the local server](./run-scout-tests.md#scout-run-tests-server-config-set) with the custom config:

```bash
node scripts/scout.js start-server --arch serverless --domain security_complete --serverConfigSet uiam_local
```
