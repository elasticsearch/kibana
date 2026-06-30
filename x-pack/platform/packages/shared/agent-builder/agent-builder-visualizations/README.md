# @kbn/agent-builder-visualizations

Browser-side React components that render Agent Builder visualizations inline (in
chat / standalone surfaces). These were previously embedded in the `agent_builder`
plugin's public tree under `components/tools/esql`; they live here so multiple
surfaces can consume one implementation.

## What it provides

- **`VisualizeLens`** — renders a stored Lens API config by value.
- **`VisualizeESQL`** — renders an ES|QL query result by suggesting a Lens config.
- **`VisualizeVega`** — renders a Vega/Vega-Lite spec via the visualize embeddable.
- **`InlineVisualization`** — dispatches to the Lens or Vega renderer based on `renderer`.
- **`getVisualizationDimensionsFromConfig` / `getVisualizationDimensionsFromChartType`** —
  recommended container sizing helpers.

The Vega renderer pulls `@kbn/embeddable-plugin` and `@kbn/presentation-util-plugin`,
so every consumer of this package takes those dependencies.

## Services

All renderers are props-driven: callers pass a `VisualizationServices` object
(`application`, `lens`, `dataViews`, `uiActions`, `unifiedSearch`, `embeddable`)
rather than relying on a plugin-specific Kibana context. This keeps the package
decoupled from any single consumer plugin.
