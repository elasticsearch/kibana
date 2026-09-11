# Context Awareness Framework — Developer Guide

> Internal reference for maintainers of the framework itself.
> For consumer-facing guidance (registering profiles, extension points), see [`README.md`](./README.md).
> For the design principles a new profile should uphold, see [`PRINCIPLES.md`](./PRINCIPLES.md).

## File map

```
context_awareness/
├── types.ts                  # Profile interface — all extension point signatures
├── composable_profile.ts     # ComposableProfile, AppliedProfile, getMergedAccessor
├── toolkit.ts                # ContextAwarenessToolkit — toolkit injected by the host
├── in_memory_toolkit.ts      # Simplified toolkit implementation for non-tab hosts
├── profile_state_adapter.ts  # Host-backed profile state API and adapter factory
├── profile_service.ts        # BaseProfileService, ProfileService (sync), AsyncProfileService
├── profiles/                 # Per-level provider types and service subclasses
├── profiles_manager/         # ProfilesManager + ScopedProfilesManager
├── hooks/                    # React integration (useProfiles, useProfileAccessor, useRootProfile)
├── profile_providers/        # All profile provider implementations + registration
│   ├── common/               #   Solution-agnostic providers
│   ├── observability/        #   Observability providers
│   ├── security/             #   Security providers
│   └── example/              #   Example/reference providers
├── inspector/                # Profiles inspector panel (dev tooling)
└── utils/                    # Shared utilities
```

## Core type hierarchy

Understanding the type chain is critical. Here is the progression from the raw `Profile` interface to what Discover actually calls at runtime:

```
Profile                      (types.ts)
  The full extension point contract. Every key is a function signature.

  ↓ Partial<>

PartialProfile               (composable_profile.ts)
  A profile doesn't have to implement every extension point.

  ↓ wrap each value in ComposableAccessor<TPrev, TContext>

ComposableProfile<TProfile, TContext>
  What profile providers define. Each method receives (prev, { context, toolkit }).

  ↓ bind context via Proxy in BaseProfileService.getProfile()

AppliedProfile
  Context is bound; each method now only receives (prev).
  This is what ProfilesManager stores and passes to getMergedAccessor.
```

### `getMergedAccessor`

The merge is a left fold over an ordered `AppliedProfile[]` — `[root, dataSource, document]`:

```ts
profiles.reduce((nextAccessor, profile) => {
  const currentAccessor = profile[key];
  return currentAccessor ? currentAccessor(nextAccessor) : nextAccessor;
}, baseImpl);
```

Each profile's accessor receives the accumulated result of all previous levels as `prev`. The final return value is what Discover uses. This means:

- The **root** profile's `prev` is the base implementation.
- The **data source** profile's `prev` is the root's result (or base if root didn't implement the extension point).
- The **document** profile's `prev` is the data source's result (or whichever above level last implemented it).

## Profile services

Three `BaseProfileService` subclasses exist, one per context level:

| Service                    | Sync/Async | `resolve` runs                                    | Provider type          |
| -------------------------- | ---------- | ------------------------------------------------- | ---------------------- |
| `RootProfileService`       | Async      | Once on app init, re-runs on solution nav change  | `AsyncProfileProvider` |
| `DataSourceProfileService` | Async      | On data view or ES\|QL query change, before fetch | `AsyncProfileProvider` |
| `DocumentProfileService`   | Sync       | Per record, after fetch                           | `ProfileProvider`      |

`BaseProfileService` stores an ordered `providers[]` array. `resolve()` iterates providers sequentially and returns the context from the **first match** (`isMatch: true`). Order in the registration array directly controls priority.

### `getProfile()` and the Proxy

`BaseProfileService.getProfile(params)` looks up the provider by `profileId` from the context, then returns a `Proxy` over the provider's `ComposableProfile`. The Proxy intercepts property access: for each key, it returns a function `(prev) => accessor(prev, params)`, effectively binding the `ComposableAccessorParams` (context + toolkit). This produces an `AppliedProfile`.

## ProfilesManager / ScopedProfilesManager

### Lifecycle

```
Plugin start
  ├─ getProfileStateRegistry()
  └─ createProfileServices()
       └─ new ProfilesManager(root, dataSource, document)
            │
            ├─ resolveRootProfile(solutionNavId)  ← called by useRootProfile hook
            │    └─ rootProfileService.resolve(params)
            │    └─ stores rootContext$ (BehaviorSubject)
            │
            └─ createScopedProfilesManager()  ← one per Discover tab / dashboard panel
                 └─ new ScopedProfilesManager(rootContext$, getRootProfile, ...)
                      │
                      ├─ resolveDataSourceProfile(params)
                      │    └─ dataSourceProfileService.resolve({...params, rootContext})
                      │    └─ stores dataSourceContext$ (BehaviorSubject)
                      │
                      ├─ resolveDocumentProfile(record)
                      │    └─ documentProfileService.resolve({...params, rootContext, dataSourceContext})
                      │    └─ returns Proxy'd record with lazy `.context` property
                      │
                      ├─ getProfiles({ record? })  → [rootApplied, dsApplied, docApplied]
                      └─ getProfiles$()             → Observable of the above
```

### Architecture diagram

```mermaid
flowchart LR
    subgraph init["Plugin Start"]
        reg["register<br/>ProfileProviders"]
    end

    subgraph services["Profile Services"]
        direction TB
        RPS["RootProfileService<br/><i>async</i>"]
        DSPS["DataSourceProfileService<br/><i>async</i>"]
        DPS["DocumentProfileService<br/><i>sync</i>"]
    end

    reg --> RPS & DSPS & DPS

    subgraph PM["ProfilesManager"]
        resolveRoot["resolveRootProfile()"]
        rootCtx["rootContext$"]
        resolveRoot --> rootCtx
    end

    PM --> create["createScopedProfilesManager()"] --> SPM

    subgraph SPM["ScopedProfilesManager · one per tab"]
        resolveDS["resolveDataSourceProfile()"]
        dsCtx["dataSourceContext$"]
        resolveDoc["resolveDocumentProfile()<br/><i>lazy Proxy per record</i>"]
        gp["getProfiles()"]
        resolveDS --> dsCtx --> gp
        resolveDoc --> gp
    end

    RPS --> resolveRoot
    DSPS --> resolveDS
    DPS --> resolveDoc
    rootCtx -.-> |shared| SPM

    subgraph output["Consumption"]
        direction TB
        merge["getMergedAccessor()<br/><i>left fold: root → ds → doc</i>"]
        EP(["Extension Point Result"])
        merge --> EP
    end

    gp -- "AppliedProfile[]" --> merge

    hooks["useProfileAccessor(key)<br/>useProfiles()"] --> merge

    SPM --> hooks
```

### Key design decisions

- **Root context is shared** across all scoped managers via `BehaviorSubject`. When root re-resolves (e.g. solution nav change), all scoped managers see the update through their subscription.
- **Deduplication**: Both `ProfilesManager` and `ScopedProfilesManager` serialize resolution params and skip re-resolution when params haven't changed (`isEqual` check on serialized form).
- **Abort on supersede**: Async resolution uses an `AbortController` to mark stale in-flight work. If a new resolution starts before the previous completes, the previous controller is aborted (`AbortReason.REPLACED`). Providers do not receive this signal, so it does not cancel provider work by itself; the result is silently discarded when it returns.
- **Document context is lazy**: `resolveDocumentProfile` returns a `Proxy` over the record. The `context` property is resolved on first access, not eagerly. This avoids unnecessary work for records that are never expanded.
- **Error fallback**: If any resolution throws, the error is logged and the **default context** for that level is used. The app never crashes from a resolution failure.

## Registration pipeline

```
plugin.tsx  getDiscoverServicesWithProfiles()
  → import('./context_awareness/profile_providers')
  → createProfileProviderSharedServices(deps)       // async init of shared services
  → getProfileStateRegistry()                       // same memoized registry used by locators
  → registerProfileProviders({...})
      → createRootProfileProviders(providerServices)       // returns ordered array
      → createDataSourceProfileProviders(providerServices)
      → createDocumentProfileProviders(providerServices)
      → registerEnabledProfileProviders() × 3              // filters + registers
```

`registerEnabledProfileProviders` filters out:

1. Providers with `isExperimental: true` unless their `profileId` is in `enabledExperimentalProfileIds` (from `kibana.yml`).
2. Providers with `restrictedToProductFeature` whose feature isn't active (serverless pricing tier check).

**Array order = resolution priority.** The first provider whose `resolve` returns `isMatch: true` wins.

## Profile state

Profile state is typed state owned by profile providers and exposed through `ContextAwarenessToolkit.getStateAdapter()`. It lets profiles share state across extension points and other profiles without host-specific plumbing in the profile implementation.

Profile state types and the registry live in `common/context_awareness/profile_state.ts`, while profile state
definitions live under `common/context_awareness/profile_state_definitions`. All definitions are registered once by
`createProfileStateRegistry()`, which is shared by browser and server locator implementations.
Each `ProfileStateDefinition<TState>` has:

- `key`: Unique storage key, enforced by `ProfileStateRegistry`.
- `descriptor`: Field-level `ProfileStateType` metadata.
- `defaultState`: Typed fallback returned before host state is written.

`getStateAdapter()` validates that the requested definition matches the registered descriptor and default state.

The same registry owns transforms between runtime profile state and the saved payload for a Discover tab type.
`createProfileStateRegistry()` registers all definitions before their transforms. Each tab type has at most one
transform, which declares an ordered tuple of distinct state definitions. The registry passes their full effective
states to `toSavedState` in that order, and the transform must return the complete saved payload for its tab type.
`fromSavedState` returns an equally sized tuple of partial states that the registry maps back to the declared
definitions. Browser persistence uses this shared registry to hydrate profile state from saved sessions and serialize
it back without separate saved-state service plumbing.

### Adding a saved tab type

Saved-session persistence is explicit and independent of `ProfileStateType`. To add a saved tab type or extend an
existing payload:

1. For a new type, add its identifier to
   [`DiscoverTabType`](/src/platform/packages/shared/kbn-discover-utils/src/constants.ts).
2. Add or extend its bounded payload in the discriminated `tabTypeState` schema in
   [the saved search saved object schema](/src/platform/plugins/shared/saved_search/server/saved_objects/schema.ts).
   Introduce a new model version and update the latest schema aliases so
   [`DiscoverSessionTabTypeState`](/src/platform/plugins/shared/saved_search/common/types.ts) is derived from that
   schema.
3. Create or update its `ProfileSavedStateTransform` under
   [`profile_state_transforms`](../../common/context_awareness/profile_state_transforms). List every state definition it
   uses in tuple order. `toSavedState` receives effective states with defaults expanded and returns the complete payload
   without the `type` discriminator; `fromSavedState` returns partial states in the same order.
4. Register each state definition before registering the transform in
   [`createProfileStateRegistry()`](../../common/context_awareness/create_profile_state_registry.ts). Only one transform
   can own a tab type.
5. Return both `tabType` and the URL-synced `profileState` definition, when applicable, from the matching
   [data source profile context](./profiles/data_source_profile.ts). A tab with no registered transform has no saved
   `tabTypeState`.
6. Update the [Discover session API schema](/src/platform/plugins/shared/discover/server/api/schema.ts) and
   [tab type state conversion](/src/platform/plugins/shared/discover/common/session/tab_type_state.ts).
   Map every saved field in both directions and test the Saved Object to API to Saved Object round trip.

#### End-to-end example

Suppose an analysis tab type owns two independent state definitions:

- `ANALYSIS_VIEW_STATE_DEF` controls presentation with `groupBy` and `chartType`.
- `ANALYSIS_QUERY_STATE_DEF` controls computation with `formula` and `sampleSize`.

The saved tab should contain only data derived from `groupBy` and `formula`. This example shows how one transform can
combine disjoint fields from both definitions and change their representation without coupling the complete runtime
shapes.

First, add the fictional tab type:

```ts
export enum DiscoverTabType {
  Default = 'default',
  // Other tab types...
  Analysis = 'analysis',
}
```

Then add its bounded payload to the next saved object model version. The complete schema chain must extend the previous
tab attributes, tab, and session schemas, register the new model version, and update the latest aliases:

```ts
const SCHEMA_TAB_TYPE_STATE_VNEXT = schema.oneOf([
  SCHEMA_TAB_TYPE_STATE_VPREV,
  schema.object({
    type: schema.literal(DiscoverTabType.Analysis),
    groupings: schema.arrayOf(schema.object({ field: schema.string({ maxLength: 1_000 }) }), {
      maxSize: 5,
    }),
    calculation: schema.object({
      expression: schema.string({ maxLength: 10_000 }),
    }),
  }),
]);

const SCHEMA_TAB_ATTRIBUTES_VNEXT = SCHEMA_TAB_ATTRIBUTES_VPREV.extends({
  tabTypeState: schema.maybe(SCHEMA_TAB_TYPE_STATE_VNEXT),
});

const SCHEMA_TAB_VNEXT = SCHEMA_TAB_VPREV.extends({
  attributes: SCHEMA_TAB_ATTRIBUTES_VNEXT,
});

const SCHEMA_DISCOVER_SESSION_VNEXT = SCHEMA_DISCOVER_SESSION_VPREV.extends({
  tabs: schema.arrayOf(SCHEMA_TAB_VNEXT, {
    minSize: 1,
    maxSize: MAX_DISCOVER_SESSION_TABS,
  }),
});

export const DISCOVER_SESSION_MODEL_VERSIONS: SavedObjectsModelVersionMap = {
  // Previous model versions...
  [VNEXT]: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_DISCOVER_SESSION_VNEXT.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_DISCOVER_SESSION_VNEXT,
    },
  },
};

export const SCHEMA_TAB_LATEST = SCHEMA_TAB_VNEXT;
export const SCHEMA_DISCOVER_SESSION_LATEST = SCHEMA_DISCOVER_SESSION_VNEXT;
```

Define the two runtime states independently. Their descriptors and defaults can include fields that never enter the
saved payload:

```ts
interface AnalysisViewState extends SerializableRecord {
  groupBy: string[];
  chartType: 'line' | 'bar';
}

export const ANALYSIS_VIEW_STATE_DEF: ProfileStateDefinition<AnalysisViewState> = {
  key: 'analysisViewState',
  descriptor: {
    groupBy: { type: ProfileStateType.Url },
    chartType: { type: ProfileStateType.Ui },
  },
  defaultState: {
    groupBy: [],
    chartType: 'line',
  },
};

interface AnalysisQueryState extends SerializableRecord {
  formula: string;
  sampleSize: number;
}

export const ANALYSIS_QUERY_STATE_DEF: ProfileStateDefinition<AnalysisQueryState> = {
  key: 'analysisQueryState',
  descriptor: {
    formula: { type: ProfileStateType.Persistent },
    sampleSize: { type: ProfileStateType.Ui },
  },
  defaultState: {
    formula: 'count()',
    sampleSize: 500,
  },
};
```

The transform receives effective states in the declared tuple order. Here it converts the `groupBy` string array into
saved grouping objects and wraps `formula` in a calculation object. Hydration reverses both transformations and returns
each field to its owning state definition:

```ts
export const ANALYSIS_SAVED_STATE_TRANSFORM = createProfileSavedStateTransform({
  tabType: DiscoverTabType.Analysis,
  stateDefinitions: [ANALYSIS_VIEW_STATE_DEF, ANALYSIS_QUERY_STATE_DEF],
  toSavedState: ([viewState, queryState]) => ({
    groupings: viewState.groupBy.map((field) => ({ field })),
    calculation: { expression: queryState.formula },
  }),
  fromSavedState: ({ groupings, calculation }) => [
    { groupBy: groupings.map(({ field }) => field) },
    { formula: calculation.expression },
  ],
});
```

Register both definitions before the transform:

```ts
export const createProfileStateRegistry = () => {
  const registry = new ProfileStateRegistry();

  /**
   * Register state definitions
   */
  registry.registerDefinition(ANALYSIS_VIEW_STATE_DEF);
  registry.registerDefinition(ANALYSIS_QUERY_STATE_DEF);

  /**
   * Register saved state transforms
   */
  registry.registerTransform(ANALYSIS_SAVED_STATE_TRANSFORM);

  return registry;
};
```

Finally, the matching data source profile selects the transform through `tabType`. It may expose only one definition
through `profileState` for URL sync; this does not limit which registered definitions the saved-state transform uses:

```ts
return {
  isMatch: true,
  context: {
    category: DataSourceCategory.Default,
    tabType: DiscoverTabType.Analysis,
    profileState: ANALYSIS_VIEW_STATE_DEF,
  },
};
```

See the concrete
[`METRICS_STATE_DEF`](../../common/context_awareness/profile_state_definitions/metrics_grid_profile_state.ts),
[`METRICS_GRID_SAVED_STATE_TRANSFORM`](../../common/context_awareness/profile_state_transforms/metrics_grid_saved_state_transform.ts),
[registry registration](../../common/context_awareness/create_profile_state_registry.ts), and
[Metrics profile](./profile_providers/common/metrics_data_source_profile/profile.ts). The
[Metrics Scout save-session test](../../test/scout/metrics_experience/ui/parallel_tests/save_session.spec.ts) exercises
the complete save, reload, unsaved-change, and reset flow.

### State types and lifetime

`ProfileStateType` is a field-level lifetime preference: `Ui` for ephemeral UI state, `Url` for Discover URL sync and local tab storage, and `Persistent` for local tab storage without URL sync.

- Main Discover stores explicit overrides in `TabState.profileState`, scoped to a tab. Fresh tabs start with raw `profileState: {}` and duplicated tabs copy the explicit profile state. Restored or locally reloaded tabs hydrate registered `Persistent` and `Url` fields from local tab storage, then strip values equal to the current definition `defaultState`. Stored `Ui` fields are ignored and come from defaults on restore.
- Main Discover writes `Url` fields to the `_p` URL parameter for the definition exposed by the active data source profile context (`context.profileState`). URL hydration can accept registered non-active `_p` entries before profile resolution so history navigation and shared links can carry state for the profile that becomes active next. URL and local storage serialization expands requested-type defaults for entries that already have explicit state, while hydration strips current defaults back to explicit overrides. Clearing `_p` resets active URL fields to definition defaults.
- Discover app locator params use a flat `profileState` map keyed by registered definition key. Producers select only
  the active data source profile and expand all effective `Url` and `Persistent` fields without stripping defaults.
  Generic locator parsing preserves explicitly supplied values, ignores `Ui` and unknown fields, writes `Url` state to
  `_p`, and carries `Persistent` state in `MainHistoryLocationState.profileState`. Saved object links do not include
  either partition.
- Normal navigation restores profile state with `tab/local < locator Persistent < URL _p` precedence, then strips
  values equal to current defaults. Background-search locators use the same expanded producer state and seed parsed
  `Persistent + Url` state into the new tab; `Ui` state is never restored.
- Simplified hosts (document route, surrounding documents page, embeddables) use `createInMemoryContextAwarenessToolkit()`, storing all profile state in memory for that scoped host instance. `Url` and `Persistent` fields are accepted there but do not change the lifetime.
- Adapters return `definition.defaultState` merged with explicit overrides.

### State adapters

Profiles access state through the host toolkit:

```ts
const stateAdapter = toolkit.getStateAdapter(MY_PROFILE_STATE_DEF);

const state = stateAdapter.getState();
stateAdapter.updateState({ value: 'next' });
stateAdapter.getState$().subscribe((nextState) => {});
```

`ProfileStateAdapter<TState>` exposes synchronous reads, an observable stream, full replacement via `setState()`, and shallow immutable updates via `updateState()`. Adapters assume consumers do not mutate returned state objects in place.

`setState()` and `updateState()` also accept `{ historyMethod: 'push' | 'replace' }`. The Redux-backed main Discover toolkit uses this option when writing URL-backed state to `_p`; in-memory hosts ignore it.

The main Discover app uses the Redux-backed toolkit from `application/main/state_management/redux/context_awareness_toolkit.ts`; non-tab hosts use `createInMemoryContextAwarenessToolkit()` with their supported `actions` on the same toolkit object.

## React integration

### `useRootProfile`

Subscribes to `chrome.getActiveSolutionNavId$()`. On each emission, calls `profilesManager.resolveRootProfile()`. Returns a discriminated union — either `{ rootProfileLoading: true }` or `{ rootProfileLoading: false, getDefaultAdHocDataViews, getDefaultEsqlQuery }`. Discover's entry point gates rendering on this.

### `useProfiles` / `useProfileAccessor`

`useProfiles` reads from `ScopedProfilesManager` (obtained via `useScopedServices()` React context). It subscribes to `getProfiles$()` and re-renders when the profile array reference changes.

`useProfileAccessor(key, options?)` wraps `getMergedAccessor` — it returns a function that, given a base implementation, produces the merged result for the specified extension point key. Components call this like:

```ts
const getCellRenderers = useProfileAccessor('getCellRenderers');
const cellRenderers = getCellRenderers(() => ({}))({ dataView, density, rowHeight });
```

For document-level extension points, pass `{ record }` in options to include the document profile:

```ts
const getDocViewer = useProfileAccessor('getDocViewer', { record });
```

The record must be the proxy returned by `ScopedProfilesManager.resolveDocumentProfile()`. Passing a raw `DataTableRecord` falls back to the default document profile because no lazy `context` property is available.

### Non-React consumption

Outside React (e.g. state management utils), call `getMergedAccessor` directly with `scopedProfilesManager.getProfiles()`.

## Adding a new extension point

1. **Define the signature** in the `Profile` interface in `types.ts`. The method receives its params and returns a result. Define any new param/result interfaces in the same file.
2. **Decide which context levels** can implement it. If only root and data source (not document), define the method on `Profile` but not on `DocumentProfile` (document profiles use `Pick<Profile, ...>` to restrict available keys). Update the `Pick` in `document_profile.ts` if the document level should support it.
3. **Provide a base implementation** at the call site. When calling `getMergedAccessor` or `useProfileAccessor`, you pass a base fallback — this is what `prev` resolves to if no profile implements the extension point.
4. **Consume the accessor** in the appropriate Discover component via `useProfileAccessor(key)` (React) or `getMergedAccessor(profiles, key, base)` (non-React).
5. **Update `EXTENSION_POINTS_INVENTORY.md`** with a new section describing the extension point.

No changes to the framework internals (`composable_profile.ts`, `profile_service.ts`, `profiles_manager/`) are needed. The generic types propagate automatically from the `Profile` interface.

## Adding a new context level

This is rare and significant. Steps:

1. **Define the profile type, context, params, provider, and service** in a new file under `profiles/`, following the pattern of existing levels. Choose sync (`ProfileService`) or async (`AsyncProfileService`) based on whether resolution can block.
2. **Add the new service** to `ProfilesManager` or `ScopedProfilesManager` constructor depending on scope. Wire up resolution, context storage (`BehaviorSubject`), and abort handling.
3. **Update `getProfiles()`** to include the new level's `AppliedProfile` in the returned array. Position determines merge order.
4. **Update `registerProfileProviders`** to accept and register providers for the new level.
5. **Update `ContextualProfileLevel`** enum in `consts.ts`.
6. **Update EBT tracking** in `ScopedProfilesManager.trackActiveProfiles`.

## The toolkit

`ContextAwarenessToolkit` is injected by the host (Discover app or embeddable) and provides action callbacks (`openInNewTab`, `updateESQLQuery`, `addFilter`, etc.) plus profile state adapters. It's passed through `ComposableAccessorParams` alongside `context`.

The toolkit is created per `ScopedProfilesManager` at creation time and is immutable for its lifetime.

`EMPTY_CONTEXT_AWARENESS_TOOLKIT` (no-op actions, no state adapter) is used for the root profile accessors returned directly from `ProfilesManager.resolveRootProfile()` — specifically `getDefaultAdHocDataViews` and `getDefaultEsqlQuery`, which are consumed before any scoped manager exists (e.g. during app initialization). Scoped managers pass through the toolkit supplied by their host surface. In the main Discover app this is usually the full Redux-backed runtime toolkit, while the document route, surrounding documents page, embeddables, and tests may provide an in-memory toolkit with only the actions they can support.

When adding new toolkit actions:

1. Add the method to `ContextAwarenessToolkitActions` in `toolkit.ts`.
2. Provide host-specific implementations when constructing each toolkit for surfaces that should expose the action.
3. Treat the action as optional in extension point implementations and access it via `params.toolkit.actions`.

## Error handling

- **Resolution errors** (thrown from `resolve`): Caught in `ProfilesManager` / `ScopedProfilesManager`. Logged via `logResolutionError`. The default context for that level is used as fallback.
- **Extension point errors** (thrown from profile methods): Not caught by the framework. These propagate to the calling component. Extension point implementations are responsible for their own error handling.
- **Abort handling**: Superseded async resolutions are silently discarded — the result is ignored if the abort signal has fired. The signal is owned by the manager and is not passed into provider `resolve` methods.

## EBT (Event-Based Telemetry)

`ScopedProfilesManager` tracks:

- **Root and data source events**: Emitted when data source resolution is applied, via `trackContextualProfileResolvedEvent({ contextLevel, profileId })`.
- **Document events**: Emitted lazily when the proxied record's `context` property is read.
- **Active profiles context**: Updated on data source resolution via `updateProfilesContextWith([rootId, dataSourceId])`, which sets the EBT context for all subsequent events in that session.

The `ScopedDiscoverEBTManager` is injected at scoped manager creation time.

## Testing

- **Unit tests** for `composable_profile.ts`, `profile_service.ts`, `profiles_manager.ts`, `record_has_context.ts`, `extend_profile_provider.ts`, `register_enabled_profile_providers.ts`, and hooks live alongside their source files.
- **Mocks** are in `__mocks__/`. Use these when testing components that depend on the framework.
- **When modifying framework internals**, run the existing test suite to catch regressions:
  ```
  yarn test:jest src/platform/plugins/shared/discover/public/context_awareness/
  ```
- **When adding extension points**, add consumption tests in the relevant Discover component tests, not in the framework tests. The framework tests verify the generic merging and resolution mechanics — extension point behavior is tested at the call site.

## Inspector

The `inspector/` directory implements a profiles inspector panel accessible from Discover's inspector drawer. It shows the currently resolved profiles for each context level. This is useful for debugging which profiles matched and in what order.
