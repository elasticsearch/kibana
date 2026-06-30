# Agent Context Layer (`agentContextLayer`)

The Agent Context Layer plugin provides a centralized service for indexing, crawling, and searching Kibana assets (visualizations, dashboards, connectors, workflows, etc.) via the **Semantic Metadata Layer (SML)**.

It was extracted from the `agentBuilder` plugin to serve as an independent, shared platform service.

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
interface AgentContextLayerPluginSetup {
  registerType(definition: SmlTypeDefinition): void;
}
```

### Start

```typescript
interface AgentContextLayerPluginStart {
  search(params): Promise<{ results: SmlSearchResult[]; total: number }>;
  /**
   * Fetch SML documents by chunk IDs. Permission checks are performed internally
   * — the returned map only contains documents the user (identified by `request`)
   * is authorized to access. Unauthorized or missing IDs are absent from the
   * result.
   */
  getDocuments(params: {
    ids: string[];
    request: KibanaRequest;
    spaceId?: string; // resolved from request when omitted
  }): Promise<Map<string, SmlDocument>>;
  getTypeDefinition(typeId: string): SmlTypeDefinition | undefined;
  resolveSmlAttachItems(params): Promise<SmlResolvedItemResult[]>;
  indexAttachment(params: SmlIndexAttachmentParams): Promise<void>;
}
```

> Note: an explicit `checkItemsAccess` primitive is intentionally **not** part of
> the public contract. `getDocuments` is safe by default and `resolveSmlAttachItems`
> covers the "convert chunks to attachments" workflow. If you find yourself wanting
> a standalone access check, use `getDocuments` and look at which IDs are present
> in the result.

## Registering an SML type

During plugin setup, call `agentContextLayer.registerType()` with an `SmlTypeDefinition`:

```typescript
setup(core, { agentContextLayer }) {
  agentContextLayer.registerType({
    id: 'my-asset',
    list: async function* (context) { /* yield pages of items */ },
    getSmlData: async (originId, context) => { /* return chunks to index */ },
    toAttachment: async (doc, context) => { /* convert to attachment */ },
    fetchFrequency: () => '30m', // optional, defaults to 10m
  });
}
```

## Current consumers

| Plugin | Types registered |
|--------|-----------------|
| `agentBuilderPlatform` | `visualization`, `connector` |
| `agentBuilderDashboards` | `dashboard` |
| `workflowsManagement` | `workflow` |

## Feature gating

SML functionality is gated behind the `contextEngine:enabled` UI setting (the Context Engine feature flag, registered by this plugin). Everything owned by this plugin — the HTTP routes (`withSmlFeatureFlag`), the crawler tasks, and the workflow index step — checks `contextEngine:enabled` alone.

SML surfaces that live in the Agent Builder family of plugins additionally require `agentBuilder:experimentalFeatures`, so they are gated on **both** flags: the `sml_search` / `sml_attach` tools, the internal `_attach` route, and the `@` command menu (in `agent_builder`), plus the connector lifecycle handler that crawls connectors into SML (in `agent_builder_platform`). This keeps SML behind Agent Builder's own experimental gate even if the Context Engine flag graduates independently.

## Index naming

SML data is stored in `.chat-sml-data` and crawler state in `.chat-sml-crawler-state`, using the `.chat-*` system index prefix registered in the Elasticsearch `kibana_system` role.
