# @kbn/agent-builder-visualizations-server

Presentation-owned, server-side visualization generation engine for Agent
Builder. It decides whether a natural-language request is best rendered with
Lens or Vega (`decideVisualizationApproach`) and builds the corresponding
visualization config:

- `visualization/` — the Lens engine (`buildVisualizationConfig`): chart-type
  selection, schemas, prompts, and palettes.
- `vega/` — the Vega-Lite engine (`buildVegaConfig`): authors, normalizes, and
  render-validates a Vega-Lite spec for requests Lens cannot express.

Consumed by the `agent_builder_visualizations` and `agent_builder_dashboards`
plugins.
