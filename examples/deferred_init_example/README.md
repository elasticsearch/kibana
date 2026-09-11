# Deferred Init Example

A **disposable demo plugin** that exercises core's lazy plugin initialization end-to-end. It is not
meant to ship. It exists to show the developer experience (how a plugin opts in and what its
lifecycle becomes) and the user experience (what someone sees when they hit a plugin that has not
initialized yet).

## The lifecycle of a lazy plugin

An ordinary plugin runs `setup()` then `start()` at boot. A lazy plugin runs **`setup()` at boot
only**. Its two remaining phases run on each Kibana instance the first time something triggers it:

1. `lazyInitialize(core, plugins)`: the costly, Elasticsearch-backed work. Retriable and, by
   contract, idempotent.
2. `start(core, plugins)`: builds the start contract over the state `lazyInitialize` produced.

Both receive the same arguments `start()` always has. Every non-lazy dependency started long
before, so their contracts are injected as usual. Once both phases complete on an instance the
plugin is `available` there: its routes serve, its app renders, `core.getStartServices()` resolves,
and `loadPluginContract` hands out the contract.

**What triggers the two phases** (on this instance):

- A request to one of the plugin's routes. Core gates every route and returns `503` with a
  `Retry-After` header until the plugin is `available`; the first hit is the trigger.
- The plugin's browser app loading. Core wraps `mount()` in an "Initializing…" gate that polls
  core's status route, and that poll is the trigger.
- Another plugin calling `core.plugins.loadPluginContract('deferredInitExample')` (or
  `context.loadPluginContract` in a route handler).
- The plugin itself calling `core.plugins.lazyInit.trigger()`.
- Boot, on a node without the `ui` role. Nothing on such a node could ever trigger the plugin, so
  core kicks every lazy plugin once boot finishes.

**What only waits, and never triggers:** `core.getStartServices()`, `core.plugins.lazyInit.status$`,
`core.plugins.lazyInit.onLazyStartService`, and the synchronous `core.plugins.lazyInit.getStatus`.

## The opt-in (developer experience)

One flag plus one method: `enableLazyInitialize: true` in `kibana.jsonc`, and `lazyInitialize` on
the server plugin class (`server/plugin.ts`):

```ts
public async lazyInitialize(core: CoreStart, plugins: StartDeps): Promise<void> {
  // costly, idempotent Elasticsearch work, using core.elasticsearch.client.asInternalUser
  // and the injected `plugins` contracts
}

public start(core: CoreStart): StartContract {
  // runs only after lazyInitialize() succeeded here; build the contract, no readiness checks
}
```

Routes are registered normally in `setup()` and core wraps them. The browser app is registered
normally too and core wraps its `mount()`. Inside a gated handler, `core.getStartServices()`
resolves immediately, so this is how a handler reaches what `start()` built:

```ts
router.get({ path, ... }, async (_context, _request, response) => {
  const [, , self] = await core.getStartServices();
  return response.ok({ body: self.getInstanceState() });
});
```

> The deferred work here is a **stand-in** for "migrations + ES init", run in five phases: (1) a
> fake ~3s "saved object migrations" delay, (2) a configurable "default state" delay
> (`initDelayMs`), (3) reading a greeting off the injected `deferredInitExampleDependency`
> contract, (4) a small, real, direct ES write (create index + mapping tolerating a concurrent
> peer, write one doc at a fixed id), (5) handing the instance-local result to `start()`. It does
> **not** touch core saved-object migrations. The app lists these phases once init completes.

## Rules a lazy plugin has to follow

- **No Elasticsearch work of your own in `setup()`.** That includes the
  `getStartServices().then(...)` idiom. For a lazy plugin that promise does not resolve until the
  deferred `start()` has run, so a `.then` written in `setup()` becomes an "after start" hook that
  never fires on a quiet node. Put the work in `lazyInitialize()`.
- **Setup-registered callbacks that other plugins invoke on their own traffic must not await your
  start.** Task runners, capabilities switchers, usage collectors and rule executors are called
  whether or not you have been triggered. They can neither wait nor trigger, so they read
  `core.plugins.lazyInit.getStatus('<your id>')` and no-op or fail fast when it is not
  `available`. If an event genuinely should initialize you (your integration being installed,
  say), call `core.plugins.lazyInit.trigger()` there explicitly.
- **Registrations into other plugins that need your initialized state go in the deferred
  `start()`**, where they naturally only exist once you are initialized. Registrations that must
  exist at boot go in `setup()`, against the other plugin's setup contract.
- **`lazyInitialize` is idempotent, `start()` need not be.** `lazyInitialize` runs once per
  instance, so several instances may run it concurrently against one cluster: create-if-missing,
  fixed document ids, overwrite-safe writes. Its success is sticky on the instance. If the deferred
  `start()` throws, only `start()` is re-run on the next attempt.
- **Publish state to `start()` in a single assignment at the end of `lazyInitialize`.** A failed
  attempt is re-run from the top on the same instance, not resumed, so partially-built state would
  be a hazard. See phase 5 in `server/plugin.ts`.
- **`stop()` is not called if `start()` never ran here.** There is nothing start-time to tear
  down, and `setup()`-time registrations need no cleanup.

## Per-instance initialization: the guarantee and the requirement

State is per instance and in memory only, exactly like every plugin's `/status` entry. Nothing is
persisted, and no cross-instance lock or shared document is involved. That guarantees that
everything downstream of `available` on an instance (its gated routes, a `loadPluginContract`
consumer running there, its own `start()`) is downstream of that instance's own successful
`lazyInitialize`, which is what makes instance-local preconditions expressible: downloading a
binary, warming an in-process cache, populating module-scoped state. This plugin leans on it by
producing `instanceState` in `lazyInitialize` and having `start()` close over it with no check.

## Prerequisites

- A Kibana dev server connected to Elasticsearch, started with `--run-examples`. Plugins under
  `examples/` are only discovered with that flag, this one included.
- If you just added this plugin to a tree that was already bootstrapped, run `yarn kbn bootstrap`
  once so the new package is registered, then start the dev server.

## Configuration

Config namespace is `deferred_init_example` (set in `kibana.yml` / `kibana.dev.yml`):

| Key | Default | Meaning |
| --- | --- | --- |
| `deferred_init_example.initDelayMs` | `5000` | "Default state" phase delay (ms). Total init is this plus a fixed ~3s migrations phase, so `initializing` is comfortably observable. |
| `deferred_init_example.forceFailure` | `false` | When `true`, `lazyInitialize` throws after the migrations phase (exercises the failure/retry path). |

## Endpoints

| Endpoint | Gated? | Purpose |
| --- | --- | --- |
| `GET /api/deferred_init_example/doc` | Yes (by core) | Returns the cluster-side doc written by `lazyInitialize`. First hit returns `503` and **triggers** the deferred phases. |
| `GET /api/deferred_init_example/instance_state` | Yes (by core) | Returns the state this instance's own `lazyInitialize` produced (`instanceUuid`, `initializedAt`, `completedPhases`), read through `getStartServices()`. |
| `GET /internal/core/deferred_init/deferredInitExample` | No (core route) | Returns `{ pluginId, status }`, plus `error`, `attempts` and `phase` while `failed`. Core's `deferredInit` browser service polls this on the app's behalf. Reading it also acts as a nudge: it kicks an `idle` plugin, and a `failed` one once background retries are exhausted. |
| `GET /api/status` | No | Overall status; the `plugin:deferredInitExample` entry reflects the lazy-init state. |

(Add the base path if your dev server uses one, e.g. `…/ora/api/status`.)

## Failure, retries, and recovery

An attempt that throws flips the plugin to `failed` and leaves its routes returning `503`. The
status route reports which phase failed. Recovery is automatic and needs no restart:

- **Background retries.** Core schedules a jittered exponential cooldown before the plugin becomes
  retriable again: full jitter, a ~1s upper bound for the first retry, doubling per attempt, capped
  at 5 minutes. The numbers are Fleet's Serverless profile (`retrySetupOnBoot`, kibana#167246),
  tuned for clusters that can take five minutes to come up cold. Full jitter also keeps a fleet of
  instances failing against the same unhealthy cluster from retrying in lockstep.
- **On-demand recovery.** After 25 consecutive failures core stops scheduling unsolicited retries.
  From then on any gated request, status poll, `loadPluginContract` or `trigger()` kicks a fresh
  attempt instead, so a plugin whose cluster finally came back recovers on the next hit.
- **Phase-aware.** If `lazyInitialize` failed, the whole attempt re-runs. If `lazyInitialize`
  succeeded and `start()` failed (or exceeded its 10s timeout), only `start()` re-runs.
- **Scope.** The failure is local to one instance and to one plugin: `/status` reports `degraded`
  (not `unavailable`) for `plugin:deferredInitExample`, other plugins stay `available`, and peer
  instances are unaffected.

## Runbook: reproduce the full flow

1. **Boot pays nothing.** Start the dev server. In the logs, confirm the readiness line
   `http server running` appears **without** either the `lazyInitialize` log line or
   `deferredInitExample: Started`. Confirm the state endpoint reports `idle` before any request:
   ```
   curl -s '<base>/internal/core/deferred_init/deferredInitExample'
   # {"pluginId":"deferredInitExample","status":"idle"}
   ```
   (That read is itself a trigger. It kicks the phases like a gated request would, so run it once
   and expect the next poll to report `initializing`.)

2. **Lazy on first request.** Hit the data route. The first call returns `503` and triggers the
   phases:
   ```
   curl -i '<base>/api/deferred_init_example/doc'
   # HTTP/1.1 503 ... retry-after: 1   body: {"pluginId":"deferredInitExample","status":"initializing"}
   ```
   The `lazyInitialize` log lines appear, then `deferredInitExample: Started`. The state endpoint
   transitions `idle → initializing → available` over ~3s (migrations) + `initDelayMs` (default
   state). After it is `available`, the same route returns `200` with the written doc:
   ```
   curl -s '<base>/api/deferred_init_example/doc'
   # {"message":"Initialized by deferred lazyInitialize","greeting":"...","initializedAt":"...","initializedBy":"<instance uuid>"}
   ```

3. **See the instance-local half.** Hit the instance-state route:
   ```
   curl -s '<base>/api/deferred_init_example/instance_state'
   # {"instanceUuid":"<instance uuid>","initializedAt":"...","completedPhases":["savedObjectMigrations","defaultState","readDependencyGreeting","wroteDefaultDocument"]}
   ```
   Nothing cluster-side backs this. `initializedBy` in step 2 is the same value, which is how you
   can tell which instance last ran the shared write when several are behind a load balancer.

4. **In the browser (UX).** Open **Deferred Init Example** (app id `deferredInitExample`, at
   `<base>/app/deferredInitExample`). On a fresh server you see the full-page "Initializing…"
   interface, rendered by core before the plugin's own `mount()` ever runs, that resolves to the
   written document plus the instance state once both phases complete. The app's static bundle
   loads while gated because it is served by core, not by the plugin's API routes.

5. **Watch `/status`.** While initializing, `GET /api/status` shows `plugin:deferredInitExample` as
   `available`, with the lifecycle state in the summary. Deferring work is a healthy state, so it
   must not drag the reported `overall` status down; once done, the summary changes but the level
   does not.

6. **Failure path.** Set `deferred_init_example.forceFailure: true`, restart the dev server, open the
   app (or hit either route). After the migrations delay the gate shows its error panel with the
   `lazyInitialize` error message, a count of automatic retries, and a **Reload page** button; the
   state endpoint reports `failed` (with `error`, `attempts` and `phase: "lazyInitialize"`), and
   `/status` shows `degraded`. Core keeps retrying in the background on the cooldown curve above,
   and the attempt counter climbs as it does. Clearing `forceFailure` means restarting the dev
   server, since the plugin reads that config once at construction.

## Resetting

Each dev-server restart resets the in-process state back to `idle`, so you can re-run the flow from
the top after every restart.
