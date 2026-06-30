---
navigation_title: Validate type changes
---

# Validate changes in Saved Object types [saved-objects-validate]

This page covers testing model versions and ensuring safe **Saved Object type** definition changes. For troubleshooting validation failures, see [Troubleshooting](troubleshooting.md). It applies to type definitions (the code you register), not to validating Saved Object instances at runtime.

## Testing model versions [_testing_model_versions]

Model version definitions are more structured than legacy migration functions. The `@kbn/core-test-helpers-model-versions` package provides utilities to test the behavior of model versions and their transformations.

### Tooling for unit tests [_tooling_for_unit_tests]

#### Model version test migrator [_model_version_test_migrator]

The `createModelVersionTestMigrator` helper creates a test migrator that applies the same transformations the migration algorithm uses during an upgrade.

**Example:**

```ts
import {
  createModelVersionTestMigrator,
  type ModelVersionTestMigrator
} from '@kbn/core-test-helpers-model-versions';

const mySoTypeDefinition = someSoType();

describe('mySoTypeDefinition model version transformations', () => {
  let migrator: ModelVersionTestMigrator;

  beforeEach(() => {
    migrator = createModelVersionTestMigrator({ type: mySoTypeDefinition });
  });

  describe('Model version 2', () => {
    it('properly backfill the expected fields when converting from v1 to v2', () => {
      const obj = createSomeSavedObject();

      const migrated = migrator.migrate({
        document: obj,
        fromVersion: 1,
        toVersion: 2,
      });

      expect(migrated.properties).toEqual(expectedV2Properties);
    });

    it('properly removes the expected fields when converting from v2 to v1', () => {
      const obj = createSomeSavedObject();

      const migrated = migrator.migrate({
        document: obj,
        fromVersion: 2,
        toVersion: 1,
      });

      expect(migrated.properties).toEqual(expectedV1Properties);
    });
  });
});
```

### Tooling for integration tests [_tooling_for_integration_tests]

With a real {{es}} cluster you can test Saved Object documents in a production-like way and simulate two {{kib}} instances with different model versions.

#### Model version test bed

Use `createModelVersionTestBed` to set up a full test bed: start/stop {{es}} and run migrations between the versions under test.

**Example:**

```ts
import {
  createModelVersionTestBed,
  type ModelVersionTestKit
} from '@kbn/core-test-helpers-model-versions';

describe('myIntegrationTest', () => {
  const testbed = createModelVersionTestBed();
  let testkit: ModelVersionTestKit;

  beforeAll(async () => {
    await testbed.startES();
  });

  afterAll(async () => {
    await testbed.stopES();
  });

  beforeEach(async () => {
    testkit = await testbed.prepareTestKit({
      savedObjectDefinitions: [{
        definition: mySoTypeDefinition,
        modelVersionBefore: 1,
        modelVersionAfter: 2,
      }]
    })
  });

  afterEach(async () => {
    if(testkit) {
      await testkit.tearDown();
    }
  });

  it('can be used to test model version cohabitation', async () => {
    const repositoryV1 = testkit.repositoryBefore;
    const repositoryV2 = testkit.repositoryAfter;

    await repositoryV1.create(someAttrs, { id });
    const v2docReadFromV1 = await repositoryV2.get('my-type', id);
    expect(v2docReadFromV1.attributes).toEqual(whatIExpect);
  });
});
```

**Limitations:**

The test bed only instantiates the parts of Core needed for the two SO repositories and does not load all plugins:

* No extensions (no security, encryption, or spaces).
* All SO types use the same SO index.

## Ensuring safe Saved Object type changes [ensuring-safe-saved-objects-type-changes]

Saved Object type definitions drive migrations and the shape of the Saved Objects API. Changes to them must meet strict safety criteria to avoid:

* Data corruption.
* Unsupported mapping changes.
* Rollback failures.

Validation runs automatically in CI on `pull_request` and `on-merge`. You can also run it locally.

### Manually running the type check

Run the check from your PR branch:

```shell
# Get your current commit
git log -n 1

# Get the merge-base with main (or your base branch)
git merge-base -a <lastCommitId> main

# Run the script (validates against that merge-base)
node scripts/check_saved_objects --baseline <mergeBase> --fix
```

If you get validation errors, see [Troubleshooting](troubleshooting.md).

### Saved Object type validation rules

#### Immutability constraints

* **Existing model versions/migrations** — Once defined, they cannot be changed or deleted. This keeps environments that have already upgraded consistent with those that have not.
* **Deleting versions** — You cannot delete model versions; you can only add new ones.

#### Versioning requirements

* **Consecutive versions** — Model versions must be consecutive integers starting at 1. No gaps.
* **One model version per PR** — A single PR cannot add more than one model version for the same type. Multi-step rollouts must ship in separate Serverless releases. The `on-merge` pipeline compares against the current Serverless release.
* **No new legacy migrations** — Do not add new versions via the deprecated `migrations` property.

#### Mapping and schema compatibility

* **Mapping changes need a new version** — Any change to mappings must be reflected in a new model version (e.g. with `mappings_addition`).
* **Backward compatible mappings** — Updates must be done in place without reindexing. {{es}} does not allow breaking changes such as removing fields or changing field types (e.g. integer to text).
* **Mandatory schemas** — New model versions must include both `create` and `forwardCompatibility` schemas.

### Ensuring robust serverless rollbacks [ensuring-robust-serverless-rollbacks]

For Serverless rollback guarantees, the validation script requires **data fixtures** for any updated Saved Object types. These represent the state before and after the upgrade.

The script runs:

1. Simulate Upgrade → Simulate Rollback → Simulate Second Upgrade.
2. At each step it reads documents via the SavedObjectsRepository.
3. It checks that the document shape matches the corresponding fixture.

Providing fixtures and defining mandatory `create` and `forwardCompatibility` schemas for each new model version allows type owners to validate both migration and rollback behavior.

### Using matchers for auto-generated values in fixtures [fixture-matchers]

Some fields in migrated documents — such as IDs generated by `uuidv4` or `uuidv5` — cannot be hardcoded in fixture files because they change with every baseline run. For these cases, a fixture document can use a special `{ "$match": "<type>" }` marker object in place of a literal value:

```json
{
  "tabs": [
    {
      "id": { "$match": "uuid" },
      "label": "Untitled",
      "attributes": { ... }
    }
  ]
}
```

Instead of requiring an exact value, the check asserts that the actual field satisfies the declared type constraint. The supported matchers are:

| Marker | Asserts |
|---|---|
| `{ "$match": "uuid" }` | A RFC 4122 UUID string |
| `{ "$match": "string" }` | Any string |
| `{ "$match": "number" }` | Any number |
| `{ "$match": "boolean" }` | Any boolean |

Matchers compose naturally with the rest of the fixture: you can use them at any depth inside arrays or objects, mixing them freely with exact literal values.

When the check fails and reports a diff, fields covered by a passing matcher are omitted from the diff output (they are silently substituted with the actual value). Fields covered by a failing matcher appear as `<any uuid>`, `<any string>`, etc., so the diff still points directly at the real problem.

## Work-in-progress Saved Object types [saved-objects-wip-types]

If you are building a new Saved Object type whose schema and mappings are still evolving, the standard immutability constraints can slow down early iteration. The WIP types mechanism lets you iterate freely during development and then graduate the type to full constraints when it is production-ready.

There are two approaches depending on how the owning plugin is deployed.

### Scenario A — Plugin disabled by default; type registered unconditionally [saved-objects-wip-types-scenario-a]

Use this when the feature and its plugin are only enabled in dedicated dev or QA environments and are not deployed to production or Serverless by default.

**Workflow:**

1. Open a PR adding the type name to `src/core/packages/saved-objects/server-internal/wip_types.json` (reviewed by `@elastic/kibana-core`). This file is the gate that Core team reviews.

2. Add the type name to `migrations.allowWipTypes` in every `kibana.yml` where the plugin is enabled. Kibana will fail to start if the type is registered but absent from this list:

   ```yaml
   migrations.allowWipTypes:
     - my_new_type
   ```

3. Iterate freely. The CI SO check treats the type as perpetually new on every PR — the same checks that apply when first introducing a type always apply, but history-based immutability constraints (e.g. "existing model versions cannot change") are never enforced.

4. **Graduation**: when the type is stable and production-ready, open a PR removing it from `wip_types.json` and from all `migrations.allowWipTypes` entries. Full immutability constraints apply from that point forward.

### Scenario B — Plugin enabled everywhere; type registered conditionally [saved-objects-wip-types-scenario-b]

Use this when the plugin is always enabled (including in Serverless production), but the SO type should only be registered when a feature flag or configuration option is turned on.

The `no_conditional_saved_object_type_registration` ESLint rule normally forbids conditional registration to avoid migration ON/OFF conflicts. For WIP types, suppress it with an inline comment and a TODO to remove it at graduation:

```typescript
if (config.featureFlags.myFeatureEnabled) {
  // eslint-disable-next-line @kbn/eslint/no_conditional_saved_object_type_registration -- TODO: remove once my_new_type graduates from WIP
  core.savedObjects.registerType(myNewType);
}
```

Because the type is only registered when the flag is on, it is never registered in environments where the flag is off — so the CI SO check never sees it, and no `wip_types.json` entry or `migrations.allowWipTypes` config is needed.

**Graduation**: remove the conditional and the ESLint suppression. The type becomes unconditionally registered and is subject to full SO type constraints from that point forward.
