# Deferred Init Example Dependency

A **disposable demo plugin**, companion to `deferred_init_example`, that plays the role of an
ordinary, non-lazy required dependency.

## What it demonstrates

This plugin has no `enableLazyInitialize`, no `lazyInitialize`, nothing special at all. `start()`
runs at boot like any other plugin's and returns a plain start contract:

```ts
export interface DeferredInitExampleDependencyStartContract {
  getGreeting(): string;
}
```

It exists to show that **a lazy plugin keeps ordinary dependencies, and gets them the ordinary
way**. `deferred_init_example` lists this plugin under `requiredPlugins`, and this plugin's start
contract is injected into the lazy plugin's `lazyInitialize(core, plugins)` and `start(core,
plugins)` exactly as it would be into any plugin's `start()`:

```ts
public async lazyInitialize(core: CoreStart, plugins: DeferredInitExampleStartDeps) {
  // ...
  const greeting = plugins.deferredInitExampleDependency.getGreeting();
  // ...
}
```

No accessor, no `loadPluginContract`, no `core` stashed on `this`. That works because a lazy
plugin's deferred phases run post-boot, by which point every non-lazy plugin has long since
started.

## Why this side is still an ordinary `requiredPlugins` dependency

Core forbids declaring a **lazy** plugin under `requiredPlugins`/`optionalPlugins`, since those
lists are what get injected into a dependent's `setup()`/`start()` arguments and a lazy plugin has
no start contract until its deferred `start()` runs. That rule is about the *lazy* end of an edge,
not about who is doing the depending: `deferred_init_example` is itself lazy, yet it declares this
plugin the normal way, because *this* plugin's start contract exists at boot and is safe to inject.
The direction that needs `runtimePluginDependencies` is the other one. See
`deferred_init_example_consumer`, which depends on the lazy plugin.

So a lazy plugin keeps ordinary dependencies, ordinary boot ordering for its `setup()`, and the
ordinary injected `plugins` argument for everything that isn't lazy itself.
