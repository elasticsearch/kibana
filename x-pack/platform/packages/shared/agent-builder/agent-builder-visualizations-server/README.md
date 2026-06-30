# @kbn/agent-builder-visualizations-server

Presentation-owned, server-side visualization generation engine for Agent
Builder. It decides whether a natural-language request is best rendered with
Lens or Vega (`decideVisualizationApproach`) and builds the corresponding Lens
configuration (`buildVisualizationConfig`), including chart-type selection,
schemas, prompts, and palettes.

Consumed by the `agent_builder_visualizations` and `agent_builder_dashboards`
plugins and by `@kbn/agent-builder-vega`.
