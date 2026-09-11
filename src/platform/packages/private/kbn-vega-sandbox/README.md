# @kbn/vega-sandbox

Vega specs are user-authored JavaScript-adjacent documents. Today they run in the Kibana
page, so a spec can touch the parent DOM, call Kibana APIs, and use the session. This
package is the isolated runtime that visTypeVega will host later: Vega runs inside an
**opaque iframe** (`sandbox="allow-scripts"` without `allow-same-origin`) and talks to
Kibana only through `postMessage`.

This package is **not** the iframe HTML document, and it is **not** the Kibana parent
(visTypeVega / the example plugin). It is two things that look like one module:

1. **A Node library** the Kibana parent imports: protocol types, `isVegaSandboxOutboundMessage`,
   constants, inspector serializers.
2. **A browser JS file** the iframe loads: `vega_sandbox.bootstrap.js`, built by webpack from
   `src/bootstrap.ts`, with Vega bundled in. It does not use Kibana optimizer globals or
   shared-deps externals.

That split is why `index.ts` and `server.ts` exist next to `bootstrap.ts`.

## Why a separate webpack bundle

Kibana plugin chunks assume they run in the Kibana page (shared deps, `__webpack_require__`
from the optimizer, same origin as `sid`). An opaque iframe has a unique origin. It cannot
see those globals, and Kibana's global CSP `script-src 'self'` does not match the iframe
origin either.

So the in-frame code is built like `@kbn/monaco` workers: `webpack.config.js` uses
`target: 'web'`, no externals, output `target_vega_sandbox/vega_sandbox.bootstrap.js`.
A **dedicated HTML route** (owned by the host, not this package) must send
`script-src 'nonce-…' 'strict-dynamic'` so that file can actually run.

## How the JS gets into the iframe

```
src/bootstrap.ts
        │  webpack (package "build" script)
        ▼
target_vega_sandbox/vega_sandbox.bootstrap.js
        │  server.ts exports bundleDir (that folder, or the dist copy)
        ▼
Core register_bundle_routes.ts
        │  GET /bundles/kbn-vega-sandbox/*
        ▼
Host HTML (example frame route today; visTypeVega later)
        │  nonced script: script.src = prependPublicUrl('/bundles/kbn-vega-sandbox/vega_sandbox.bootstrap.js')
        ▼
iframe executes bootstrap.ts: listen for postMessage, draw Vega
```

### `server.ts`

Node-only. Kibana's HTTP server asks "which directory contains the files I should expose
at `/bundles/kbn-vega-sandbox/`?"

```ts
export const bundleDir = Fs.existsSync(localBundleDir) ? localBundleDir : builtBundleDir;
```

- Dev: webpack wrote `src/platform/packages/private/kbn-vega-sandbox/target_vega_sandbox/`.
- Dist: `build_packages_task.ts` copied that folder into the build output; `bundleDir` falls
  back to `target/build/.../target_vega_sandbox`.

Core does `import * as KbnVegaSandbox from '@kbn/vega-sandbox/server'` and passes
`KbnVegaSandbox.bundleDir` to `registerRouteForBundle`, same pattern as monaco. Parents never
import `server.ts` in the browser.

### `index.ts`

What the **Kibana parent** imports (`@kbn/vega-sandbox`): protocol types, version constant,
outbound message guard, error/warning codes, bundle public path constants. It does **not**
import Vega or `bootstrap.ts`. Loading this entry in Node or the Kibana bundle must not pull
in the iframe runtime.

### `src/bootstrap.ts`

The iframe's `main()`. Webpack's entry is this file. On load it:

1. Listens for `message` on `window`.
2. On `init`: check `protocolVersion`, optional color mode / tooltip CSS, install href
   interceptors, set `initialized`.
3. On `render`: destroy any previous Vega view, call `renderVegaDescriptor` (`src/render.ts`),
   then `postMessage({ type: 'rendered', renderId })`.
4. On `resize`: `controller.resize(dimensions)` — **does not** emit `rendered`.
5. Forwards Vega expression functions (`kibanaAddFilter`, …) as `applyFilter`, href clicks as
   `openHref`, loader URL checks as `validateExternalUrl`, inspector traffic as snapshot/update.

It never imports Kibana plugins. The only way out is `window.parent.postMessage`.

`#vega-sandbox-root` must exist in the host HTML. Bootstrap does not create the document.

### `src/render.ts`

Turns a serializable `VegaSandboxRenderDescriptor` into a Vega `View` (parse + interpreter,
hover, resize, tooltips). Registers Kibana's Vega functions as forwarders to the parent
instead of touching Filter Manager. Image URLs go through `onValidateExternalUrl` (parent
policy) before the loader fetches them.

### `src/protocol.ts`

The `postMessage` contract. Inbound (parent → iframe): `init`, `render`, `resize`,
`restoreState`, plus inspector / URL-validation replies. Outbound (iframe → parent):
`rendered`, `error`, `warn`, `applyFilter`, `saveState`, `openHref`, inspector, URL
validation requests.

`render` / `rendered` / `error` carry a `renderId` so a stale completion cannot satisfy a
newer render. Matching `rendered` is the completion signal visTypeVega will use for
`handlers.done()`, which PNG/PDF reporting waits on. `resize` is not a render.

`isVegaSandboxOutboundMessage` shape-guards untrusted iframe payloads. The parent should
not trust anything else from `event.data`.

## Who owns the HTML

| Piece | Owner |
| --- | --- |
| Vega + bootstrap JS | this package |
| Serving `/bundles/kbn-vega-sandbox/` | Core |
| iframe document, CSP, `<iframe sandbox>` | host (example plugin now, visTypeVega later) |
| Filters, href navigation, `externalUrl.policy` | host (not this package) |

The example at `examples/vega_sandbox_example` is a thin host: one GET route returns HTML
with `#vega-sandbox-root`, a nonce, and a script tag that loads the bootstrap. It is not
the production visTypeVega session.

## Try it

```
yarn start --run-examples
```

Open **Developer Examples → Vega sandbox**. **Render** draws a bar chart; **Render filter
example** lets you click a bar so the parent filters inline data and sends a new `render`;
**Resize** toggles iframe height without a new `rendered`.

visTypeVega sandbox integration (feature flag, dashboard panels, inspector) is a follow-up.
