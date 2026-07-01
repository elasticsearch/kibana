# Event-driven triggers: contributing and approval

## Contributing Event-Driven Triggers

This section provides a complete guide for contributors who want to add event-driven triggers so workflows can subscribe and run when events occur. Triggers are registered from **your plugin**, not from inside `workflows_extensions` (same ownership rule as [custom steps](STEPS.md#contributing-custom-step-types)).

**Agent skill:** Cursor and Claude agents should use the [`workflows-custom-triggers`](../.claude/skills/workflows-custom-triggers/SKILL.md) skill for plugin discovery, file layout conventions, and review checklists. This doc remains the canonical source for implementation steps and code templates.

**Quick checklist:**

1. Define common trigger (id, eventSchema, title, description; optional documentation and snippets) in your plugin
2. Register on server and public in plugin `setup()`
3. Emit events via request context or direct `emitEvent`
4. Add to approved list and get workflows-eng approval

### Trigger ID and naming conventions

Trigger IDs use the following convention:

- Format: `<namespace>.<event>` — use **kebab-case** for the namespace, **camelCase** for the event
- ✅ Good: `"my-namespace.customTrigger"`, `"cases.updated"`, `"custom-feature.alertFired"`
- ⚠️ Allowed: Inherited forms from OpenAPI/connectors/platform-owned contracts
- ❌ Bad: `"my_trigger"` (no namespace), `"custom_trigger"` (event not camelCase)

### Step 1: Define common trigger (id, eventSchema, title, description; optional documentation and snippets)

Create a shared definition (e.g. `common/triggers/my_trigger.ts`) in your plugin. **title** and **description** are required. **documentation** (details + YAML examples) and **snippets** (e.g. a default `on.condition`) are optional but strongly recommended so the YAML editor, hover docs, and agent tools can guide users (aligned with custom steps):

```typescript
import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';

/** Trigger id: kebab-case namespace, camelCase event */
export const MY_TRIGGER_ID = 'my-plugin.myTrigger' as const;

export const myTriggerEventSchema = z.object({
  message: z.string().describe('The message text for the event.'),
  source: z.string().optional().describe('The source that emitted the event.'),
  category: z.string().optional().describe('Category for filtering in workflow conditions.'),
});

export type MyTriggerEvent = z.infer<typeof myTriggerEventSchema>;

export const commonMyTriggerDefinition: CommonTriggerDefinition = {
  id: MY_TRIGGER_ID,
  stability: 'tech_preview',
  eventSchema: myTriggerEventSchema,
  title: i18n.translate('myPlugin.myTrigger.title', { defaultMessage: 'My trigger' }),
  description: i18n.translate('myPlugin.myTrigger.description', {
    defaultMessage: 'Emitted when something happens.',
  }),
  documentation: {
    details: 'Filter when this workflow runs using KQL on event properties (e.g. event.category, event.message).',
    examples: [
      `## Match by category\n\`\`\`yaml\ntriggers:\n  - type: ${MY_TRIGGER_ID}\n    on:\n      condition: 'event.category: "alerts"'\n\`\`\``,
    ],
  },
  snippets: { condition: 'event.category: "alerts"' },
};
```

- Set `stability: 'tech_preview'` on every trigger (required). Until event-driven triggers GA, registration accepts only `'tech_preview'`. After GA, promote production-ready triggers to `stability: 'stable'`.
- Use `.describe()` on schema fields so the UI and docs show helpful text.
- `eventSchema` must be a Zod object schema; payloads are validated at emit time.
- When you provide `documentation.examples`, each example must only reference fields present on `eventSchema` (agents pattern-match YAML examples).
- When you provide `snippets.condition`, it must be valid KQL using only `event.*` fields from `eventSchema` (validated at registration).

### Step 2: Register on server

In your plugin's server `setup()`, register the **same** common definition:

```typescript
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import { commonMyTriggerDefinition } from '../common/triggers/my_trigger';

export const registerTriggers = (workflowsExtensions: WorkflowsExtensionsServerPluginSetup) => {
  workflowsExtensions.registerTriggerDefinition(commonMyTriggerDefinition);
};

// In plugin.ts setup():
registerTriggers(plugins.workflowsExtensions);
```

Reference: `examples/workflows_extensions_example/server/triggers/index.ts`.

### Step 3: Register on public

Spread the common definition and add **icon** only (browser-only UI):

```typescript
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import React from 'react';
import { commonMyTriggerDefinition } from '../common/triggers/my_trigger';

export const myTriggerPublicDefinition: PublicTriggerDefinition = {
  ...commonMyTriggerDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/star').then(({ icon }) => ({ default: icon }))
  ),
};

// In public plugin setup():
plugins.workflowsExtensions.registerTriggerDefinition(myTriggerPublicDefinition);
```

**Async registration (optional):** To keep your plugin's main bundle small, you can register a **loader** instead of the definition. The workflows app awaits `workflowsExtensions.isReady()` before rendering, so trigger definitions are available when the UI needs them:

```typescript
// In public plugin setup():
plugins.workflowsExtensions.registerTriggerDefinition(() =>
  import('./triggers/custom_trigger').then((m) => m.myTriggerPublicDefinition)
);
```

Reference: `examples/workflows_extensions_example/public/triggers/custom_trigger.ts` and `public/triggers/index.ts`.

### Step 4: Emit events — two ways

**Option A — From a route (request context, recommended)**

When you have an HTTP request, use the request-scoped client so space and request are taken from the current context:

1. Add `workflowsExtensions` to your plugin's `requiredPlugins` in `kibana.jsonc`.
2. Type your route handler context to include `workflows: WorkflowsApiRequestHandlerContext` (from `@kbn/workflows/server`).
3. In the route handler:

```typescript
const workflows = await context.workflows;
await workflows.emitEvent(MY_TRIGGER_ID, { message: request.body.message, source: 'my-api', category: 'alerts' });
```

Reference: `examples/workflows_extensions_example/server/plugin.ts` and `server/routes/emit_event.ts`.

**Option B — Direct (when you have request and space)**

1. Add `workflowsExtensions` to your plugin's `requiredPlugins` in `kibana.jsonc`.
2. When emitting from background code (e.g. a job) where you have a `KibanaRequest`, you can get the workflows client from the start contract of the `workflowsExtension` plugin, to emit an event:

```typescript
const workflowsClient = await plugins.workflowsExtensions.getClient(request);
await workflowsClient.emitEvent(MY_TRIGGER_ID, { message: 'Event from job', source: 'background', category: 'audit' });
```

Payload is validated against the trigger's `eventSchema`; if validation fails, `emitEvent` throws. A trigger event handler must be registered (e.g. by `workflows_management`) for workflows to run.

### Step 5: Trigger approval

All new triggers must be approved. See [Trigger Definition Approval Process](#trigger-definition-approval-process) below.

### Example workflow YAML

Users subscribe to your trigger in a workflow:

```yaml
triggers:
  - type: my-plugin.myTrigger
    on:
      condition: 'event.category: "alerts"'
steps:
  - name: handle_event
    type: console.log
    with:
      message: "Event: {{ context.event.message }}"
```

Event payload is available in workflows as `context.event`.

### Full example

See `examples/workflows_extensions_example` for a complete trigger: common definition, server and public registration, route that emits via request context, and approval entry.

## Trigger Definition Approval Process

All event-driven trigger definitions must be approved by the workflows-eng team before being merged. This is enforced through a Scout API test that validates registered triggers against an approved list.

### How it works

1. When you register a new trigger, the test detects it during CI runs.
2. Each trigger has a **schema hash** (derived from its `eventSchema`). The test compares registered triggers against the approved list.
3. The approved list lives in `test/scout/api/fixtures/approved_trigger_definitions.ts`.

### Adding a new trigger

1. **Register your trigger** (common + server + public) as in [Contributing Event-Driven Triggers](#contributing-event-driven-triggers).
2. **Run the server** and GET `internal/workflows_extensions/trigger_definitions` to obtain the `schemaHash` for your trigger id.
3. **Add an entry** to `test/scout/api/fixtures/approved_trigger_definitions.ts` (alphabetically by id):

   ```typescript
   export const APPROVED_TRIGGER_DEFINITIONS: Array<{ id: string; schemaHash: string }> = [
     { id: 'my-plugin.myTrigger', schemaHash: 'a1b2c3d4e5f6...' },
   ];
   ```

4. **Get approval** from the workflows-eng team (via PR review).

If you change the trigger's `eventSchema`, the schema hash changes; update the approved list and get re-approval.

## Event-driven guardrails

To prevent infinite loops and unbounded workflow executions:

- **Event-chain depth**: Depth is inferred from the request inside `emitEvent` (and propagated on outbound `kibana.request` steps via headers). Each time a trigger event schedules workflow runs, depth is incremented for those runs. If the new depth would exceed the configured maximum, those workflows are **not** scheduled and a server warning is logged.

- **Configuration**: Set the maximum chain depth in `kibana.yml` with **`workflowsExecutionEngine.eventDriven.maxChainDepth`**. Default is **`10`**; minimum is **`1`**. See the [workflows execution engine README](../../workflows_execution_engine/README.md#configuration) and [config](../../workflows_execution_engine/server/config.ts).

- **Same request is required for depth tracking**: Emitters must pass the **same request** from the current code path when calling `emitEvent`. The platform attaches event-chain context (depth, source execution id, and visited workflow ids when present) to that request when a workflow runs; if you use a different request (e.g. a new or unrelated one), the platform cannot infer chain context and cannot enforce the depth limit. **Always use the request you use for attribution/space** so the guardrail works correctly.

- **Per-trigger `on.workflowEvents` (YAML)**: For registered (custom) triggers, workflows may set `triggers[].on.workflowEvents` to **`ignore`**, **`avoid-loop`**, or **`allow-all`**. Omitted defaults to **`avoid-loop`**: the workflow runs on workflow-attributed emits unless the event-chain **cycle** guard blocks it; **`ignore`** skips scheduling when the emit is workflow-attributed; **`allow-all`** opts out of the cycle guard (depth cap still applies).

#### Event-chain depth (loop) demo

The example plugin registers a second trigger `example.loopTrigger` (payload: `{ iteration: number }`) and a route that emits it. You can demonstrate the event-chain depth guardrail (`workflowsExecutionEngine.eventDriven.maxChainDepth`, default `10`) by running a workflow that re-emits the same trigger until the guardrail stops scheduling. Use a **`kibana.request`** step so the execution engine attaches event-chain headers on the outbound call; a generic HTTP connector step does not add those headers and may not propagate depth correctly.

Example workflow (create this in the UI or import as YAML):

```yaml
name: Example loop trigger (event-chain depth demo)
description: >-
  Triggered by example.loopTrigger; calls emit_loop to re-emit with the next iteration until maxChainDepth is reached.
enabled: true

triggers:
  - type: example.loopTrigger

steps:
  - name: reemit_loop
    type: kibana.request
    with:
      method: POST
      path: /api/workflows_extensions_example/emit_loop
      body:
        iteration: '{{ event.iteration | default: 0 | plus: 1 }}'
```

1. **Run Kibana with examples:** `yarn start --run-examples`.
2. **Create the loop workflow** using the YAML above (trigger `example.loopTrigger` and the `kibana.request` step as shown).
3. **Start the loop:**
   ```bash
   curl -X POST -u elastic:changeme -H 'Content-Type: application/json' \
     'http://localhost:5601/api/workflows_extensions_example/emit_loop' -d '{}'
   ```
   (or `-d '{"iteration":0}'`). Each run executes the `kibana.request` step, which POSTs to `emit_loop` with the next iteration and re-emits the trigger. After the event chain reaches your configured `maxChainDepth` (default `10`), the guardrail stops scheduling further runs.
