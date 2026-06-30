---
navigation_title: "Kibana API authorization"
description: "This guide provides an overview of API authorization in Kibana."
---

# Kibana API authorization

Authorization is an important aspect of API design. It must be considered for all endpoints, even those marked as `internal`. This guide explains how and when to apply authorization to your endpoints.

Kibana API routes must declare their authorization requirements using the `security` configuration in `KibanaRouteOptions`. This allows Kibana to enforce these requirements and ensure that only authorized users can access the API routes.

If your endpoint is not a simple CRUD interface to Saved Objects, or if your endpoint bypasses our built-in Saved Objects authorization checks, then you must ensure that only authorized users can invoke your endpoint. 
This is **especially** important if your route does any of the following:
1. Performs non-insignificant processing, causing load on the Elasticsearch cluster or the Kibana server.
2. Calls Elasticsearch APIs using the internal `kibana_system` user.
3. Calls a third-party service.
4. Exposes any non-public information to the caller, such as system configuration or state, as part of the successful or even error response.

## Adding API authorization with `security` configuration
`KibanaRouteOptions` provides a security configuration at the route definition level, offering robust security configurations for both **Classic** and **Versioned** routes.

### Key features:
1. **Fine-grained control**: 
  - Define the exact privileges required to access the route.
  - Use `requiredPrivileges` to specify privileges with support for complex rules:
    - **AND rules** using `allRequired`: Requires all specified privileges for access.
    - **OR rules** using `anyRequired`: Allows access if any one of the specified privileges is met.
    - **Complex Nested Rules**: Combine both `allRequired` and `anyRequired` for advanced access rules.
2. **Explicit Opt-out**: Provide a reason for opting out of authorization to maintain transparency.
3. **Versioned Routes**: Define security configurations for different versions of the same route.
4. **Improved Documentation with OpenAPI (OAS)**: Automatically generated OAS documentation with the required privileges for each route.
5. **AuthzResult Object in Route Handlers**: Access the authorization response in route handlers to see which privileges were met.

### Configuring authorization on routes
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: ['<privilege_1>', '<privilege_2>'],
    },
  },
  ...
}, handler);
```

### Naming conventions for privileges
1. **Privilege should start with a valid `ApiOperation`**:
   - **Valid operations**: `manage`, `read`, `update`, `delete`, `create`.
   - Use the corresponding methods from the `ApiPrivileges` utility class: `ApiPrivileges.manage`, `ApiPrivileges.read`, etc.
2. **Use `_` as the separator** between the operation and the subject.

**Examples**:
Incorrect privilege names ❌
- `read-entity-a`: Uses `-` instead of `_`.
- `delete_entity-a`: Mixes `_` and `-`.
- `entity_manage`: Places the subject name before the operation.

Correct privilege names ✅
- `read_entity_a`
- `delete_entity_a`
- `manage_entity`

### Configuring operator and superuser privileges
We have two special predefined privilege sets that can be used in security configuration:
1. Operator
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: [ReservedPrivilegesSet.operator, '<privilege_2>'],
    },
  },
  ...
}, handler);
```
Operator privileges check is enforced only if operator privileges are enabled in the Elasticsearch configuration.
For more information on operator privileges, refer to the [Operator privileges documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/operator-privileges.html).
If operator privileges are disabled, we skip the check for it, so the only privilege checked from the example above is `<privilege_2>`.
Operator privileges cannot be used as standalone, it is required to explicitly specify additional privileges in the configuration to ensure that the route is protected even when operator privileges are disabled.

2. Superuser
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: [ReservedPrivilegesSet.superuser],
    },
  },
  ...
}, handler);
```

### Opting out of authorization for specific routes
**Before migration:**
```ts
router.get({
  path: '/api/path',
  ...
}, handler);
```

**After migration:**
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      enabled: false,
      reason: 'This route is opted out from authorization because ...',
    },
  },
  ...
}, handler);
```

### Classic router security configuration examples

**Example 1: All privileges required.**
Requires `<privilege_1>` AND `<privilege_2>` to access the route.
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: ['<privilege_1>', '<privilege_2>'],
    },
  },
  ...
}, handler);
```

**Example 2: Any privileges required.**
Requires `<privilege_1>` OR `<privilege_2>` to access the route.
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: [{ anyRequired: ['<privilege_1>', '<privilege_2>'] }],
    },
  },
  ...
}, handler);
```

**Example 3: Complex configuration.**
Requires `<privilege_1>` AND `<privilege_2>` AND (`<privilege_3>` OR `<privilege_4>`) to access the route.
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: [{ allRequired: ['<privilege_1>', '<privilege_2>'], anyRequired: ['<privilege_3>', '<privilege_4>'] }],
    },
  },
  ...
}, handler);
```

**Example 4: Complex configuration with nested `allOf`.**
Requires (`<privilege_1>` AND `<privilege_2>`) OR (`<privilege_3>` AND `<privilege_4>`) to access the route.
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: [
        { 
          anyRequired: [
            { allOf: ['<privilege_1>', '<privilege_2>']}, 
            { allOf: ['<privilege_3>', '<privilege_4>']}
          ],
        }
      ],
    },
  },
  ...
}, handler);
```

**Example 5: Complex configuration with nested `anyOf`.**
Requires (`<privilege_1>` OR `<privilege_2>`) AND (`<privilege_3>` OR `<privilege_4>`) to access the route.
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: [
        { 
          allRequired: [
            { anyOf: ['<privilege_1>', '<privilege_2>']}, 
            { anyOf: ['<privilege_3>', '<privilege_4>']}
          ],
        }
      ],
    },
  },
  ...
}, handler);
```

### Versioned router security configuration examples
Different security configurations can be applied to each version when using the Versioned Router. This allows your authorization needs to evolve in lockstep with your API.

**Example 1: Default and custom version security.**

1. **Default configuration**: Applies to versions without specific authorization, requires `<privilege_1>`.

2. **Version 1**: Requires **both** `<privilege_1>` and `<privilege_2>` privileges.

3. **Version 2**: Inherits the default authorization configuration, requiring `<privilege_1>`.

```ts
router.versioned
  .get({
    path: '/internal/path',
    access: 'internal',
    // default security configuration, will be used for version unless overridden
    security: {
      authz: {
        requiredPrivileges: ['<privilege_1>'],
      },
    },
  })
  .addVersion({
    version: '1',
    validate: false,
    security: {
      authz: {
        requiredPrivileges: ['<privilege_1>', '<privilege_2>'],
      },
    },
  }, handlerV1)
  .addVersion({
    version: '2',
    validate: false,
  }, handlerV2);
```

**Example 2: Multiple versions with different security requirements.**
1. **Default Configuration**: Applies to versions without specific authorization, requires `<privilege_1>`.

2. **Version 1**: Requires **both** `<privilege_1>` and `<privilege_2>` privileges.

3. **Version 2**: Requires `<privilege_3>` AND (`<privilege_1>` OR `<privilege_2>`).

4. **Version 3**: Requires only `<privilege_3>`.

```ts
router.versioned
  .get({
    path: '/internal/path',
    access: 'internal',
    // default security configuration, will be used for version unless overridden
    security: {
      authz: {
        requiredPrivileges: ['<privilege_1>'],
      },
    },
  })
  .addVersion({
    version: '1',
    validate: false,
    security: {
      authz: {
        requiredPrivileges: ['<privilege_1>', '<privilege_2>'],
      },
    },
  }, handlerV1)
  .addVersion({
    version: '2',
    validate: false,
    security: {
      authz: {
        requiredPrivileges: ['<privilege_3>', anyRequired: ['<privilege_1>', '<privilege_2>']],
      },
    },
  }, handlerV2)
  .addVersion({
    version: '3',
    validate: false,
    security: {
      authz: {
        requiredPrivileges: ['<privilege_3>'],
      },
    },
  }, handlerV3);
```

## Authorization response available in route handlers
The `AuthzResult` object is available in route handlers, which provides information about the privileges granted to the caller.
For example, you have a route that requires `<privilege_3>` and ANY of the privileges `<privilege_1>` OR `<privilege_2>`:
```ts
router.get({
  path: '/api/path',
  security: {
    authz: {
      requiredPrivileges: ['<privilege_3>', { anyRequired: ['<privilege_1>', '<privilege_2>'] }],
    },
  },
  ...
}, (context, request, response) => {
  // The authorization response is available in `request.authzResult`
  // {
  //   "<privilege_3>": true,
  //   "<privilege_1>": true,
  //   "<privilege_2>": false
  // }
});
```

## OpenAPI specification (OAS) documentation
Based on the security configuration defined in routes, OAS documentation will automatically generate and include description about the required privileges. 
This makes it easy to view the security requirements of each endpoint in a standardized format, facilitating better understanding and usage by developers or teams consuming the API.

To check the OAS documentation for a specific API route and see its security details, you can use the following command:
```sh
GET /api/oas?pathStartsWith=/your/api/path
```

## Questions?
If you have any questions or need help with API authorization, please reach out to the `@elastic/kibana-security` team.