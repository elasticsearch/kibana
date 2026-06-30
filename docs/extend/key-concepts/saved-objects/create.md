---
navigation_title: Create a type
---

# Create a Saved Object type [saved-objects-create]

This page describes how to define and register a **Saved Object type** (the type definition), not how to create Saved Object instances via the client. It covers registering the type, defining mappings and references, and defining the initial model version with full validation.

## Registering a Saved Object type [saved-objects-type-registration]

Saved object type definitions should live in a `my_plugin/server/saved_objects` directory.

The folder should contain one file per type (named after the snake_case type name) and an `index.ts` that exports all types.

```typescript
import { SavedObjectsType } from 'src/core/server';

export const dashboardVisualization: SavedObjectsType = {
  name: 'dashboard_visualization', <1>
  namespaceType: 'multiple-isolated', <2>
  hidden: true, <3>
  modelVersions: {
    1: modelVersion1,
    2: modelVersion2,
  },
  mappings: {
    dynamic: false,
    properties: {
      description: {
        type: 'text',
      },
      hits: {
        type: 'integer',
      },
    },
  },
  // ...other mandatory properties
};
```

1. The name may form part of the URL path for the public Saved Objects HTTP API; use snake_case per our API URL path convention.
2. This determines space behavior (single space, multiple spaces, or all spaces). See [Sharing Saved Objects](share.md) for details.
3. If `hidden: true`, the type is not exposed by default via the Saved Objects Client APIs or HTTP APIs. Hidden types must be listed in `SavedObjectsClientProviderOptions[includedHiddenTypes]` to be accessible.

```typescript
export { dashboardVisualization } from './dashboard_visualization';
export { dashboard } from './dashboard';
```

```typescript
import { dashboard, dashboardVisualization } from './saved_objects';

export class MyPlugin implements Plugin {
  setup({ savedObjects }) {
    savedObjects.registerType(dashboard);
    savedObjects.registerType(dashboardVisualization);
  }
}
```

## Mappings [_mappings]

Each Saved Object type can define its own {{es}} field mappings. Because multiple types can share the same index, each type's mappings are nested under a top-level field that matches the type name.

Example for the `search` type:

[search.ts](https://github.com/elastic/kibana/blob/master/src/platform/plugins/shared/saved_search/server/saved_objects/search.ts#L19-L70)

```typescript
import { SavedObjectsType } from 'src/core/server';
// ... other imports
export const getSavedSearchObjectType: SavedObjectsType = {
  name: 'search',
  hidden: false,
  namespaceType: 'multiple-isolated',
  mappings: {
    dynamic: false,
    properties: {
      title: { type: 'text' },
      description: { type: 'text' },
    },
  },
  modelVersions: { ... },
  // ...other optional properties
};
```

This results in the following being applied to the `.kibana_analytics` index:

```json
{
  "mappings": {
    "dynamic": "strict",
    "properties": {
      ...
      "search": {
        "dynamic": false,
        "properties": {
          "title": {
            "type": "text",
          },
          "description": {
            "type": "text",
          },
        },
      }
    }
  }
}
```

Do not use field mappings like SQL column types. Treat them like SQL indexes: only add mappings for fields you need to search or query. Use `dynamic: false` at any level to allow {{es}} to store other fields without mapping them.

Never use `enabled: false` or `index: false` in your mappings. {{es}} does not support toggling these later, so you would not be able to query the data without migrating to a new field. Use `dynamic: false` instead, or omit the mapping for the field (it will still be stored, but not searchable or aggregatable).

*What NOT to do:*

```typescript
export const dashboardVisualization: SavedObjectsType = {
  name: 'dashboard_visualization',
  ...
  mappings: {
    properties: {
      metadata: {
        enabled: false,  // Don't do this
        properties: {
          created_by: { type: 'keyword' }
        }
      },
      description: {
        index: false,    // Don't do this
        type: 'text'
      }
    }
  }
};
```

*Preferred approach:*

```typescript
export const dashboardVisualization: SavedObjectsType = {
  name: 'dashboard_visualization',
  ...
  mappings: {
    properties: {
      dynamic: false,
      metadata: {
        properties: {
          // created_by can be stored but won't be queryable
        }
      },
    }
  }
};
```

This keeps all fields available for future querying if needed.

{{es}} has a default limit of 1000 fields per index, so add mappings carefully. Do not use `dynamic: true` on Saved Object types, as it can add an unbounded number of fields to the `.kibana` index.

## References [references]

Declare Saved Object references by adding `id`, `type`, and `name` to the `references` array.

```typescript
router.get(
  { path: '/some-path', validate: false },
  async (context, req, res) => {
    const object = await context.core.savedObjects.client.create(
      'dashboard',
      {
        title: 'my dashboard',
        panels: [
          { visualization: 'vis1' }, [1]
        ],
        indexPattern: 'indexPattern1'
      },
      { references: [
          { id: '...', type: 'visualization', name: 'vis1' },
          { id: '...', type: 'index_pattern', name: 'indexPattern1' },
        ]
      }
    )
    ...
  }
);
```

[1] Store the reference **name** (e.g. `vis1`) in the attribute (e.g. `dashboard.panels[0].visualization`), not the id. That way the reference stays correct when the id in the `references` array is updated.

## Initial model version [initial-model-version]

When you create a new Saved Object type, define an initial model version (version 1) that describes the current shape. The first version must be numbered 1, with no gaps in subsequent versions.

::::{note}
If the type's schema and mappings are still evolving and you need to iterate freely without CI failing on immutability constraints, use the WIP types mechanism. See [Work-in-progress Saved Object types](./validate.md#saved-objects-wip-types) for the available approaches.
::::

We recommend defining `create` and `forwardCompatibility` schemas that include **all** fields of your Saved Object type: those that appear in your mappings, as well as any non-indexed attributes you store. Exhaustive schemas give better validation on create and on read, and support safe rollbacks in Serverless.

:::{important}
Changes to a type’s `create` schema, specifically adding new required fields, can effectively become breaking changes for consumers using the deprecated Saved Objects HTTP CRUD APIs, because those APIs validate create and bulk-create payloads against this schema for that type.
:::

```ts
import { schema } from '@kbn/config-schema';
...
const schemaV1 = schema.object({
  foo: schema.string(),
  bars: schema.arrayOf(schema.string()),
});
...
const myType: SavedObjectsType = {
  ...
  modelVersions: {
    1: {
      changes: [],
      schemas: {
        create: schemaV1,
        forwardCompatibility: schemaV1.extends({}, { unknowns: 'ignore' }),
      },
    },
  },
  ...
};
```

If you are working with complex Saved Object types that have many properties—especially if these properties are defined dynamically or if you use external validation libraries like zod—you may provide partial schemas for the `create` and `forwardCompatibility` fields. At a minimum, you must include all properties defined in your ES mappings to help ensure data consistency, since these mappings are stored in the Elasticsearch index. In these situations, your partial schemas can be defined as shown below:

```ts
import { schema } from '@kbn/config-schema';
...
const schemaV1 = schema.object({
  mappedProperty1: schema.string(),
  mappedProperty2: schema.arrayOf(schema.string()),
  ...
  mappedPropertyN: schema.boolean(),
});
...
const myType: SavedObjectsType = {
  ...
  modelVersions: {
    1: {
      changes: [],
      schemas: {
        create: schemaV1.extends({}, { unknowns: 'allow' }),
        forwardCompatibility: schemaV1.extends({}, { unknowns: 'allow' }),
      },
    },
  },
  ...
};
```

## Opting out of the global Saved Objects APIs

You have two options, depending on how much control you need:

* **Full control** — Set your type as `hidden: true`. You handle all HTTP APIs and access; clients must explicitly include the type (e.g. via `includedHiddenTypes`).
* **Use client, custom HTTP** — Set `hiddenFromHttpApis: true` (and `hidden: false`). The type is available to the Saved Objects client as usual, but not exposed by the global Saved Objects HTTP APIs, so you can implement your own routes.

```ts
import { SavedObjectsType } from 'src/core/server';

export const foo: SavedObjectsType = {
  name: 'foo',
  hidden: false, [1]
  hiddenFromHttpApis: true, [2]
  namespaceType: 'multiple-isolated',
  mappings: { ... },
  modelVersions: { ... },
  ...
};
```

[1] Must be `false` to use `hiddenFromHttpApis`.
[2] Set to `true` to keep using the client while building your own HTTP API.
