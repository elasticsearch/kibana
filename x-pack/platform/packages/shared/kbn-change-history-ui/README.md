# @kbn/change-history-ui

Shared browser package for **change history** UI in Kibana. Domains integrate via `ChangeHistoryAdapter`; the package ships a **fullscreen modal** shell and reusable timeline components.

## Integration (3 steps)

1. **Implement `ChangeHistoryAdapter`** — `listChanges` and `getChange`, optional `restoreChange`.
2. **Wrap with `ChangeHistoryProvider`** — pass adapter, `renderPreview`, optional `renderBadge`, labels and optional `features`.
3. **Render `ChangeHistoryTrigger` + `ChangeHistoryModal`** — modal overlay; no dedicated route required.

```tsx
<ChangeHistoryProvider
  objectId={workflowId}
  adapter={workflowChangeHistoryAdapter}
  renderPreview={renderWorkflowYamlPreview}
  renderBadge={renderWorkflowBadge}
>
  <ChangeHistoryTrigger />
  <ChangeHistoryModal />
</ChangeHistoryProvider>
```

## HTTP adapter

`createChangeHistoryHttpAdapter` sends **0-based** `page` query params, matching the package's internal pagination (`page.index` starts at `0`).

Domains with **1-based** list APIs that embed detail in each row (e.g. workflows) should implement a custom `ChangeHistoryAdapter` instead of the generic HTTP helper.

## Running tests

```bash
node scripts/jest x-pack/platform/packages/shared/kbn-change-history-ui/src/hooks/use_change_history_list.test.ts
node scripts/jest x-pack/platform/packages/shared/kbn-change-history-ui/src/components/modal/change_history_modal.test.tsx
```

## Exports

- Types (`ChangeHistoryAdapter`, DTOs, …)
- `ChangeHistoryProvider`, `useChangeHistoryConfig`, `useChangeHistoryList`, `useChangeHistoryDetail`
- `ChangeHistoryModal`, `ChangeHistoryTrigger`, `ChangeHistoryPreviewPanel`
- Timeline (`ChangeHistoryTimeline`, …)
- `createChangeHistoryHttpAdapter`
