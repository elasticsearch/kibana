---
navigation_title: API services
---

# API services [scout-api-services]

API services are higher-level helpers for Kibana APIs used for **setup**, **teardown**, and **side-effect verification**. They’re accessed via the **worker-scoped** `apiServices` fixture (your editor should autocomplete `apiServices.<service>`).

::::::{tip}
API services should focus on **server-side interactions** (HTTP requests). UI interactions belong in [page objects](./page-objects.md).
::::::

## When to use `apiServices` vs `apiClient` [scout-api-services-when]

- **`apiClient`**: validate the endpoint under test with scoped credentials (see [Write API tests](./write-api-tests.md)).
- **`apiServices`**: prepare state, clean up, or verify side effects with higher privileges.

## What’s included [scout-api-services-included]

`@kbn/scout` ships a small set of built-in services (available as `apiServices.<name>`):

- `alerting`
- `cases`
- `core`
- `dataViews`
- `fleet`
- `sampleData`
- `spaces`
- `streams`

:::::::{note}
This list will grow over time. If you build a helper that’s broadly useful, consider contributing it to `@kbn/scout` (or your solution Scout package) so other teams can reuse it.
:::::::

## Example [scout-api-services-example]

```ts
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test.describe('My suite', { tag: tags.deploymentAgnostic }, () => {
  test.beforeAll(async ({ apiServices }) => {
    await apiServices.streams.enable();
  });

  test.afterAll(async ({ apiServices }) => {
    await apiServices.streams.disable();
  });
});
```

## Create a new service [create-a-new-api-service]

If you find repeated API setup/cleanup code across suites, add a helper to your plugin/solution’s `apiServices` extension. If it’s broadly useful, consider contributing it to `@kbn/scout` or your solution Scout package.

Guidelines:

- Keep services **HTTP-only** (wrap `kbnClient.request(...)` calls). Put UI flows in [page objects](./page-objects.md).
- Make methods read like intent (`enable()`, `createTestData()`, `deleteAll()`), and keep assertions in tests.
- Keep services **stateless**. Compute per-test ids/names in the test and pass them into the service method.
- If the API is **space-scoped**, accept an optional `spaceId` and prefix requests with `/s/<spaceId>` when provided.

## Extend `apiServices` in your plugin fixtures [extend-apiServices]

:::::::::::{stepper}

::::::::::{step} Define your service

Create a helper that bundles repeated setup/teardown operations (for example `getMyFeatureApiService(...)`).

If you’ll use it from both UI and API suites, put it under `test/scout/common`:

```ts
// <plugin-root>/test/scout/common/services/my_feature_api_service.ts
import type { KbnClient, ScoutLogger } from '@kbn/scout';

export type MyFeatureApiService = {
  enable: (spaceId?: string) => Promise<void>;
  disable: (spaceId?: string) => Promise<void>;
};

export const getMyFeatureApiService = ({
  kbnClient,
  log,
}: {
  kbnClient: KbnClient;
  log: ScoutLogger;
}): MyFeatureApiService => {
  const withSpace = (path: string, spaceId?: string) => (spaceId ? `/s/${spaceId}${path}` : path);

  return {
    enable: async (spaceId?: string) => {
      log.debug('Enabling my feature');
      await kbnClient.request({
        method: 'POST',
        path: withSpace('/api/my_feature/_enable', spaceId),
      });
    },
    disable: async (spaceId?: string) => {
      log.debug('Disabling my feature');
      await kbnClient.request({
        method: 'POST',
        path: withSpace('/api/my_feature/_disable', spaceId),
      });
    },
  };
};
```

::::::::::

::::::::::{step} Extend the `apiServices` fixture

You can add plugin-specific helpers by extending the `apiServices` fixture in your `fixtures/index.ts`.

The pattern is the same for UI tests (`test`) and API tests (`apiTest`): extend the entrypoint you import in that suite’s `fixtures/index.ts`.

Example (API tests):

```ts
import type { ApiServicesFixture } from '@kbn/scout';
import { apiTest as baseApiTest } from '@kbn/scout';
import {
  getMyFeatureApiService,
  type MyFeatureApiService,
} from '../../common/services/my_feature_api_service';

export type MyFeatureApiServices = ApiServicesFixture & {
  myFeature: MyFeatureApiService;
};

export const apiTest = baseApiTest.extend<{}, { apiServices: MyFeatureApiServices }>({
  apiServices: async ({ apiServices, kbnClient, log }, use) => {
    await use({
      ...apiServices,
      myFeature: getMyFeatureApiService({ kbnClient, log }),
    });
  },
});
```

Example (UI tests):

```ts
import type { ApiServicesFixture } from '@kbn/scout';
import { test as baseTest } from '@kbn/scout';
import {
  getMyFeatureApiService,
  type MyFeatureApiService,
} from '../../common/services/my_feature_api_service';

export type MyFeatureApiServices = ApiServicesFixture & { myFeature: MyFeatureApiService };

export const test = baseTest.extend<{}, { apiServices: MyFeatureApiServices }>({
  apiServices: async ({ apiServices, kbnClient, log }, use) => {
    await use({ ...apiServices, myFeature: getMyFeatureApiService({ kbnClient, log }) });
  },
});
```

::::::::::

::::::::::{step} Use it for setup/teardown

Use the helper for **setup/teardown** (and keep the endpoint under test in `apiClient` for readable, scoped tests). See [API test best practices](./api-best-practices.md).

:::::::{note}
In parallel UI suites (`spaceTest`), use `scoutSpace.id` when calling methods that need space scoping: `await apiServices.myFeature.enable(scoutSpace.id)`.
:::::::

::::::::::

:::::::::::
