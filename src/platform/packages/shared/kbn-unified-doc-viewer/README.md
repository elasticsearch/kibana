# @kbn/unified-doc-viewer

Renders the **document viewer** — the tabbed detail view for a single Elasticsearch document — used by Discover and other consumers. Tabs are `DocView`s registered on a `DocViewsRegistry` and rendered by `DocViewer`.

## Deep-linking a tab's state to the URL

A `DocView` tab can make part of its state **URL-shareable**: when a Discover document link is copied and reopened, the tab reopens with that state restored (e.g. the selected sub-tab, or an open nested panel).

Two things are required:

1. **Declare a bounded `shareableStateSchema`** on the `DocView` registration — this decides _what_ is shareable.
2. **Report the tab's state** through the render props `initialState` / `onInitialStateChange` (`DocViewRestorableStateProps`) — this decides _how the tab reports it_.

Only what the tab reports is eligible for sharing, and only the fields the schema admits reach the URL. The host (Discover) projects the state through the schema, validates and size-caps it on read, and ties it to the expanded document.

### 1. Declare the schema

`shareableStateSchema` is a [zod](https://github.com/colinhacks/zod) schema (`@kbn/zod`) describing a structural subset of the tab's state. Keep every field bounded, and evolve it **additively** (add optional fields; never repurpose a key) so older shared links degrade gracefully rather than break.

```ts
registry.add({
  id: 'doc_view_example',
  title: 'Example',
  order: 10,
  shareableStateSchema: z.object({ selectedSubTab: z.string().max(64) }),
  render: (props) => <ExampleTab {...props} />,
});
```

### 2. Report the state — two methods

Every tab's `render` receives `DocViewRestorableStateProps`: `initialState` (seed on mount) and `onInitialStateChange` (report the current state). There are two ways to satisfy this contract.

#### Method 1 — `withRestorableState` / `useRestorableState` (recommended default)

The [`@kbn/restorable-state`](../kbn-restorable-state/README.md) HOC wires both props for you, and additionally restores the state across **in-app tab switches**, not just shared links.

```ts
interface ExampleState {
  selectedSubTab: string;
}

const { withRestorableState, useRestorableState } =
  createRestorableStateProvider<ExampleState>();

const InternalExampleTab = () => {
  const [selectedSubTab, setSelectedSubTab] = useRestorableState('selectedSubTab', 'overview');
  // ...render using selectedSubTab / setSelectedSubTab
};

// Now accepts `initialState` / `onInitialStateChange`, satisfying DocViewRestorableStateProps.
export const ExampleTab = withRestorableState(InternalExampleTab);
```

#### Method 2 — wire the props yourself (provider-agnostic)

A tab that manages its state elsewhere — its own store, a redux slice, or you don't want to use `withRestorableState` — can satisfy the **same** contract by hand: seed from `initialState`, report via `onInitialStateChange`. It does **not** need `@kbn/restorable-state`.

```ts
const ExampleTab = ({
  initialState,
  onInitialStateChange,
}: DocViewRenderProps & DocViewRestorableStateProps<ExampleState>) => {
  // On mount, seed your own state from `initialState`.
  // When your state changes, report the full slice:
  onInitialStateChange?.({ selectedSubTab });
  // ...
};
```

## The round-trip

```
report ─▶ project through shareableStateSchema ─▶ URL (_a.docViewerState) ─▶ seed initialState
(tab)      (host: drop non-schema fields,           (single bounded envelope,     (tab reopens with
            drop invalid slices)                      only while a doc is open)     the state restored)
```

On the host side (Discover is the only one implementing it for now), the reported per-tab state is projected through each tab's `shareableStateSchema`, combined with the selected tab into a single `DocViewerShareableState` envelope (`{ selectedTabId, tabsState }`), written to the `_a` URL param **only while a document is expanded**, validated and size-capped on read, and seeded back into each tab's `initialState`.

Guidelines:

- **Bound every schema field** (`.max()` on strings/arrays). The host also caps the whole envelope (`DOC_VIEWER_SHAREABLE_STATE_MAX_LENGTH`) as a backstop, but the per-field bounds are yours to set.
- **Evolve additively** — invalid or unknown slices are dropped on read, not fatal, so old links keep working.
- **Share discrete navigation** (selected sub-tab, open panel id), not high-frequency values (scroll offsets, keystrokes) — they could bloat the URL.
