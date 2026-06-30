# Streams Development Guide

This guide is for coding agents and developers working on the Streams plugins and related packages. It explains the domain, architecture, codebase layout, key patterns, and how to get started.

## What Is Streams?

Streams is a higher-level abstraction over Elasticsearch's index templates, component templates, ingest pipelines, and data streams. Instead of managing these low-level concepts directly, users work with **stream** entities that represent named collections of documents with shared processing, retention, and schema. Kibana keeps the underlying Elasticsearch objects in sync with the stream definitions.

The main use cases are **refining stream entities** (splitting and routing data) and **enriching documents** (parsing, transforming, and extracting fields).

### Stream Types

| Type | Description |
|------|-------------|
| **Wired stream** | Opinionated, managed, hierarchical stream for logs. Tree structure (e.g. `logs.otel`, `logs.otel.nginx`). Underlying ES objects are fully managed. |
| **Classic stream** | Compatibility layer for existing data streams. Flat structure, partially managed. Often created by Integrations/Fleet. |
| **Query stream** | Virtual, read-only, defined by ES\|QL. No stored data; resolves on read. Isolated from parent views via the `$.` prefix (see below). |

### Wired Stream Hierarchy

Wired streams form a tree. Two root streams exist: `logs.otel` (OTel-normalized) and `logs.ecs` (no transformation). Data enters a root, gets processed, and routing rules may send it to child streams. Mappings are inherited down the tree and must be additive (children cannot change field types defined by parents).

### Query Streams and the `$.` Prefix

Query streams are virtual, read-only streams backed by ES|QL views. They let users define aggregations, transformations, or filtered projections of existing stream data without storing anything — the query runs on read.

#### How they work

When a query stream named `cars.electric` is created, the system creates an ES|QL view named `$.cars.electric` via the Elasticsearch `PUT /_query/view` API. The `$.` prefix (defined as `ESQL_VIEW_PREFIX` in `@kbn/streams-schema`) is central to how query streams are stored and queried.

#### Why the `$.` prefix matters

The prefix serves two purposes:

1. **Avoids name shadowing.** Without the prefix, an ES|QL view named `cars.electric` would shadow the `cars.electric` data stream. The `$.` namespace keeps them separate.

2. **Isolates query streams from parent views.** Ingest streams query their data using patterns like `FROM cars, cars.*`. Because query stream views live in the `$.` namespace, the wildcard `cars.*` never matches `$.cars.electric`. This means:
   - Aggregated or transformed columns (e.g. `error_count`, `doubled`) defined by query streams do not leak into parent stream schemas
   - Users querying a parent ingest stream see only ingest data, not derived query stream results
   - The isolation works at any nesting depth — `$.cars.electric.fast` is equally invisible to `FROM cars, cars.*`

#### How to query a query stream

Query streams must be queried directly by their `$.`-prefixed view name:

```
FROM $.cars.electric
```

The Discover integration handles this automatically — `getDiscoverEsqlQuery()` returns `FROM ${definition.query.view}` for query streams, which is the prefixed name.

#### Key implementation files

| File | Role |
|------|------|
| `@kbn/streams-schema/.../query/view_name.ts` | `ESQL_VIEW_PREFIX`, `getEsqlViewName()`, `getStreamNameFromViewName()` |
| `@kbn/streams-schema/.../helpers/hierarchy_helpers.ts` | `getIndexPatternsForStream()` — returns `[name, name.*]` for ingest streams (no `$.`) |
| `@kbn/streams-schema/.../helpers/get_discover_esql_query.ts` | Returns `FROM $.name` for query streams, `FROM name, name.*` for ingest |
| `streams/server/.../esql_views/manage_esql_views.ts` | Creates/reads/deletes ES|QL views via `/_query/view` |
| `streams/server/.../state_management/streams/query_stream.ts` | Uses `getEsqlViewName()` when building create/update/delete actions |

#### Known limitation: wildcard queries over ES|QL views

Querying query streams with wildcard patterns like `FROM $.parent.*` is **unreliable** and should not be used. Manual testing revealed that Elasticsearch produces false "circular view reference" errors even when no actual cycles exist in the view graph. Key findings:

- `FROM $.parent.*` may succeed or fail unpredictably depending on the **global view graph state** — the full set of ES|QL views defined in the cluster, not just those matching the wildcard
- Adding or removing an unrelated view elsewhere in the system can cause a previously working wildcard query to start failing, or vice versa
- The error message (`circular view reference`) is misleading — it does not indicate an actual circular dependency
- Elasticsearch's `Regex.simpleMatch()` matches across dots, so `*` is multi-segment (e.g., `$.parent.*` matches `$.parent.child.grandchild`)
- The behavior appears tied to view resolution order, which is non-deterministic from the user's perspective

This is an Elasticsearch-level limitation, not a Kibana bug. The `$.` prefix isolation ensures that **ingest stream** wildcard patterns (`FROM parent, parent.*`) work reliably because they never enter the `$.` namespace. But querying across query stream views with wildcards should be avoided until Elasticsearch resolves the underlying view resolution issue.

### Draft Mode

Processing and child streams can exist in "draft" mode, which uses ES|QL views at query time instead of ingest pipelines. This lets users test changes on existing data before committing them to ingest time. Draft streams can be promoted to ingest sub streams when ready.

### Streamlang

Streamlang is the processing DSL. It defines how documents are parsed, transformed, and enriched. It transpiles to both **ingest pipelines** (ingest time) and **ES|QL** (query time), enabling seamless migration between draft and production processing. Streamlang is defined using Zod schemas and is YAML-friendly.

### Storage

Stream definitions live in a managed `.kibana_streams` Elasticsearch index. Asset links (dashboards, rules, SLOs) are stored in `.kibana_streams_assets`. All wired stream ES objects (index templates, component templates, pipelines) are reconstructible from the `.kibana_streams` documents.

## Codebase Map

### Plugins

| Plugin | Path | Purpose |
|--------|------|---------|
| `streams` | `x-pack/platform/plugins/shared/streams/` | Core server+browser plugin. APIs, services, state management, storage. |
| `streams_app` | `x-pack/platform/plugins/shared/streams_app/` | UI application. Stream list, detail views, management tabs. |

### Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@kbn/streams-schema` | `x-pack/platform/packages/shared/kbn-streams-schema/` | Zod schemas for all stream types, fields, lifecycle, queries. Shared between server and browser. |
| `@kbn/streamlang` | `x-pack/platform/packages/shared/kbn-streamlang/` | Processing DSL: types, conditions, processors, validators, transpilers (ingest pipeline + ES\|QL). |
| `@kbn/streams-ai` | `x-pack/platform/packages/shared/kbn-streams-ai/` | AI workflows: description generation, system identification, feature identification, pipeline suggestions. |
| `@kbn/streamlang-yaml-editor` | `x-pack/platform/packages/shared/kbn-streamlang-yaml-editor/` | Monaco-based YAML editor component for Streamlang. |
| `@kbn/streamlang-tests` | `x-pack/platform/packages/shared/kbn-streamlang-tests/` | Scout API integration tests for Streamlang transpilers. |

### Dependency Graph

```
@kbn/streamlang (core DSL, no dependency on streams-schema)
       ↑
@kbn/streams-schema (stream models, uses StreamlangDSL for processing)
       ↑
@kbn/streams-ai (AI workflows, uses both)

@kbn/streamlang-yaml-editor (UI editor, uses @kbn/streamlang + @kbn/streams-plugin)
```

## API Design and Integration

### Public vs Internal APIs

The plugin exposes two tiers of HTTP APIs:

- **Public APIs** (`/api/streams/*`) — Versioned, documented endpoints designed for third-party consumers (Terraform, external scripts, other Kibana plugins, automation tools). These carry a version string in the endpoint (e.g. `GET /api/streams/{name} 2023-10-31`) and OAS metadata (`summary`, `description`, `availability.stability`). All stream management operations that external users need are available here. Public APIs are contracts; breaking changes require careful consideration and the `streams_app` UI uses them as well when the operation is part of the public surface.

- **Internal APIs** (`/internal/streams/*`) — Unversioned endpoints that exist exclusively for the `streams_app` UI. No other consumer should depend on them — they can and do change freely between releases. Most feature-specific endpoints live here (schema editing, lifecycle management, processing simulation, AI suggestions, onboarding, task management). If you are adding a new endpoint, default to internal unless there is a clear need for external consumers to call it.

The full route repository is assembled in `server/routes/index.ts` by spreading all route objects into a single `streamsRouteRepository`. This object is also exported as the `StreamsRouteRepository` type, which is the foundation for end-to-end type safety.

### Public API Surface

| Endpoint | Purpose |
|----------|---------|
| `GET /api/streams` | List all streams (definitions only) |
| `GET /api/streams/{name}` | Get a stream with inherited fields, lifecycle, assets, privileges |
| `PUT /api/streams/{name}` | Create or update a stream (idempotent upsert) |
| `DELETE /api/streams/{name}` | Delete a stream and its underlying data stream |
| `POST /api/streams/_enable` | Enable wired streams (creates root streams + ES objects) |
| `POST /api/streams/_disable` | Disable wired streams (deletes all wired stream definitions) |
| `POST /api/streams/{name}/_fork` | Fork a wired stream (create child with routing condition) |
| `POST /api/streams/_resync` | Resync all streams (rebuild ES objects from definitions) |
| `GET /api/streams/{name}/_ingest` | Get ingest settings for an ingest stream |
| `PUT /api/streams/{name}/_ingest` | Update ingest settings (processing, lifecycle, fields, routing) |
| `GET /api/streams/{name}/_doc_counts` | Get document counts per stream |
| `GET /api/streams/{name}/_query` | Get a query stream definition |
| `PUT /api/streams/{name}/_query` | Create or update a query stream (creates `$.`-prefixed ES\|QL view) |
| `GET/PUT/DELETE /api/streams/{name}/queries/*` | Manage significant event queries. Deprecated, pending removal (use the internal query endpoints). |
| `GET/POST /api/queries/*` | Query management |
| `GET/PUT /api/content/*` | Content pack import/export |
| `GET/POST/DELETE /api/attachments/*` | Asset attachments (dashboards, rules) |

The API follows the stream taxonomy in its payload structure: shared properties are top-level, `ingest`-specific properties are nested under `stream.ingest`, and wired-specific properties are under `stream.ingest.wired`. The `PUT` endpoint accepts an `UpsertRequest` that is a discriminated union — the schema determines whether it is a wired, classic, or query stream update based on the shape of the body.

### GET Response Structure

The `GET /api/streams/{name}` response enriches the raw stream definition with derived data:

```typescript
// For wired streams (Streams.WiredStream.GetResponse):
{
  stream: { ... },              // The definition (PUT-able)
  inherited_fields: { ... },    // Fields inherited from ancestors
  effective_lifecycle: { ... },  // Resolved lifecycle (may be inherited)
  effective_settings: { ... },   // Resolved settings
  effective_failure_store: { ... },
  privileges: { manage, read_failure_store, ... },
  dashboards: ["id1", "id2"],
  rules: ["id3"],
  index_mode: "...",
}
```

The `stream` object is what can be sent back to `PUT`. Everything outside of `stream` is derived or stored separately (assets, inherited fields, privileges).

### End-to-End Type Safety

The type chain flows from server to browser without manual duplication:

1. **Route definition** (server) — `createServerRoute` defines the endpoint, Zod params, and return type
2. **Route repository** (server) — All routes are spread into `streamsRouteRepository`, exported as `StreamsRouteRepository`
3. **Repository client** (browser) — `StreamsRepositoryClient` is typed as `RouteRepositoryClient<StreamsRouteRepository>`, created via `createRepositoryClient(core)`
4. **API calls** (browser) — `streamsRepositoryClient.fetch('GET /api/streams/{name} 2023-10-31', { params })` is fully typed: params are validated against the Zod schema, and the return type matches the handler's return type

This means adding a new route automatically makes it available with full type safety on the browser side — no manual API client code is needed.

### How the UI Consumes APIs

The `streams_app` accesses the API through the `StreamsRepositoryClient` provided via React context. The two main patterns are:

**Direct fetch with `useStreamsAppFetch`** — Wraps `useAbortableAsync` with time range integration, auto-refresh, and error toasts:

```typescript
const { value, loading, refresh } = useStreamsAppFetch(
  async ({ signal }) => {
    return streamsRepositoryClient.fetch('GET /internal/streams/{name}/_details', {
      signal,
      params: { path: { name }, query: { start, end } },
    });
  },
  [name, start, end]
);
```

**Context providers for shared data** — `StreamDetailContextProvider` fetches the stream definition once and provides it to all child components via `useStreamDetail()`. This avoids redundant fetches across tabs. Narrowing hooks like `useStreamDetailAsIngestStream()` provide type-safe access to stream-type-specific fields.

### Security Model

API security operates on two levels:

- **Kibana feature privileges** — The `streams` feature registers `read` and `all` privilege levels. API routes declare `requiredPrivileges` using `STREAMS_API_PRIVILEGES.read` or `STREAMS_API_PRIVILEGES.manage`.
- **Elasticsearch privileges** — Write operations use the authenticated user's ES permissions. The user must have index template, ingest pipeline, and data stream management privileges for mutations to succeed. The `privileges` field in GET responses tells the UI what the current user is allowed to do for a specific stream.

The UI intersects both: `manage` is only true when the user has both the Kibana-level `streams.manage` UI capability and the ES-level data-stream-specific `manage` privilege.

## streams Plugin Architecture

**Plugin ID**: `streams` | **Config path**: `xpack.streams`

### Directory Structure

```
streams/
├── common/                    # Shared types and utilities (exported to browser)
│   ├── constants.ts           # Feature IDs, API privileges, tiered features
│   ├── config.ts              # Plugin config schema
│   ├── queries.ts             # Query link types
│   └── query_helpers.ts       # KQL, range query, ES|QL filter builders
├── public/                    # Browser-side (thin)
│   ├── api/index.ts           # StreamsRepositoryClient (typed API client)
│   └── plugin.ts              # Browser plugin class
├── server/
│   ├── plugin.ts              # Server plugin class (setup/start lifecycle)
│   ├── feature_flags.ts       # UI settings registration for feature flags
│   ├── routes/
│   │   ├── create_server_route.ts  # Route factory with telemetry + error mapping
│   │   ├── streams/           # Public API routes (/api/streams/*)
│   │   └── internal/          # Internal API routes (/internal/streams/*)
│   │       └── streams/
│   │           ├── crud/          # List, detail, resolve index
│   │           ├── schema/        # Field mapping management
│   │           ├── lifecycle/     # Retention configuration
│   │           ├── processing/    # Processing pipeline management
│   │           ├── management/    # Enable/disable, fork, resync
│   │           ├── ingest/        # Bulk ingest endpoint
│   │           ├── features/      # Feature identification
│   │           ├── systems/       # System identification
│   │           ├── queries/       # Query management
│   │           ├── insights/      # Insights discovery
│   │           ├── significant_events/  # Significant events
│   │           ├── prompts/       # AI prompt configuration
│   │           ├── failure_store/  # Failure store access
│   │           ├── onboarding/    # Onboarding flows
│   │           └── tasks/         # Background task management
│   └── lib/
│       ├── streams/
│       │   ├── service.ts         # StreamsService (creates scoped clients)
│       │   ├── client.ts          # StreamsClient (core CRUD operations)
│       │   ├── stream_crud.ts     # Stream CRUD helpers
│       │   ├── state_management/  # State machine for applying changes to ES
│       │   │   ├── execution_plan/    # Plans ES operations needed
│       │   │   ├── stream_active_record/  # Diffs current vs desired state
│       │   │   └── streams/           # WiredStream, ClassicStream state types
│       │   ├── storage/           # StreamsStorageClient for .kibana_streams
│       │   ├── attachments/       # Dashboard/SLO/rule linking
│       │   ├── assets/query/      # Query storage and linking
│       │   ├── feature/           # Feature identification service
│       │   ├── system/            # System identification service
│       │   ├── component_templates/
│       │   ├── data_streams/
│       │   ├── esql_views/
│       │   ├── index_templates/
│       │   ├── ingest_pipelines/
│       │   ├── lifecycle/
│       │   └── helpers/
│       ├── content/           # Content pack import/export
│       ├── rules/             # ES|QL alerting rule type
│       ├── tasks/             # Background task definitions
│       │   └── task_definitions/  # Description gen, system ID, features, insights
│       ├── significant_events/  # Significant event generation
│       └── telemetry/         # EBT and usage collection
└── test/scout/                # Scout API tests
```

### Key Patterns

#### Route Registration

Routes use `@kbn/server-route-repository` with a custom `createServerRoute` factory that adds:
- Telemetry tracking (endpoint latency)
- Error mapping (`StatusError` → Boom 400/403/404/409/500)
- OAS tagging (`oas-tag:streams`)

Each route specifies `endpoint`, `params` (Zod schema), `security.authz.requiredPrivileges`, and a `handler` function.

```typescript
export const myRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{name}/_details',
  params: z.object({
    path: z.object({ name: z.string() }),
    query: z.object({ start: z.string(), end: z.string() }),
  }),
  security: {
    authz: { requiredPrivileges: [STREAMS_API_PRIVILEGES.read] },
  },
  handler: async ({ params, request, getScopedClients }) => {
    const { streamsClient } = await getScopedClients({ request });
    // ... use streamsClient
  },
});
```

#### Service / Client Pattern

Services are instantiated in plugin setup. Each service provides a `getClientWithRequest({ request })` method that creates a request-scoped client with the correct auth context. The `getScopedClients` function wires all scoped clients together for route handlers.

Key services and their clients:
- `StreamsService` → `StreamsClient` (core CRUD: list, get, upsert, delete, fork, resync)
- `AttachmentService` → `AttachmentClient`
- `FeatureService` → `FeatureClient`
- `SystemService` → `SystemClient`
- `ContentService` → `ContentClient`
- `QueryService` → `QueryClient`
- `TaskService` → `TaskClient`

#### State Management (Server)

Stream mutations go through a state machine in `lib/streams/state_management/`. The flow is:
1. Load current state from `.kibana_streams` and ES
2. Build a `StreamActiveRecord` that diffs current vs desired state
3. Generate an `ExecutionPlan` of ES operations (create/update/delete templates, pipelines, etc.)
4. Execute the plan atomically

This ensures that all Elasticsearch objects stay in sync with stream definitions.

#### Feature Flags

Features behind flags are registered as `uiSettings` in `feature_flags.ts`:
- `observability:streams:enableSignificantEvents`
- `observability:streams:enableSignificantEventsDiscovery`
- `observability:streams:enableContentPacks`
- `observability:streams:enableAttachments`
- `observability:streams:enableQueryStreams`

## streams_app Plugin Architecture

**Plugin ID**: `streamsApp` | **Config path**: `xpack.streamsApp`

The app plugin provides the UI at `/app/streams`.

### Directory Structure

```
streams_app/
├── common/
│   ├── locators/              # StreamsAppLocatorDefinition (deep links)
│   └── url_schema/            # URL state schema for enrichment
├── public/
│   ├── plugin.tsx             # Plugin class, app registration
│   ├── application.tsx        # Root component
│   ├── routes/config.tsx      # Typed route configuration (io-ts)
│   ├── hooks/                 # React hooks
│   ├── services/              # App services
│   ├── components/
│   │   ├── app_root/          # Providers, router, breadcrumbs, tour
│   │   ├── stream_list_view/  # Stream list + tree table
│   │   ├── stream_root/       # Stream detail wrapper
│   │   ├── data_management/   # Core management tabs
│   │   │   ├── stream_detail_routing/      # Partitioning / routing rules
│   │   │   ├── stream_detail_enrichment/   # Processing pipeline (Streamlang)
│   │   │   │   ├── state_management/       # XState machines
│   │   │   │   │   ├── stream_enrichment_state_machine/
│   │   │   │   │   ├── simulation_state_machine/
│   │   │   │   │   ├── interactive_mode_machine/
│   │   │   │   │   ├── steps_state_machine/
│   │   │   │   │   └── yaml_mode_machine/
│   │   │   │   └── steps/blocks/action/    # Processor editors
│   │   │   ├── stream_detail_schema_editor/
│   │   │   ├── stream_detail_lifecycle/    # Retention, downsampling, failure store
│   │   │   └── shared/                     # Condition editor, condition display
│   │   ├── stream_detail_systems/          # Systems + features + description
│   │   ├── stream_detail_significant_events_view/
│   │   ├── significant_events_discovery/   # Discovery page
│   │   └── query_streams/                  # Query stream creation
│   └── telemetry/
├── server/                    # Minimal server plugin
└── test/scout/                # Scout UI tests (Playwright)
```

### UI Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `StreamListView` | Stream list with tree table |
| `/_discovery/{tab}` | `SignificantEventsDiscoveryPage` | Discovery: streams, features, queries, insights |
| `/{key}/management/{tab}` | `StreamDetailManagement` | Tabbed management (differs by stream type) |

Management tabs for **wired streams**: partitioning, processing, schema, retention, advanced, significant events, data quality, attachments.

Management tabs for **classic streams**: processing, advanced, data quality, retention, significant events, schema, attachments.

### Key UI Patterns

#### Routing

Uses `@kbn/typed-react-router-config` with `io-ts` for type-safe route params. Navigation via `useStreamsAppRouter()` which provides `push()`, `replace()`, and `link()`.

#### State Management (Client)

- **XState** for complex multi-step flows (enrichment pipeline editing, routing rules, simulation)
- **React Query** for server state (data fetching, caching, invalidation)
- **React Context** for scoped state (`StreamDetailContextProvider`, `StreamRoutingContextProvider`, `StreamEnrichmentContextProvider`)
- **react-hook-form** for form state in processor editors and lifecycle forms
- **URL state** via `KbnUrlStateStorageFromRouterProvider`

#### Data Fetching

The `useStreamsAppFetch` hook wraps `useAbortableAsync` and integrates with the global timefilter, auto-refresh, and error toasts.

## How to Work on Common Tasks

### Adding a New Route (Server)

1. Create a file in the appropriate `routes/` subdirectory (e.g. `routes/internal/streams/my_feature/route.ts`)
2. Use `createServerRoute` with endpoint, params (Zod), security, and handler
3. Export and spread the route into the parent route aggregation file (follow existing patterns in the directory's `index.ts`)
4. Access scoped clients via `getScopedClients({ request })` in the handler

### Adding a New Processing Action (Streamlang)

1. Define the Zod schema for the new action in `@kbn/streamlang` under `types/processors/`
2. Add the action to the processor union in `types/processors/index.ts`
3. Implement the ingest pipeline transpiler in the transpiler directory
4. Implement the ES|QL transpiler
5. Add the action metadata to `ACTION_METADATA_MAP`
6. Update the validator if the action has type constraints
7. Add tests in `@kbn/streamlang-tests`
8. Add the form-based editor in `streams_app` under `components/data_management/stream_detail_enrichment/steps/blocks/action/`

### Adding a New Management Tab (UI)

1. Add the tab to the appropriate management component in `stream_detail_management/`
2. Create the tab component under `components/data_management/`
3. Wire it into the route config if it needs URL params
4. Add feature flag gating in `feature_flags.ts` if needed

### Modifying Stream Schema

Stream type definitions live in `@kbn/streams-schema`. When changing the shape of a stream:
1. Update the Zod schemas in `@kbn/streams-schema`
2. Update the state management in `streams/server/lib/streams/state_management/` to handle the new fields
3. Update the execution plan to generate the correct ES operations
4. Update API routes that read/write the changed fields
5. Update the UI components that display/edit the changed fields

## Running and Testing

### Local Development

```bash
# Bootstrap (run after switching branches or on dependency errors)
yarn kbn bootstrap

# Generate sample log data (useful for testing streams)
node scripts/synthtrace.js sample_logs --live
```

Streams are shipped in Observability serverless. Enable wired streams via the Streams page flyout.

### Type Checking

```bash
# Streams plugin
yarn test:type_check --project x-pack/platform/plugins/shared/streams/tsconfig.json

# Streams app plugin
yarn test:type_check --project x-pack/platform/plugins/shared/streams_app/tsconfig.json

# Streams schema package
yarn test:type_check --project x-pack/platform/packages/shared/kbn-streams-schema/tsconfig.json

# Streamlang package
yarn test:type_check --project x-pack/platform/packages/shared/kbn-streamlang/tsconfig.json
```

### Unit Tests (Jest)

```bash
# Run tests for a specific file
yarn test:jest path/to/file.test.ts

# Run all tests in a directory (config is auto-discovered)
yarn test:jest x-pack/platform/plugins/shared/streams/server/lib/streams/
```

### Integration Tests (Scout)

Scout tests for the streams_app use Playwright:

```bash
# Start server (ESS)
node scripts/scout.js start-server --arch stateful --domain classic

# Run UI tests
node scripts/playwright test --config x-pack/platform/plugins/shared/streams_app/test/scout/ui/playwright.config.ts --project=local --grep stateful-classic
```

For serverless:
```bash
node scripts/scout.js start-server --arch serverless --domain observability_complete
node scripts/playwright test --config x-pack/platform/plugins/shared/streams_app/test/scout/ui/playwright.config.ts --project=local --grep serverless-observability
```

Streamlang integration tests:
```bash
node scripts/scout run-tests --arch stateful --domain classic --config x-pack/platform/packages/shared/kbn-streamlang-tests/test/scout/api/scout.config.ts
```

### Linting

```bash
node scripts/eslint --fix $(git diff --name-only)
```

## Key Domain Invariants

These rules are enforced by the system and must be preserved in any change:

- **Wired stream names** reflect the hierarchy with dot separators: `logs.otel.nginx.access`
- **Mappings are additive**: a child stream cannot change a field type defined by its parent
- **Routing is owned by the parent**: routing conditions for child streams are stored in the parent stream's definition
- **Routing happens after processing**: all processing steps execute before routing decisions
- **Root streams are read-only** except for routing decisions
- **Query streams are isolated from parent views**: the `$.` prefix on ES|QL view names ensures that `FROM parent, parent.*` never includes query stream data. Users must query them directly via `FROM $.name`
- **Draft mode is query-time only**: draft processing uses ES|QL views, not ingest pipelines
- **Classic streams are partially managed**: their underlying ES objects can be changed directly by users
- **Stream definitions are the source of truth**: all wired stream ES objects must be reconstructible from `.kibana_streams`
