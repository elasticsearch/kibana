# @kbn/core-chrome-browser-mocks

Jest mocks for Core's browser-side Chrome service.

Depends on `@kbn/core-chrome-browser-internal-types` for the `InternalChromeSetup` / `InternalChromeStart` type definitions, plus `@kbn/core-chrome-browser-context` / `@kbn/core-chrome-sidebar-context` so `withProvider` can render the same context providers as production. It does not depend on `browser-internal` or `browser-components`, which avoids circular TS project reference chains.

## Exports

| Export | Description |
|---|---|
| `chromeServiceMock.create()` | Returns a deeply-mocked `ChromeService` contract (`{ setup, start, stop }`) |
| `chromeServiceMock.createSetupContract()` | Returns a deeply-mocked `InternalChromeSetup` |
| `chromeServiceMock.createStartContract()` | Returns a deeply-mocked `InternalChromeStart` with all observables pre-wired to `BehaviorSubject` / `of()` defaults |

## `withProvider` mirrors production

`createStartContract().withProvider(children)` wraps `children` in `ChromeServiceProvider` (and `SidebarServiceProvider`), exactly like the real `withProvider` in `browser-internal`. Because `KibanaRootContextProvider` / `KibanaRenderContextProvider` call `chrome.withProvider`, any test rendering through `<KibanaRenderContextProvider {...coreStart}>` gets chrome context for free — so components that read chrome (e.g. `AppHeader`) render in tests without per-test wrapping, just as they do at runtime.
