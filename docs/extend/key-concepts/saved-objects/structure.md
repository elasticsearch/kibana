---
navigation_title: Structure
---

# Structure of a Saved Object type [saved-objects-structure]

This page describes the structure of a **Saved Object type** definition (the configuration you register), not the structure of Saved Object documents in the index. A type is defined by the `SavedObjectsType` interface. Its main parts are:

* **name** — The type name, used as the internal id and potentially as part of the URL path for the public Saved Objects HTTP API. Names should follow the API URL path convention and be written in snake_case.
* **indexPattern** — Optional. If defined, type instances are stored in the given index instead of the default one.
* **mappings** — The {{es}} field mapping definition for the type. Because multiple types can share the same index, each type's mappings are nested under a top-level field that matches the type name. See [Create: Mappings](create.md#_mappings) for details.
* **modelVersions** — A map of model versions that describe schema and data changes over time. Each version is identified by a single integer, starting at 1 with no gaps.

The `SavedObjectsType` interface (from `@kbn/core-saved-objects-server`) also includes other properties such as `namespaceType`, `hidden`, `hiddenFromHttpApis`, and optional hooks. Refer to the type definition in `src/core/packages/saved-objects/server/src/saved_objects_type.ts` for the full contract.

## Structure of a model version [structure-of-a-model-version]

Model versions are structured objects (not plain migration functions). They describe how a version behaves and what changed since the previous one.

A model version is defined by:

* **changes** — The list of changes applied in this version (mapping additions, backfills, data removal, etc.).
* **schemas** — Optional but recommended: `create` (validation on create/bulkCreate) and `forwardCompatibility` (used when reading documents from a newer version than the current Kibana instance, to strip unknown fields).

*Base example:*

```ts
const myType: SavedObjectsType = {
  name: 'test',
  modelVersions: {
    1: {
      changes: [
        {
          type: 'mappings_addition',
          addedMappings: {
            someNewField: { type: 'text' },
          },
        },
        {
          type: 'data_backfill',
          transform: someBackfillFunction,
        },
      ],
      schemas: {
        forwardCompatibility: fcSchema,
        create: createSchema,
      },
    },
  },
  // ...other mandatory properties
};
```

:::{note}
Having multiple changes of the same type for a given version is supported by design to allow merging different sources (to prepare for an eventual higher-level API).
:::

*Valid definition with multiple changes of the same type:*

```ts
const version1: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        someNewField: { type: 'text' },
      },
    },
    {
      type: 'mappings_addition',
      addedMappings: {
        anotherNewField: { type: 'text' },
      },
    },
  ],
};
```

### changes [_changes]

Describes the list of changes applied during this version. This replaces the old migration system and allows defining when a version adds new mappings, mutates documents, or other type-related changes.

The current types of changes are:

#### mappings_addition [_mappings_addition]

Defines new mappings introduced in this version.

*Example:*

```ts
const change: SavedObjectsModelMappingsAdditionChange = {
  type: 'mappings_addition',
  addedMappings: {
    newField: { type: 'text' },
    existingNestedField: {
      properties: {
        newNestedProp: { type: 'keyword' },
      },
    },
  },
};
```

:::{note}
When adding mappings, the root `type.mappings` must also be updated accordingly (as with the previous migration system).
:::

#### mappings_deprecation [_mappings_deprecation]

Flags mappings as no longer used and ready to be removed.

*Example:*

```ts
let change: SavedObjectsModelMappingsDeprecationChange = {
  type: 'mappings_deprecation',
  deprecatedMappings: ['someDeprecatedField', 'someNested.deprecatedField'],
};
```

:::{note}
It is currently not possible to remove fields from an existing index's mapping (without reindexing). The mappings flagged here will not be deleted for now, but this should still be used so the system can clean them once upstream ({{es}}) allows it.
:::

#### data_backfill [_data_backfill]

Populates fields (indexed or not) added in the same version.

*Example:*

```ts
let change: SavedObjectsModelDataBackfillChange = {
  type: 'data_backfill',
  transform: (document) => {
    return { attributes: { someAddedField: 'defaultValue' } };
  },
};
```

:::{note}
This type of change should only be used to backfill newly introduced fields.
:::

#### data_removal [_data_removal]

Removes data (unsets fields) from all documents of the type.

*Example:*

```ts
let change: SavedObjectsModelDataRemovalChange = {
  type: 'data_removal',
  removedAttributePaths: ['someRootAttributes', 'some.nested.attribute'],
};
```

:::{note}
Due to backward compatibility, field usage must be stopped in a prior release before actual data removal (in case of rollback). See the field removal example in [Update](update.md#removing-an-existing-field).
:::

#### unsafe_transform [_unsafe_transform]

Executes an arbitrary transformation function.

*Example:*

```ts
const transformFn: SavedObjectModelUnsafeTransformFn<BeforeType, AfterType> = (
  doc: SavedObjectModelTransformationDoc<BeforeType>
) => {
  const attributes: AfterType = {
    ...doc.attributes,
    someAddedField: 'defaultValue',
  };

  return { document: { ...doc, attributes } };
};

const change: SavedObjectsModelUnsafeTransformChange = {
  type: 'unsafe_transform',
  transformFn: (typeSafeGuard) => typeSafeGuard(transformFn),
};
```

:::{note}
Such transformations are potentially unsafe because the migration system has no knowledge of the operations executed on the documents. Use them only when no other change type covers your needs. Reach out to the development team if you think you need this.
:::

### schemas [_schemas]

Schemas are used to validate or convert Saved Object documents at various stages of their lifecycle.

#### forwardCompatibility [_forwardcompatibility]

Used for inter-version compatibility. When retrieving a document from the index, if the document's version is higher than the latest version known to the {{kib}} instance, the document is passed through the `forwardCompatibility` schema of the associated model version.

These conversions should not assert the data; they should only strip unknown fields to convert the document to the shape of that version. The schema should keep all known fields and remove unknown ones without throwing.

Forward compatibility can be implemented in two ways:

1. **Using `config-schema`** — Use `schema.object(..., { unknowns: 'ignore' })` so additional fields are evicted without error.
2. **Using a plain function** — Return an object that only includes known fields (e.g. with `pick(attributes, knownFields)`).

:::{note}
:applies_to: stack: ga 9.3
Starting with {{kib}} 9.3.0, all new model versions must include a `forwardCompatibility` schema to ensure that if a Serverless instance is rolled back, the Saved Objects APIs still return data in the pre-upgrade format.
:::

#### create [_create]

Replaces the old `SavedObjectType.schemas` definition. It is a `@kbn/config-schema` object-type schema used to validate document attributes during `create` and `bulkCreate` operations. New model versions must include both `create` and `forwardCompatibility`; see [Validate](validate.md#saved-object-type-validation-rules).

For implementation examples, see [Update: Use-case examples](update.md#use-case-examples).
