---
navigation_title: "Persistable State"
description: "Persitable state is a key concept to understand when building a Kibana plugin."
---

# Persistable State

“Persistable state” is developer-defined state that supports being persisted by a plugin other than the one defining it. Persistable State needs to be serializable and the owner can/should provide utilities to migrate it, extract and inject any [references to Saved Objects](../saved-objects.md) it may contain, as well as telemetry collection utilities.

## Exposing state that can be persisted

Any plugin that exposes state that another plugin might persist should implement `PersistableStateService` interface on their `setup` contract. This will allow plugins persisting the state to easily access migrations and other utilities.

Example: Data plugin allows you to generate filters. Those filters can be persisted by applications in their saved
objects or in the URL. In order to allow apps to migrate the filters in case the structure changes in the future, the Data plugin implements `PersistableStateService` on `data.query.filterManager`.

note: There is currently no obvious way for a plugin to know which state is safe to persist. The developer must manually look for a matching `PersistableStateService`, or ad-hoc provided migration utilities (as is the case with Rule Type Parameters).
In the future, we hope to make it easier for producers of state to understand when they need to write a migration with changes, and also make it easier for consumers of such state, to understand whether it is safe to persist.

## Exposing state that can be persisted but is not owned by plugin exposing it (registry)

Any plugin that owns collection of items (registry) whose state/configuration can be persisted should implement `PersistableStateService`
interface on their `setup` contract and each item in the collection should implement `PersistableStateDefinition` interface.

Example: Embeddable plugin owns the registry of embeddable factories to which other plugins can register new embeddable factories. Dashboard plugin
stores a bunch of embeddable panels input in its saved object and URL. Embeddable plugin setup contract implements `PersistableStateService`
interface and each `EmbeddableFactory` needs to implement `PersistableStateDefinition` interface.

Embeddable plugin exposes this interfaces:

```
// EmbeddableInput implements Serializable

export interface EmbeddableRegistryDefinition extends PersistableStateDefinition<EmbeddableInput> {
  id: string;
  ...
}

export interface EmbeddableSetup extends PersistableStateService<EmbeddableInput>;
```

Note: if your plugin doesn't expose the state (it is the only one storing state), the plugin doesn't need to implement the `PersistableStateService` interface.
If the state your plugin is storing can be provided by other plugins (your plugin owns a registry) items in that registry still need to implement `PersistableStateDefinition` interface.

## Storing persistable state as part of saved object

Any plugin that stores any persistable state as part of their saved object should make sure that its saved object migration
and reference extraction and injection methods correctly use the matching `PersistableStateService` implementation for the state they are storing.

Take a look at [example saved object](https://github.com/elastic/kibana/blob/8.9/examples/embeddable_examples/server/searchable_list_saved_object.ts#L32) which stores an embeddable state. Note how the `migrations`, `extractReferences` and `injectReferences` are defined.

## Storing persistable state as part of URL

When storing persistable state as part of URL you must make sure your URL is versioned. When loading the state `migrateToLatest` method
of `PersistableStateService` should be called, which will migrate the state from its original version to latest.

note: Currently there is no recommended way on how to store version in url and its up to every application to decide on how to implement that.

## Available state operations

### Extraction/Injection of References

In order to support import and export, and space-sharing capabilities, Saved Objects need to explicitly list any references they contain to other Saved Objects.
To support persisting your state in saved objects owned by another plugin, the `extract` and `inject` methods of Persistable State interface should be implemented.

[Learn how to define Saved Object references](./create.md)

[See example embeddable providing extract/inject functions](https://github.com/elastic/kibana/blob/8.9/examples/embeddable_examples/public/migrations/migrations_embeddable_factory.ts)

### Migrations and Backward compatibility

As your plugin evolves, you may need to change your state in a breaking way. If that happens, you should write a migration to upgrade the state that existed prior to the change.

[How to write a migration](./create.md).

[See an example saved object storing embeddable state implementing saved object migration function](https://github.com/elastic/kibana/blob/8.9/examples/embeddable_examples/server/searchable_list_saved_object.ts)

[See example embeddable providing migration functions](https://github.com/elastic/kibana/blob/8.9/examples/embeddable_examples/public/migrations/migrations_embeddable_factory.ts)

## Telemetry

You might want to collect statistics about how your state is used. If that is the case you should implement the telemetry method of Persistable State interface.