# @kbn/data-lifecycle-phases

Canonical phase labels, titles, descriptions, and colors for Elasticsearch data lifecycle phases: `hot`, `warm`, `cold`, `frozen`, `delete`.

Used by both Index Lifecycle Management (ILM) and Data Lifecycle Management (DLM) features.

This package also provides shared UI building blocks for inspecting retention policies and configuring data lifecycle in flyouts (Streams, Index Management).

## Components

### `FlyoutWithTabs`

A generic, reusable flyout shell that renders a title and a tab bar in its header. Tab selection state is managed internally and passed to the `children` render prop, so consumers never need their own tab state.

```typescript
import { FlyoutWithTabs } from '@kbn/data-lifecycle-phases';

const tabs = [
  { id: 'summary', label: 'Summary' },
  { id: 'json', label: 'JSON' },
] as const;

<FlyoutWithTabs
  title="My flyout"
  tabsAriaLabel="My flyout tabs"
  tabs={tabs}
  initialTabId="summary"
  onClose={() => setOpen(false)}
  size={400}
>
  {(selectedTab) => (
    <>
      {selectedTab === 'summary' && <SummaryContent />}
      {selectedTab === 'json' && <JsonContent />}
    </>
  )}
</FlyoutWithTabs>
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `title` | `string` | yes | Flyout heading text |
| `tabsAriaLabel` | `string` | yes | Accessible label for the `<EuiTabs>` element |
| `tabs` | `NonEmptyFlyoutTabs<TId>` (`[FlyoutHeaderTab<TId>, ...FlyoutHeaderTab<TId>[]]`) | yes | Tab definitions — must contain at least one entry |
| `initialTabId` | `TId` | no | Tab to select on first render (defaults to first tab) |
| `onClose` | `() => void` | yes | Called when the flyout requests to be closed |
| `size` | `number` | no | Flyout width in pixels (default: `400`) |
| `children` | `(selectedTabId: TId) => ReactNode` | yes | Render prop receiving the active tab ID |

### `DefaultSnapshotRepositoryRequiredModal`

Modal shown when a user tries to add a frozen phase but no snapshot repositories are available. The primary action is a link to create a default repository in Snapshot and Restore (`target="_blank"`). Pass `createDefaultRepositoryUrl` from `application.getUrlForApp('management', { path: '/data/snapshot_restore/add_repository' })` (or equivalent). The split-button secondary action calls `onRefresh` to re-fetch repositories; keep `aria-label` on the icon action via the built-in i18n string.

```typescript
import { DefaultSnapshotRepositoryRequiredModal } from '@kbn/data-lifecycle-phases';

<DefaultSnapshotRepositoryRequiredModal
  createDefaultRepositoryUrl={url}
  onCancel={close}
  onRefresh={refetchRepositories}
  isRefreshing={isLoading}
/>
```

### `InspectIlmPolicyFlyout`

A stateless flyout for inspecting an ILM policy. Displays a **Summary** tab (per-phase accordions with action details) and a **JSON** tab (copyable `PUT _ilm/policy/…` request).

```typescript
import { InspectIlmPolicyFlyout } from '@kbn/data-lifecycle-phases';

<InspectIlmPolicyFlyout
  policyName="my-policy"
  policy={serializedPolicy}
  onBack={() => {}}
  onEditPolicy={(name) => navigateToIlmEditor(name)}
  onSelectAndApply={(name) => applyPolicy(name)}
/>
```

### `RetentionSelector`

A searchable selector for retention options, with optional inspect affordances (e.g. “Inspect ILM policy”).

```typescript
import type { RetentionOption } from '@kbn/data-lifecycle-phases';
import { RetentionSelector } from '@kbn/data-lifecycle-phases';

const options: RetentionOption[] = [
  { name: 'logs-default', descriptionParts: ['30 days', '3 phases'], inspectable: true },
  { name: 'metrics-long', descriptionParts: ['180 days', '2 phases'] },
];

<RetentionSelector
  options={options}
  selectedOptionName="logs-default"
  onSelectOption={(name) => setSelected(name)}
  onInspect={(name) => openInspectFlyout(name)}
  searchPlaceholder="Search policies"
  inspectButtonLabel={(name) => `Inspect ${name}`}
/>
```

### `EditDataLifecycleFlyoutBody`

Flyout body content for configuring a stream/index lifecycle:

- Optional **inherit lifecycle** section (disabled state + pinned inherited values while inheriting)
- Optional **lifecycle method** picker (`dlm` vs `ilm`)
- ILM policy selection (uses `RetentionSelector` under the hood)
- Optional custom content area when Data Stream Lifecycle is active (consumer-provided)

```typescript
import { EditDataLifecycleFlyoutBody } from '@kbn/data-lifecycle-phases';

<EditDataLifecycleFlyoutBody
  inherit={{
    value: inheritLifecycle,
    onChange: setInheritLifecycle,
    link: { href: inheritedFromUrl, label: 'View source' },
  }}
  method={{ value: lifecycleMethod, onChange: setLifecycleMethod }}
  ilm={{
    policies: ilmPolicies,
    selectedPolicyName: selectedIlmPolicyName,
    onSelect: setSelectedIlmPolicyName,
    onInspect: openInspectIlmPolicyFlyout,
  }}
  dataStreamLifecycleContent={<MyDataStreamLifecycleContent />}
/>
```

### `FlyoutFooterWithRetentionWarning` and `useRetentionWarning`

A shared flyout footer with **Cancel / Apply** actions and an optional warning callout. The `useRetentionWarning` hook helps determine whether to show the warning based on the selected ILM policy (e.g. when downsampling steps cannot be applied).

```typescript
import { FlyoutFooterWithRetentionWarning, useRetentionWarning } from '@kbn/data-lifecycle-phases';

const showWarning = useRetentionWarning({
  ilmPolicies,
  selectedIlmPolicyName,
  canUseDownsampling,
  inheritLifecycle,
});

<FlyoutFooterWithRetentionWarning
  onCancel={closeFlyout}
  onApply={applyChanges}
  isApplyDisabled={!isValid}
  showWarning={showWarning}
/>
```
### `EnterpriseGatingModal`

A stateless modal for gating Enterprise-only data lifecycle actions (for example, enabling the frozen data phase). Consumers control visibility via `isOpen` and should hide/unmount the modal when `onCancel` is called.

The primary action is intentionally callback-based through `onPrimaryAction` because the final action behavior is consumer-defined. The component chooses the visible primary action from the environment/permission/trial inputs:

- Self-managed: primary action is `contactUs`
- Cloud + no subscription management permission: no primary action
- Cloud + subscription management permission: `startTrial` (default) or `upgrade` when `trialStatus` is `expired`

The “Review subscription features” link is controlled by the required `subscriptionFeaturesUrl` prop. Consumers must provide it explicitly (for example, `https://www.elastic.co/subscriptions/cloud` for Cloud or `https://www.elastic.co/subscriptions` for self-managed).

### `FrozenEnterpriseRequiredCallout`

A warning callout shown when the current subscription tier does not support the frozen phase. The optional `onUpgradeEnterprise` callback renders an "Upgrade to enterprise" action; when omitted, the callout is informational only.

```typescript
import { FrozenEnterpriseRequiredCallout } from '@kbn/data-lifecycle-phases';

<FrozenEnterpriseRequiredCallout
  onUpgradeEnterprise={openUpgradeFlow}
  calloutTestSubj="frozenEnterpriseRequiredCallout"
  upgradeButtonTestSubj="frozenEnterpriseUpgradeButton"
/>
```

### `FrozenDefaultRepositoryRequiredCallout`

A warning callout shown when the previously assigned default searchable snapshot repository is no longer available. Renders an `EuiSplitButton` whose primary action creates a default repository (`onCreateDefaultRepository`) and whose secondary action refreshes the panel (`onRefresh`, with `isRefreshing` for the loading state). When neither callback is provided, the callout is informational only.

```typescript
import { FrozenDefaultRepositoryRequiredCallout } from '@kbn/data-lifecycle-phases';

<FrozenDefaultRepositoryRequiredCallout
  onCreateDefaultRepository={openCreateRepositoryFlow}
  onRefresh={refetchRepositories}
  isRefreshing={isLoading}
/>
```

## Development

### Storybook

View and develop the components in Storybook:

```bash
yarn storybook data_lifecycle_phases
```
