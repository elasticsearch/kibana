# @kbn/agent-builder-vega

Server-side generation of [Vega-Lite](https://vega.github.io/vega-lite/) visualization
specs for Agent Builder. This is the Vega fallback used by the `create_visualization`
tool when a request cannot be expressed as a standard Lens chart (e.g. faceting /
small multiples, repeated charts, layered/combination charts, scatter/bubble with size).

The Lens-vs-Vega decision itself lives in `@kbn/agent-builder-tools-base`
(`decideVisualizationApproach`); this package only authors and hardens the Vega spec
once Vega has been chosen.

## What it does

- **`createVegaGraph`** — a LangGraph flow that resolves an ES|QL query (reusing
  `@kbn/agent-builder-genai-utils`), asks the model to author a Vega-Lite v6 spec,
  retries on malformed output, and normalizes the result.
- **`normalizeVegaSpec`** — pins the Vega-Lite v6 `$schema`, injects the canonical
  ES|QL query as the data source (the model never owns it), strips fixed top-level
  sizing so the chart fills its container, and escapes dotted field references.
- **`escapeVegaFieldReferences`** — escapes dots in `field` references so flat ES|QL
  columns such as `host.name` are not misread as nested paths.
- **`createAuthorVegaSpecPrompt`** — the prompt used to author/edit a spec.

## Boundaries

Depends one-directionally on `@kbn/agent-builder-tools-base` (shared LLM/ES|QL helpers)
and `@kbn/agent-builder-genai-utils` (ES|QL generation). Nothing in `tools-base`
depends on this package, so there is no cycle.
