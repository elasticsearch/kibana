---
navigation_title: Browser auth
---

# Browser authentication in Scout [scout-browser-auth]

Use the `browserAuth` fixture to authenticate **UI tests**. Scout uses **SAML**, so the same approach works across deployment types.

## Log in with `browserAuth` [scout-browser-auth-login]

Available methods:

| Method                                | Description                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `loginAsViewer()`                     | Read-only flows using the built-in `viewer` role                            |
| `loginAsPrivilegedUser()`             | Resolves to `editor`, or `developer` for Elasticsearch serverless projects  |
| `loginAsAdmin()`                      | Admin-only behavior (full access); avoid unless required                    |
| `loginAs(role)`                       | Log in with a specific built-in role by name (must exist in the deployment) |
| `loginWithCustomRole(roleDescriptor)` | Log in with a specific set of Kibana and Elasticsearch privileges           |

```ts
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

test.describe('My suite', { tag: tags.deploymentAgnostic }, () => {
  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.dashboard.goto();
  });

  // ...
});
```

::::::{note}
Local runs can create on-demand identities via a trusted mock IdP. Cloud runs authenticate using pre-provisioned users.
::::::

## Custom roles [scout-browser-auth-custom-role]

Use `loginWithCustomRole()` to test permission boundaries with least privilege:

```ts
await browserAuth.loginWithCustomRole({
  kibana: [{ spaces: ['*'], base: [], feature: { discover: ['read'] } }],
  elasticsearch: {
    indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
  },
});
```

## Reuse role helpers [scout-browser-auth-extend]

If the same login/role is needed across many tests, extend `browserAuth` in your solution/package/plugin fixtures instead of repeating role descriptors.

This is useful because it:

- keeps role descriptors **centralized** (one place to review/update)
- makes tests read like intent (`loginAsPlatformEngineer()`) instead of plumbing
- reduces drift/typos when multiple suites need the same privileges

### Real example: `@kbn/scout-security` adds `loginAsPlatformEngineer()` [scout-browser-auth-extend-example]

The Security solution’s Scout package extends `browserAuth` with a helper that picks the right auth strategy depending on the environment (serverless vs stateful).

```ts
// x-pack/solutions/security/packages/kbn-scout-security/src/playwright/fixtures/test/browser_auth/index.ts
import { browserAuthFixture, mergeTests } from '@kbn/scout';
import type {
  BrowserAuthFixture,
  ElasticsearchRoleDescriptor,
  KibanaRole,
  SamlAuth,
  ScoutLogger,
  ScoutTestConfig,
} from '@kbn/scout';
import type { RoleDescriptorsFixture } from '../../worker';
import { roleDescriptorsFixture } from '../../worker';

export interface SecurityBrowserAuthFixture extends BrowserAuthFixture {
  loginAsPlatformEngineer: () => Promise<void>;
}

export const securityBrowserAuthFixture = mergeTests(
  browserAuthFixture,
  roleDescriptorsFixture
).extend<{
  browserAuth: SecurityBrowserAuthFixture;
}>({
  browserAuth: async ({ browserAuth, config, roleDescriptors, samlAuth, log }, use) => {
    const loginWithCustomRole = async (role: KibanaRole | ElasticsearchRoleDescriptor) => {
      await samlAuth.setCustomRole(role);
      return browserAuth.loginAs(samlAuth.customRoleName);
    };

    const loginAsPlatformEngineer = async () => {
      const roleName = 'platform_engineer';
      if (!config.serverless) {
        const roleDescriptor = roleDescriptors.serverless?.get(
          roleName
        ) as ElasticsearchRoleDescriptor;
        if (!roleDescriptor) throw new Error(`No role descriptors found for ${roleName}`);
        log.debug(`Using "${roleName}" role to execute the test`);
        return loginWithCustomRole(roleDescriptor);
      }
      return browserAuth.loginAs(roleName);
    };

    await use({ ...browserAuth, loginWithCustomRole, loginAsPlatformEngineer });
  },
});
```

Then tests can call the helper directly (example from Security Solution):

```ts
// x-pack/solutions/security/plugins/security_solution/test/scout/ui/parallel_tests/flyout/alert_details_url_sync.spec.ts
import { spaceTest, tags } from '@kbn/scout-security';
import { CUSTOM_QUERY_RULE } from '@kbn/scout-security/src/playwright/constants/detection_rules';

spaceTest.describe(
  'Expandable flyout state sync',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`,
      });

      await browserAuth.loginAsPlatformEngineer();
    });
  }
);
```

Examples in the repo:

- [Security](https://github.com/elastic/kibana/blob/main/x-pack/solutions/security/packages/kbn-scout-security/src/playwright/fixtures/test/browser_auth/index.ts)
- [APM](https://github.com/elastic/kibana/blob/main/x-pack/solutions/observability/plugins/apm/test/scout/ui/fixtures/index.ts)

::::::{tip}
You can also extend `browserAuth` at the **plugin** level. Add helpers in your plugin’s Scout fixtures (for example `<plugin-root>/test/scout/ui/fixtures/index.ts`) so all specs in that plugin can call `browserAuth.loginAsMyRole()` without repeating role descriptors.
::::::

## Best practices [scout-browser-auth-best-practices]

- Avoid `admin` unless you’re explicitly testing admin-only behavior.
- Prefer `loginAsPrivilegedUser()` for suites that run across multiple environments.
- Keep custom roles minimal and document why they exist.
