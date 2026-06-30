---
navigation_title: Troubleshooting validation
---

This page helps you resolve failures from the Saved Object type validation check in CI and at {{kib}} startup.

# CI is failing for a PR [saved-objects-troubleshooting-ci]

When the *Check changes in saved objects* CI step fails, a comment is posted directly on the PR. Each violation is grouped by SO type and shows a **rule ID**, a message, a fix hint, and a link to the relevant docs section:

```markdown
### `<soType>`
- **[rule-id]** Message. _Fix:_ Fix hint. ([docs](link))
```

You can reproduce all findings locally:

```shell
# Get the merge-base with main (or the base branch of your PR)
git merge-base HEAD main

# Run the check. Add "--fix" to auto-generate missing fixture templates
node scripts/check_saved_objects --baseline <mergeBase> --fix
```

Use the rule IDs below to identify the problem and the appropriate fix.

## Existing type rules

### `existing-type/mutated-migrations` [existing-type-mutated-migrations]

**Problem:** The deprecated `migrations` property has been modified. It must remain unchanged so that old documents can still be imported.

**Fix:** Revert any changes to `<type>.migrations`. If you need to change migration behavior, add a new model version instead.

### `existing-type/mutated-existing-model-version` [existing-type-mutated-model-version]

**Problem:** A structural change was made to an already-defined model version (mappings, changes block, or similar). Existing model versions are immutable once merged.

**Scenario 1:** You are fixing a bug in an existing model version. Once it is released (for example, in Serverless), other nodes may already be running against it. Add a new model version instead of editing the existing one.

**Scenario 2:** You only added one new version but CI still reports a mutation. Validation uses two baselines: the PR merge-base and the **current Serverless release**. If the Serverless release includes a version that differs from your local copy, the check sees a mutation. Rebase onto the latest `main` to pick up any updates.

**Fix:** Revert the structural change and add a new model version to capture the update.

### `existing-type/schema-breaking-changes` [existing-type-schema-breaking-changes]

**Problem:** A breaking schema change was detected in an existing model version. For example, a field was removed, its type changed, or an optional field was made required. These changes would break documents already stored against that version.

**Fix:** Revert the breaking schema change. If the update is necessary, introduce it in a new model version.

### `existing-type/schema-undiffable-legacy-hash` [existing-type-schema-undiffable]

**Problem:** A schema-only change was detected in an existing model version, but the baseline snapshot stores the schema as a legacy SHA-256 hash rather than a structured object. Detailed diffing is not possible against the old format.

**Fix:** Rebase onto the latest `main` to obtain a baseline snapshot with the new format, then re-run the check.

### `existing-type/deleted-model-versions` [existing-type-deleted-model-versions]

**Problem:** One or more model versions were deleted from the type. Your branch may be behind the current Serverless baseline and missing recent versions.

**Fix:** Restore the missing model version(s). Existing model versions cannot be deleted.

### `existing-type/too-many-new-model-versions` [existing-type-too-many-model-versions]

**Problem:** A single PR is adding more than one model version for the same type. Only one new model version per type per PR is allowed to support safe, incremental Serverless rollouts.

**Scenario 1:** You have several unrelated changes that each require a model version. Ship them in separate PRs.

**Scenario 2:** You only added one version but CI still reports two. Validation uses two baselines: your PR merge-base and the **current Serverless release**. If the Serverless release was recently rolled back, the "current release" baseline may make your branch look like it defines two new versions. Wait for the release state to normalize, or contact the {{kib}} Core team.

**Fix:** Split the change so that each PR adds exactly one new model version.

### `existing-type/mappings-changed-without-new-model-version` [existing-type-mappings-without-model-version]

**Problem:** The type's mappings were modified without adding a new model version. Mapping changes must be declared in a model version so the migration algorithm can keep the index up to date.

**Fix:** Add a new model version with a `mappings_addition` change block and the corresponding `schemas.forwardCompatibility` (and `schemas.create` if applicable).

### `existing-type/new-mappings-not-in-model-version` [existing-type-new-mappings-not-in-model-version]

**Problem:** The new model version's `mappings_addition` change does not include all of the newly introduced mapping fields.

**Fix:** Add the missing fields to the `mappings_addition` change in the new model version.

### `existing-type/removed-mapped-properties` [existing-type-removed-mapped-properties]

**Problem:** One or more mapped properties were removed from the type. {{es}} does not allow removing fields from a live index without a full reindex.

**Fix:** Restore the removed mapped properties. To stop writing to a field, leave it in the mappings but stop populating it from application code.

### `existing-type/virtual-version-downgrade` [existing-type-virtual-version-downgrade]

**Problem:** The type's computed virtual version is lower than it was in the baseline. This is usually caused by removing a model version.

**Fix:** Restore the missing model version(s) so the virtual version is at least as high as the baseline.

### `existing-type/keyword-missing-ignore-above` [existing-type-keyword-ignore-above]

**Problem:** A newly introduced `keyword` or `flattened` mapping field is missing an `ignore_above` limit. Without it, {{es}} silently drops strings that exceed the default limit.

**Fix:** Add `ignore_above: 1024` (or another appropriate limit) to each affected field.

### `existing-type/invalid-name-title-field-type` [existing-type-invalid-name-title]

**Problem:** A `name` or `title` field in the type's mappings uses a type other than `text`. The Saved Objects Search API relies on these fields being `text` for full-text search.

**Fix:** Change the field mapping type to `text`. If the field already exists in production, this requires a full reindex.

## New type rules

### `new-type/missing-initial-model-version` [new-type-missing-initial-model-version]

**Problem:** A brand-new SO type does not define model version `1`.

**Fix:** Add a `modelVersions` entry with key `1` containing `schemas.create` and `schemas.forwardCompatibility`.

### `new-type/legacy-migrations` [new-type-legacy-migrations]

**Problem:** A new SO type is using the deprecated `migrations` property.

**Fix:** Remove `migrations` and replace it with `modelVersions`, starting at version `1`.

### `new-type/keyword-missing-ignore-above` [new-type-keyword-ignore-above]

Same cause and fix as [`existing-type/keyword-missing-ignore-above`](#existing-type-keyword-ignore-above), but for a brand-new type.

### `new-type/invalid-name-title-field-type` [new-type-invalid-name-title]

Same cause and fix as [`existing-type/invalid-name-title-field-type`](#existing-type-invalid-name-title), but for a brand-new type.

## Model version rules

These rules apply to both new and existing types.

### `model-version/initial-must-be-schema-only` [model-version-initial-schema-only]

**Problem:** The initial model version (`1`) of a new type defines a `changes` block (for example, `mappings_addition`). For backward-compatibility reasons, the first model version can only contain `schemas`.

**Fix:** Remove `changes` from model version `1` and keep only `schemas`.

### `model-version/numbers-must-be-consecutive` [model-version-consecutive]

**Problem:** Model version keys must be consecutive positive integers starting at `1`. Either a key is not a number or there is a gap in the sequence.

**Fix:** Rename version keys to form an unbroken sequence: `1`, `2`, `3`, …

### `model-version/missing-schemas` [model-version-missing-schemas]

**Problem:** A new model version is missing the `schemas` definition entirely.

**Fix:** Add a `schemas` object with both `create` and `forwardCompatibility` sub-schemas.

### `model-version/missing-forward-compatibility` [model-version-missing-fwd-compat]

**Problem:** A new model version is missing `schemas.forwardCompatibility`.

**Fix:** Add `schemas.forwardCompatibility` to the model version.

### `model-version/missing-create-schema` [model-version-missing-create]

**Problem:** A new model version is missing `schemas.create`.

**Fix:** Add `schemas.create` to the model version.

### `model-version/mappings-not-in-schema` [model-version-mappings-not-in-schema]

**Problem:** The type has mapping fields that are not present in the latest model version's `create` schema. All mapped fields must be covered by the schema.

**Fix:** Add the missing fields to the `create` schema of the latest model version.

### `model-version/mapping-index-false` [model-version-mapping-index-false]

**Problem:** A new mapping field uses `index: false`. This option cannot be reverted without a full reindex, making it a risky long-term commitment.

**Fix:** Use `dynamic: false` on the parent object to prevent {{es}} from indexing unknown sub-fields, or omit the mapping entirely for fields that do not need to be searchable.

### `model-version/mapping-enabled-false` [model-version-mapping-enabled-false]

**Problem:** A new mapping field uses `enabled: false`. Like `index: false`, this cannot be undone without a reindex.

**Fix:** Use `dynamic: false` on the parent object instead, or omit the mapping entirely.

### `model-version/fixture-missing` [model-version-fixture-missing]

**Problem:** The type has a new model version but the required rollback test fixtures are missing. Fixtures are needed to validate upgrade and rollback behavior during CI.

**Fix:** Run `node scripts/check_saved_objects --baseline <mergeBase> --fix` to generate the fixture template, then populate it with representative sample documents. See [Ensuring robust serverless rollbacks](validate.md#ensuring-robust-serverless-rollbacks).

### `model-version/fixture-invalid` [model-version-fixture-invalid]

**Problem:** A fixture file exists but its contents are malformed. The file must be a JSON object with one key per version (`<previousVersion>` and `<newVersion>`), each holding a non-empty array of documents.

**Fix:** Correct the fixture file so it matches the expected format, or delete it and re-run with `--fix` to regenerate a valid template.

## Document rules

### `documents/fixture-mismatch` [documents-fixture-mismatch]

**Problem:** During the automated rollback test, a document read from {{es}} did not match any entry in the fixture. Either the migration produced an unexpected document shape, or the fixture is out of date.

**Fix:** Update the fixture to match the actual document structure produced by the migration, or fix the migration transformation to produce the expected output.

## Removed type rules

### `removed-type/registry-needs-update` [removed-type-registry-needs-update]

**Problem:** A Saved Object type is no longer registered but `removed_types.json` has not been updated to record the removal.

**Fix:** Run `node scripts/check_saved_objects --baseline <mergeBase> --fix`, then commit the updated `removed_types.json`. See [Delete](delete.md) for how to get the merge-base.

### `removed-type/name-reused` [removed-type-name-reused]

**Problem:** The type name was previously removed and recorded in `removed_types.json`. Type names in that file are permanently reserved and cannot be reused.

**Fix:** Choose a different name for the new type.

# Kibana fails to start: WIP type not in `allowWipTypes` [saved-objects-troubleshooting-wip-startup]

```shell
Kibana cannot start because the following WIP saved object types are registered but not listed in 'migrations.allowWipTypes': [<soType>].
```

**Problem:** A type listed in `wip_types.json` is registered by a plugin but has not been explicitly allowed in the Kibana configuration.

**Fix:** Add the type name to `migrations.allowWipTypes` in `kibana.yml` for every environment where the plugin is enabled:

```yaml
migrations.allowWipTypes:
  - <soType>
```

If you did not intend to register a WIP type, check whether the plugin should be turned off in this environment. See [Scenario A](validate.md#saved-objects-wip-types-scenario-a) for the full workflow.
