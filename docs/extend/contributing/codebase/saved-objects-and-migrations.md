---
navigation_title: "Saved objects and migrations"
description: "How to access saved objects correctly and preserve backward compatibility across Kibana versions."
---

# Saved objects and migrations

## Using the SavedObjectClient

The SavedObjectClient should always be used for reading and writing saved objects that you manage. For saved objects managed by other plugins, their plugin APIs should be used instead.

Good:
```
const dataView = dataViewStartContract.get(dataViewId);
```

Bad:
```
const dataView = savedObjectsClient.get(dataViewId) as DataView;
```

## Backward compatibility

Any time you change state that is part of a Saved Object you will have to write a [migration](../../key-concepts/saved-objects.md).

Never store state from another plugin in your Saved Objects or URLs unless it implements the [persistable state interface](../../key-concepts/saved-objects/persistable-state.md). Remember to check for migrations when deserializing that state.

If you expose state and you wish to allow other plugins to persist you must ensure it implements the [persistable state interface](../../key-concepts/saved-objects/persistable-state.md). This is very common for `by value` entities, like visualizations that exist on a dashboard but are not part of the visualization library. If you make a breaking change to this state you must remember to register a migration for it.

Saved objects exported from past {{kib}} versions should always continue to work. Bookmarked URLs should also always work. Check out [URL Locators](../../key-concepts/platform-architecture/routing-navigation-and-url.md#specifying-state) to learn about migrating state in URLs.
