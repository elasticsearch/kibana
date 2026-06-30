---
navigation_title: Update a type
---

# Update a Saved Object type [saved-objects-update]

This page describes how to upgrade existing **Saved Object type** definitions: transitioning legacy types to model versions and adding new model versions to types that already use them. It does not cover updating Saved Object instances via the client.

## Version numbering

Model versions are identified by a single integer. The first version must be 1; each new version increments by one with no gaps.

*Valid:*

```ts
const myType: SavedObjectsType = {
  name: 'test',
  modelVersions: {
    1: modelVersion1,
    2: modelVersion2,
  },
  // ...other mandatory properties
};
```

*Invalid:*

```ts
const myType: SavedObjectsType = {
  name: 'test',
  modelVersions: {
    2: modelVersion2, // invalid: first version must be 1
    4: modelVersion3, // invalid: skipped version 3
  },
  // ...other mandatory properties
};
```

## Transitioning legacy Saved Object types

If you are updating a legacy Saved Object type that does not yet use model versions, you must establish a baseline first. This is a two-step process so that Serverless can roll back safely if needed.

### The initial version PR

The first PR must define the **current, existing shape** of the type's documents.

* **No mapping changes** — Do not change any existing mappings; only add the required schemas.
* **Deploy first** — This PR must be merged and released in Serverless before you open a second PR with your real changes.

Please refer to [Create: Initial model version](create.md#initial-model-version) for more details on how to define the initial model version.

If your type was using the legacy `migrations` property, and it was already defining `schemas`, you can reuse the latest schema as the initial model version.


## Upgrading a type that already has model versions

When the type already defines `modelVersions`, add a **new** model version for your change. Do not modify existing versions. The new version must be the next consecutive integer and must include the appropriate `changes` and updated `create` and `forwardCompatibility` schemas. See [Structure: Structure of a model version](structure.md#structure-of-a-model-version) for the available change types and schema options.

You must add a new model version whenever mappings change. The migration logic uses the presence of a new model version (and its `mappings_addition` or other mapping-related changes) to determine that it needs to update the index mappings for that type.

See the use-case examples below for adding fields, backfilling defaults, and removing fields.

## Use-case examples

These examples show migration scenarios supported by the model version system.

:::{note}
More complex scenarios (e.g. field mutation by copy/sync) can be implemented with the current tooling, but without higher-level support from Core, much of the sync and compatibility work falls on the type owner and is not documented here.
:::

### Adding a non-indexed field without default value [_adding_a_non_indexed_field_without_default_value]

Type is at model version 1 with two indexed fields: `foo` and `bar`. You want to add a non-indexed field `dolly` with no default.

Version 1:

```ts
const myType: SavedObjectsType = {
  name: 'test',
  namespaceType: 'single',
  modelVersions: {
    1: {
      changes: [],
      schemas: {
        forwardCompatibility: schema.object(
          { foo: schema.string(), bar: schema.string() },
          { unknowns: 'ignore' }
        ),
        create: schema.object(
          { foo: schema.string(), bar: schema.string() },
        )
      },
    },
  },
  mappings: {
    properties: {
      foo: { type: 'text' },
      bar: { type: 'text' },
    },
  },
};
```

Add version 2 with no `changes`; only extend the schemas to include `dolly`:

```ts
let modelVersion2: SavedObjectsModelVersion = {
  changes: [],
  schemas: {
    forwardCompatibility: schema.object(
      { foo: schema.string(), bar: schema.string(), dolly: schema.string() },
      { unknowns: 'ignore' }
    ),
    create: schema.object(
      { foo: schema.string(), bar: schema.string(), dolly: schema.string() },
    )
  },
};
```

### Adding an indexed field without default value [_adding_an_indexed_field_without_default_value]

Same as above but `dolly` must be indexed. Add a `mappings_addition` change and update the root `mappings`:

```ts
let modelVersion2: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        dolly: { type: 'text' },
      },
    },
  ],
  schemas: {
    forwardCompatibility: schema.object(
      { foo: schema.string(), bar: schema.string(), dolly: schema.string() },
      { unknowns: 'ignore' }
    ),
    create: schema.object(
      { foo: schema.string(), bar: schema.string(), dolly: schema.string() },
    )
  },
};

// And update root mappings:
mappings: {
  properties: {
    foo: { type: 'text' },
    bar: { type: 'text' },
    dolly: { type: 'text' },
  },
},
```

### Adding an indexed field with a default value [_adding_an_indexed_field_with_a_default_value]

Add both a `data_backfill` change and a `mappings_addition` change:

```ts
let modelVersion2: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'data_backfill',
      transform: (document) => {
        return { attributes: { dolly: 'default_value' } };
      },
    },
    {
      type: 'mappings_addition',
      addedMappings: {
        dolly: { type: 'text' },
      },
    },
  ],
  schemas: {
    forwardCompatibility: schema.object(
      { foo: schema.string(), bar: schema.string(), dolly: schema.string() },
      { unknowns: 'ignore' }
    ),
    create: schema.object(
      { foo: schema.string(), bar: schema.string(), dolly: schema.string() },
    )
  },
};
```

Update the root `mappings` to include `dolly` as in the previous example.

:::{note}
For a non-indexed field with a default, use only the `data_backfill` change (no `mappings_addition` or root mapping update).
:::

### Adding a new, searchable field [adding-a-new-searchable-field]

Adding a new field that will be used by business logic for search/filter/aggregation must be done in two releases to preserve rollback safety:

1. **Release N** — Add the field mapping and a new model version (plus `data_backfill` if needed), but do **not** depend on the field in business logic yet.
2. **Release N+1** — Update business logic to read/search/filter using the field.

If business logic starts depending on the field in the same release where it is introduced, rollback windows can hit partially migrated data and lead to inconsistent behavior.

*Version N — introduce the field and migration changes:*

```ts
let modelVersion2: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'data_backfill',
      transform: (document) => {
        return { attributes: { searchable_field: 'default_value' } };
      },
    },
    {
      type: 'mappings_addition',
      addedMappings: {
        searchable_field: { type: 'keyword' },
      },
    },
  ],
  schemas: {
    forwardCompatibility: schema.object(
      { foo: schema.string(), bar: schema.string(), searchable_field: schema.string() },
      { unknowns: 'ignore' }
    ),
    create: schema.object(
      { foo: schema.string(), bar: schema.string(), searchable_field: schema.string() },
    )
  },
};

// And update root mappings:
mappings: {
  properties: {
    foo: { type: 'text' },
    bar: { type: 'text' },
    searchable_field: { type: 'keyword' },
  },
},
```

*Version N+1 — start relying on the field in business logic:*

```ts
const result = await soClient.find({
  type: 'my_type',
  filter: 'my_type.attributes.searchable_field: "default_value"',
});
```

### Removing an existing field [removing-an-existing-field]

Removing a field must be done in two releases to preserve rollback safety:

1. **Release N** — Application still uses the field.
2. **Release N+1** — Application stops using the field; remove it from `forwardCompatibility` and `create` schemas so it is no longer returned, but do **not** delete data yet.
3. **Release N+2** — Add a `data_removal` change to delete the field from documents.

If you deleted the data in N+1 and then rolled back to N, the old version would expect the field and data would be lost.

*Version N+1 — stop returning the field:*

```ts
let modelVersion2: SavedObjectsModelVersion = {
  changes: [],
  schemas: {
    forwardCompatibility: schema.object(
      { kept: schema.string() }, // removed no longer in schema
      { unknowns: 'ignore' }
    ),
    create: schema.object(
      { kept: schema.string() },
    )
  },
};
```

*Version N+2 — remove data:*

```ts
let modelVersion3: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'data_removal',
      removedAttributePaths: ['removed']
    }
  ],
  schemas: {
    forwardCompatibility: schema.object(
      { kept: schema.string() },
      { unknowns: 'ignore' }
    ),
    create: schema.object(
      { kept: schema.string() },
    )
  },
};
```

The root `mappings` can still list the removed field ({{es}} does not support removing mapping fields without reindexing). You can flag it with a `mappings_deprecation` change so it can be cleaned up when supported.