---
navigation_title: Callout
---

# @kbn/ui-callout [kbn-ui-callout]

`@kbn/ui-callout` provides a small set of **semantic callouts** for surfacing a message inline, in the context of the page it relates to. They are curated, composed components rather than flexible primitives: each variant presets its color, icon, and button styling, so you choose the one that matches your *intent* and the component keeps callouts consistent across {{kib}}.

The package replicates the redesigned [`EuiCallOut`](https://github.com/elastic/eui/pull/9642) using public EUI primitives, so you can adopt the new look today and migrate to the native component with little or no change once it ships.

## When to use a callout [kbn-ui-callout-when-to-use]

A callout is tied to a region of the page and stays visible until the user dismisses it or the underlying context changes. Reach for a different pattern when that isn't true:

* **Callout** — persistent, in-context information about the area it sits next to (a form, a panel, a step in a flow).
* **Toast** — a brief, transient confirmation of something that just happened. It disappears on its own.
* **Banner** — a global message that applies to the whole app or space, not a single region.

Keep callouts short. A callout that needs several paragraphs usually belongs in the page body or its own panel.

## Variants [kbn-ui-callout-variants]

Choose the variant by meaning, not by color. This is what keeps callouts predictable for users — the same color always carries the same intent.

| Component | Use it to… |
| --- | --- |
| `KbnInfoCallout` | Share neutral, contextual information, tips, or help. |
| `KbnSuccessCallout` | Confirm that an action completed successfully. |
| `KbnWarningCallout` | Flag something that needs attention but isn't broken. |
| `KbnDangerCallout` | Communicate an error, failure, or destructive consequence. |

:::{storybook}
:id: kibana:kbn_ui:callout--variants
:::

## Getting started [kbn-ui-callout-usage]

Import the variant that matches your message and give it a `title` and `content`. Nothing else is required.

```tsx
import { KbnWarningCallout } from '@kbn/ui-callout';

<KbnWarningCallout
  title="Unsaved changes"
  content="Your changes will be lost if you navigate away."
/>;
```

Every variant accepts the same props:

| Prop | Description |
| --- | --- |
| `title` | Short, text-only title. |
| `content` | Body content. For `size="s"` it renders inline with the title, separated by a dot. |
| `size` | `m` (stacked, the default) or `s` (inline banner). |
| `onDismiss` | When provided, renders a dismiss (X) button and is called when it's clicked. |
| `actions` | `{ primary, secondary }` — see [Actions](#kbn-ui-callout-actions). |

Each component also exports its own props type (for example `KbnWarningCalloutProps`) for typing wrappers and handlers.

## Actions [kbn-ui-callout-actions]

Add up to two actions with the `actions` prop. The variant owns the button color and emphasis — the primary action is a filled button, the secondary an empty one — so you only supply the label and behavior. A `secondary` action can't appear on its own; the type requires a `primary` one.

:::{storybook}
:id: kibana:kbn_ui:callout--actions
:::

```tsx
<KbnInfoCallout
  title="Update available"
  content="A new version is ready to install."
  actions={{
    primary: { label: 'Update now', onClick: onUpdate },
    secondary: { label: 'View changes', href: '/changelog' },
  }}
/>;
```

Each action is `{ label, onClick?, href?, isDisabled?, 'data-test-subj'? }`. Pass `href` to render the action as a link instead of a button.

## Dismissing [kbn-ui-callout-dismiss]

Pass `onDismiss` to render the close (X) button. The callout doesn't manage its own visibility — the host decides what dismissing means (hiding it, remembering the choice, and so on).

:::{storybook}
:id: kibana:kbn_ui:callout--dismissible
:::

```tsx
const [isOpen, setIsOpen] = useState(true);

return isOpen ? (
  <KbnWarningCallout
    title="Unsaved changes"
    content="Your changes will be lost if you navigate away."
    onDismiss={() => setIsOpen(false)}
  />
) : null;
```

## Sizes [kbn-ui-callout-sizes]

The default `m` size stacks the title above the content and actions. Use `s` in tight spaces — it renders the title and content inline like a banner. In both sizes the callout switches between a stacked and a side-by-side layout based on the width available to it.

:::{storybook}
:id: kibana:kbn_ui:callout--sizes
:::

## Custom color and icon [kbn-ui-callout-custom]

Prefer a variant whenever one fits — that's what keeps callouts consistent. For the rare case that needs a different color or icon, the base `KbnCallout` takes a required `color` and an optional `iconType`. The variants are thin wrappers around it.

:::{storybook}
:id: kibana:kbn_ui:callout--custom-icon
:::

```tsx
import { KbnCallout } from '@kbn/ui-callout';

<KbnCallout color="primary" iconType="bell" title="Custom icon" content="…" />;
```

## Accessibility [kbn-ui-callout-accessibility]

* The title and content are placed before the dismiss button in the DOM, so screen readers reach the message before the control.
* The dismiss button ships with a translated `aria-label` and a matching tooltip.
* Variant icons are decorative and hidden from assistive technology — the variant's meaning comes through the content, not the icon alone.
* Actions render as real buttons (or links when given an `href`), so they're keyboard accessible by default.

## Development [kbn-ui-callout-development]

Run the stories in the shared `kbn-ui` Storybook:

```bash
yarn storybook kbn_ui
```

## Testing [kbn-ui-callout-testing]

```bash
yarn test:jest src/platform/kbn-ui/callout
```
