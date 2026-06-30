# @kbn/content-list-provider-client

Client-side Content List Provider — designed for easy migration from `TableListView`.

## Overview

This package provides a client-side adapter for content listing that wraps existing `TableListView`-style `findItems` functions. It enables consumers to migrate from `TableListView` to the new `ContentListProvider` architecture with minimal code changes.

## When to Use

Use this provider when:

- **Migrating from `TableListView`** with minimal code changes.
- Working with **smaller datasets** (< 10,000 items).
- Your existing `findItems` implementation already handles data fetching.

## How It Works

This adapter is designed for easy migration from `TableListView`. It:

- **Passes only `searchQuery`** to your existing `findItems` function (matching `TableListView` behavior).
- **Caches the server response by `searchQuery`** — changing filters, sort, or page reuses the cached items and does not trigger a new server round-trip.
- **Applies client-side filtering, sorting, and pagination** in memory on the cached items. Your `findItems` returns all matching items; the adapter narrows them.
- **Does not forward** `sort`, `page`, or `filters` parameters to your `findItems` implementation.
- **Exposes `onInvalidate`** on the data source so the core provider can force a fresh server fetch after mutations (e.g. delete). The consumer never calls this directly — it happens automatically.

## Usage

### Basic Migration from TableListView

The key migration step is passing your existing `findItems` function:

```tsx
import { ContentListClientProvider } from '@kbn/content-list-provider-client';

// Your existing findItems function from TableListView - no changes needed!
const findItems = useCallback(
  async (searchTerm) => {
    return dashboardClient.search({
      query: searchTerm,
    }).then(({ meta: { total }, data }) => ({
      total,
      hits: data.map(transformToDashboardUserContent),
    }));
  },
  []
);

// Before: TableListView
<TableListView
  findItems={findItems}
  entityName="dashboard"
  entityNamePlural="dashboards"
  // ...other props
/>

// After: ContentListClientProvider
<ContentListClientProvider
  id="dashboard"
  labels={{
    entity: i18n.translate('dashboard.listing.entity', { defaultMessage: 'dashboard' }),
    entityPlural: i18n.translate('dashboard.listing.entityPlural', { defaultMessage: 'dashboards' }),
  }}
  findItems={findItems}
>
  <MyDashboardList />
</ContentListClientProvider>
```

## Props

| Prop            | Type                          | Required | Description                                                                    |
| --------------- | ----------------------------- | -------- | ------------------------------------------------------------------------------ |
| `id`            | `string`                      | Yes\*    | Unique identifier. `queryKeyScope` derived as `${id}-listing` if not provided. |
| `queryKeyScope` | `string`                      | Yes\*    | Explicit React Query cache key scope.                                          |
| `labels`        | `ContentListLabels`           | Yes      | User-facing entity labels (should be i18n-translated).                         |
| `findItems`     | `TableListViewFindItemsFn`    | Yes      | Your existing `TableListView` findItems function.                              |
| `core`          | `ContentListKibanaCore`       | Yes      | Kibana `CoreStart` slice. Used to read `savedObjects:perPage` / `savedObjects:listingLimit` from `uiSettings`, and to power the internal `ContentEditorKibanaProvider` that backs the Content Editor flyout. A full `CoreStart` value satisfies this structurally. |
| `features`      | `ContentListClientFeatures`   | No       | Feature configuration. Replaces the base provider's `contentEditor` with a Kibana-flavored config bag (`isReadonly`, `onSave`, `customValidators`, `appendRows`); the provider rebuilds it into the base shape's `features.contentEditor.open` callback so `<Action.ContentEditor />` can read it directly. |
| `services`      | `ContentListClientServices`   | No       | Domain services. Extends `ContentListServices` with `savedObjectsTagging` (powers the Content Editor flyout's tag UI). |
| `item`          | `ContentListItemConfig`       | No       | Per-item configuration for links.                                              |
| `isReadOnly`    | `boolean`                     | No       | Disable mutation actions.                                                      |

\*At least one of `id` or `queryKeyScope` is required.

> The provider wraps its tree with `ContentEditorKibanaProvider` internally and calls `useOpenContentEditor()` for you — consumers never need to mount the provider or pass an `openContentEditor` themselves.

## findItems Function Signature

Your existing `findItems` function should match this signature:

```typescript
interface SavedObjectReference {
  type: string;
  id: string;
  name?: string;
}

type TableListViewFindItemsFn = (
  searchQuery: string,
  refs?: {
    references?: SavedObjectReference[];
    referencesToExclude?: SavedObjectReference[];
  }
) => Promise<{ total: number; hits: UserContentCommonSchema[] }>;
```

This is the same signature expected by `TableListView.findItems`.

> **Note:** The `refs` parameter (for tag filtering) is not yet supported in the new `ContentListProvider` architecture. Only `searchQuery` is forwarded in this initial version. Tag filtering support is planned for a future release.

## Saved-object listing services

`ContentListClientProvider` is a generic primitive — it accepts plain `core`/`services`/`features`/`findItems` args. For typical saved-object listings (Dashboards, Maps, Visualize, Graph, etc.) the wiring of those args is repetitive: build a tags service from the tagging API, instantiate a favorites client, decorate `findItems` with EBT performance metrics, format duplicate-title validators, and so on.

The `services/` folder ships small, single-purpose helpers — one per capability area. Each helper builds exactly one piece of the args you already pass to `ContentListClientProvider`. They are not a wrapper, hook, or "preset"; they are the building blocks of the existing API surface.

Each subfolder is named after the `ContentListClientProvider` field it serves:

| Helper                                | Subfolder                | Fills                                          |
| ------------------------------------- | ------------------------ | ---------------------------------------------- |
| `createTagsService(api)`              | `services/tags/`         | `services.tags`                                |
| `createFavoritesService(opts)`        | `services/favorites/`    | `services.favorites`                           |
| `createUserProfilesService(profile)`  | `services/user_profiles/`| `services.userProfiles`                        |
| `createContentInsightsService(opts)` + `<SavedObjectActivityRow>` | `services/content_insights/` | `features.contentEditor.appendRows`            |
| `createDuplicateTitleValidator(opts)` | `services/duplicate_title/` | `features.contentEditor.customValidators.title`|
| `useRecentlyAccessedDecoration(src)`  | `services/recently_accessed/` | `findItems` decoration + `features.flags` + a closure-bound `RecentsFilter` |
| `withPerformanceMetrics(fn, opts)`    | `services/performance_metrics/` | wraps `findItems` / `actions.delete.onBulkAction` |

Each helper is tested in isolation and is independently optional. Use one, several, or none — `ContentListClientProvider` accepts the raw types either way.

### Composing them in a consumer

```tsx
import {
  ContentListClientProvider,
  createTagsService,
  createFavoritesService,
  createUserProfilesService,
  createContentInsightsService,
  createDuplicateTitleValidator,
  useRecentlyAccessedDecoration,
  withPerformanceMetrics,
  SavedObjectActivityRow,
} from '@kbn/content-list-provider-client';

const tags = createTagsService(savedObjectsTagging.getTaggingApi()?.ui);
const favorites = createFavoritesService({
  appId: 'dashboards',
  savedObjectType: 'dashboard',
  http: coreServices.http,
  userProfile: coreServices.userProfile,
  usageCollection: usageCollectionService,
});
const userProfiles = createUserProfilesService(coreServices.userProfile);
const insights = createContentInsightsService({
  http: coreServices.http,
  logger,
  domainId: 'dashboard',
});
const search = useMemo(
  () =>
    withPerformanceMetrics(rawSearch, {
      analytics: coreServices.analytics,
      eventName: SAVED_OBJECT_LOADED_TIME,
      savedObjectType: 'dashboard',
    }),
  [rawSearch]
);
const recents = useRecentlyAccessedDecoration(getDashboardRecentlyAccessedService());

return (
  <ContentListClientProvider
    core={coreStart}
    services={{ tags, favorites, userProfiles, savedObjectsTagging }}
    findItems={async (q, opts) => recents.decorate(await search(q, opts))}
    features={{
      flags: [recents.flag],
      contentEditor: {
        onSave: updateItemMeta,
        customValidators: {
          title: [
            createDuplicateTitleValidator({
              findCurrentTitle: (id) =>
                findService.findById(id).then((r) =>
                  r.status === 'error' ? undefined : r.attributes.title
                ),
              checkForDuplicate: ({ title, lastSavedTitle }) =>
                checkForDuplicateDashboardTitle({
                  title,
                  lastSavedTitle,
                  copyOnSave: false,
                  isTitleDuplicateConfirmed: false,
                }),
            }),
          ],
        },
        appendRows: (item) => (
          <SavedObjectActivityRow service={insights} item={item} entityNamePlural="dashboards" />
        ),
      },
    }}
  >
    <ContentListToolbar>
      <Filters>
        <Filters.Starred />
        <recents.RecentsFilter />
        <Filters.Tags />
      </Filters>
    </ContentListToolbar>
    <ContentListTable>{/* ... */}</ContentListTable>
  </ContentListClientProvider>
);
```

### Rendering `<Action.ContentEditor />`

`<Action.ContentEditor />` reads `open` from `features.contentEditor` on the active provider. When the consumer supplies a `contentEditor` config here, the client provider rebuilds it into a base `{ open }` callback so the action can wire itself; if no config is supplied, `open` is `undefined` and the action self-skips, dropping the row icon. Consumers therefore render the action unconditionally — there's no flag to gate on.

```tsx
import { useContentListConfig } from '@kbn/content-list-provider';

const MyList = () => {
  const { isReadOnly } = useContentListConfig();
  return (
    <ContentListTable>
      <Column.Name showDescription showTags />
      {!isReadOnly && (
        <Column.Actions>
          <Action.ContentEditor />
          <Action.Delete />
        </Column.Actions>
      )}
    </ContentListTable>
  );
};
```

## Exports

```typescript
// Provider component.
export { ContentListClientProvider } from './provider';
export type { ContentListClientProviderProps } from './provider';

// Strategy.
export { createClientStrategy } from './strategy';
export type { ClientStrategy } from './strategy';

// Types.
export type {
  TableListViewFindItemsFn,
  TableListViewFindItemsResult,
  SavedObjectReference,
} from './types';

// Saved-object listing services (see "Saved-object listing services" above).
export {
  createTagsService,
  createFavoritesService,
  createUserProfilesService,
  createContentInsightsService,
  SavedObjectActivityRow,
  createDuplicateTitleValidator,
  useRecentlyAccessedDecoration,
  RecentsFilterRenderer,
  withPerformanceMetrics,
} from './services';
```

## Related Packages

- [`@kbn/content-list-provider`](../kbn-content-list-provider) — Core provider and hooks.
- [`@kbn/content-list-toolbar`](../kbn-content-list-toolbar) — Toolbar components consumed by `<recents.RecentsFilter />`.
