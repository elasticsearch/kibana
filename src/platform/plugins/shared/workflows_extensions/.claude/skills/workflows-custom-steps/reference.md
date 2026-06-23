# Workflow Step Registration — Reference

Extended templates and patterns that are too long to fit in `SKILL.md`. Read this only when you need the full shape; the main skill has the rules.

## 1. Full scaffold for a new step

A minimal end-to-end step ("process a message") across the common, server, and public layers. Copy and rename for a real step.

> **Key casing:** workflow-owned config keys are kebab-case (`connector-id`); workflow-owned input keys under `with:` are kebab-case or snake_case (`max_count`, `dry-run`) — **never camelCase** (`maxCount`). Only inherited OpenAPI/connector shapes keep their original case. See SKILL.md → [Workflow YAML naming conventions](SKILL.md#workflow-yaml-naming-conventions-read-first).

### `common/step_types/process_message.ts`

```ts
import { z } from '@kbn/zod/v4';
import { i18n } from '@kbn/i18n';
import { StepCategory } from '@kbn/workflows';
import type { CommonStepDefinition } from '@kbn/workflows-extensions/common';

export const ProcessMessageStepTypeId = 'my-namespace.processMessage' as const;

export const InputSchema = z.object({
  message: z.string().min(1),
  count: z.number().int().positive().optional(),
});

export const OutputSchema = z.object({
  result: z.string(),
});

export const ConfigSchema = z.object({
  'connector-id': z.string(),
});

export type ProcessMessageInputSchema = typeof InputSchema;
export type ProcessMessageOutputSchema = typeof OutputSchema;
export type ProcessMessageConfigSchema = typeof ConfigSchema;

export const processMessageCommonDefinition: CommonStepDefinition<
  ProcessMessageInputSchema,
  ProcessMessageOutputSchema,
  ProcessMessageConfigSchema
> = {
  id: ProcessMessageStepTypeId,
  category: StepCategory.Kibana,
  label: i18n.translate('myPlugin.processMessage.label', {
    defaultMessage: 'Process Message',
  }),
  description: i18n.translate('myPlugin.processMessage.description', {
    defaultMessage: 'Processes a message and returns a result.',
  }),
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  configSchema: ConfigSchema,
  documentation: {
    details: i18n.translate('myPlugin.processMessage.documentation.details', {
      defaultMessage:
        'Use {ref} to read the result in subsequent steps. The optional `count` parameter is appended to the output.',
      values: { ref: '`{{ steps.<name>.output.result }}`' },
    }),
    examples: [
      `## Basic usage
\`\`\`yaml
- name: process_message
  type: ${ProcessMessageStepTypeId}
  connector-id: my-connector
  with:
    message: "Hello"
\`\`\``,
      `## With count
\`\`\`yaml
- name: process_message
  type: ${ProcessMessageStepTypeId}
  connector-id: my-connector
  with:
    message: "Hello"
    count: 3
\`\`\``,
    ],
  },
};
```

### `server/step_types/process_message.ts`

```ts
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ExecutionError } from '@kbn/workflows/server';
import { processMessageCommonDefinition } from '../../common/step_types/process_message';

export const processMessageDefinition = createServerStepDefinition({
  ...processMessageCommonDefinition,
  handler: async (context) => {
    const { message, count } = context.input;
    const { 'connector-id': connectorId } = context.config;

    if (!connectorId) {
      throw new ExecutionError({
        type: 'ValidationError',
        message: 'connector-id is required',
        details: { field: 'connector-id' },
      });
    }

    context.logger.info('Processing message', {
      stepId: context.stepId,
      connectorId,
    });

    const result = `Processed: ${message}${count ? ` (x${count})` : ''}`;
    return { output: { result } };
  },
});
```

### `server/step_types/index.ts`

```ts
import type { CoreSetup } from '@kbn/core/server';
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import { processMessageDefinition } from './process_message';

export const registerStepDefinitions = (
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup,
  _core: CoreSetup
): void => {
  workflowsExtensions.registerStepDefinition(processMessageDefinition);
};
```

### `public/step_types/process_message.ts`

```ts
import React from 'react';
import { createPublicStepDefinition } from '@kbn/workflows-extensions/public';
import { processMessageCommonDefinition } from '../../common/step_types/process_message';

export const processMessageDefinition = createPublicStepDefinition({
  ...processMessageCommonDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/email').then(({ icon }) => ({ default: icon }))
  ),
});
```

### `public/step_types/index.ts`

```ts
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';

export const registerStepDefinitions = (
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup
): void => {
  // Async loader keeps the step module + zod out of the plugin's main bundle.
  workflowsExtensions.registerStepDefinition(() =>
    import('./process_message').then((m) => m.processMessageDefinition)
  );
};
```

### Plugin wiring

```ts
// server/plugin.ts (setup phase)
import type { Plugin, CoreSetup } from '@kbn/core/server';
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import { registerStepDefinitions } from './step_types';

export interface MyPluginSetupDeps {
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
}

export class MyServerPlugin implements Plugin {
  public setup(core: CoreSetup, plugins: MyPluginSetupDeps) {
    registerStepDefinitions(plugins.workflowsExtensions, core);
    return {};
  }
}
```

```ts
// public/plugin.ts (setup phase)
import type { Plugin } from '@kbn/core/public';
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';
import { registerStepDefinitions } from './step_types';

export interface MyPluginSetupDeps {
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup;
}

export class MyPublicPlugin implements Plugin {
  public setup(_core: unknown, plugins: MyPluginSetupDeps) {
    registerStepDefinitions(plugins.workflowsExtensions);
    return {};
  }
}
```

```jsonc
// kibana.jsonc
{
  "type": "plugin",
  "id": "@kbn/my-plugin",
  "owner": "@elastic/my-team",
  "plugin": {
    "id": "myPlugin",
    "server": true,
    "browser": true,
    "requiredPlugins": ["workflowsExtensions"]
  }
}
```

## 2. Selection handlers

Pick the **least custom** option that fits — the editor already understands the built-ins and will give your users the same UX every other step gets.

| Use case | Handler | Notes |
|---|---|---|
| Pick a Kibana connector | `connectorIdSelection` | Built-in. **Only** on `config['connector-id']`. |
| Pick an index / alias / data stream | `selection: getIndexSelectionHandler(services, options)` | Reusable from `@kbn/workflows-ui`. Any field. Needs `dataViews` + `application`. |
| Anything else (templates, agents, owners, custom catalogs) | Custom `selection` with `search` + `resolve` + `getDetails` | All three are required when `selection` is declared. |

### 2a. Custom `selection` — templates (mirrors cases `create_case_from_template`)

A `case_template_id` input property that filters templates by the sibling `input.owner` field. Adapted from `x-pack/platform/plugins/shared/cases/public/workflows/create_case_from_template.tsx`.

```ts
import { createPublicStepDefinition } from '@kbn/workflows-extensions/public';
import { createCaseFromTemplateCommonDefinition } from '../../common/step_types/create_case_from_template';
import { getTemplatesForOwner, isValidOwner } from '../services/templates_service';

export const createCaseFromTemplateDefinition = createPublicStepDefinition({
  ...createCaseFromTemplateCommonDefinition,
  editorHandlers: {
    input: {
      case_template_id: {
        selection: {
          // Declare every sibling field the handlers read. Missing entries cause
          // stale cache hits when the user edits the sibling (e.g. switching owner).
          dependsOnValues: ['input.owner'],

          search: async (input, ctx) => {
            const owner = ctx.values.input.owner;
            if (!isValidOwner(owner)) return [];

            const query = input.trim().toLowerCase();
            const templates = await getTemplatesForOwner(owner);
            const queryIsEmpty = query.length === 0;

            return templates
              .filter(
                (t) =>
                  queryIsEmpty ||
                  t.key.toLowerCase().includes(query) ||
                  t.name.toLowerCase().includes(query)
              )
              .map((t) => ({
                value: t.key,
                label: t.name,
                description: t.description,
              }));
          },

          resolve: async (value, ctx) => {
            const owner = ctx.values.input.owner;
            if (!owner) return null;
            const templates = await getTemplatesForOwner(owner);
            const template = templates.find((t) => t.key === value);
            if (!template) return null;
            return {
              value: template.key,
              label: template.name,
              description: template.description,
            };
          },

          // No network call when `option` is non-null — the validation-outcome
          // cache reuses this result for ~30s per logical field.
          getDetails: async (value, _ctx, option) => {
            if (option) {
              return { message: `Template "${option.label}" can be used.` };
            }
            return { message: `Template "${value}" not found.` };
          },
        },
      },
    },
  },
});
```

### 2b. Built-in `connectorIdSelection` — pick a Kibana connector

Use this whenever your step needs to pick a connector. The editor handles autocomplete, type filtering, and (optionally) a "create connector" affordance.

```ts
import React from 'react';
import { createPublicStepDefinition } from '@kbn/workflows-extensions/public';
import { runAgentStepCommonDefinition } from '../../common/step_types/run_agent_step';

export const runAgentStepDefinition = createPublicStepDefinition({
  ...runAgentStepCommonDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/product_agent').then(({ icon }) => ({
      default: icon,
    }))
  ),
  editorHandlers: {
    config: {
      'connector-id': {
        connectorIdSelection: {
          // Required: action type IDs the picker accepts.
          connectorTypes: ['inference.unified_completion', 'bedrock', 'gen-ai', 'gemini'],
          // Optional, default `false` for custom steps. When `true`, the editor
          // shows a "create connector" affordance for the FIRST entry in
          // `connectorTypes` ('inference.unified_completion' here).
          enableCreation: false,
        },
      },
    },
  },
});
```

**Hard limitations** (enforced by `workflows_management/public/shared/lib/connectors_utils.ts`):

- Property MUST be the literal **`'connector-id'`** key. `connectorId`, `connector_id`, `my-connector-id` are silently ignored.
- Property MUST be in **`config`**, not `input`. The lookup is `editorHandlers?.config?.['connector-id']?.connectorIdSelection`.
- Pick one of `connectorIdSelection` or `selection` per property; do not declare both on the same handler.

**Defaults** to be aware of when reviewing PRs:

- Built-in connector steps default `enableCreation` to **true**. Custom steps default to **false**. If a custom step needs to show the create-connector affordance, set `enableCreation: true` explicitly and confirm the **first** entry in `connectorTypes` is the right type to surface.

### 2c. Reusable `getIndexSelectionHandler` — pick an index / alias / data stream

Imported from `@kbn/workflows-ui`. Returns a `PropertySelectionHandler<string>`, so it plugs into the **`selection`** slot of any field (`config` or `input`). The handler needs Kibana services, so wire it up through a public-side factory rather than a static `createPublicStepDefinition` call.

```ts
import React from 'react';
import type { ApplicationStart } from '@kbn/core/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import { createPublicStepDefinition } from '@kbn/workflows-extensions/public';
import { getIndexSelectionHandler } from '@kbn/workflows-ui';
import { searchDocsCommonDefinition } from '../../common/step_types/search_docs';

export interface SearchDocsStepDeps {
  dataViews: DataViewsContract;
  application: ApplicationStart;
}

export const getSearchDocsStepDefinition = (deps: SearchDocsStepDeps) =>
  createPublicStepDefinition({
    ...searchDocsCommonDefinition,
    icon: React.lazy(() =>
      import('@elastic/eui/es/components/icon/assets/search').then(({ icon }) => ({
        default: icon,
      }))
    ),
    editorHandlers: {
      input: {
        index: {
          selection: getIndexSelectionHandler(
            { dataViews: deps.dataViews, application: deps.application },
            {
              allowWildcard: true,    // accept patterns like `logs-*`; default `false`
              showAllIndices: false,  // exclude hidden/internal indices; default `false`
              maxResults: 20,         // search result cap; default `20`
            }
          ),
        },
      },
    },
  });
```

**What you get for free:**

- Autocomplete against `dataViews.getIndices(...)` with index / alias / data-stream detection (`description: "Type: index | alias | data stream"`).
- When `allowWildcard: true` and the user hasn't yet typed `*`, a wildcard suggestion (`<input>*`) is surfaced first when it would match more than one source.
- `resolve` rejects wildcards when `allowWildcard: false`; rejects empty strings always.
- `getDetails` renders a friendly "no current match" message with a deep link to **Index Management** built from `application.getUrlForApp('management', { deepLinkId: 'index_management' })`.

**No field-name restriction:** attach it to any property whose value is an index pattern (`index`, `target`, `data_stream`, `source`, etc.). Internal steps use it on `input.index` for several `elasticsearch.*` step types — see `workflows_management/public/common/context/internal_steps/editor_handlers/editor_handlers.ts` for three different option presets (search vs write vs delete).

**Required services** must come from your plugin's public dependencies — declare `dataViews` in `requiredPlugins` of `kibana.jsonc`. `application` is on `CoreStart`. Pass them into the factory; do **not** try to import them statically.

### Registering definitions that need deps

When the public definition needs Kibana services (`connectorIdSelection` does not, but `getIndexSelectionHandler` and most custom `selection` handlers do), export a factory and call it from the async loader:

```ts
// public/step_types/index.ts
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';
import type { SearchDocsStepDeps } from './search_docs';

export const registerStepDefinitions = (
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup,
  deps: SearchDocsStepDeps
) => {
  workflowsExtensions.registerStepDefinition(() =>
    import('./search_docs').then((m) => m.getSearchDocsStepDefinition(deps))
  );
};
```

## 3. Dynamic output schema

When the shape of `output` depends on `input`, use `editorHandlers.dynamicSchema.getOutputSchema` for **editor-time** autocomplete. The server still validates against the static `outputSchema` from the common definition — keep that schema as the **union** of all possible output shapes.

```ts
// common/step_types/transform_step.ts
const InputSchema = z.object({
  mode: z.enum(['partial', 'full']),
  field: z.string(),
});

const OutputSchema = z.union([
  z.object({ partial: z.string() }),
  z.object({ full: z.string(), metadata: z.record(z.string(), z.string()) }),
]);
```

```ts
// public/step_types/transform_step.ts
import { z } from '@kbn/zod/v4';
import { createPublicStepDefinition } from '@kbn/workflows-extensions/public';
import { transformStepCommonDefinition } from '../../common/step_types/transform_step';

export const transformStepDefinition = createPublicStepDefinition({
  ...transformStepCommonDefinition,
  editorHandlers: {
    dynamicSchema: {
      getOutputSchema: ({ input }) => {
        if (input.mode === 'partial') {
          return z.object({ partial: z.string() });
        }
        return z.object({
          full: z.string(),
          metadata: z.record(z.string(), z.string()),
        });
      },
    },
  },
});
```

## 4. Conditional / feature-flagged registration

Public side:

```ts
workflowsExtensions.registerStepDefinition(async () => {
  if (!(await deps.featureFlags.get('myPlugin.enableProcessMessage'))) {
    return undefined; // skip silently — no error, no entry in the registry
  }
  return (await import('./process_message')).processMessageDefinition;
});
```

Server side (resolving a `CoreSetup`-derived feature flag once and reusing it):

```ts
import type { CoreSetup } from '@kbn/core/server';
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';

export const registerStepDefinitions = (
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup,
  core: CoreSetup
) => {
  const isEnabled = core
    .getStartServices()
    .then(([coreStart]) =>
      coreStart.featureFlags.getBooleanValue('myPlugin.enableProcessMessage', false)
    );

  workflowsExtensions.registerStepDefinition(async () => {
    if (!(await isEnabled)) return undefined;
    return (await import('./process_message')).processMessageDefinition;
  });
};
```

Loaders that throw are caught by the registry and logged via the plugin logger; a single broken loader cannot prevent other steps (or workflow execution as a whole) from working. If a step seems "missing" at runtime, check the Kibana log for a registration failure before suspecting the schema.

## 5. Error handling — patterns

```ts
import { ExecutionError } from '@kbn/workflows/server';

// (a) Plain throw — engine converts to ExecutionError(type=Error.name, message)
if (!context.input.userId) throw new Error('userId is required');

// (b) Custom typed error with structured details
if (!user.hasPermission(action)) {
  throw new ExecutionError({
    type: 'PermissionError',
    message: `User ${userId} cannot ${action}`,
    details: { userId, action, required: action, has: user.permissions },
  });
}

// (c) Wrap a caught error to add context
try {
  return { output: await performAction(user, action) };
} catch (error) {
  if (error instanceof ExecutionError) throw error;  // already typed; propagate
  throw new ExecutionError({
    type: 'ProcessingError',
    message: `Failed to process action for user ${userId}`,
    details: {
      userId,
      action,
      originalError: error instanceof Error ? error.message : String(error),
    },
  });
}

// (d) Return error in result (preserves any partial output computed so far)
return {
  output: { partial },
  error: new ExecutionError({
    type: 'NetworkError',
    message: 'Downstream service unreachable',
    details: { url },
  }),
};
```

## 6. Common `kibana.jsonc` shape

```jsonc
{
  "type": "plugin",
  "id": "@kbn/my-workflow-steps",
  "owner": "@elastic/my-team",
  "description": "Adds workflow steps owned by my team",
  "group": "platform",
  "visibility": "private",
  "plugin": {
    "id": "myWorkflowSteps",
    "server": true,
    "browser": true,
    "requiredPlugins": ["workflowsExtensions"]
  }
}
```

If your handler calls another plugin's request-scoped client (preferred over `callKibanaApi`), add that plugin to `requiredPlugins` and pass `context.contextManager.getFakeRequest()` to the client.

## 7. Tests to write

Reuse the local plugin's test style; common minimum:

- **Common Zod schemas**: a snapshot or fixture round-trip per schema with at least one happy-path object and one rejection case (e.g. wrong type, missing required field).
- **Server handler**: a Jest unit test mocking `StepHandlerContext` (or the plugin's own helper) — assert the happy path produces the expected `output`, and at least one error path throws / returns the expected `ExecutionError.type`.
- **Public registration**: there is already a precedent of `register_workflow_steps.test.ts` in `security_solution` — assert each step is registered (including async loaders) and that conditional registrations respect their flags.
- **Approval test** (Scout API): runs in CI; locally, run it to get the `echo … > approved_step_definitions/<step.id>.txt` command(s) you need to run from the kibana directory to add or update each per-step approval file. See [STEPS.md → Step Definition Approval Process](../../dev_docs/STEPS.md#step-definition-approval-process).

Avoid snapshotting the entire definition unless behavior changes; the i18n strings churn.

## 8. Reference files in the repo

Useful files to grep for real-world patterns:

| Need | File |
|---|---|
| Canonical example | `examples/workflows_extensions_example/{common,server,public}/step_types/` |
| Server contract types | `src/platform/plugins/shared/workflows_extensions/server/step_registry/types.ts` |
| Public contract types | `src/platform/plugins/shared/workflows_extensions/public/step_registry/types.ts` |
| `EditorHandlers` / `ConnectorIdSelectionHandler` types | `src/platform/packages/shared/kbn-workflows/types/v1.ts` (search `EditorHandlers`, `ConnectorIdSelectionHandler`) |
| `getIndexSelectionHandler` | `src/platform/packages/shared/kbn-workflows-ui/src/lib/steps/editor_handlers/index_selection_handler.ts` |
| `connectorIdSelection` consumer | `src/platform/plugins/shared/workflows_management/public/shared/lib/connectors_utils.ts` (`getCustomStepConnectorIdSelectionHandler`, `isCreateConnectorEnabledForStepType`) |
| `getIndexSelectionHandler` in-tree usage | `src/platform/plugins/shared/workflows_management/public/common/context/internal_steps/editor_handlers/editor_handlers.ts` |
| Custom `selection` (cases templates) | `x-pack/platform/plugins/shared/cases/public/workflows/create_case_from_template.tsx` |
| `connectorIdSelection` example | `x-pack/platform/plugins/shared/agent_builder/public/step_types/run_agent_step.ts` |
| `BaseStepDefinition` + `StepCategory` | `src/platform/packages/shared/kbn-workflows/spec/step_definition_types.ts` |
| `ExecutionError` | `src/platform/packages/shared/kbn-workflows/server/errors/execution_error.ts` |
| Approval fixtures (one file per step) | `src/platform/plugins/shared/workflows_extensions/test/scout/api/fixtures/approved_step_definitions/` |
| Factory-style server steps | `x-pack/platform/plugins/shared/cases/server/workflows/steps/` |
| Feature-flagged loader | `x-pack/solutions/security/plugins/security_solution/server/workflows/step_types/register_workflow_steps.ts` |
