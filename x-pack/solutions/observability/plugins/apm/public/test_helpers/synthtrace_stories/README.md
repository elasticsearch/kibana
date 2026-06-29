# Synthtrace-in-Storybook — APM scenario layer

> **Related issues:** obs-dev [#5690](https://github.com/elastic/observability-dev/issues/5690)
> (synthtrace fixtures) · [#5692](https://github.com/elastic/observability-dev/issues/5692)
> (Storybook capabilities) · [#5684](https://github.com/elastic/observability-dev/issues/5684)
> (parent epic)

## The problem with hand-crafted fixtures

Before this layer, every APM story that needed realistic data maintained its own array of
hardcoded `{x, y}` or `{nodes, edges}` values — usually copied from a real API response,
quickly stale, and inconsistent across stories (the service map shows "opbeans-java" but
the latency chart shows "testService"). Updating them all when the topology changes is
manual and error-prone.

## The scenario → selector pattern

```
scenario()               ─→  flat ApmFields[]          (one shared dataset)
  ├── toServiceMapResponse()   ─→  ServiceMapResponse    (service map selector)
  │     └── transformToReactFlow()  ─→  { nodes, edges } (production fn, reused)
  └── toLatencyChartResponse() ─→  latency chart shape   (latency chart selector)
        └── <LatencyChart latencyChartResponse={...} />
```

**A scenario** is a synthtrace generator that builds an in-memory `ApmFields[]` dataset
without touching Elasticsearch.  A **selector** is a small pure function that aggregates
those flat docs into the exact shape a specific APM component fetches from its server
endpoint — the in-memory analog of that endpoint's aggregation logic.

Benefits:
- All stories sharing a scenario show **consistent services, latencies, and topology**.
- Switching from `opbeansScenario()` to a future `hipsterStoreScenario()` updates every
  story at once.
- Selectors double as **in-memory test fixtures** — no ES mock needed.

### Adding a new selector

1. Create `selectors/<feature>.ts` that imports `ApmFields` and returns the shape your
   component expects (mirror what the relevant server endpoint returns).
2. Export from `index.ts`.
3. Use in your story: `args: { myResponse: toMyResponse(opbeansScenario(), serviceName) }`.

---

## Storybook capabilities reference (obs-dev #5692)

`@kbn/storybook` already wires these addons — no extra config needed.

| Capability | How to use | Verdict for obs-presentation |
|---|---|---|
| **controls** (`addon-essentials`) | Add `argTypes` to `meta` or a story. Works with any serialisable `args` shape — including the API-response objects computed by selectors. | ✅ High value: swap scenario, change service names, tweak params without code changes. |
| **autodocs** (`addon-docs`) | Add `tags: ['autodocs']` to a story. The component's JSDoc and prop types are parsed automatically (`reactDocgen: false` disables the slower TypeScript-based parser; JSDoc still works). Docs panel shows the description + prop table. | ✅ High value: free API documentation for complex shared components like `ServiceMapGraph`. |
| **a11y** (`addon-a11y`) | Already active globally. The `SynthtraceGenerated` story is tagged with the same `a11y` config as `SimpleExample` (color-contrast, image-alt, aria-required-attr, aria-roles). Open the **Accessibility** tab to see the audit per story. | ✅ High value: catches regression (e.g. missing `aria-label` on React Flow nodes) without a separate a11y test run. |
| **addon-jest** | Surface Jest test results in the **Tests** panel. Requires the `jest_setup.js` in `.storybook/`. No extra story annotation needed — results appear automatically for co-located `.test.ts(x)` files. | 🟡 Medium: useful for components that already have unit tests; currently none of the service map stories co-locate Jest tests in the same file. |
| **interaction tests** (`addon-interactions`) | **Not wired** into `@kbn/storybook` today. Needs `@storybook/addon-interactions` + `@storybook/test-runner` (Playwright). See obs-dev #5694 for the go/no-go exploration. | 🔲 Stretch — see #5694 |

### Running the APM Storybook

```bash
# dev server (port 9001)
yarn storybook apm

# static build
yarn storybook --site apm
```

Navigate to **app/ServiceMap/ServiceMap → SynthtraceGenerated** to see the scenario-driven
service map and to **shared/charts/LatencyChart → Example** to see the same scenario's
latency data.

---

## Three wiring patterns for Storybook stories

All three exist in the APM Storybook. They are not mutually exclusive — a complex page
story can combine all three.

### 1. Props-direct (simplest)

Best for presentational ("dumb") components that take data as props.

```tsx
// service_map/__stories__/service_map.stories.tsx → SynthtraceGenerated
import { transformToReactFlow } from '../../../../common/service_map/transform_to_react_flow';
import { opbeansScenario, toServiceMapResponse } from '../../../../test_helpers/synthtrace_stories';

export const SynthtraceGenerated: Story = {
  render: () => {
    const { nodes, edges } = transformToReactFlow(toServiceMapResponse(opbeansScenario()));
    return <ServiceMapGraph nodes={nodes} edges={edges} ... />;
  },
};
```

### 2. `__storybook_mocks__` — hook-level replacement

Best for lightweight container components whose fetch hook can be replaced wholesale.
Webpack's `NormalModuleReplacementPlugin` (configured in `@kbn/storybook`) transparently
substitutes any `./use_service_map` import within the `service_map/` directory when
Storybook builds — **no component code change required**.

```ts
// service_map/__storybook_mocks__/use_service_map.ts
import { transformToReactFlow } from '../../../../common/service_map';
import { opbeansScenario, toServiceMapResponse } from '../../../../test_helpers/synthtrace_stories';
import type { UseServiceMapResult } from '../use_service_map';

const syntheticData = transformToReactFlow(toServiceMapResponse(opbeansScenario()));

export const useServiceMap = (): UseServiceMapResult => ({
  data: syntheticData,
  status: FETCH_STATUS.SUCCESS,
});
```

The mock file lives next to the real hook — `service_map/__storybook_mocks__/use_service_map.ts`.
Any component in `service_map/` that imports `./use_service_map` silently gets this mock in
Storybook. In Jest, use the corresponding `__mocks__/` directory for the same result.

### 3. API-level mock (`mockApmApiCallResponse`)

Best for components that call `callApmApi(...)` internally and whose response shape the
selector can produce directly.

```tsx
// latency_chart/latency_chart.stories.tsx → Example
import { opbeansScenario, toLatencyChartResponse } from '../../../../test_helpers/synthtrace_stories';

mockApmApiCallResponse(
  'GET /internal/apm/services/{serviceName}/transactions/charts/latency',
  () => toLatencyChartResponse(opbeansScenario(), 'opbeans-node')
);
```

The `mockApmApiCallResponse` function intercepts `callApmApi` (a jest spy) at the call site.
The selector produces the exact shape the component expects from the real endpoint.

---

## Proposed rollout to other APM stories

The `toLatencyChartResponse` and `toServiceMapResponse` selectors cover two of the most
important APM components. The same pattern can be extended to:

| Component | Selector to add | Server endpoint to mirror |
|---|---|---|
| Throughput chart | `toThroughputChartResponse` | `GET .../transactions/charts/throughput` |
| Error rate chart | `toErrorRateChartResponse` | `GET .../transactions/charts/error_rate` |
| Service inventory | `toServiceInventoryResponse` | `GET /internal/apm/services` |
| Service overview | `toServiceOverviewResponse` | Combines latency + throughput + error rate |
| Trace waterfall | `toTraceWaterfallResponse` | `GET /internal/apm/traces/{traceId}` |

Each new selector is typically ~30 lines: filter by service/event type, bucket or
aggregate, return the server's response shape.
