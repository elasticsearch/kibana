# @kbn/change-history-ui

Shared browser package for **change history** UI in Kibana. Domains integrate via `ChangeHistoryAdapter`; the package ships a **fullscreen modal** shell and reusable timeline components.

List, detail, and restore flows use **react-query** (`@kbn/react-query`) for caching and invalidation. The package does not create its own `QueryClient` — the host app must provide one.

## Integration (4 steps)

1. **Mount `QueryClientProvider`** — once at the app root (or any ancestor of change history UI). Most Kibana apps already do this; if yours does not, add it before `ChangeHistoryProvider`.
2. **Implement `ChangeHistoryAdapter`** — `listChanges` and `getChange`, optional `restoreChange`.
3. **Wrap with `ChangeHistoryProvider`** — pass adapter, `renderPreview`, `labels.previewTitle`, optional `renderBadge`, `features`, and `permissions`.
   Enable restore with **both** `features={{ restore: true }}` and `permissions={{ canRestore: true }}`.
4. **Render `ChangeHistoryTrigger` + `ChangeHistoryModal`** — modal overlay; no dedicated route required.

```tsx
import { QueryClientProvider } from '@kbn/react-query';
import {
  ChangeHistoryProvider,
  ChangeHistoryModal,
  ChangeHistoryTrigger,
} from '@kbn/change-history-ui';

<QueryClientProvider client={queryClient}>
  <ChangeHistoryProvider
    objectId={workflowId}
    adapter={workflowChangeHistoryAdapter}
    renderPreview={renderWorkflowYamlPreview}
    renderBadge={renderWorkflowBadge}
    labels={{ previewTitle: workflowName }}
  >
    <ChangeHistoryTrigger />
    <ChangeHistoryModal />
  </ChangeHistoryProvider>
</QueryClientProvider>
```

### Tests

Wrap components under test with a `QueryClientProvider`. See `src/test_utils/create_query_client_wrapper.tsx`.

## React-query cache

Hooks read from the nearest `QueryClientProvider`. Multiple consumers in the same app **share one client**; cache entries are isolated by query key, not by adapter instance.

Query keys are scoped per object:

```
['change-history', <objectId>, 'list', pageSize]
['change-history', <objectId>, 'detail', <changeId>]
```

- **`objectId` must be unique** among all change-history consumers under the same `QueryClient`. Use the domain's real saved-object id, or prefix it (e.g. `workflow:${id}`) if ids could collide across features.
- **`adapter` is not part of the key** — do not reuse the same `objectId` with different adapters.
- After a successful restore, `useChangeHistoryRestore` calls `useInvalidateChangeHistory(objectId)` to refetch active list and detail queries. Consumers do not need to call invalidation unless they mutate history outside the restore button.

## HTTP adapter

`createChangeHistoryHttpAdapter` sends **0-based** `page` query params, matching the package's internal pagination (`page.index` starts at `0`).

Domains with **1-based** list APIs that embed detail in each row (e.g. workflows) should implement a custom `ChangeHistoryAdapter` instead of the generic HTTP helper.

For list-backed adapters, ensure `getChange` can resolve while the list is refetching (e.g. do not clear an in-memory detail cache until new list data has arrived).

## Running tests

```bash
node scripts/jest x-pack/platform/packages/shared/kbn-change-history-ui/src/hooks/use_change_history_list.test.ts
node scripts/jest x-pack/platform/packages/shared/kbn-change-history-ui/src/components/modal/change_history_modal.test.tsx
```

## Exports

- Types (`ChangeHistoryAdapter`, DTOs, …)
- `ChangeHistoryProvider`, `useChangeHistoryConfig`, `useChangeHistoryList`, `useChangeHistoryDetail`, `useChangeHistoryRestore`
- `useInvalidateChangeHistory`, `useChangeHistoryAutoSelection`
- Query key helpers (`changeHistoryListQueryKey`, `changeHistoryDetailQueryKey`, `changeHistoryObjectQueryKeyPrefix`, …)
- `ChangeHistoryModal`, `ChangeHistoryTrigger`, `ChangeHistoryPreviewPanel`
- `createChangeHistoryHttpAdapter`
