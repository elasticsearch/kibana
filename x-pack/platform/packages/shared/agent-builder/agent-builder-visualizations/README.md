# @kbn/agent-builder-visualizations

Browser-side React components that render Agent Builder visualizations inline (in
chat / standalone surfaces). These were previously embedded in the `agent_builder`
plugin's public tree under `components/tools/esql`; they live here so multiple
surfaces can consume one implementation.

## Entry points

The package has two entries so Lens-only consumers don't pull the Vega renderer
(and its `embeddable` / `presentationUtil` dependencies) into their bundle.

### Root — `@kbn/agent-builder-visualizations` (Lens only)

- **`VisualizeLens`** — renders a stored Lens API config by value.
- **`VisualizeESQL`** — renders an ES|QL query result by suggesting a Lens config.
- **`getVisualizationDimensionsFromConfig` / `getVisualizationDimensionsFromChartType`** —
  recommended container sizing helpers.

### `@kbn/agent-builder-visualizations/vega` (Vega-capable)

- **`VisualizeVega`** — renders a Vega/Vega-Lite spec via the visualize embeddable.
- **`InlineVisualization`** — dispatches to the Lens or Vega renderer based on `renderer`.

Importing from this entry pulls `@kbn/embeddable-plugin` and
`@kbn/presentation-util-plugin`. Only consumers that actually render Vega (e.g.
the `agent_builder_visualizations` plugin's attachment) should import it.

## Services

All renderers are props-driven: callers pass a services object rather than
relying on a plugin-specific Kibana context. This keeps the package decoupled
from any single consumer plugin.

- `VisualizationServices` (Lens renderers): `application`, `lens`, `dataViews`,
  `uiActions`, `unifiedSearch`.
- `VegaVisualizationServices` (Vega renderer / attachment): the above plus
  `embeddable`.
