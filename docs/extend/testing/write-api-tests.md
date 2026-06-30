---
navigation_title: Write API tests
---

# Write Scout API tests [scout-write-api-tests]

Scout API tests validate HTTP endpoints with realistic scoped credentials.

:::::{important}
[Set up your plugin or package](./setup-scout.md) first.
:::::

## Recommended structure [api-test-suite-anatomy]

1. **Prepare the test environment** with higher-privilege helpers (`apiServices`, `kbnClient`, `esArchiver`, …)
2. **[Authenticate](api-auth.md)** with `requestAuth` (or `samlAuth` for `internal/*` endpoints)
3. **Call the endpoint under test** with `apiClient` + the scoped headers
4. **Assert** status + response body, and verify side effects when needed

See [API test best practices](./api-best-practices.md).

Example test ([Console](https://github.com/elastic/kibana/blob/main/src/platform/plugins/shared/console/test/scout/api/tests/spec_definitions.spec.ts)).

## API matchers [scout-write-api-tests-matchers]

For API tests, import `expect` from `@kbn/scout/api` or `@kbn/scout-<solution>/api` (more on [solution-specific Scout packages](./scout.md#scout-packages)).

Scout provides response matchers for `apiClient` responses and `kbnClient.request(...)` (Axios) responses:

- `toHaveStatusCode(200)` (or `toHaveStatusCode({ oneOf: [200, 201] })`)
- `toHaveStatusText('OK')`
- `toHaveHeaders({ 'content-type': 'application/json; charset=utf-8' })` (partial match; header keys are case-insensitive)

These matchers do not apply to higher-level `kbnClient.*` helpers that return only `data`.

```ts
import type { RoleApiCredentials } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest } from '../fixtures';

apiTest.describe('My endpoint', { tag: tags.deploymentAgnostic }, () => {
  let viewerRoleCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth }) => {
    viewerRoleCredentials = await requestAuth.getApiKeyForViewer();
  });

  apiTest('returns JSON', async ({ apiClient }) => {
    const res = await apiClient.get('api/my-plugin/endpoint', {
      headers: { ...viewerRoleCredentials.apiKeyHeader, 'kbn-xsrf': 'scout' },
      responseType: 'json',
    });

    expect(res).toHaveStatusCode(200);
    expect(res).toHaveHeaders({ 'content-type': 'application/json; charset=utf-8' });
    expect(res.body).toMatchObject({ ok: true });
  });
});
```

## Save the test file [save-api-test-file]

API tests live under `<plugin-root>/test/scout/api/tests` and must end with `.spec.ts`.

## Next steps [api-tests-next]

- [API authentication](./api-auth.md)
- [API test best practices](./api-best-practices.md)
- [Fixtures](./fixtures.md)
- [Run tests](./run-scout-tests.md) and [Debugging](./debugging.md)
- [Parallelism notes](./parallelism.md#api-tests-and-parallelism)
