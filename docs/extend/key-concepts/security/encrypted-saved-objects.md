---
navigation_title: "Encrypted Saved Objects"
description: "Configure your saved object types to secure sensitive data."
---

# Encrypted Saved Objects

## Overview

"Encrypted Saved Objects" (ESO) are [Saved Object types](../saved-objects.md) that have been registered with the Encrypted Saved Objects
Service (ESO Service) to specify which attributes should be protected (encrypted attributes) and which attributes, if any, should be present and unchanged
in order to decrypt the protected attributes ("Additional Authenticated Data", or AAD).

The ESO Service encrypts ESOs with the Encrypted Saved Object encryption key, a Kibana configuration setting. This setting must have a valid value for the ESO Service
to function. For more details see [Secure saved objects](https://www.elastic.co/guide/en/kibana/current/xpack-security-secure-saved-objects.html). When running in a
development environment, Kibana is always automatically configured with a static ESO encryption key of "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".
As the ESO encryption key is an optional setting, developers should rely on the `canEncrypt` function exposed by the ESO Plugin to decide whether they should
gracefully degrade any functionality dependent on ESOs, or reject functioning entirely.

Developers create and manage their Encrypted Saved Object types programmatically. This document will cover the basics.

## Registering an Encrypted Saved Object Type

### Should your Saved Object be an Encrypted Saved Object?

Most Saved Object types do not need to be registered as an encrypted type. Only register a Saved Object type with the ESO service if it contains sensitive
information. What sort of information is considered sensitive? Here is a non-inclusive list to help you make a determination:

- Credentials: usernames, passwords, API keys, access keys
- Personally identifiable information (PII): social security numbers or equivalent, back routing numbers, credit card numbers
- Other sensitive information: private endpoints, secrets, etc.

When in doubt, consult with the Kibana Security team (Application Experience/Platform Services/Security).

### Registration

To register a Saved Object type, the type must first be registered with the Saved Objects Repository. This can be achieved by calling the Saved Object Service's
`registerType` function. More information can be found in the [Register a new saved object type](../saved-objects/create.md) tutorial. Once the
Saved Object type is registered, use the ESO Plugin's `registerType` function, and provide an `EncryptedSavedObjectTypeRegistration` object that defines how the
object should be encrypted.

```ts
  export interface EncryptedSavedObjectTypeRegistration {
    readonly type: string; // The name of the Saved Object type. This must match the name used to register the type with Core's Saved Object Service.
    readonly attributesToEncrypt: ReadonlySet<string | AttributeToEncrypt>; // The attributes to protect (anything considered sensitive data)
    readonly attributesToIncludeInAAD?: ReadonlySet<string>; // The attributes to include in AAD (more on this below)
  }
```

`attributesToEncrypt` can be defined by either a string matching the name of the attribute, or an `AttributeToEncrypt` object, which enables you to specify when
an attribute's value should be allowed to be "dangerously exposed". There are generally three use cases to consider regarding the accessing of encrypted values:

1. By default, when ESOs are retrieved with any "standard" Saved Object Client APIs (e.g. get, find), decryption does not occur, and instead all encrypted
attributes are removed from the returned Saved Objects.
2. As a plugin developer, if you want to access decrypted attributes of ESOs, you should use the dedicated APIs exposed via the Encrypted Saved Objects Client (e.g.
`getDecryptedAsInternalUser`, `createPointInTimeFinderDecryptedAsInternalUser`). When using these functions, it is assumed that you will only consume decrypted
attributes internally and will not expose them to end users unless it is absolutely necessary. In this case, these APIs can serve as a way to conditionally expose
certain decrypted secrets in a controlled manner.
3. If decrypted attributes should be exposed to anyone who has access to the Saved Object itself, these ESO attributes should be registered with
`dangerouslyExposeValue: true`. This way, all "standard" Saved Object Client APIs will decrypt these corresponding encrypted attributes and return them to the
consumer. As the `dangerouslyExposeValue` name implies, the decision to expose decrypted attributes should be thoroughly evaluated and documented.

### AAD

AAD, or Additional Authenticated Data, is part of an "Authenticated Encryption" schema. AAD is an unencrypted string that is used during encryption and decryption
operations in addition to the supplied encryption key, to protect access to encrypted values. If AAD is used during encryption, it must be provided during decryption,
and must be an exact match to the AAD value used during encryption, otherwise decryption will fail. In this way, AAD is bound to any encrypted data. Typically, AAD
comprises data that could only be accessed by an authenticated user and either never changes, or only potentially changes when encrypted data changes.

For ESOs, AAD is constructed of key-value pairs composed of the Saved Object Descriptor and any attributes included in `attributesToIncludeInAAD` when the ESO is
registered. The Saved Object Descriptor consists of the object type, ID, and, if applicable, namespace (or space ID). The descriptor for space-agnostic types
(`namespaceType: 'agnostic'`), and multi-namespace types (`namespaceType: 'multiple-isolated'` and `namespaceType: 'multiple'`), will not include a namespace. Thus,
the Saved Object Descriptor for a Saved Object never changes.

```ts
  export interface SavedObjectDescriptor {
    readonly id: string;
    readonly type: string;
    readonly namespace?: string;
  }
```

Any time an ESO's AAD changes (when any attribute that is included in AAD changes), all encrypted attributes of that ESO must be re-encrypted to account for the new AAD.
This is one reason why it is important to carefully consider whether an attribute should be included in AAD. More on this below in
[What attributes should be included in AAD](./encrypted-saved-objects.md#what-attributes-should-be-included-in-aad)

#### Nested attributes

When an attribute is included in AAD, all of its properties, or subfields, are inherently included in AAD. When AAD is constructed as key-value pairs, the nested properties
of an attribute are all included in its value. In this way, AAD inclusion is hierarchical. If restructuring the attributes of an object to account for AAD hierarchical
inclusion is not possible or desireable, you can make use of more granular keys, e.g. `firstLevelAttribute.nestedFieldToInclude`.

#### What attributes should be included in AAD

Determining which attributes to include in AAD is not an exact science, however there are some basic guidelines.

Good candidates for attributes to INCLUDE in AAD are attributes that...
- have some association or relationship with an encrypted attribute (e.g. a configuration element of an ESO that reflects the shape of the encrypted data, the token type of a connector, the URL or TLS certificate for a monitor)
- have a value that will never change once an object is created (e.g the created date or created by user, the type of action or connector)

Good candidates for attributes to EXCLUDE from AAD are attributes that...

- the value can be changed by an end user, and is meant to be updated separately from encrypted data, and has no association to any of the encrypted or AAD attributes (e.g. the name or UI properties of an object, the email title for an action or alert)
- may not be present or populated, or populated algorithmically (e.g. any optional attributes, or calculated attributes like statistics or last updated time)
- may be removed from the object or refactored in the future (e.g. deprecated or soon-to-be deprecated attributes, experimental attributes)
- contain a large amount of data that can significantly slow down encryption and decryption, especially during bulk operations (e.g. large geo shape, arbitrary HTML document or image data)

There are additional considerations to make due to how version upgrades work in Serverless. These are covered in more detail in the
[Serverless Considerations](./encrypted-saved-objects.md#serverless-considerations) section, but the basics are:

- An attribute cannot be removed from AAD once it is included, unless it can be altogether removed from the object type, or refactored with a new name.
- An existing attribute cannot be added to AAD if it was not included in AAD when it was first defined and has already been populated.

When making the decision of which attributes to include in AAD, it is best to be conservative and only include attributes that the owning team is 100% confident
should be included.

## Caveats

### Partial Updates

Partial updates on ESOs are only possible if the changes are limited to unencrypted and non-AAD attributes. Any changes to an ESO's encrypted values or AAD-
included values requires re-encryption, which means the entire object must be provided when updating to avoid corrupting the object. If an ESO is corrupted by
a partial update, it will be effectively undecryptable. Currently, there is nothing preventing or limiting partial updates of ESOs (see open GitHub issue
[50256](https://github.com/elastic/kibana/issues/50256)), so this requires consistent diligence from developers utilizing ESOs.

### Migrations, Backward compatibility, and Serverless

With time you may need to change your ESO types. Model Versions allow developers to make versioned changes to Saved Object types, but an ESO type requires special
handling if there are changes to its encrypted attributes or attributes that are included in AAD - in both cases an object must be re-encrypted. For this case the
ESO Service exposes a Model Version wrapper function API `createModelVersion`. Similar in utility to its predecessor (`createMigration` - used with non-Model Version
Saved Object legacy migrations), `createModelVersion` provides a way to wrap a Model Version definition such that decryption and encryption occur automatically
during migration of any applicable ESOs.

In addition to a Model Version definition, `createModelVersion` also requires both an "input type" and "output type" `EncryptedSavedObjectTypeRegistration`
input parameters.

```ts
export interface CreateEsoModelVersionFnOpts {
  modelVersion: SavedObjectsModelVersion;
  shouldTransformIfDecryptionFails?: boolean;
  inputType: EncryptedSavedObjectTypeRegistration;
  outputType: EncryptedSavedObjectTypeRegistration;
}
```

The `inputType` parameter provides the necessary ESO registration definition for decrypting an ESO of the preceding Model Version prior to performing any transforms
defined by the Model Version. The `outputType` parameter provides the necessary ESO registration definition for encrypting an ESO once the transforms defined in the
Model Version have been completed. All of the Model Version transform functions ('unsafe_transform', 'data_backfill', 'data_removal'), are merged into a single
transform function for efficiency. This way, each ESO only needs to be decrypted and re-encrypted once to incorporate all of the changes defined in a Model Version.
The optional `shouldTransformIfDecryptionFails` parameter defines whether an ESO type should proceed with the Model Version changes even if decryption fails.

Some examples of `createModelVersion` can be found in the ESO Model Version example plugin (
[examples/eso_model_version_example/server/plugin.ts](https://github.com/elastic/kibana/blob/06fc22a0f15e692857ba689a7b0ddec91ed2dac2/examples/eso_model_version_example/server/plugin.ts))

For more information see our developer documentation for [Model Versions](../saved-objects/create.md).

#### Serverless Considerations

Changes to ESOs must be carefully considered due to how upgrades occur for Serverless projects. In Serverless, there is a "Zero Downtime" (ZDT) upgrade algorithm. This
means that both the latest and previous versions of Kibana may be running simultaneously. In regard to ESOs, this means that the previous version of Kibana may attempt
to access ESOs that have been migrated by the latest version of Kibana, and in order to do so, must be able to decrypt them successfully without having any knowledge of
the new Model Version definition or changes to the ESO's `EncryptedSavedObjectTypeRegistration`. Thus, if an ESO's AAD has changed due to the migration, the previous
version will not be able to decrypt it. It is critical that when changes are made to an ESO, that they either do not affect its AAD or are staged carefully in
subsequent Model Versions.

It is worth noting here that if a ESO's Model Version `forwardCompatibility` schema is set to drop unknown fields (when the `unknowns` option is set to `ignore`),
ESOs of this type will first be decrypted before the unknown fields are dropped. This more easily supports the hierarchical aspect of AAD-included attributes - when
subfields of an attribute are added or removed, the previous version of Kibana will still be able to successfully construct AAD and decrypt the object.

The table below offers some general guidance on how various changes could be supported (or not). Keep in mind that any time you are adding or removing attributes from
a Saved Object type, all related business logic for that type must be capable of gracefully and appropriately handling an object with or without the attribute in both
the current and previous version of Kibana. Some of the advice here is applicable to any Saved Object type migration.

| Change to ESO                                | Encrypted? | In AAD? | General Guidance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a new attribute                          | No         | No      | Implement a Model Version as needed. There is no need to wrap the Model Version with `createModelVersion` because AAD is unaffected. Implement a `forwardCompatibility` schema and ignore unknowns if the previous version of Kibana will not be able to tolerate the additional attribute.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Add a new attribute                          | No         | Yes     | This will require 2 Serverless release stages. `Release 1`: Add the attribute to the ESO's `attributesToIncludeInAAD`. Do not yet populate or use the new attribute. `Release 2`: Implement a Model Version and wrap it in a call to `createModelVersion`, providing the former `EncryptedSavedObjectTypeRegistration` as the input type, and the new `EncryptedSavedObjectTypeRegistration` as the output type. Implement a Model Version `backfill` change as needed. The attribute can safely be populated in this release.                                                                                                                                                                           |
| Add a new attribute                          | Yes        | N/A     | Implement a Model Version and wrap it in a call to `createModelVersion`. Implement Model Version changes as needed. Implement a `forwardCompatibility` schema and ignore unknowns if the previous version of Kibana will not be able to tolerate additions to the attribute.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Add an existing attribute to AAD             | No         | No->Yes | This is not currently supported. Existing attributes that are in use and populated with data cannot be added to AAD. The previous version of Kibana will never be able to successfully perform decryption in this case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Remove an existing attribute                 | No         | No      | Implement a Model Version as needed. There is no need to wrap the Model Version with `createModelVersion` because AAD is unaffected. If the previous version of Kibana will not be able to tolerate the missing attribute, this will require 2 Serverless release stages. `Release 1`: update all business logic to handle this type without the attribute that will be removed. `Release 2`: implement a Model Version as described.                                                                                                                                                                                                                                                                    |
| Remove an existing attribute                 | No         | Yes     | Implement a Model Version and wrap it in a call to `createModelVersion`, providing the former `EncryptedSavedObjectTypeRegistration` as the input type, and the new `EncryptedSavedObjectTypeRegistration` as the output type. The previous version of Kibana will be able to decrypt objects without this attribute, as attributes that are not present are never included when constructing AAD. If the previous version of Kibana will not be able to tolerate the missing attribute, this will require 2 Serverless release stages. `Release 1`: update all business logic to handle this type without the attribute that will be removed. `Release 2`: implement a Model Version as described.      |
| Remove an existing attribute                 | Yes        | N/A     | Implement a Model Version as needed. There is no need to wrap the Model Version with `createModelVersion` because AAD is unaffected. The previous version of Kibana will not throw an error if there is a missing encrypted attribute, but will add a debug-level log. If the previous version of Kibana will not be able to tolerate the missing attribute, this will require 2 Serverless release stages. `Release 1`: update all business logic to handle this type without the attribute that will be removed. `Release 2`: implement a Model Version as described.                                                                                                                                  |
| Modify an attribute (add or remove subfield) | No         | No      | Implement a Model Version as needed. There is no need to wrap the Model Version with `createModelVersion` because AAD is unaffected. If the previous version of Kibana will not be able to tolerate the changes, this will require 2 Serverless release stages. `Release 1`: update all business logic to handle this type with the modified attribute. `Release 2`: implement a Model Version as described.                                                                                                                                                                                                                                                                                             |
| Modify an attribute (add or remove subfield) | No         | Yes     | Implement a Model Version and wrap it in a call to `createModelVersion`, providing the former `EncryptedSavedObjectTypeRegistration` as the input type, and the new `EncryptedSavedObjectTypeRegistration` as the output type. The previous version of Kibana will be able to decrypt objects with the changed attribute, as all subfields are inherent in the value of AAD-included attributes when constructing AAD. If the previous version of Kibana will not be able to tolerate the attribute changes, this will require 2 Serverless release stages. `Release 1`: update all business logic to handle this type with the modified attribute. `Release 2`: implement a Model Version as described. |
| Modify an attribute (add or remove subfield) | Yes        | N/A     | Implement a Model Version and wrap it in a call to `createModelVersion`. Implement Model Version changes as needed. Even though AAD is unaffected, the objects will require decryption and re-encryption to be modified. If the previous version of Kibana will not be able to tolerate the attribute changes, this will require 2 Serverless release stages. `Release 1`: update all business logic to handle this type with the modified attribute. `Release 2`: implement a Model Version as described.                                                                                                                                                                                               |
| Change an existing attribute to be encrypted | No->Yes    | No/Yes  | This is not currently supported. The previous version of Kibana will not decrypt this attribute, and any business logic that utilizes the attribute will fail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Remove an attribute from the encrypted list  | Yes->No    | No      | This is not currently supported. The previous version of Kibana will always attempt to decrypt the attribute.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Remove an attribute from AAD inclusion       | No         | Yes->No | This is not currently supported. The previous version of Kibana will always use the attribute to construct AAD.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## A real world example

Let's examine one of the latest ESO types as of writing this document, the 'ad_hoc_run_params' type. We're using this type as an example, because it is one of the first
new ESO types to use a Model Version, and it is a fairly simple type (compared to other Model Version ESOs).

### Registering the Saved Object type

Below is the call to register the type.

```ts
  savedObjects.registerType({
    name: AD_HOC_RUN_SAVED_OBJECT_TYPE, // 'ad_hoc_run_params'
    indexPattern: ALERTING_CASES_SAVED_OBJECT_INDEX,
    hidden: true,
    namespaceType: 'multiple-isolated',
    mappings: {
      dynamic: false,
      properties: {
        apiKeyId: {
          type: 'keyword',
        },
        createdAt: {
          type: 'date',
        },
        end: {
          type: 'date',
        },
        rule: {
          properties: {
            alertTypeId: {
              type: 'keyword',
            },
            consumer: {
              type: 'keyword',
            },
          },
        },
        start: {
          type: 'date',
        },
      },
    },
    management: {
      importableAndExportable: false,
    },
    modelVersions: adHocRunParamsModelVersions,
  });
```
And here is what the Model Version and schemas look like:

```ts
  const adHocRunParamsModelVersions: CustomSavedObjectsModelVersionMap = {
    '1': {
      changes: [],
      schemas: {
        forwardCompatibility: rawAdHocRunParamsSchemaV1.extends({}, { unknowns: 'ignore' }),
        create: rawAdHocRunParamsSchemaV1,
      },
      isCompatibleWithPreviousVersion: () => true,
    },
  };

  const rawAdHocRunParamsSchema = schema.object({
    apiKeyId: schema.string(),
    apiKeyToUse: schema.string(),
    createdAt: schema.string(),
    duration: schema.string(),
    enabled: schema.boolean(),
    end: schema.maybe(schema.string()),
    rule: rawAdHocRunParamsRuleSchema,
    spaceId: schema.string(),
    start: schema.string(),
    status: rawAdHocRunStatus,
    schedule: schema.arrayOf(rawAdHocRunSchedule),
  });

  const rawAdHocRunParamsRuleSchema = schema.object({
    name: schema.string(),
    tags: schema.arrayOf(schema.string()),
    alertTypeId: schema.string(),
    params: schema.recordOf(schema.string(), schema.maybe(schema.any())),
    apiKeyOwner: schema.nullable(schema.string()),
    apiKeyCreatedByUser: schema.maybe(schema.nullable(schema.boolean())),
    consumer: schema.string(),
    enabled: schema.boolean(),
    schedule: schema.object({
      interval: schema.string(),
    }),
    createdBy: schema.nullable(schema.string()),
    updatedBy: schema.nullable(schema.string()),
    updatedAt: schema.string(),
    createdAt: schema.string(),
    revision: schema.number(),
  });

  const rawAdHocRunStatus = schema.oneOf([
    schema.literal('complete'),
    schema.literal('pending'),
    schema.literal('running'),
    schema.literal('error'),
    schema.literal('timeout'),
  ]);

  const rawAdHocRunSchedule = schema.object({
    interval: schema.string(),
    status: rawAdHocRunStatus,
    runAt: schema.string(),
  });
```

### Registering the type as an Encrypted Saved Object

```ts
  encryptedSavedObjects.registerType({
    type: AD_HOC_RUN_SAVED_OBJECT_TYPE, // 'ad_hoc_run_params' - the type name must match
    attributesToEncrypt: new Set(['apiKeyToUse']),
    attributesToIncludeInAAD: new Set(['rule', 'spaceId']),
  });
```

There is only one encrypted attribute, `apiKeyToUse`, which contains the API key that needs to be protected. The attributes to include in AAD consist of the `spaceId`,
and the `rule` definition. Since the object's namespace type is `'multiple-isolated'`, the space ID (or namespace) will not automatically be part of AAD by way of the
Saved Object Descriptor (see [AAD](./encrypted-saved-objects.md#aad)). In theory, the space id will never change for a
`'multiple-isolated'`, which makes it a reasonable candidate for an AAD field.

The `rule` attribute contains values related to the encrypted attribute `apiKeyToUse`, or that will never change:

```ts
  apiKeyOwner: schema.nullable(schema.string()),
  apiKeyCreatedByUser: schema.maybe(schema.nullable(schema.boolean())),
  createdBy: schema.nullable(schema.string()),
  createdAt: schema.string(),
```

The above are prime examples of the type of attributes that should comprise AAD. The `rule` attribute also contains some attributes that may change independently of the
encrypted attribute `apiKeyToUse`:

```ts
  enabled: schema.boolean(),
  schedule: schema.object({
    interval: schema.string(),
  }),
  updatedBy: schema.nullable(schema.string()),
  updatedAt: schema.string(),
  revision: schema.number(),
```

This is not a problem, but it is important to consider that a change to any of these attributes will require re-encryption of an object. It is worth considering the nature
of AAD hierarchical inclusion when structuring attributes for your saved objects. You can also utilize more granular keys when specifying which attributes to include in AAD,
e.g. `rule.apiKeyOwner`. For more information, see the [Nested attributes](./encrypted-saved-objects.md#nested-attributes) section of
this document.

Additionally, the owning team implemented a type to help manage partial updates. This is a great addition to ensure changes to the ESOs do not render them undecryptable.

```ts
export type AdHocRunAttributesNotPartiallyUpdatable = 'rule' | 'spaceId' | 'apiKeyToUse';
```

Usage:
```ts
export type PartiallyUpdateableAdHocRunAttributes = Partial<
  Omit<AdHocRunSO, AdHocRunAttributesNotPartiallyUpdatable>
>;

interface PartiallyUpdateAdHocRunSavedObjectOptions {
  refresh?: SavedObjectsUpdateOptions['refresh'];
  version?: string;
  ignore404?: boolean;
  namespace?: string; // only should be used  with ISavedObjectsRepository
}

// typed this way so we can send a SavedObjectClient or SavedObjectRepository
type SavedObjectClientForUpdate = Pick<SavedObjectsClient, 'update'>;

export async function partiallyUpdateAdHocRun(
  savedObjectsClient: SavedObjectClientForUpdate,
  id: string,
  attributes: PartiallyUpdateableAdHocRunAttributes,
  options: PartiallyUpdateAdHocRunSavedObjectOptions = {}
): Promise<void> {
  // ensure we only have the valid attributes that are not encrypted and are excluded from AAD
  const attributeUpdates = omit(attributes, [
    ...AdHocRunAttributesToEncrypt,
    ...AdHocRunAttributesIncludedInAAD,
  ]);
  const updateOptions: SavedObjectsUpdateOptions<AdHocRunSO> = pick(
    options,
    'namespace',
    'version',
    'refresh'
  );

  try {
    await savedObjectsClient.update<AdHocRunSO>(
      AD_HOC_RUN_SAVED_OBJECT_TYPE,
      id,
      attributeUpdates,
      updateOptions
    );
  } catch (err) {
    if (options?.ignore404 && SavedObjectsErrorHelpers.isNotFoundError(err)) {
      return;
    }
    throw err;
  }
}
```

## Making Changes

If you will be making changes to your ESOs, or creating new ESOs, the AppEx Platform Services Security team is available for consultation and assistance. Please reach
out to the Kibana Security Team with any questions or queries.

We also ask that you please tag us (@elastic/kibana-security) for review on any PRs related to ESOs.