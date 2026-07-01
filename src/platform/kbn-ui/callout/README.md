# @kbn/ui-callout

Variant-specific callout components that replicate the redesigned [`EuiCallOut`](https://github.com/elastic/eui/pull/9642) (currently on an EUI feature branch). The implementation is bespoke — built on public EUI primitives — so consumers can adopt the new look now and swap to the native component with little or no change once it ships. Each variant presets the color and its default notification icon.

These are curated, semantic components — not flexible primitives. The prop surface is intentionally minimal so callouts stay consistent across Kibana; the variant owns its color, icon, and button styling.

## Usage

```tsx
import { KbnInfoCallout, KbnDangerCallout, KbnSuccessCallout, KbnWarningCallout } from '@kbn/ui-callout';

<KbnInfoCallout
  title="Heads up"
  content="Life is a canvas, and you are the artist."
  actions={{
    primary: { label: 'Primary action', onClick: onConfirm },
    secondary: { label: 'Secondary action', onClick: onLearnMore },
  }}
/>
```

The four variants are:

| Component           | Color     | Default icon       |
| ------------------- | --------- | ------------------ |
| `KbnInfoCallout`    | `primary` | `info` (filled)    |
| `KbnSuccessCallout` | `success` | `checkCircleFill`  |
| `KbnWarningCallout` | `warning` | `warningStatic`    |
| `KbnDangerCallout`  | `danger`  | `errorFill`        |

`KbnCallout` is the underlying component; it additionally takes a required `color` and an optional `iconType`, and is what each variant wraps. Use a variant unless you specifically need a custom color/icon combination.

## Props

Variants accept:

- `title` — short, text-only title.
- `content` — body content. For `size="s"` it renders inline with the title, separated by a dot.
- `size` — `m` (stacked) or `s` (inline banner). Defaults to `m`.
- `onDismiss` — renders a dismiss (X) button and fires this callback when clicked.
- `actions` — `{ primary, secondary }`, where each action is `{ label, onClick?, href?, isDisabled?, 'data-test-subj'? }`. A `primary` action is required to show a `secondary` one.

`KbnCallout` adds `color` (required) and `iconType` (override the default notification icon). Each component exports its own props type (e.g. `KbnInfoCalloutProps`, `KbnCalloutProps`, `KbnCalloutAction`).

### Layout

The callout switches between a narrow (column) and a wide (row) layout based on its container's inline size via container queries that adapt to `size`. In wide layouts the actions sit beside the content with the primary action on the right; in narrow layouts they stack beneath it, and go full-width when very narrow.

### Dismiss

Pass `onDismiss` to render the close (X) button.

```tsx
<KbnDangerCallout title="Failed to save" content="Something went wrong." onDismiss={() => setOpen(false)} />
```

## Notes for the EUI team

This package is a temporary, bespoke replica of the [`EuiCallOut` redesign](https://github.com/elastic/eui/pull/9642). The notable bespoke pieces, which disappear once the native component (and its internal `EuiNotificationIcon`) are released:

- **Notification icons.** `info` and `warning` use the new `info_fill` / `warning_static` assets, copied locally because they are not yet in the published EUI icon set. `success` and `danger` reuse the existing `checkCircleFill` / `errorFill` icons.
- **Layout.** The container-query layout, left highlight stripe, inline `size="s"` rendering, and responsive action row are reimplemented with public tokens rather than EUI internals (`useEuiBorderColorCSS`, `getTokenName`).

## Development

```bash
yarn kbn bootstrap
yarn test:jest src/platform/kbn-ui/callout
```
