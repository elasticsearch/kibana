# Workflows Management Plugin

This plugin contains the Workflows management application and APIs.

The workflows management plugin provides the user interface and management capabilities for creating, editing, scheduling, and monitoring workflows. It serves as the primary interface for workflow operations and integrates with the workflows execution engine.

---

## Table of Contents

- [Requirements](#requirements)
- [Enable the Feature Flag](#enable-the-feature-flag)
- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Dependencies](#dependencies)
- [API versioning, compatibility, and stability](#api-versioning-compatibility-and-stability)
- [API Endpoints](#api-endpoints)
- [UI Application](#ui-application)
- [Development](#development)

---

## Requirements

To use workflows, you need an **active Enterprise license**. Workflows are not available on Basic or Standard licenses.

---

## The Feature Flag

The workflows feature UI setting is enabled by default, it can be disabled via Kibana config with:

```yml
uiSettings.overrides:
  workflows:ui:enabled: false
```

Experimental Workflows features are gated behind a separate Advanced Setting:

```yml
uiSettings.overrides:
  workflows:experimentalFeatures: true
  workflows:ui:visualEditor:enabled: true
  workflows:ui:executionGraph:enabled: true
  workflows:ui:showExecutor:enabled: true
```

If running in Serverless or Cloud dev environments, you can disable it via API:

```bash
POST kbn://internal/kibana/settings
{
   "changes": {
      "workflows:ui:enabled": false
   }
}
```

---

## Overview

The workflows management plugin provides:

- **Workflow Designer**: Visual interface for creating and editing workflows
- **Workflow Library**: Browse and manage existing workflows
- **Execution Monitoring**: Track workflow runs and performance
- **Scheduling**: Configure automated workflow execution
- **Connector Integration**: Manage workflow connectors and actions

---

## Features

### Workflow Creation
- Drag-and-drop workflow designer
- Step configuration and validation
- Variable and context management
- Template support
- YAML-based workflow definition

### Workflow Management
- Workflow versioning and history
- Import/export capabilities
- Workflow cloning
- Bulk operations

### Execution & Monitoring
- Real-time execution tracking
- Execution history and logs
- Performance metrics
- Error handling and debugging
- Step-level execution details

### Testing & Validation
- Workflow validation before execution
- Test individual steps
- Test complete workflows without saving
- JSON schema validation

---

## Architecture

The management plugin follows a layered architecture:

```
┌─────────────────────────────────────────┐
│          Public UI Layer                │
│  (React components, forms, visualizer)  │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Server API Layer                │
│      (REST endpoints, validation)       │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│       Service Layer                     │
│  (Business logic, workflow management)  │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│    Storage & Execution Layer            │
│ (Saved Objects, Task Manager, Engine)   │
└─────────────────────────────────────────┘
```

### Key Components

- **Workflows Management Service**: Core service for workflow CRUD operations and execution management
- **Workflows API**: RESTful API endpoints for all workflow operations
- **Saved Objects**: Workflow definitions persisted as Kibana saved objects
- **Task Manager Integration**: Handles scheduled workflow execution
- **Connector Integration**: Interfaces with Kibana Actions framework

---

## Dependencies

### Required Plugins

| Plugin | Purpose |
|--------|---------|
| `workflowsExecutionEngine` | Core execution runtime for workflows |
| `taskManager` | Scheduled execution management |
| `actions` | Connector and action support |
| `features` | Feature registration and capabilities |
| `security` | Access control and authentication |
| `triggersActionsUi` | Action configuration UI |
| `spaces` | Multi-tenancy support |
| `navigation` | UI navigation |
| `data`, `dataViews` | Data layer and index patterns |
| `esUiShared` | Shared Elasticsearch UI components |
| `stackConnectors` | Built-in connector types |
| `fieldFormats` | Field formatting utilities |
| `unifiedSearch` | Search capabilities |
| `embeddable` | Workflow visualization |

### Optional Plugins

| Plugin | Purpose |
|--------|---------|
| `alerting` | Integration with alerting framework |
| `serverless` | Serverless-specific features |

---

## API versioning, compatibility, and stability

This section summarizes how public Workflows HTTP APIs are versioned and how that appears in documentation. For authoritative paths, parameters, and examples, use the generated OpenAPI surface.

### Version compatibility

| Topic | Detail |
|--------|--------|
| **API date version** | Public routes use version `2023-10-31` (see `API_VERSION` in [`server/api/routes/utils/route_constants.ts`](./server/api/routes/utils/route_constants.ts)). |
| **Version header** | Send `elastic-api-version: 2023-10-31` on requests to public endpoints, consistent with [Kibana HTTP API versioning](https://github.com/elastic/kibana/blob/main/dev_docs/contributing/kibana_http_api_design_guidelines.mdx#versioning). |
| **Stack introduction** | Public Workflows REST APIs are annotated with `since: 9.4.0` for stack deployments. |
| **License** | An **Enterprise** license is required (see [Requirements](#requirements)). |
| **Privileges** | Access is enforced via `workflowsManagement` feature privileges (see route `security` blocks under [`server/api/routes/`](./server/api/routes/)). |
| **UI setting `workflows:ui:enabled`** | Controls whether the **Workflows management application and related UI** are registered in the browser. It does **not** remove public REST routes under `/api/workflows`; those routes remain subject to license and authorization checks. |
| **Spaces** | Public URLs are space-aware (for example `/s/{space_id}/api/workflows` in documentation); see [Spaces](https://www.elastic.co/docs/deploy-manage/manage-spaces). |

---

## API Endpoints

Public HTTP APIs live under `/api/workflows` (space-aware in docs as `/s/{space_id}/api/workflows/...`). Send `elastic-api-version: 2023-10-31` on requests.

**OpenAPI (OAS) documentation for these endpoints:** use the generated bundles—[`kibana.yaml`](../../../../../oas_docs/output/kibana.yaml) (stateful) and [`kibana.serverless.yaml`](../../../../../oas_docs/output/kibana.serverless.yaml) (serverless)—or the published [Workflows API group (stateful)](https://www.elastic.co/docs/api/doc/kibana/group/endpoint-workflows) and [Workflows API group (serverless)](https://www.elastic.co/docs/api/doc/serverless/group/endpoint-workflows). Each public operation lists parameters, request bodies, responses, and examples.

### Public routes

| Method | Path | Summary |
|--------|------|---------|
| GET | `/api/workflows` | List workflows (pagination and filters via query string). |
| POST | `/api/workflows` | Bulk create workflows. |
| DELETE | `/api/workflows` | Bulk delete workflows. |
| POST | `/api/workflows/mget` | Get multiple workflows by ID. |
| POST | `/api/workflows/export` | Export workflows. |
| GET | `/api/workflows/stats` | Workflow statistics. |
| GET | `/api/workflows/aggs` | Workflow aggregations. |
| GET | `/api/workflows/connectors` | Available connector types. |
| GET | `/api/workflows/schema` | Workflow JSON schema. |
| POST | `/api/workflows/workflow` | Create a workflow. |
| GET | `/api/workflows/workflow/{id}` | Get a workflow by ID. |
| PUT | `/api/workflows/workflow/{id}` | Update a workflow. |
| DELETE | `/api/workflows/workflow/{id}` | Delete a workflow. |
| POST | `/api/workflows/workflow/{id}/clone` | Clone a workflow. |
| POST | `/api/workflows/workflow/{id}/run` | Run a workflow. |
| GET | `/api/workflows/workflow/{workflowId}/executions` | List executions for a workflow. |
| GET | `/api/workflows/workflow/{workflowId}/executions/steps` | List step executions for a workflow. |
| POST | `/api/workflows/workflow/{workflowId}/executions/cancel` | Cancel all active executions for a workflow. |
| POST | `/api/workflows/test` | Test a workflow without persisting it. |
| POST | `/api/workflows/step/test` | Test a single workflow step. |
| GET | `/api/workflows/executions/{executionId}` | Get an execution by ID. |
| GET | `/api/workflows/executions/{executionId}/children` | List child executions. |
| GET | `/api/workflows/executions/{executionId}/logs` | Execution logs. |
| GET | `/api/workflows/executions/{executionId}/step/{stepExecutionId}` | Get a step execution. |
| POST | `/api/workflows/executions/{executionId}/cancel` | Cancel an execution. |
| POST | `/api/workflows/executions/{executionId}/resume` | Resume an execution. |
| GET | `/api/workflows/executions/{executionId}/trigger_event_trace` | Trigger event trace for an execution. |

### Internal routes

These routes use `access: internal` and are **not** included in the public OpenAPI bundles above. They use a numeric `elastic-api-version` (see `INTERNAL_API_VERSION` in [`server/api/routes/utils/route_constants.ts`](./server/api/routes/utils/route_constants.ts)). For validate, example payloads live in [`validate_workflow.yaml`](./server/api/routes/examples/validate_workflow.yaml).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/internal/workflows/config` | Execution engine feature flags for the plugin. |
| POST | `/internal/workflows/disable` | Disable all workflows (administrative). |
| POST | `/api/workflows/validate` | Validate a workflow YAML definition without saving. |

---

## UI Application

The workflows management UI is available at `/app/workflows` when the feature flag is enabled.

### Features

- **Workflow Designer**: Visual workflow builder with drag-and-drop interface
- **Workflow Library**: Browse, search, and filter workflows
- **Execution Dashboard**: Monitor workflow executions in real-time
- **Execution History**: View past executions with filtering and sorting
- **Step-by-step Debugging**: Detailed step execution information
- **Connector Management**: View and configure available connectors

### Routes

- `/app/workflows` - Workflow library (home page)
- `/app/workflows/new` - Create new workflow
- `/app/workflows/edit/{id}` - Edit existing workflow
- `/app/workflows/{id}` - View workflow details
- `/app/workflows/{id}/executions` - View workflow execution history
- `/app/workflows/executions/{executionId}` - View execution details

### Pagination (HTTP APIs)

Many list endpoints accept `page` and `size` (or route-specific defaults) as **query parameters** on `GET` requests. Exact fields and response envelopes differ by route—use the OpenAPI entries for each operation.

**Examples** (add `elastic-api-version: 2023-10-31` and auth headers as for any public Kibana API):

List workflows (free-text `query` plus pagination):

```http
GET /api/workflows?page=1&size=20&query=sales
```

List executions for a workflow:

```http
GET /api/workflows/workflow/{workflowId}/executions?page=1&size=20
```

Execution logs (see the **workflows** OpenAPI operation for required vs optional query fields such as `size`, `page`, and `stepExecutionId`):

```http
GET /api/workflows/executions/{executionId}/logs
```

---

## Development

### Plugin Structure

```
workflows_management/
├── common/              # Shared code (types, schemas, utilities)
├── public/              # Browser-side code
│   ├── application.tsx  # Main application entry
│   ├── components/      # React components
│   ├── features/        # Feature modules
│   ├── pages/          # Page components
│   └── ...
├── server/             # Server-side code
│   ├── workflows_management/  # Core service and API
│   │   ├── routes/           # API route handlers
│   │   └── ...
│   ├── storage/        # Data persistence layer
│   ├── tasks/          # Task manager integration
│   └── ...
└── README.md          # This file
```

### Local Development

1. Enable the feature flag in `kibana.dev.yml`
2. Start Elasticsearch: `yarn es snapshot`
3. Start Kibana: `yarn start`
4. Navigate to `/app/workflows`

### Event-driven custom trigger `on` options

Registered (non-built-in) triggers may set optional flags under `triggers[].on` in YAML:

- **`workflowEvents`**: One of **`ignore`**, **`avoid-loop`**, or **`allow-all`** (string). Controls how the workflow is scheduled when the trigger event was emitted from a workflow-attributed chain:
  - **`ignore`**: Do not schedule when the emit is workflow-attributed; user or domain-originated emits (no chain context) still run the workflow.
  - **`avoid-loop`**: Schedule on workflow-attributed emits, but skip if this workflow id is already on the event chain (cycle guard). **Omitted defaults to `avoid-loop`** at runtime.
  - **`allow-all`**: Schedule without the cycle guard; **`maxEventChainDepth`** from the execution engine config still applies.

### Testing

```bash
# Run unit tests
yarn test:jest src/platform/plugins/shared/workflows_management
# Running a specific test
yarn test:jest -- $path # (e.g. src/platform/plugins/shared/workflows_management/public/widgets/workflow_yaml_editor/lib/snippets/insert_trigger_snippet.test.ts)

# Run integration tests
yarn test:jest_integration src/platform/plugins/shared/workflows_management

# Run FTR tests (if available)
yarn test:ftr --config x-pack/test/workflows_management_api_integration/config.ts
```

### Authentication & Authorization

All API endpoints require authentication. The plugin integrates with Kibana's security framework:

- **Read operations**: Require `read` privilege on workflows
- **Write operations**: Require `write` privilege on workflows
- **Execute operations**: Require `execute` privilege on workflows
- **Delete operations**: Require `delete` privilege on workflows

Workflows are space-aware and respect Kibana Spaces boundaries.

---

## Additional Resources

- [Workflows Execution Engine Plugin](../workflows_execution_engine/README.md)
- [Kibana Plugin Development Guide](https://www.elastic.co/guide/en/kibana/current/development.html)

---

**Plugin Owner**: `@elastic/workflows-eng`