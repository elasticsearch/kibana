# @kbn/core-chrome-browser-context-mocks

Test mocks for `@kbn/core-chrome-browser-context`.

Exports `MockChromeContextProvider`, which supplies a `chromeServiceMock` via context so components
that read chrome (e.g. `AppHeader`) can render in tests without the
`"useChromeService must be used within a ChromeServiceProvider"` crash.

```tsx
import { MockChromeContextProvider } from '@kbn/core-chrome-browser-context-mocks';

render(
  <MockChromeContextProvider>
    <MyComponentThatReadsChrome />
  </MockChromeContextProvider>
);
```
