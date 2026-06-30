# @kbn/agent-builder-visualizations-plugin

Presentation-owned plugin that registers Agent Builder's `visualization`
attachment type with the `agentBuilder` plugin. It owns the server-side
behavior of visualization attachments (validation, by-reference resolution from
Lens saved objects, and the agent-facing text representation).

The attachment schema and shared types live in
`@kbn/agent-builder-visualizations-common`; the browser renderers live in
`@kbn/agent-builder-visualizations`.
