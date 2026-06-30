# Managed workflows: registration and rollout patterns

> **AI agent skill:** For Cursor/Claude-assisted registration and PR review, see [workflows-managed-workflows SKILL.md](../.claude/skills/workflows-managed-workflows/SKILL.md).

This guide explains how plugin owners declare, install, and run **managed workflows** through `workflows_extensions`. Managed workflows are workflow documents owned by code (not by users): the platform creates and maintains them based on definitions you ship with your plugin.

This guide covers:

- ownership registration (setup)
- client initialization (start)
- when and where to install
- space-scoped vs global installs
- workflow identity (custom id, suffix, the reserved `system-` prefix)
- lifecycle policies (`lifecycle`, `versionStrategy`, `enablement`)
- billing declaration (`billable`)
- `yaml` vs `yamlTemplate`
- checking managed workflow status
- executing managed workflows

## Concepts

| Concept | Meaning |
|---|---|
| **Definition** | Code-owned descriptor: `id`, `pluginId`, `version`, `billable`, `yaml` or `yamlTemplate`, `management` policy. Lives in `@kbn/workflows/managed`. |
| **Owner plugin** | Plugin that owns a definition (`pluginId`). Drives reconciliation and orphan cleanup. |
| **Installed document** | Persisted workflow in `.workflows-*` indices, identified by `workflowId` + `spaceId`. |
| **Reserved namespace** | All managed definition ids start with `system-`. The platform rejects this prefix for user-defined workflows. |

Concrete flow:

1. Define a managed workflow in `@kbn/workflows/managed`.
2. From your plugin, register the owner during `setup()`.
3. Initialize a plugin-scoped client during `start()`.
4. Install instances when you have all the inputs (at `start()` or on-demand later).
5. Optionally execute via `managed.execute(...)`, with a request.

## 1) Register the owner (setup)

Register your plugin id during `setup()`. This is what tells the platform that your plugin is a legitimate owner of managed workflows.

```ts
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';

const MY_PLUGIN_ID = 'myPlugin';

export const setupManagedWorkflows = (
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup
) => {
  workflowsExtensions.registerManagedWorkflowOwner(MY_PLUGIN_ID);
};
```

Why it matters:

- **Orphan cleanup** removes managed documents whose owner plugin is not registered.
- **Auto-update reconciliation** uses registered owners to decide what may be re-applied at startup.

> Do not call `install` from `setup()`. Setup is for registration only.

## 2) Initialize the plugin-scoped client (start)

Initialize once in `start()`. The plugin id is bound to the client, so it is reused for every `install`/`uninstall`.

```ts
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';

const MY_PLUGIN_ID = 'myPlugin';

const managed = await workflowsExtensions.initManagedWorkflowsClient(MY_PLUGIN_ID);
```

Client surface:

- `install(id, options)` — no request required
- `uninstall(id, options)` — no request required
- `getWorkflowStatus(id, options)` — no request required
- `execute(request, id, options)` — **request required** (used for attribution and space context)

## 3) When to install

| When | Use it for |
|---|---|
| `setup()` | Never. Registration only. |
| `start()` | Baseline/static workflows you always want available. |
| On-demand (any time after `start()`) | Per-entity / per-tenant / per-space instances created in response to user or system actions. |

The same `install` API is used in both cases — there is no separate "deferred" or "post-start" entry point. As long as the plugin-scoped client has been initialized (see step 2), you can call `managed.install(...)` whenever you have the inputs you need (e.g., once a referenced entity exists, once a user enables a feature, once another plugin emits an event).

```ts
// start(): baseline install.
await managed.install(MY_WORKFLOW_ID, { spaceId: 'default' });

// On-demand: install a per-entity instance whenever it is needed.
async function onEntityCreated(entityId: string, spaceId: string) {
  await managed.install(MY_WORKFLOW_ID, {
    workflowIdSuffix: entityId,
    values: { entityId },
    spaceId,
  });
}
```

Installs are idempotent on `(definition version, persisted values)`, so it is safe to call `install` again for the same id without checking whether the document already exists.

## 3.1) Signaling readiness (`ready()`)

After installing all **static** workflows in `start()`, call `managed.ready()` to signal that the plugin has completed its startup installs:

```ts
// start()
const managed = await workflowsExtensions.initManagedWorkflowsClient(MY_PLUGIN_ID);

await managed.install(WORKFLOW_A_ID, { spaceId: 'default' });
await managed.install(WORKFLOW_B_ID, { workflowIdSuffix: 'us-east', spaceId: 'us-east' });
await managed.install(WORKFLOW_B_ID, { workflowIdSuffix: 'eu-west', spaceId: 'eu-west' });

await managed.ready();
```

### What `ready()` does

1. **Marks the startup window as closed** for this plugin. Any subsequent `install` of a static workflow logs a warning (the operation still succeeds, but it won't be tracked for reconciliation).
2. **Triggers per-plugin reconciliation** — the platform compares the set of `(workflowDocumentId, spaceId)` pairs that were installed during the startup window against all persisted static documents owned by this plugin. Any persisted document whose key was **not** seen during this startup is deleted as an orphan.

### Granularity of tracking

Reconciliation tracks installs at the **full document identity** level: `${workflowDocumentId}:${spaceId}`. The `workflowDocumentId` includes any suffix (e.g., `system-my-wf-us-east`). This means:

- Different suffix-based instances are tracked independently.
- The same definition in different spaces is tracked independently.
- Removing one suffix variant or one space from the `start()` install set causes only that specific instance to be cleaned up — other instances of the same definition remain untouched.

**Example:**

Previous startup installed:
- `system-monitor-host-a` in space `prod`
- `system-monitor-host-b` in space `prod`
- `system-monitor-host-a` in space `staging`

This startup only installs:
- `system-monitor-host-b` in space `prod`

After `ready()`: the two instances that were not re-installed (`system-monitor-host-a:prod` and `system-monitor-host-a:staging`) are removed.

### Dynamic workflows are excluded from cleanup

Orphan reconciliation only targets documents whose definition has `lifecycle: 'static'`. Dynamic workflows are never auto-cleaned — their create/remove lifecycle is explicitly managed by the owning plugin via `install`/`uninstall`.

Dynamic workflows with `versionStrategy: 'auto'` are still eligible for startup upgrades: when the owning plugin calls `ready()`, persisted dynamic instances for that plugin are re-applied from the current registry definition while preserving their stored template values.

## 4) Space-scoped vs global installs

Managed workflows can live in a specific space or in the **global** space (`'*'`, exported as `GLOBAL_WORKFLOW_SPACE_ID` from `@kbn/workflows/server`).

### Space-scoped (`spaceId: 'my-space'`)

Use a specific space when the workflow only makes sense inside that space:

- the related entity is space-aware (e.g., a rule, connector, or saved object that belongs to a single space)
- a user actively runs a flow in a specific space
- the workflow has overrides or template values that are space-specific
- the workflow must not be visible or executable from other spaces

```ts
await managed.install(MY_WORKFLOW_ID, { spaceId: 'my-space' });
```

### Global (`spaceId: '*'`)

Use the global space when the same workflow definition should serve every space, with execution-time isolation:

- the workflow definition is **visible and executable from every space** (one persisted document)
- each execution **runs in the context of the invoking space** — the execution document is stamped with the requesting `spaceId`
- execution results are **only visible inside the space that triggered the run**

This is the right choice for:

- system-level workflows that don't need a per-space copy but still must respect per-space data boundaries at runtime
- workflows that are space-agnostic (their behavior does not depend on the invoking space at all)

```ts
import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';

await managed.install(MY_WORKFLOW_ID, { spaceId: GLOBAL_WORKFLOW_SPACE_ID });
```

### No default

`spaceId` is required for managed operations. Omitted/empty `spaceId` is rejected. Use `GLOBAL_WORKFLOW_SPACE_ID` (`'*'`) explicitly when you want a global install.

## 5) Workflow identity

Install options:

- `workflowId` — full custom persisted id
- `workflowIdSuffix` — suffix appended to the definition id

Constraints:

- `workflowId` and `workflowIdSuffix` are mutually exclusive
- a custom `workflowId` must equal the definition id, or start with `${definitionId}-`

### `system-` is reserved

All managed definition ids **must** start with `system-`. The platform rejects this prefix for user-defined workflows, so:

- managed ids never collide with user workflows
- because suffixed ids inherit the `system-` prefix, suffix-based instances stay inside the reserved namespace

For a definition `system-entity-monitor`, valid persisted ids look like:

- `system-entity-monitor`
- `system-entity-monitor-host-42`
- `system-entity-monitor-my-space`

### Why id / suffix matters

Calling `install` repeatedly **without** `workflowId` or `workflowIdSuffix` resolves to the same persisted id (the definition id). Each install **overwrites** the previous document instead of creating a new instance.

To create the same managed workflow as multiple distinct instances, callers must use a deterministic id or suffix.

### Recommended patterns

| Use case | Suffix to use |
|---|---|
| One instance per space | the space id (e.g., `'my-space'`) |
| One instance per entity | a stable entity id (e.g., `'host-42'`, `'rule-uuid'`) |
| One instance per tenant | the tenant id |

Because the suffix is part of the persisted id, the resulting `workflowId` is **deterministic** and re-derivable. Callers can invoke a per-entity workflow later without storing an `entity → workflowId` (or `space → workflowId`) mapping.

```ts
// Per-space instance.
await managed.install(MY_WORKFLOW_ID, {
  workflowIdSuffix: 'my-space',
  spaceId: 'my-space',
});

// Per-entity instance.
await managed.install(MY_WORKFLOW_ID, {
  workflowIdSuffix: 'host-42',
  values: { entityId: 'host-42' },
  spaceId: 'my-space',
});

// Later, derive id and execute:
const workflowId = `${MY_WORKFLOW_ID}-host-42`;
await managed.execute(request, MY_WORKFLOW_ID, {
  workflowId,
  spaceId: 'my-space',
});
```

## 6) Lifecycle policies (`management`)

Every managed definition declares a policy (no default policy is injected at runtime):

```ts
management: {
  lifecycle: 'static' | 'dynamic',
  versionStrategy: 'auto' | 'on_adopt',
  enablement: 'enforced' | 'restorable',
}
```

| Field | Value | Behavior |
|---|---|---|
| `lifecycle` | `static` | Baseline workflow that must be installed every startup before `ready()`. Any persisted static instance not re-installed during the startup window is removed by reconciliation. |
| `lifecycle` | `dynamic` | Instance-like workflow created on-demand from runtime context (per entity / tenant / etc.). Not auto-removed by per-plugin reconciliation, but startup upgrades are applied when paired with `versionStrategy: 'auto'`. |
| `versionStrategy` | `auto` | Startup reconciliation may re-apply updates when the installed managed workflow differs from the current definition. |
| `versionStrategy` | `on_adopt` | Startup never auto-upgrades. Updates only happen on explicit `install`. |
| `enablement` | `enforced` | Managed updates always re-apply enabled state from the definition. |
| `enablement` | `restorable` | User-driven enabled/disabled state is preserved across managed updates. |

Choosing rules of thumb:

- platform-owned background workflow with a fixed set of instances → `static` + `auto` + `enforced`
- per-entity / per-tenant instance created or removed at runtime → `dynamic` + `on_adopt` + `restorable`

Key distinction: **static** workflows are declarative — the set installed at startup is the source of truth and anything not declared is cleaned up. **Dynamic** workflows are imperative — only explicit `uninstall` removes them during normal operation.

> **Global orphan cleanup (both lifecycles):** Regardless of lifecycle, all managed documents are removed at startup if their owning plugin is no longer registered or their definition has been removed from `@kbn/workflows/managed`. This ensures that uninstalling a plugin or deleting a definition leaves no dangling documents behind.

## 7) Authoring a definition

All managed workflow definitions live in `@kbn/workflows/managed`, organized as **one file per plugin** under the `definitions/` directory. Adding a new definition is a three-step change in that package:

1. **Create or update the plugin's definition file** in `managed/definitions/<your_plugin>.ts`. Declare the id as a `const` and the definition, and export both — the id is the value other code uses to call `install` / `uninstall` / `execute`, and tests reference it.
2. **Register the definition** by adding it to the `managedWorkflowDefinitions` array in `managed/definitions/index.ts`. The platform discovers definitions through this registry (e.g., for orphan cleanup and auto-update reconciliation), so a definition that isn't in this list does not exist as far as the platform is concerned.
3. **Re-export the id** from `managed/definitions/index.ts`; the package entry point forwards those exports so consumers import ids from `@kbn/workflows/managed` rather than from internal paths.

```ts
// packages/kbn-workflows/managed/definitions/my_plugin.ts
export const MY_WORKFLOW_ID = 'system-my-workflow';

export const MY_WORKFLOW: ManagedWorkflowDefinition = {
  id: MY_WORKFLOW_ID,
  pluginId: 'myPlugin',
  version: 1,
  billable: false,
  yaml: '...',
  management: { lifecycle: 'static', versionStrategy: 'auto', enablement: 'enforced' },
};
```

```ts
// packages/kbn-workflows/managed/definitions/index.ts
import { MY_WORKFLOW, MY_WORKFLOW_ID } from './my_plugin';

export const managedWorkflowDefinitions = [
  // ...existing definitions
  MY_WORKFLOW,
] as const;

export { MY_WORKFLOW_ID };
```

Consumers then use the id as a const everywhere:

```ts
import { MY_WORKFLOW_ID } from '@kbn/workflows/managed';

await managed.install(MY_WORKFLOW_ID, { spaceId: 'default' });
```

> Never hardcode the literal `'system-...'` string at call sites — always import the id const. This keeps definition ownership and rename safety in one place.

Validation note: `@kbn/workflows/managed` tests validate YAML syntax and the core workflow shape,
but intentionally tolerate extension-registered triggers, connectors, and plugin-registered steps.
Full validation of those runtime extensions requires a plugin-level schema built from the
workflows extension registries.

## 8) `yaml` vs `yamlTemplate`

A managed definition must provide exactly one of `yaml` or `yamlTemplate`.

### `yaml` — fixed definition

Use when the workflow body is fully static and install-time variables are not needed.

```ts
import type { ManagedWorkflowDefinition } from '@kbn/workflows/managed';

export const HEALTH_CHECK_WORKFLOW_ID = 'system-workflows-management-health-check';

export const HEALTH_CHECK_WORKFLOW: ManagedWorkflowDefinition = {
  id: HEALTH_CHECK_WORKFLOW_ID,
  pluginId: 'workflowsManagement',
  version: 1,
  billable: false,
  yaml: `name: Workflows Management Health Check
enabled: true
triggers:
  - type: scheduled
    with:
      every: 1h
steps:
  - name: ping
    type: console
    with:
      message: "workflows-management is alive"`,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
};

// Install once at start():
await managed.install(HEALTH_CHECK_WORKFLOW_ID, {
  spaceId: GLOBAL_WORKFLOW_SPACE_ID,
});
```

### `yamlTemplate(values)` — install-time parameterization

Use when some values are only known at install time (entity id, connector id, rule id, etc.). The template renders at install/update time, install values are persisted alongside the document, and re-installs are idempotent on `(definition version, persisted values)`.

```ts
import type { ManagedWorkflowDefinition } from '@kbn/workflows/managed';

interface MyTemplateValues {
  entityId: string;
}

export const MY_TEMPLATE_WORKFLOW_ID = 'system-my-template';

export const MY_TEMPLATE_WORKFLOW = {
  id: MY_TEMPLATE_WORKFLOW_ID,
  pluginId: 'myPlugin',
  version: 1,
  billable: false,
  yamlTemplate: ({ entityId }) => `name: Monitor ${entityId}
enabled: true
triggers:
  - type: scheduled
    with:
      every: 5m
steps:
  - name: check
    type: console
    with:
      message: "Checking ${entityId}"`,
  management: {
    lifecycle: 'dynamic',
    versionStrategy: 'auto',
    enablement: 'restorable',
  },
} as const satisfies ManagedWorkflowDefinition<MyTemplateValues>;

// Install:
await managed.install(MY_TEMPLATE_WORKFLOW_ID, {
  workflowIdSuffix: 'host-42',
  values: { entityId: 'host-42' },
  spaceId: 'my-space',
});
```

**Why `satisfies` for templates?** `as const satisfies ManagedWorkflowDefinition<MyTemplateValues>` validates the object against the type while preserving the literal `id` and `yamlTemplate` signature for downstream type inference. This allows the platform to infer `TValues` at call sites — `values` is type-checked for this workflow id (`entityId` typo/wrong type fails at compile time).

For `yaml`-based definitions (no template values), a direct annotation (`: ManagedWorkflowDefinition`) is sufficient since there is no `values` type to infer.

### `version` — definition versioning

Every managed definition declares a `version: number` (positive integer, starting at 1). Bump it whenever you ship a change to the definition's `yaml` or `yamlTemplate`.

- **`version` is metadata, not a reconciliation trigger.** The `definitionHash` (SHA-256 of the YAML content) remains the source of truth for whether an update is needed. The `version` provides a human-readable label persisted as `managedVersion` on the workflow document.
- Consumers (and future APIs) can compare the installed `managedVersion` on a document against the registry definition's `version` to answer "is this workflow up to date?" without inspecting hashes.
- `version` is not auto-derived from the hash — it is an explicit declaration that the owner controls.

### `billable` — execution metering

Every managed definition must declare `billable: boolean`. Set it to `true` only when executions of this managed workflow should be billed; otherwise set it to `false`.

This value is persisted with the managed workflow and included in metering metadata for directly executed managed workflows. If you are not sure whether your workflow should be billable, ask the Workflows team before adding or changing the definition.

## 9) Checking managed workflow status

Use `getWorkflowStatus` when a plugin needs a read-only pre-flight check before executing or depending on a managed workflow. The API is plugin-scoped: a plugin can only query definitions it owns. Unknown ids and ids owned by another plugin throw before workflow storage is queried.

```ts
const managed = await workflowsExtensions.initManagedWorkflowsClient(MY_PLUGIN_ID);

const status = await managed.getWorkflowStatus(MY_WORKFLOW_ID, {
  workflowIdSuffix: 'host-42',
  spaceId: 'my-space',
});

if (status.status !== 'intact') {
  logger.warn('Managed workflow is not ready', { status });
  return;
}
```

Status values:

| Status | Meaning |
|---|---|
| `intact` | The document exists, is managed by this plugin, is valid, enabled, and matches the registered definition hash and version. |
| `missing` | The document does not exist or is soft-deleted. |
| `disabled` | The document exists and is valid, but `enabled === false`. |
| `invalid` | The document exists but has no valid parsed workflow definition. |
| `drifted` | The document exists, but its stored `definitionHash`, `managedVersion`, or origin definition id differs from the registered definition. |
| `not_managed` | A workflow document exists at the resolved id, but it is not a managed workflow. |

If multiple conditions apply, the API reports the first matching status in this priority order: `missing`, `not_managed`, `invalid`, `disabled`, `drifted`, `intact`.

The status API accepts the same identity options as install/uninstall, except template `values` are not needed:

- omit `workflowId` and `workflowIdSuffix` to check the fixed definition id
- pass `workflowId` to check a known full persisted id
- pass `workflowIdSuffix` to check a deterministic suffixed instance

`getWorkflowStatus` does not mutate workflow state. To repair `missing` or `drifted` workflows, call `install` through the same plugin-scoped client.

## 10) Executing managed workflows

Execution always runs in the context of a `KibanaRequest`:

- the **request** is required for user attribution and authorization.
- the **execution document's `spaceId`** is taken from `options.spaceId` — pass the requesting space explicitly so the execution and its results are scoped to that space (this is what makes per-space visibility work for global workflows).
- `options.spaceId` is required. Omitting it rejects the managed operation.

```ts
const executionId = await managed.execute(request, MY_WORKFLOW_ID, {
  spaceId: 'my-space',
  inputs: { foo: 'bar' },
  triggeredBy: 'manual',
});
```

For a per-entity instance installed with a deterministic suffix, pass the resolved `workflowId`:

```ts
const workflowId = `${MY_WORKFLOW_ID}-host-42`;

await managed.execute(request, MY_WORKFLOW_ID, {
  workflowId,
  spaceId: 'my-space',
  inputs: { reason: 'periodic-check' },
});
```

### Global workflows at execution time

Global workflows (`spaceId: '*'`) are visible from any space, but each execution must still be stamped with a real space so results stay scoped:

- the workflow lookup uses `includeGlobal: true`, so the global document is found from any space.
- the execution document is stamped with the `spaceId` you pass in `options` — pass the requesting user's space, not `'*'`.
- consequence: results of a global workflow run are visible only inside the space that triggered the run.

## 11) Global workflows: user-facing behavior

Global managed workflows (`spaceId: '*'`) are stored **once** but have important cross-space implications that affect both end-users and plugin authors:

### Execution visibility is space-scoped

Although a global workflow is visible from every space, each execution is stamped with the space that triggered it. From the UI a user sees **only their own space's executions** — runs triggered from other spaces are invisible to them. This is by design: one workflow definition, per-space execution isolation.

### Edits and disabling are global

Because there is a **single persisted document** for a global workflow, any edit (YAML, name, tags, description) or enable/disable toggle **affects all spaces immediately**. There is no per-space override mechanism today. Plugin authors should be aware of this when choosing global vs space-scoped installs:

| Action | Scope |
|---|---|
| Edit YAML / name / tags | All spaces (single document) |
| Enable / disable | All spaces (single document) |
| Execute | Space that triggered the run |
| View execution results | Only the triggering space |

> **Future consideration:** Per-space overrides (e.g., enabling a global workflow only in certain spaces) are not yet supported. If your workflow needs per-space enablement control, use space-scoped installs with one document per space instead.

## 12) Rollout checklist

1. Add the definition in `@kbn/workflows/managed` with the correct `pluginId`, a `system-` id, `version: 1`, and an explicit `billable` value; export the id as a const.
2. Add the definition to `managedWorkflowDefinitions` in `managed/definitions/index.ts`, and re-export the id from that definitions barrel.
3. Register the owner plugin id in `setup()`.
4. Initialize the plugin-scoped client in `start()`.
5. Install baseline (static) workflows at `start()`. Use on-demand installs (the same `install` API) for dynamic instances.
6. Call `managed.ready()` after all static installs in `start()` — this triggers per-plugin reconciliation.
7. Pick an explicit `spaceId` strategy: space-scoped or global.
8. For multiple instances, always pass `workflowIdSuffix` (or `workflowId`) — never rely on the definition id alone.
9. Pick lifecycle policy intentionally (`static`/`dynamic`, `auto`/`on_adopt`, `enforced`/`restorable`).
10. Use `yamlTemplate` only when install-time values are required.
11. Ask the Workflows team if you are unsure whether the workflow should be billable.
12. Bump `version` on the definition whenever you change the `yaml` or `yamlTemplate`.
13. Use `managed.getWorkflowStatus(...)` for read-only pre-flight checks before execution.
14. Execute via `managed.execute(request, ...)`; for dynamic instances, pass the deterministic `workflowId`.
