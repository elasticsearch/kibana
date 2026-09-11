# @kbn/app-header

React APIs for Kibana app headers during the Chrome Next migration.

Chrome Next uses one shared header view with two placement models:

- App-owned inline rendering, where the page renders `AppHeader` in its own React tree.
- Chrome-owned rendering, where the app registers `ChromeAppHeaderConfig` and Chrome renders the
  layout top-bar slot.

Prefer inline rendering when the page owns its header placement. Use Chrome-owned registration when
Chrome must own the top-bar slot, including apps with sticky or shared top-nav constraints such as
Discover, Dashboard, and Lens.

Presentation (shell, title, tabs, badges, menu rendering, stories) lives in private
`@kbn/ui-app-header`. This package is the stable plugin facade: it keeps registration semantics,
Chrome-connected adapters, and the public `@kbn/app-header` imports.

## Folder layout

Connected adapters and Chrome hooks live in `src/app_header/`. Presentation components live in
`@kbn/ui-app-header`. Do not import the UI package from plugins.

## Which API should I use?

Use `AppHeader` when the page can render its header inline. This is the preferred model for pages
that own their title, back target, tabs, badges, and app menu locally. Use `AppHeaderLoading` in
the same slot while that content is not ready yet.

Use `ChromeAppHeaderRegistration` when Chrome should own the top-bar slot. This keeps migration
small for pages with sticky or shared top-nav constraints while still using the shared header view.

Use `useChromeAppHeaderRegistration` only for lower-level wrappers that need to compose registration
with other hooks. Most apps should use `ChromeAppHeaderRegistration`.

Do not register app-header state through `core.chrome`. Use the React adapters in this package.

## Migrating route headers

Use `AppHeader` instead of `EuiPageHeader`, `EuiPageTemplate.Header`, or
`KibanaPageTemplate.Header` for top-level application route headers. `EuiPageHeader` and
`EuiPageTemplate.Header` remain appropriate for nested content and other UI that is not the route
header. `KibanaPageTemplate.Header` and the `KibanaPageTemplate` `pageHeader` prop are deprecated;
do not add new consumers.

See the [AppHeader migration guide](https://github.com/elastic/kibana/issues/283673) for migration
steps, examples, and tracking.

Keep title and back visible at the top while route content scrolls. They replace always-visible
breadcrumbs. Scroll to verify; see [Sticky positioning](#sticky-positioning) if they move away.

## Back navigation

The header chevron is "up", not history. It points at the page's single IA parent — the same
destination for a given route, regardless of how the user arrived. Browser Back remains the only
history control. Do not use `history.back()`, and do not infer origin from history or
`document.referrer`.

The one exception is a satellite page: the route was opened to act on a foreign object or flow and
received an explicit origin (state or param such as `referrer` or an embeddable transfer). That
origin replaces the IA parent. Without it, the page uses its normal parent, or no back.

Pass one target with a `label` that names the destination — the parent page ("Component templates")
or the satellite origin ("Dashboard"):

```tsx
<AppHeader back={{ href: '/app/my-app', label: 'My app' }} title="Details" />
```

Kibana handles same-origin `href` values as SPA navigation, so an `onClick` that navigates to the
same URL is unnecessary. If the handler replaces navigation, call `event.preventDefault()`.

Omit `back` on top-level pages that are already side-nav destinations. Do not copy the classic
breadcrumb trail into `back` (categories, current page, selected tabs). Do not point at the current
URL or a sibling tab — tabs live on `AppHeader.tabs`. Do not pass a cross-space or cross-deployment
href. Do not pass an array of targets; the popover exists only for the breadcrumb-derived fallback.

Use `onClick` when returning to a satellite origin needs more than navigation (for example
`transferBackToEditor`). Keep a real `href` as the fallback.

As a temporary compatibility fix, if an unmigrated page already owns an in-page back (for example
`EuiPageHeader` breadcrumbs or a custom back control) and would also get a Chrome Next compatibility
back from breadcrumbs, mount:

```tsx
<>
  <SuppressChromeBackButton />
  <EuiPageHeader breadcrumbs={[...]} ... />
</>
```

`SuppressChromeBackButton` is inert outside Chrome Next project style. Prefer a full `AppHeader`
migration over long-lived suppression.

Tri-state `back` lives only on chrome registration (`ChromeAppHeaderConfig` via
`ChromeAppHeaderRegistration`). The rendered `AppHeader` component
does not accept `false`:

- value — explicit chrome back (no breadcrumb fallback)
- `false` — intentional no chrome back; suppresses the breadcrumb-derived fallback
- omitted — allow the compatibility fallback to derive back from project breadcrumbs

Do not register `{ back: false }` separately from another app-header config on the same route —
`set` replaces the whole config. Prefer combining fields on one registration, or use
`SuppressChromeBackButton` when suppression is the only registration.

## Page announcements

Chrome Next announces the `AppHeader` / `ChromeAppHeaderRegistration` title, plus the same
brand suffix as classic (`customBranding.pageTitle` or `Elastic`). Do not put breadcrumbs
or that suffix in the header title itself; Chrome appends it.

`AppHeaderLoading` owns the header slot without a title, so a registered chrome-owned title is
not announced while it is mounted. Unmigrated routes fall back to the document title, then the
active nav item. Project breadcrumbs are never announced.

Classic Chrome still announces its visible breadcrumb trail. Back navigation is separate; see
[Back navigation](#back-navigation).

## Discover tabs

Discover uses `DiscoverAppHeader` from `@kbn/app-header/discover` to place its UnifiedTabs bar beside
the title. This is a Discover-specific layout exception; other apps should use the structured
`tabs` or `badges` props on `AppHeader`. The public header components discard undeclared props, so
this internal title slot cannot be forced through a type suppression. When the tabs bar is present,
it owns the bottom separator and title actions remain visible without hovering.

## Loading skeleton

When the page title and menu are not ready yet, mount `AppHeaderLoading` instead of gating the
whole page behind a spinner. It claims the same inline slot as `AppHeader` and skeletons both
regions with defaults that match a typical title + overflow + primary header:

```tsx
<AppHeaderLoading />
```

`back` still renders when provided. Once data arrives, replace it with the real `AppHeader`.

The fully supported swap is a **single-row** header: title (optional back) plus the app menu.
`AppHeaderLoading` does not skeleton tabs, description, metadata, or title actions. Swapping from
the loading placeholder to a multi-row `AppHeader` will change the header height.

The menu skeleton can be customized later if the loaded header will not look like the default
(for example two icon buttons and no primary). `buttonCount` is clamped to AppMenu's
`APP_MENU_ITEM_LIMIT` (3); the primary action is separate and does not count toward that limit.
The menu uses the same responsive collapsed / minimal / expanded layouts as `AppMenu`.

```tsx
<AppHeaderLoading menu={{ buttonCount: 2, hasPrimary: false }} />
<AppHeaderLoading back={{ href: '/app/my-app', label: 'My app' }} />
```

## Editable titles

Pass a title object when the page title can be renamed from the header:

```tsx
<AppHeader
  title={{
    text: name,
    onSave: async (nextName) => {
      const saved = await saveName(nextName);
      if (!saved) {
        return 'Choose a different name.';
      }
    },
  }}
/>
```

The header renders a normal heading until the user edits it. Pressing Enter or leaving the input
saves, Escape cancels, and returning a string from `onSave` keeps edit mode open.

## Description and metadata

Use `description` only when short explanatory text materially helps users understand the page. It
accepts a string:

```tsx
<AppHeader
  title="Data federation"
  description="Query and analyze data stored across multiple Elasticsearch clusters."
/>
```

To add a URL rendered with the fixed label "Learn more", use the object form:

```tsx
<AppHeader
  title="Data federation"
  description={{
    text: 'Query and analyze data stored across multiple Elasticsearch clusters.',
    learnMoreUrl: documentationUrl,
  }}
/>
```

Description and `metadata` share the secondary row and are mutually exclusive. Use metadata for
structured entity facts such as status, owner, or creation time. Documentation links that are not
part of a necessary description belong in the app menu via `docLink`.

## Strict props

The public types are the contract: strings, callbacks, known unions. A type assertion can still
pass a React node as a `label`, or extra keys that get spread into EUI. Either path paints custom
UI and the header stops looking like one component.

The renderer only uses declared fields, and only as real strings. A non-string becomes empty (or is
omitted if optional); leftover keys are dropped. In development this logs a one-time `console.warn`.
Do not pass `FormattedMessage` or other nodes.

If a layout cannot be expressed with the public API, extend the API. The deprecated
`renderCustomBadge` hatch is the only supported custom-UI path today.

Menu item text is coerced the same way in `@kbn/ui-app-menu`.

## Title size

The title is `xs` with `compact` spacing and `s` with every other spacing mode. This is automatic —
there is no size knob to set.

## Spacing

`spacing` controls the header's content inset and whether its background and bottom border break out
of a padded parent. It does not affect sticky positioning. Vertical padding matches the horizontal
inset so content sits the same distance from every edge. `'flush'` is the exception: the parent owns
the horizontal inset, but the header still applies the standard vertical padding to its own content.

The preferred layout keeps `AppHeader` outside the padded content section. In that structure, omit
`spacing` and let the header own its standard 16px inset. If the page shell owns the inset for the
header as well as the body, use `'flush'`.

The bleed modes are compatibility options for layouts where the page shell forces the header inside
a padded content container. They couple the header to its parent's padding through negative margins,
so they should be treated as a transitional layout pattern rather than the target structure.

Choose the value from the padding of the header's immediate parent:

- Use `'standard'` (or omit `spacing`) when the parent does not add padding around the header. The
  header supplies the standard 16px horizontal page gutter.
- Use `'compact'` for dense layouts that intentionally use an 8px symmetric gutter. Discover uses this
  mode. A titleless header (only a back and/or overflow button) already defaults to `'compact'` so
  sparse legacy states don't look too tall.
- Use `'flush'` when the parent or adjacent layout already owns the content inset. The header adds no
  padding or negative margins, so its background stays within the parent's content box.
- Use `'bleed'` when the header is a direct child of a container with 16px symmetric padding
  (`paddingSize="m"`) and its background and border need to reach that container's top, left, and
  right edges. The header applies 16px negative top and inline margins, then adds 16px inline padding
  so its content stays on the parent's content grid.
- Use `'largeBleed'` for the same arrangement in an existing container with 24px symmetric padding
  (`paddingSize="l"`). This mode preserves legacy layouts; new layouts should use a 16px parent
  gutter and `'bleed'`.

A bleed value must match the parent's actual top and inline padding. Do not use a bleed mode in an
unpadded parent, and do not use `'bleed'` inside a 24px parent. Bleed does not cancel bottom padding.

For `EuiPageTemplate.Section` and `KibanaPageTemplate.Section`:

- `paddingSize="none"`: omit `spacing` so `AppHeader` supplies its 16px inset. Use `'flush'` only when
  another wrapper already supplies the intended inset.
- `paddingSize="m"`: use `'bleed'` if the header must remain inside the section.
- `paddingSize="l"`: use `'largeBleed'` if the header must remain inside the section. An
  `EuiPageTemplate.Section` with no `paddingSize` also uses the 24px default.
- Other padding sizes have no matching bleed mode. Move the header outside the padded section so it
  can own its standard gutter.

The same mapping applies when the effective padding comes from page template `mainProps` instead of
an explicit section.

The header's height is driven by its content plus the symmetric vertical padding, with a minimum floor
so short headers (e.g. a title with no trailing control) don't get too thin. The floor is 64px in the
standard modes and 48px in `'compact'`.

## Sticky positioning

In Chrome Next project layout, title and back replace always-visible breadcrumbs and must remain at
the top while the page scrolls.

- Inline `AppHeader`: omit `sticky` (defaults to `true`) to use CSS `position: sticky`.
- `ChromeAppHeaderRegistration`: Chrome pins the header in the layout top-bar and renders the view
  with `sticky={false}`.
- Set `sticky={false}` only when the surrounding layout already pins the header in the correct
  scroll container.

`sticky={false}` does not make the header full-width. `flush` and bleed modes control inset.

CSS sticky fails when:

- A wrapper is only as tall as the header, so sticky is confined to that containing block.
- An `overflow: hidden`, `auto`, or `scroll` ancestor sits between the header and the page scroller.

Scroll the page. If title or back moves away, the migration is not done.

## Testing

`AppHeader` reads chrome from context, so rendering it without a `ChromeServiceProvider` throws
`"useChromeService must be used within a ChromeServiceProvider"`.

**If your harness renders through `KibanaRenderContextProvider {...coreStart}`, you need nothing.** That
provider forwards `chrome.withProvider`, and the chrome mock (`chromeServiceMock.createStartContract()`)
implements it just like production — wrapping children in `ChromeServiceProvider`. So any test using the
standard core-mock render harness already has chrome context, exactly as the app does at runtime.

**For components rendered in isolation** (a bare `render(<Component />)` with no core-mock render
context), wrap with `MockAppHeaderProvider`, which supplies everything an `AppHeader` needs in tests
(today just the chrome context):

```tsx
import { MockAppHeaderProvider } from '@kbn/app-header/mocks';

render(
  <MockAppHeaderProvider>
    <MyComponentThatRendersAnAppHeader />
  </MockAppHeaderProvider>
);
```

Pass `chrome` to override the default mock chrome service when a test needs custom chrome behavior:

```tsx
<MockAppHeaderProvider chrome={myChromeMock}>{children}</MockAppHeaderProvider>
```

`MockChromeContextProvider` (the generic chrome-only provider it wraps) is also re-exported here, and
lives in `@kbn/core-chrome-browser-context-mocks` for non-header code.

Assert against `APP_HEADER_TEST_SUBJECTS` (from the package root) so component and test can't drift:

```ts
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';

expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('My app');
```

`APP_HEADER_TEST_SUBJECTS.title` is placed on the visible title text element (not the wrapper), so
exact text matchers such as Playwright `toHaveText` or jest exact text resolve to just the rendered
title and are not polluted by the hidden width sizer. In edit mode the visible title is replaced by
the input, exposed as `APP_HEADER_TEST_SUBJECTS.titleInput`.

Menu items — including the header's own documentation/feedback/integrations — collapse into the app
menu overflow popover at narrow widths (the default in jsdom). Open it with the helper from
`@kbn/app-header/test_helpers` before querying those items:

```ts
import { openAppMenuOverflow } from '@kbn/app-header/test_helpers';

await openAppMenuOverflow();
expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.menuDocumentation)).toBeInTheDocument();
```

## Runtime checks

`ChromeAppHeaderRegistration` registers only when the active chrome style is project:

```ts
chrome.getChromeStyle() === 'project';
```

When this condition is false, registration is a no-op and classic Chrome continues to own the header
area.

## Migration guidance

Migrate route-by-route, not necessarily app-by-app. Different routes in the same plugin can use
different buckets while the migration is in progress:

| Bucket | Preferred API | When to use |
|---|---|---|
| Inline-ready | `AppHeader` | The page can colocate header state with its React tree. |
| Chrome-owned | `ChromeAppHeaderRegistration` | Chrome should own the top-bar slot because the route has sticky, shared top-nav, or layout constraints. |
| Fallback-only | Legacy Chrome state | Temporary safety net for routes that have not explicitly migrated. |

### Fallback-only

Chrome Next in project layout does not render the classic breadcrumbs UI. For unmigrated routes,
Chrome can still render a minimal app header as a fallback by deriving:

- A back button from the closest usable breadcrumb.
- A menu from `chrome.setAppMenu()` or a legacy `chrome.setHeaderActionMenu()` mount point.
- Badges from legacy badge state.

This is a compatibility fallback, not a migration target. If breadcrumbs are missing, stale, or point
to the wrong parent, the fallback back button inherits the same problem. The fallback may emit an
array of ancestors and render a popover; that array form is deprecated for explicit `back` — pass
one `{ href, label }` instead. Move routes in this bucket to `AppHeader`. Existing apps with
approved Chrome-owned placement should provide explicit `ChromeAppHeaderRegistration` configuration
instead of relying on fallback state.

The legacy menu, badge, and breadcrumb-extension setters that feed this fallback are deprecated. Keep
existing calls until their route migrates, but do not add new consumers.

Do not use project breadcrumb overrides to configure app-header back navigation. The
`ChromeSetBreadcrumbsParams.project` and serverless `setBreadcrumbs` paths remain only to protect
fallback-only routes during migration and can be deprecated independently of `chrome.setBreadcrumbs`,
which still owns visible breadcrumbs in classic Chrome.
