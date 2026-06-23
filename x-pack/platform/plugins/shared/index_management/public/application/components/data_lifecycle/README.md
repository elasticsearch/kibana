# Data lifecycle (Index Management)

Shared UI building blocks for configuring **Data Stream Lifecycle (DLM)** in Index Management.

## `EditDataLifecycleFlyout`

The top-level flyout for editing a data stream's lifecycle. Combines DLM phase configuration, ILM policy selection, and failed-data retention in a tabbed UI.

`onApply` receives `{ successfulData, failedData }` where `successfulData` is one of:

| Case | Shape |
|------|-------|
| Inheriting from index template | `{ inheritLifecycle: true }` |
| DLM with phase durations | `{ inheritLifecycle: false, method: 'dlm', frozenAfter?: '30d', dataRetention?: '60d' }` |
| ILM with a selected policy | `{ inheritLifecycle: false, method: 'ilm', ilmPolicyName: string }` |
| ILM but no policy chosen yet | `undefined` |

And `failedData` is `{ inheritLifecycle: true }` or `{ inheritLifecycle: false, failureStoreEnabled: boolean }`.

```tsx
import { EditDataLifecycleFlyout } from './edit_data_lifecycle_flyout';

<EditDataLifecycleFlyout
  onClose={() => setOpen(false)}
  onApply={({ successfulData, failedData }) => {
    // persist successfulData and failedData
  }}
  successfulData={{
    inheritLifecycle,
    onInheritLifecycleChange: setInherit,
    dlm: { hasEnterpriseLicense, hasDefaultSnapshotRepository, ... },
  }}
  failedData={{
    inheritLifecycle: inheritFailed,
    onInheritLifecycleChange: setInheritFailed,
    failureStoreEnabled,
    onFailureStoreChange: setFailureStoreEnabled,
    deletePhase: { value: deletePhase, onChange: setDeletePhase },
  }}
/>;
```

### Key design decisions

- **`onApply` is the single source of truth** for DLM durations. The flyout tracks phase changes internally and includes `frozenAfter` / `dataRetention` in the `successfulData` payload — callers do not need to subscribe to any separate `onChange`.
- `successfulData.dlm.onChange` is intentionally omitted from the prop type; use `onApply` instead.
- `onInheritLifecycleChange` is optional on both `successfulData` and `failedData`. Omitting it hides the inherit toggle entirely.

---

## `DlmPhasesSelector`

Low-level phase selector used internally by `EditDataLifecycleFlyout`. Use this directly only when you need the phase picker without the flyout shell.

Configure DLM phase timings:

- **Hot**: required
- **Frozen**: optional (gated by license + default snapshot repository)
- **Delete**: optional

```tsx
import { DlmPhasesSelector } from './dlm_phases_selector';

<DlmPhasesSelector
  hasEnterpriseLicense={hasEnterpriseLicense}
  hasDefaultSnapshotRepository={hasDefaultSnapshotRepository}
  defaultSnapshotRepository={defaultSnapshotRepositoryName}
  onRefreshDefaultSnapshotRepository={refreshDefaultSnapshotRepository}
  onChange={(value, serialized, isValid) => {
    // value: normalized UI state
    // serialized: { frozen_after?: '30d', data_retention?: '90d' }
    // isValid: duration + ordering validation
  }}
/>;
```

### Props

- `hasEnterpriseLicense` / `hasDefaultSnapshotRepository`: required booleans used to gate the frozen phase toggle.
- `onRefreshDefaultSnapshotRepository`: optional revalidation handler for the default repository modal.
- `defaultValue`: optional initial values (defaults: frozen disabled `30d`, delete disabled `60d`).
- `isDisabled`: disables editing.
- `defaultSnapshotRepository`: optional default repository name shown in the frozen phase "Searchable snapshot" info.
- `manageRepositoriesUrl`: URL for the "manage your repositories" link.
- `onChange(value, serializedValue, isValid)`: called on any change.

Note: this component uses `@kbn/i18n-react`. In Jest/component tests wrap with `__IntlProvider` (see `dlm_phases_selector/dlm_phases_selector.test.tsx`).

### Phase cards (internal building blocks)

`DlmPhasesSelector` is composed of three "card" components under `dlm_phases_selector/`. These are **internal** (not exported from `dlm_phases_selector/index.ts`) but are useful to understand when updating the UX.

- **`HotPhaseCard`** (`dlm_phases_selector/hot_phase_card.tsx`)
  - **Purpose**: renders the required **Hot** phase as always enabled.
  - **Behavior**: `checked` is always true and the card is `disabled`; shows a "Required" badge.
  - **Props**: `id` (checkbox id) and `color` (phase dot color from `usePhaseColors()`).

- **`FrozenPhaseCard`** (`dlm_phases_selector/frozen_phase_card.tsx`)
  - **Purpose**: optional **Frozen** phase configuration (move-to-frozen after a duration).
  - **Self-contained gating**: the card receives the raw requirement booleans (`hasEnterpriseLicense`, `hasDefaultSnapshotRepository`) plus the data needed to act on them (`canCreateDefaultSnapshotRepository`, `createDefaultRepositoryUrl`, `enterprise`, `onRefreshDefaultSnapshotRepository`), and derives the gating/grace behavior internally. The card also **owns and renders the gating modals** (`EnterpriseGatingModal` and `DefaultSnapshotRepositoryRequiredModal`): both the disabled-state badge and the grace-state callout open the same modal, so the parent no longer manages modal state. The card also captures whether the phase was active on first render to decide the grace state.
  - **Disabled + badge behavior** (phase **not** active and a requirement is missing):
    - **No Enterprise license** → "Enterprise required" badge (clicking it opens the `EnterpriseGatingModal`).
    - **No default snapshot repository** → "Default repository required" badge (clicking it opens the `DefaultSnapshotRepositoryRequiredModal`). Enterprise takes precedence when both are missing.
    - The card is disabled and the config UI is hidden even if `duration.enabled` is true.
  - **Grace state (existing template with frozen already active)**:
    - When the card mounts with `duration.enabled === true` (e.g. editing an existing template) but a requirement is missing, it keeps the phase **enabled** and renders warning callouts instead of a badge, matching the order used by the Streams DLM frozen configuration flyout:
      - `FrozenEnterpriseRequiredCallout` renders **above** the configuration when the Enterprise license is missing; its "Upgrade to enterprise" button opens the same `EnterpriseGatingModal` as the badge.
      - `FrozenDefaultRepositoryRequiredCallout` renders **inside the Searchable snapshot section** when the default repository is missing; its "Create default repository" button opens the same `DefaultSnapshotRepositoryRequiredModal` as the badge (disabled when `canCreateDefaultSnapshotRepository` is false), and its refresh button revalidates via `onRefreshDefaultSnapshotRepository`.
    - While a warning callout is shown the phase configuration inputs (move-after duration) are **disabled** until the warning is resolved or the phase is turned off.
    - The user can resolve the warning or **uncheck** the phase. Once unchecked while a requirement is missing, the card collapses back to the disabled + badge state (and the badge/modal for the situation). It can't be re-enabled until the requirement is satisfied.
  - **What it renders when enabled**:
    - `DurationFields` labeled "Move after …"
    - A "Searchable snapshot" info row plus `SearchableSnapshotRepositoryInfo` when `defaultSnapshotRepository` is provided (or the default-repository warning callout in the grace state).
  - **Props**: `duration`/`durationError`/`helpText`/`onChange`, `isFormDisabled`, `defaultSnapshotRepository`, `manageRepositoriesHref`, the requirement booleans `hasEnterpriseLicense`/`hasDefaultSnapshotRepository`, and the data the card needs to drive its own modals: `canCreateDefaultSnapshotRepository`, `createDefaultRepositoryUrl`, `enterprise` (all required), plus the optional `onRefreshDefaultSnapshotRepository` callback.

- **`DeletePhaseCard`** (`dlm_phases_selector/delete_phase_card.tsx`)
  - **Purpose**: optional **Delete** phase configuration (delete after a duration).
  - **Behavior**:
    - Uses a trash icon and a checkbox to toggle `duration.enabled`.
    - The card is disabled via `isCardDisabled` (the selector passes `isDisabled`).
    - `DurationFields` are disabled when either `isFormDisabled` or `isCardDisabled` is true.
  - **Props**: `duration`/`durationError`/`helpText`/`onChange`, `isCardDisabled`, `isFormDisabled`, `id`.

## Development

### Storybook

From the Kibana repo root, run:

```bash
yarn storybook index_management
```
