# @kbn/change-history-ui

Shared browser package for **change history** UI in Kibana. Domains integrate via `ChangeHistoryAdapter`; the package ships a **fullscreen modal** shell and reusable timeline components.

The host app must provide **`QueryClientProvider`** (`@kbn/react-query`). This package does not create its own `QueryClient`.

## Integration

1. Implement **`ChangeHistoryAdapter`** — `listChanges`, `getChange`, optional `restoreChange`.
2. Wrap with **`ChangeHistoryProvider`** — adapter, `renderPreview`, `labels.previewTitle`, **`scope`**, optional `renderBadge`, `features`, `permissions`, optional `listPageSize` (defaults to `DEFAULT_CHANGE_HISTORY_PAGE_SIZE`, currently 20), and optional `analytics`.
   Enable restore with **both** `features={{ restore: true }}` and `permissions={{ canRestore: true }}`.
3. Render **`ChangeHistoryTrigger`** and **`ChangeHistoryModal`**.

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
    scope={{
      module: 'stack',
      dataset: 'workflows',
      objectType: 'workflow',
    }}
    analytics={{ reportEvent: core.analytics.reportEvent }}
  >
    <ChangeHistoryTrigger />
    <ChangeHistoryModal />
  </ChangeHistoryProvider>
</QueryClientProvider>
```

**`scope`** — `{ module, dataset, objectType }`, aligned with `@kbn/change-history` server clients and telemetry payloads. **`objectId`** must be unique within that scope when multiple domains share one `QueryClient`.

## HTTP adapter

`createChangeHistoryHttpAdapter` uses **0-based** `page` query params. Domains with **1-based** list APIs or detail embedded in list rows (e.g. workflows) should implement a custom `ChangeHistoryAdapter`.

## Telemetry

Register EBT event types once in the consuming plugin's `setup()`:

```tsx
import { registerChangeHistoryTelemetryEvents } from '@kbn/change-history-ui';

registerChangeHistoryTelemetryEvents(analytics);
```

For bundle size, lazy-load registration:

```tsx
void import('@kbn/change-history-ui/src/telemetry/register_change_history_telemetry_events').then(
  ({ registerChangeHistoryTelemetryEvents }) => registerChangeHistoryTelemetryEvents(analytics)
);
```

Pass **`analytics={{ reportEvent: core.analytics.reportEvent }}`** and **`scope`** into `ChangeHistoryProvider`. Set `features={{ telemetry: false }}` to disable reporting.

Registration is idempotent: call from each consumer's `setup()`; Core rejects duplicate event types and other errors are rethrown. First successful registration wins for schema ownership.

Every payload includes `eventName`, `module`, `dataset`, and `objectType` (from `scope`). Use `useChangeHistoryConfig().telemetry` to emit additional events from custom UI.

### Events

| Event type | `eventName` | When emitted | Notable properties |
| --- | --- | --- | --- |
| `change_history_opened` | Change history opened | Each time the modal is opened (closed → open) | — |
| `change_history_change_selected` | Change history change selected | User selects a timeline row or auto-selects latest | `selectionSource` (`user_click` \| `auto_latest`), `hasSequence`, optional `eventAction` |
| `change_history_filter_applied` | Change history filter applied | Filter UI applies a change *(not wired yet)* | `filterType` (`timeRange` \| `actor`), optional `hasActiveTimeRange`, `activeActorCount` |
| `change_history_diff_viewed` | Change history diff viewed | User views a diff *(not wired yet)* | `comparisonType` (`vs_current` \| `vs_previous`), optional `versionDistance`, `compareMode`, `hasSemanticSummary` |
| `change_history_restore_confirmed` | Change history restore confirmed | User confirms restore in the dialog | optional `restoredFromSequence`, `currentSequence`, `rollbackDistance` |
| `change_history_restore_completed` | Change history restore completed | Restore API succeeds | same sequence fields + optional `durationMs` (confirm → API success) |
| `change_history_restore_failed` | Change history restore failed | Restore API fails | optional sequence fields + optional `errorCode` (e.g. `RESTORE_CONFLICT`) |

`rollbackDistance` is `currentSequence - restoredFromSequence` when both are present. Sequence fields are omitted when list rows lack `object.sequence`.
