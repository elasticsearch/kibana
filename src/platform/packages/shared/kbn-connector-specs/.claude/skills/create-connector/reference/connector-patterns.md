# Connector Patterns

This document describes the file structure and patterns for creating new connectors in Kibana.

## Directory Structure

Connector specs live in: `src/platform/packages/shared/kbn-connector-specs/src/specs/`

```
kbn-connector-specs/src/specs/
├── all_specs.ts                # Registration file - ADD YOUR SPEC HERE
├── slack/
│   ├── slack.ts                # Connector spec
│   ├── slack.test.ts           # Tests
│   ├── types.ts                # Zod schemas and inferred types
│   └── icon/
│       └── index.tsx           # Brand icon component
├── github/
│   ├── github.ts
│   ├── github.test.ts
│   ├── types.ts
│   └── icon/
│       └── index.tsx
└── {your_connector}/           # YOUR NEW CONNECTOR
    ├── {your_connector}.ts
    ├── {your_connector}.test.ts
    ├── types.ts
    └── icon/
        └── index.tsx
```

## Scaffold Generator

For new connectors, run:

```bash
node scripts/generate connector <name> --id ".<id>" --owner "<team>"
```

Replace `<team>` with the owning GitHub team. Ask the user if unsure.

The generator creates:
- Connector spec stub, test stub, icon placeholder
- Documentation page at `docs/reference/connectors-kibana/`
- Updates to `all_specs.ts`, `connector_icons_map.ts`, CODEOWNERS, docs TOC

After running the generator, fill in the TODO placeholders.

## Connector Spec Structure

```typescript
import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { ConnectorSpec } from '../../connector_spec';
import { SearchInputSchema, GetItemInputSchema } from './types';
import type { SearchInput, GetItemInput } from './types';

export const YourConnector: ConnectorSpec = {
  metadata: {
    id: '.your_connector',           // MUST start with a dot
    displayName: 'Your Connector',
    description: i18n.translate('core.kibanaConnectorSpecs.yourConnector.metadata.description', {
      defaultMessage: 'Search items, list collections, and retrieve details from Your Service',
    }),
    minimumLicense: 'enterprise',
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [{ type: 'bearer' }],     // or 'api_key_header', 'oauth_client_credentials'
  },

  schema: z.object({
    // Config fields (optional — only if the connector needs user-configured settings)
  }),

  actions: {
    search: {
      isTool: true,
      description: 'Search items by keyword. Returns a ranked list of matching results with IDs and summaries.',
      input: SearchInputSchema,
      handler: async (ctx, input: SearchInput) => {
        const response = await ctx.request({ method: 'GET', url: '/search', params: input });
        return response.data;
      },
    },
    getItem: {
      isTool: true,
      description: 'Retrieve full details for a single item by ID. Use the IDs returned by the search action.',
      input: GetItemInputSchema,
      handler: async (ctx, input: GetItemInput) => {
        const response = await ctx.request({ method: 'GET', url: `/items/${input.id}` });
        return response.data;
      },
    },
  },

  skill: [
    'To find and read an item: first call `search` with a keyword query, then call `getItem` with an ID from the results.',
    'The `search` action returns at most 20 results by default; use the `limit` parameter to request more.',
    'Item IDs are not stable across connector instances — always search before referencing an ID.',
  ].join('\n'),
};
```

## Input Schemas & Types

Define Zod schemas and inferred types in a separate `types.ts` file alongside the connector spec. This keeps schemas as the single source of truth for both runtime validation and TypeScript types.

**Path**: `src/platform/packages/shared/kbn-connector-specs/src/specs/<name>/types.ts`

```typescript
import { z } from '@kbn/zod/v4';

export const SearchInputSchema = z.object({
  query: z.string().describe('Search query string'),
  limit: z.number().optional().describe('Maximum results (default: 20)'),
});
export type SearchInput = z.infer<typeof SearchInputSchema>;

export const GetItemInputSchema = z.object({
  id: z.string().describe('The item ID'),
});
export type GetItemInput = z.infer<typeof GetItemInputSchema>;
```

This pattern (used by ServiceNow, Slack, GitHub connectors):
- Eliminates drift between schemas and types — `z.infer` derives the type from the schema
- Keeps the main connector file focused on handler logic
- Gives handlers full autocomplete without inline `as` casts

## MCP-Native Connector Pattern

For connectors backed by an MCP server. Uses `withMcpClient` from `lib/mcp` to wrap MCP tool calls as typed actions.

```typescript
import { z } from '@kbn/zod/v4';
import type { ConnectorSpec } from '../../connector_spec';
import { withMcpClient } from '../../lib/mcp/with_mcp_client';
import { UISchemas } from '../../connector_spec_ui';

export const YourMcpConnector: ConnectorSpec = {
  metadata: {
    id: '.your_mcp_connector',
    displayName: 'Your MCP Connector',
    description: 'Search and retrieve data via Your Service MCP server',
    minimumLicense: 'enterprise',
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [{ type: 'bearer' }],
  },

  schema: z.object({
    serverUrl: UISchemas.url('https://mcp.example.com/mcp/')
      .describe('MCP server URL')
      .meta({ label: 'Server URL' }),
  }),

  actions: {
    search: {
      isTool: true,
      description: 'Search Your Service by keyword using the underlying MCP tool.',
      input: z.object({
        query: z.string().describe('Keyword or natural-language search query'),
      }),
      handler: withMcpClient(async (client, input) => {
        return client.callTool({ name: 'your_search', arguments: input });
      }),
    },
    // Escape hatches for dynamic tool discovery
    listTools: {
      isTool: true,
      description: 'List all MCP tools exposed by the server. Useful for dynamic discovery.',
      input: z.object({}),
      handler: withMcpClient(async (client) => {
        return client.listTools();
      }),
    },
    callTool: {
      isTool: true,
      description: 'Call any MCP tool by name with arbitrary arguments. Use listTools first to discover available tools.',
      input: z.object({
        name: z.string().describe('The MCP tool name (from listTools)'),
        arguments: z.record(z.unknown()).optional().describe('Tool arguments as a key/value map'),
      }),
      handler: withMcpClient(async (client, input) => {
        return client.callTool(input);
      }),
    },
  },

  skill: [
    'To search: call `search` with a keyword query.',
    'For tools not covered by typed actions, use `listTools` to discover available MCP tools, then call them with `callTool`.',
  ].join('\n'),
};
```

**Reference connectors:**
- GitHub: `src/platform/packages/shared/kbn-connector-specs/src/specs/github/github.ts`
- Tavily: `src/platform/packages/shared/kbn-connector-specs/src/specs/tavily/tavily.ts`

## Schema UI Configuration

Schema config fields define the "Connector settings" section of the creation form. Every field in the `schema` object **must** have `.meta()` with at least a `label`, or the field will render as an unlabeled input.

```typescript
schema: z.object({
  instanceUrl: z
    .string()
    .url()
    .describe('ServiceNow instance URL')
    .meta({
      label: 'Instance URL',           // REQUIRED - displayed as the field label
      widget: 'text',                   // Widget type (text, password, select, etc.)
      placeholder: 'https://your-instance.service-now.com',
    }),
}),
```

Available `.meta()` options: `label`, `widget`, `placeholder`, `helpText`, `hidden`, `sensitive`, `disabled`, `order`.

For URL fields, use the `UISchemas.url()` helper from `connector_spec_ui.ts`:

```typescript
import { UISchemas } from '../../connector_spec_ui';

schema: z.object({
  apiUrl: UISchemas.url('https://api.example.com')
    .describe('API endpoint URL')
    .meta({ label: 'API URL' }),
}),
```

## OAuth Auth Configuration

When using `oauth_client_credentials` or `oauth_authorization_code`, customize the auth form to minimize user friction. Use `defaults` with `{ hidden: true }` for values that should be hardcoded, and `overrides.meta` with `placeholder` for values the user must provide.

### Defaults vs Placeholders

**Defaults** set the actual value of a field. On "Edit", defaults re-appear even though the user's original values are encrypted and cannot be read back. This means:

- **If a field has a true default** (a value that is always correct and the user should never change), set it as a `default` AND mark it `{ hidden: true }` so the user never sees it. Good examples: `scope` values, fixed OAuth endpoints (e.g. Google's `https://accounts.google.com/o/oauth2/v2/auth`).
- **If a field needs an example** (the user must enter their own value, like a tenant-specific URL), use a `placeholder` instead of a `default`. This way, on "Edit", the field appears empty rather than showing a misleading template value.

### Example: Fixed endpoints (Google, Notion, Figma, Zoom)

When the OAuth provider has a single, fixed set of endpoints, use hidden defaults for everything:

```typescript
auth: {
  types: [
    {
      type: 'oauth_authorization_code',
      defaults: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'https://www.googleapis.com/auth/drive.readonly',
      },
      overrides: {
        meta: {
          authorizationUrl: { hidden: true },
          tokenUrl: { hidden: true },
          scope: { hidden: true },
        },
      },
    },
  ],
},
```

### Example: Tenant-specific endpoints (SharePoint, ServiceNow)

When URLs vary per tenant/instance, use placeholders for URLs and hidden defaults for scope:

```typescript
auth: {
  types: [
    {
      type: 'oauth_client_credentials',
      defaults: {
        scope: 'https://graph.microsoft.com/.default',
      },
      overrides: {
        meta: {
          scope: { hidden: true },
          tokenUrl: {
            placeholder: 'https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token',
            helpText: "Replace '{tenant-id}' with your Azure AD tenant ID.",
          },
        },
      },
    },
  ],
},
```

### Example: Variable endpoints (Salesforce)

When the provider has standard URLs that advanced users may change (e.g. sandbox vs production), use placeholders:

```typescript
auth: {
  types: [
    {
      type: 'oauth_authorization_code',
      defaults: {
        scope: 'api refresh_token',
      },
      overrides: {
        meta: {
          authorizationUrl: {
            placeholder: 'https://login.salesforce.com/services/oauth2/authorize',
          },
          tokenUrl: {
            placeholder: 'https://login.salesforce.com/services/oauth2/token',
          },
          scope: { hidden: true },
        },
      },
    },
  ],
},
```

**Key rules:**
- Never use `defaults` for a field the user sees on "Edit" — the default will overwrite their encrypted value.
- Always pair a `default` with `{ hidden: true }` so the field is invisible in the form.
- Use `placeholder` to show examples for fields the user must fill in.
- Use `{ disabled: true }` only when the value should be visible but not editable (rare).

## Icon Patterns

### Option 1: SVG File + EuiIcon (preferred)

Save the brand SVG as a separate file, then load it via `EuiIcon`. This matches the pattern used by `amazon_s3`, `bigquery`, `azure_blob`, `figma`, and most other connectors.

**`icon/box.svg`** — plain SVG markup (no JSX, no React imports):
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <!-- SVG paths from the original logo -->
</svg>
```

**`icon/index.tsx`**:
```typescript
import React from 'react';
import { EuiIcon } from '@elastic/eui';
import type { ConnectorIconProps } from '../../../types';

import connectorIcon from './connector_name.svg';

export default (props: ConnectorIconProps) => {
  return <EuiIcon type={connectorIcon} {...props} />;
};
```

### Option 2: PNG Image

```typescript
import React from 'react';
import { EuiIcon } from '@elastic/eui';
import type { ConnectorIconProps } from '../../../types';
import iconImage from './icon.png';

export default (props: ConnectorIconProps) => {
  return <EuiIcon type={iconImage} {...props} />;
};
```

### Register the Icon

Add to `src/platform/packages/shared/kbn-connector-specs/src/connector_icons_map.ts`:

```typescript
[
  '.your_connector',
  lazy(
    () => import(/* webpackChunkName: "connectorIconYourConnector" */ './specs/your_connector/icon')
  ),
],
```

## Where to Find Existing Logos

1. **Connector Specs** (SVG components):
   `src/platform/packages/shared/kbn-connector-specs/src/specs/{name}/icon/`

2. **Stack Connectors** (SVG components):
   `x-pack/platform/plugins/shared/stack_connectors/public/connector_types/{connector}/logo.tsx`

3. **Data Connectors Plugin** (various formats):
   `packages/kbn-data-connectors-plugin/`

## Naming Conventions

| Item | Convention | Example                                    |
|------|------------|--------------------------------------------|
| Directory name | snake_case | `sharepoint_online`                        |
| Connector ID | **MUST start with dot**, snake_case | `.sharepoint-online`, `.servicenow_search` |
| TypeScript files | snake_case.ts | `types.ts`                                 |
| Export names | PascalCase for specs | `SharepointOnline`                         |
| Test files | {name}.test.ts | `sharepoint_online.test.ts`                |

## Critical ID Alignment

The following IDs **MUST all match exactly**:

1. `ConnectorSpec.metadata.id` in the connector spec
2. Key in `ConnectorIconsMap` in `connector_icons_map.ts`

If a connector already exists with a given ID, use a unique variant (like `.servicenow_search`).

## LLM-Quality Descriptions and Skill Content

Connectors surface three levels of natural-language guidance to AI agents: the connector-level `metadata.description`, per-action `description` fields, and an optional top-level `skill` property. All three are read by the agent at runtime — write them as if you were briefing a capable but uninformed assistant.

### `isTool` — exposing actions to Agent Builder

Set `isTool: true` on actions that should be discoverable by AI agents in Agent Builder. This is the common case — most actions should be tools. The default is `false`, so omitting it silently hides the action from agents.

Set `isTool: false` (or omit it) for actions that exist for completeness but should not be invoked by an agent autonomously — for example, destructive operations, admin-only actions, or low-level helpers that are only useful as building blocks for other actions.

### Action descriptions

Every action should have a `description` that answers: "What does this do, and when should I call it?"

- **Use plain strings** — action descriptions are for LLM consumption only, not shown in the UI. Do NOT wrap them in `i18n.translate()`.
- State the operation in plain terms (what it fetches, creates, or sends).
- Mention what the response contains so the agent knows what it can do next.
- If there is an obvious ordering relationship with another action, note it here.
- **Download/binary actions**: If the action returns base64-encoded or binary data, include a WARNING in the description advising agents to only call it when they have a plan to process the data (e.g. via an Elasticsearch ingest pipeline attachment processor). Warn about potentially large payloads.

**ServiceNow examples:**
- `'Search incidents by keyword, status, or assignee. Returns incident numbers, short descriptions, and state.'`
- `'Retrieve the full details of a single incident by sys_id. Use the sys_id values returned by searchIncidents.'`

**Slack examples:**
- `'Send a message to a Slack channel or DM. Returns the message timestamp, which can be used to post a reply in a thread.'`
- `'Search Slack messages by keyword. Returns matching messages with channel, author, and timestamp.'`

### Parameter `.describe()`

Every Zod parameter should have a `.describe()` call that gives the agent the context it needs to fill in a correct value.

- Include the expected format or type when it is not obvious (`'ISO 8601 date string, e.g. 2024-01-15'`).
- State the unit for numeric fields (`'Maximum number of results to return (1–100, default 20)'`).
- For ID fields, say where the value comes from (`'The sys_id of the incident, returned by searchIncidents'`).
- For enum-like strings, list the accepted values inline (`'Filter by state: "new", "in_progress", or "resolved"'`).
- **Bound user-input strings** — add `.max()` to string fields that accept free-form user input (search queries, AI prompts, natural-language descriptions). Use the service's documented API limit if available; otherwise 2000 for queries and 10000 for AI prompts are safe defaults. Do not bound ID fields or pagination tokens — those have fixed service-side formats.

```typescript
export const SearchInputSchema = z.object({
  query: z.string().describe('Keyword or natural-language search query'),
  limit: z.number().optional().describe('Maximum results to return (1–100, default 20)'),
  state: z.string().optional().describe('Filter by state: "new", "in_progress", or "resolved"'),
});

export const GetItemInputSchema = z.object({
  id: z.string().describe('The item sys_id, returned by the search action'),
});
```

### `skill` property

The top-level `skill` field is a markdown string with usage guidance that does not fit neatly inside a single action description. Use it for:

- **Multi-step patterns**: e.g., "search first, then fetch by ID".
- **Gotchas**: rate limits, pagination, fields that require a prior lookup.
- **Cross-action references**: when one action's output feeds another.

Use the `[...].join('\n')` pattern to keep each point on its own line and avoid a long string literal:

```typescript
skill: [
  'To find and read an incident: call `searchIncidents` first, then pass the `sys_id` from the result to `getIncident`.',
  'The `searchIncidents` action returns at most 20 results by default; use `limit` to request up to 100.',
  'To post a threaded reply in Slack, call `sendMessage` with the `thread_ts` value returned by a previous `sendMessage` call.',
].join('\n'),
```

**ServiceNow** (`src/platform/packages/shared/kbn-connector-specs/src/specs/servicenow/`) and **Slack** (`src/platform/packages/shared/kbn-connector-specs/src/specs/slack/`) are the reference connectors for these patterns.

## `metadata.description` Quality

The description is shown in the UI tile picker and surfaced to AI agents. Write it to accurately reflect capabilities.

**Rules:**
- **MUST use `i18n.translate()`** — this string is shown in the UI and must be internationalized
- **List the key verbs/actions** the connector supports (e.g., "search", "list", "download", "send")
- **Name the objects** those actions operate on (e.g., "messages", "issues", "files")
- **Keep to one sentence** — ~15 words max
- **Don't start with "Connect to X"** — that's implied
- **Don't say "Kibana Stack Connector for X"** — that's an implementation detail

**Good examples:**
- `'Search messages, list public channels, and send messages in Slack'`
- `'Search repositories, issues, and pull requests, browse file contents, and list branches in GitHub'`

**Bad examples:**
- `'Connect to Jira to pull data from your project.'` — too vague
- `'Kibana Stack Connector for SharePoint Online.'` — says nothing about capabilities
