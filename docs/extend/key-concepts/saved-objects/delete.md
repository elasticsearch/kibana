---
navigation_title: Delete a type
---

# Delete a Saved Object type [saved-objects-delete]

This page describes how to **remove a Saved Object type** (unregister the type definition from your plugin). It does not cover deleting Saved Object instances via the client.

## Removing a Saved Object type

When you remove a Saved Object type from your plugin, you must ensure its name cannot be reused later.

### Why we track removed types

Once a type has been registered and used in production, its name is reserved. Reusing that name for a different type would:

* **Cause migration conflicts** — Old documents with the removed type could conflict with new documents of the same type name.
* **Cause upgrade failures** — Upgrades from older versions could hit migration failures if the same type name is reused.

{{kib}} keeps a list of removed type names in `packages/kbn-check-saved-objects-cli/removed_types.json` so those names are never reused.

### How to remove a Saved Object type

#### Step 1: Remove the type registration

Remove the type registration from your plugin, delete the type definition file, and remove any references to the type.

#### Step 2: Run the automated check

Run the check that detects removed types and updates `removed_types.json`:

```bash
# Get your current commit ID
git log -n 1

# Get the merge-base commit with main
git merge-base -a <currentCommitSha> main

# Run the check with the baseline
node scripts/check_saved_objects --baseline <mergeBase> --fix
```

Replace `<currentCommitSha>` with the commit SHA from the first command and `<mergeBase>` with the merge-base SHA from the second.

This will:

1. Compare current registered types to the baseline (merge-base with main).
2. Detect removed types.
3. Add the removed type name(s) to `removed_types.json`.
4. Exit with an error message listing the types that were added.

Example output:

```shell
❌ The following SO types are no longer registered: 'my-removed-type'.
Updated 'removed_types.json' to prevent the same names from being reused in the future.
```

#### Step 3: Commit the changes

Commit both your code changes and the updated `removed_types.json`.

### Manual update (alternative)

To update `removed_types.json` by hand:

1. Open `packages/kbn-check-saved-objects-cli/removed_types.json`.
2. Add the removed type name to the array in alphabetical order.
3. Save the file.

### Important considerations

::::{warning}
  Once a type name is in `removed_types.json`, it cannot be used again for a new Saved Object type. Choose type names carefully when creating new types.
::::

Before removing a type:

* **No references** — Ensure no other Saved Object types reference the type you are removing.
* **Data migration** — If users have documents of this type, ensure they have been migrated or are no longer needed.
* **Stakeholders** — Confirm with your team and any dependent teams that the removal is expected.
