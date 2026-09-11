# Deferred Init Example Consumer

A **disposable demo plugin**, companion to `deferred_init_example`, that shows every way another
plugin can relate to a lazy plugin's start contract in-process, with no HTTP request ever hitting
the lazy plugin's own routes. It covers the two questions a dependent has to answer: do I want to
**cause** the lazy plugin to initialize, or only **react** if it does?

See also `deferred_init_example_dependency`, a companion in the other direction: an ordinary
plugin that `deferred_init_example` depends on, whose contract is injected into the lazy plugin's
`lazyInitialize()` and `start()` the normal way.

## A lazy dependency is never injected

`kibana.jsonc` declares the dependency as `runtimePluginDependencies: ["deferredInitExample"]`, not
`requiredPlugins`. That is not a style choice: core rejects, at boot, any plugin that lists a lazy
plugin under `requiredPlugins`/`optionalPlugins`, because those two lists are exactly what core
copies into a dependent's `setup()`/`start()` `plugins` argument, and a lazy plugin has no start
contract until its deferred `start()` runs. `onStart()` is rejected for the same reason.
`runtimePluginDependencies` keeps the lazy plugin out of the injection *and* out of the topological
sort, while still satisfying the rule that all of the APIs below only work on declared
dependencies.

## The four patterns, and which ones trigger

| Pattern | API | Triggers the lazy plugin? |
| --- | --- | --- |
| 1. Route handler | `context.loadPluginContract('deferredInitExample')` | **Yes**, then waits |
| 2. Function in own contract | `core.plugins.loadPluginContract('deferredInitExample')`, called by whoever holds the function post-boot | **Yes**, then waits |
| 3. React when it starts | `core.plugins.lazyInit.onLazyStartService('deferredInitExample', cb)` | No |
| 4. Read its state now | `core.plugins.lazyInit.getStatus('deferredInitExample')` | No |

`loadPluginContract` is the only triggering accessor a dependent has. Everything on
`core.plugins.lazyInit` waits, apart from `trigger()`, which is self-only and therefore not
available to a dependent.

### Pattern 1: `context.loadPluginContract` in a route handler

```ts
const deferredInitExample =
  await context.loadPluginContract<DeferredInitExampleStartContract>('deferredInitExample');
const instanceState = deferredInitExample.getInstanceState();
const doc = await deferredInitExample.getDoc();
```

The request handler context exposes the loader scoped to the plugin that registered the route. The
call kicks `deferredInitExample`'s `lazyInitialize()` and `start()` on this instance if nobody has
yet, waits for both, then returns the contract `start()` built. If the attempt fails, the call
rejects with a `DeferredInitializationError`, which (left uncaught) propagates to core's central
HTTP error handler and becomes a `503` + `Retry-After` with body `{ pluginId, status }`.

### Pattern 2: the function-in-contract pattern in `start()`

```ts
public start(core: CoreStart): DeferredInitExampleConsumerStartContract {
  return {
    getDeferredInitExample: () =>
      core.plugins.loadPluginContract<DeferredInitExampleStartContract>('deferredInitExample'),
  };
}
```

`start()` returns a *function* that loads the lazy dependency; whoever consumes this contract calls
it post-boot. Awaiting `loadPluginContract` for a lazy plugin inside `setup()`/`start()` itself is
rejected by core's start-cycle guard with an explicit error: blocking a lifecycle on the very work
that was deferred would stall boot past its watchdog. This is the shape Fleet's real dependents use
today to resolve `fleetSetupCompleted()`, which the lazy model makes redundant: the contract only
exists once setup completed.

### Pattern 3: `onLazyStartService`, react without triggering

```ts
core.plugins.lazyInit.onLazyStartService<DeferredInitExampleStartContract>(
  'deferredInitExample',
  (contract) => {
    // runs once, on this instance, when deferredInitExample has started (immediately if it already had)
  }
);
```

This is the hook for "when X is up here, register this into it" without forcing X up. On a quiet
node the callback simply never fires. A throwing callback is logged by core and does not affect the
lazy plugin.

### Pattern 4: `getStatus`, a synchronous read

```ts
if (core.plugins.lazyInit.getStatus('deferredInitExample') !== 'available') {
  return; // no-op; do not wait, do not trigger
}
```

This is the shape a setup-registered callback that runs on *someone else's* traffic uses: a task
runner claimed by Task Manager, a capabilities switcher on a page load, a usage collector fetch. It
can neither wait (that would hang whoever invoked it) nor trigger (that would make the lifecycle
depend on incidental traffic), so it reads the state and decides. `status$` is the observable form.

## Endpoints

| Endpoint | Triggers? | Purpose |
| --- | --- | --- |
| `GET /api/deferred_init_example_consumer/doc` | **Yes** | Pattern 1. Loads `deferredInitExample`'s contract and returns `{ doc, instanceState }`. |
| `GET /api/deferred_init_example_consumer/status` | No | Pattern 4, plus what pattern 3 recorded: `{ status, observedLazyStart }`. Hit it as often as you like; it never starts anything. |

## Runbook

1. Start a fresh dev server. Hit **this** plugin's status route and confirm nothing has happened:
   ```
   curl -s '<base>/api/deferred_init_example_consumer/status'
   # {"status":"idle","observedLazyStart":null}
   ```
   Hit it again. Still `idle`: pattern 4 is a read, not a trigger, and the pattern 3 callback has
   not fired. Watch the logs: no `lazyInitialize` line from `deferredInitExample`.
2. Hit this plugin's data route (not `deferredInitExample`'s own route):
   ```
   curl -i '<base>/api/deferred_init_example_consumer/doc'
   ```
   This blocks for the full duration of `deferredInitExample`'s deferred phases (~3s migrations
   delay + `initDelayMs`, default 5s), then returns `200` with `{ doc, instanceState }`. The lazy
   plugin's `lazyInitialize` steps and `deferredInitExample: Started` appear in the logs even though
   nobody ever called `GET /api/deferred_init_example/doc`. `instanceState.instanceUuid` is this
   instance's UUID: the phases ran *here*.
3. Hit the status route again:
   ```
   curl -s '<base>/api/deferred_init_example_consumer/status'
   # {"status":"available","observedLazyStart":{"at":"...","instanceUuid":"<instance uuid>"}}
   ```
   The pattern 3 callback fired when the lazy plugin started and recorded what it read off the
   contract, without this plugin ever asking for it.
4. Set `deferred_init_example.forceFailure: true` and restart. Hitting the data route now returns
   `503` with `retry-after: 1` and body `{"pluginId":"deferredInitExample","status":"failed"}` once
   the attempt fails, via the central handler's `DeferredInitializationError` branch. The status
   route reports `failed` and `observedLazyStart: null`. Core keeps retrying on its backoff curve
   and, once background retries are exhausted, on every subsequent hit to the data route.

## Why a separate plugin

`loadPluginContract` and the `lazyInit` observation APIs require the target to be declared as a
dependency in the caller's manifest, and a plugin cannot declare itself, so demonstrating the
cross-plugin paths needs a second plugin.
