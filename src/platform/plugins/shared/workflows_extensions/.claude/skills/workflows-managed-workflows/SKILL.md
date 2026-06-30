---
name: workflows-managed-workflows
description: Register and roll out managed workflows from a Kibana plugin using `@kbn/workflows-extensions` and `@kbn/workflows/managed`. Use when adding or modifying a code-owned workflow definition, `registerManagedWorkflowOwner`, `initManagedWorkflowsClient`, `install` / `uninstall` / `ready`, choosing `lifecycle` / `versionStrategy` / `enablement`, authoring `yaml` vs `yamlTemplate`, space-scoped vs global installs, `getWorkflowStatus`, or `execute`, or reviewing PRs that touch managed workflow definitions or rollout. Always ask for the user's plugin id first to locate the correct plugin and definition file paths.
---

# Workflows — Managed Workflow Registration

> Managed workflows are code-owned workflow documents the platform installs and reconciles for you. A misconfigured definition can orphan documents at startup, wipe dynamic instances, install into the wrong space, or ship YAML that fails validation. The defaults are not always right — verify each field in the canonical guide explicitly.

**Canonical doc:** [dev_docs/MANAGED_WORKFLOWS.md](../../dev_docs/MANAGED_WORKFLOWS.md) — registration, rollout, lifecycle policies, `yaml` / `yamlTemplate`, spaces, status, execute, and full code examples.

**Worked example:** `examples/workflows_extensions_example/` + `src/platform/packages/shared/kbn-workflows/managed/definitions/workflows_extensions_example.ts`

## Source files

| What                  | Path                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Definition types      | `src/platform/packages/shared/kbn-workflows/managed/types.ts`                             |
| Registry              | `src/platform/packages/shared/kbn-workflows/managed/definitions/index.ts`                 |
| Plugin-scoped client  | `src/platform/plugins/shared/workflows_extensions/server/types.ts`                        |
| Runtime API types     | `src/platform/packages/shared/kbn-workflows/server/types.ts`                              |
| Global space constant | `GLOBAL_WORKFLOW_SPACE_ID` from `@kbn/workflows/server`                                   |
| Registry tests        | `src/platform/packages/shared/kbn-workflows/managed/managed_workflow_definitions.test.ts` |

Read [MANAGED_WORKFLOWS.md](../../dev_docs/MANAGED_WORKFLOWS.md) for the full walkthrough. Use the sections below only for agent workflow and review gates.

## 0. Locate the owning plugin (do this first)

**Before creating or editing any files**, ask the user for their **plugin id** (`plugin.id` from `kibana.jsonc`, camelCase — e.g. `streams`, `workflowsExtensionsExample`). Do not guess or assume a plugin.

If the user already named their plugin in the request, confirm it matches `plugin.id` before proceeding. The same id must appear on:

- `definition.pluginId` in `@kbn/workflows/managed`
- `registerManagedWorkflowOwner(pluginId)` in plugin `setup()`
- `initManagedWorkflowsClient(pluginId)` in plugin `start()`

### Resolve the plugin root

```bash
rg '"id": "<pluginId>"' --glob '**/kibana.jsonc'
```

Read that `kibana.jsonc` to confirm `workflowsExtensions` is in `requiredPlugins`.

### Choose file locations

| Location                                                                     | Purpose                                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/platform/packages/shared/kbn-workflows/managed/definitions/<plugin>.ts` | Definition + exported id const(s)                                 |
| `src/platform/packages/shared/kbn-workflows/managed/definitions/index.ts`    | Add to `managedWorkflowDefinitions`; re-export id(s)              |
| `your-plugin/server/managed_workflows/`                                      | Optional: re-export ids + `PLUGIN_ID` const for install code      |
| `your-plugin/server/plugin.ts`                                               | `registerManagedWorkflowOwner` (setup), client + installs (start) |

Inspect existing plugins for conventions already in use (flat file vs subdirectory, e.g. `streams_ki/`, `significant_events/`).

## Quick rule reference

See [MANAGED_WORKFLOWS.md](../../dev_docs/MANAGED_WORKFLOWS.md) for rationale and examples. High-signal rules:

| Concern                 | Rule                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Definition id           | Must start with `system-`; stable once shipped — import id const at call sites          |
| `pluginId`              | Same id in definition, `registerManagedWorkflowOwner`, and client init                  |
| Registry                | Definition in `managedWorkflowDefinitions` + id re-exported from `definitions/index.ts` |
| `management`            | Explicit `lifecycle`, `versionStrategy`, `enablement` — no runtime default              |
| `yaml` / `yamlTemplate` | Exactly one; bump `version` on content changes                                          |
| `setup()`               | `registerManagedWorkflowOwner` only — never `install`                                   |
| `start()`               | `initManagedWorkflowsClient` → static `install`s → `ready()`                            |
| `spaceId`               | Required on every operation; use `GLOBAL_WORKFLOW_SPACE_ID` explicitly for global       |
| Multi-instance          | Use `workflowIdSuffix` or full `workflowId` — bare id overwrites                        |
| `execute`               | Real request + requesting user's space in options (not `'*'`)                           |
| Templates               | Add representative `values` to `templateRepresentativeValuesById` in registry tests     |

## Author checklist

When adding a managed workflow:

1. **Plugin id**

   - [ ] User's `plugin.id` confirmed from `kibana.jsonc`
   - [ ] Same id on definition, `registerManagedWorkflowOwner`, and `initManagedWorkflowsClient`

2. **Definition** (`kbn-workflows/managed/definitions/`) — see [§7–§8 in MANAGED_WORKFLOWS.md](../../dev_docs/MANAGED_WORKFLOWS.md)

   - [ ] Id starts with `system-`; exported as a `const`
   - [ ] `pluginId` matches owning plugin
   - [ ] `version: 1` (bump on YAML changes)
   - [ ] Exactly one of `yaml` or `yamlTemplate`
   - [ ] Explicit `management` policy chosen intentionally
   - [ ] Template defs use `as const satisfies ManagedWorkflowDefinition<TValues>`
   - [ ] Added to `managedWorkflowDefinitions` in `definitions/index.ts`
   - [ ] Id re-exported from `definitions/index.ts`

3. **Tests** (`managed_workflow_definitions.test.ts`)

   - [ ] Representative `values` added for new `yamlTemplate` definitions

4. **Owner plugin** — see [§1–§3 in MANAGED_WORKFLOWS.md](../../dev_docs/MANAGED_WORKFLOWS.md)

   - [ ] `workflowsExtensions` in `requiredPlugins`
   - [ ] `registerManagedWorkflowOwner` in `setup()` only
   - [ ] `initManagedWorkflowsClient` in `start()`
   - [ ] Static workflows installed in `start()` before `ready()`
   - [ ] `ready()` called after all static installs
   - [ ] Dynamic/on-demand installs use deterministic suffixes
   - [ ] Every `install` / `execute` passes explicit `spaceId`
   - [ ] Install/execute sites import id consts — no string literals

5. **Review**
   - [ ] CODEOWNERS on `@kbn/workflows/managed` notified
   - [ ] Global vs space-scoped choice documented if non-obvious

## Reviewer checklist

When reviewing a PR that adds or modifies managed workflows:

- [ ] Definition id uses `system-` prefix; id const exported and used at call sites
- [ ] `pluginId` matches the plugin that calls `registerManagedWorkflowOwner`
- [ ] Definition appears in `managedWorkflowDefinitions` and id is re-exported
- [ ] `management` policy matches install pattern (static + `ready()` vs dynamic on-demand)
- [ ] No `install` calls in `setup()`
- [ ] Static installs happen before `ready()`; dynamic workflows not expected to survive reconciliation alone
- [ ] Multi-instance installs use suffix or full `workflowId` — not bare definition id repeated for different entities
- [ ] `spaceId` explicit everywhere; global installs use `GLOBAL_WORKFLOW_SPACE_ID`, not omitted
- [ ] `execute` passes request and requesting space (not `'*'` for execution stamping)
- [ ] Template definitions updated in `templateRepresentativeValuesById` when added/changed
- [ ] YAML references triggers/steps the owning plugin (or dependencies) actually register

## Reference implementations

| Plugin / package  | Path                                                                                                                           | Notable pattern                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Workflows example | `kbn-workflows/managed/definitions/workflows_extensions_example.ts` + `examples/workflows_extensions_example/server/plugin.ts` | `yamlTemplate` + static install at global space + `ready()`                                          |
| Streams           | `kbn-workflows/managed/definitions/streams_ki/` + `x-pack/platform/plugins/shared/streams/server/plugin.ts`                    | Multiple workflows; YAML in separate files; `static` + `auto` + `enforced`; dedicated install helper |
| SigEvents         | `kbn-workflows/managed/definitions/significant_events/`                                                                        | Multi-workflow subdirectory registry                                                                 |

## Before finishing

- [ ] Plugin id confirmed; definition and owner plugin aligned
- [ ] Full registration and rollout steps verified against [MANAGED_WORKFLOWS.md](../../dev_docs/MANAGED_WORKFLOWS.md)
- [ ] Public Slack channel for questions: `#one-workflow`
