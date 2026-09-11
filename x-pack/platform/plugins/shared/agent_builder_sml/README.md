# Agent Builder SML (`agentBuilderSml`)

The Agent Builder SML plugin provides a centralized service for indexing, crawling, and searching Kibana assets (visualizations, dashboards, connectors, workflows, rules, action policies, significant events) via the **Semantic Metadata Layer (SML)**.


## Overview

The SML makes Kibana content discoverable by maintaining a search index of asset metadata. It supports:

- **Type registration** — solution plugins register `SmlTypeDefinition`s describing how to list, index, and convert their assets.
- **Crawling** — a background Task Manager task periodically crawls registered types and keeps the index up to date.
- **Event-driven indexing** — plugins can call `indexAttachment()` to immediately index or remove an asset (e.g., on connector create/delete).
- **Search** — an internal HTTP route and programmatic API for searching indexed assets with space and permission filtering.
- **Attach resolution** — resolves search hits into conversation attachments for use in the Agent Builder.

## Plugin contracts

### Setup

```typescript
interface AgentBuilderSmlPluginSetup {
  registerType(definition: SmlTypeDefinition): void;
}
```

### Start

```typescript
interface AgentBuilderSmlPluginStart {
  search(params): Promise<{ results: SmlSearchResult[] }>;
  getTypeDefinition(typeId: string): SmlTypeDefinition | undefined;
  resolveSmlAttachItems(params): Promise<SmlResolvedItemResult[]>;
  indexAttachment(params: SmlIndexAttachmentParams): Promise<void>;
}
```

## Registering an SML type

During plugin setup, call `agentBuilderSml.registerType()` with an `SmlTypeDefinition`:

```typescript
setup(core, { agentBuilderSml }) {
  agentBuilderSml.registerType({
    id: 'my-asset',
    list: async function* (context) { /* yield pages of items */ },
    getSmlEntry: async (originId, context) => { /* return entry to index */ },
    toAttachment: async (doc, context) => { /* convert to attachment */ },
    fetchFrequency: () => '30m', // optional, defaults to 10m
  });
}
```

## Current consumers

| Plugin | Types registered |
|--------|-----------------|
| `agentBuilderPlatform` | `connector` |
| `agentBuilderDashboards` | `dashboard` |
| `agentBuilderVisualizations` | `visualization` |
| `agentBuilderWorkflows` | `workflow` |
| `alertingV2` | `rule`, `action_policy` |
| `significantEvents` | `significant_event` |

`workflowsManagement` calls `indexAttachment` indirectly (via a callback passed in by `agentBuilderWorkflows`) but does not register a type. `agentBuilder` itself is the only real caller of `search`/`resolveSmlAttachItems`.

## Feature gating

SML functionality is gated behind the `agentBuilder:experimentalFeatures` UI setting — the same flag Agent Builder uses for its own experimental surfaces. This plugin's HTTP routes (`withSmlFeatureFlag`) and crawler tasks check it directly; so do the `sml_search` / `sml_attach` tools, the internal `_attach` route, and the `@` command menu (in `agent_builder`), and the connector lifecycle handler that crawls connectors into SML (in `agent_builder_platform`).

SML was previously also gated behind a dedicated `contextEngine:enabled` setting, from before it was folded into Agent Builder. That setting still exists (registered in `server/ui_settings.ts`) but nothing checks it anymore — it's kept registered for potential future use rather than removed outright.

## Index naming

SML data is stored in `.ai-index-idx-elastic-index` — the Elastic AI index. Kibana creates it bare and the Elasticsearch-managed `ai-index-idx-managed` index template owns its mappings; the `kibana_system` role grants access through its `.ai-index-idx-*` pattern.

Crawler state is stored separately in `.chat-sml-crawler-state`, using the `.chat-*` system index prefix registered in the Elasticsearch `kibana_system` role.
