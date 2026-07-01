---
name: workflows-custom-triggers
description: Register and implement custom workflow triggers from an external Kibana plugin using `@kbn/workflows-extensions`. Use when adding or modifying an event-driven trigger with `registerTriggerDefinition`, designing `eventSchema` Zod schemas, writing `documentation` and KQL `snippets`, wiring `emitEvent` via request context or `getClient`, choosing sync vs async public loader registration, updating `APPROVED_TRIGGER_DEFINITIONS`, or reviewing PRs that touch any of these. Always ask for the user's plugin id first to locate the correct plugin and file paths.
---

# Workflows — Custom Trigger Registration

> Custom triggers let workflows subscribe to domain events from your plugin. A misconfigured trigger can break workflows on every restart, emit invalid payloads that fail at runtime, cause infinite event chains, or silently fail the approval gate. The defaults are not always right — verify each field below explicitly.

## Canonical guide — read this for implementation steps

Follow the end-to-end steps, code templates, emit patterns, guardrails, and approval workflow in:

**[dev_docs/TRIGGERS.md](../../dev_docs/TRIGGERS.md)**

Sections to use while implementing:

| Task | TRIGGERS.md section |
|---|---|
| Define common trigger (`id`, `eventSchema`, docs, snippets) | [Step 1](../../dev_docs/TRIGGERS.md#step-1-define-common-trigger-id-eventschema-title-description-optional-documentation-and-snippets) |
| Server registration | [Step 2](../../dev_docs/TRIGGERS.md#step-2-register-on-server) |
| Public registration (icon, async loader) | [Step 3](../../dev_docs/TRIGGERS.md#step-3-register-on-public) |
| Emit via request context or direct client | [Step 4](../../dev_docs/TRIGGERS.md#step-4-emit-events--two-ways) |
| Approval gate | [Trigger Definition Approval Process](../../dev_docs/TRIGGERS.md#trigger-definition-approval-process) |
| Event-chain depth and loop prevention | [Event-driven guardrails](../../dev_docs/TRIGGERS.md#event-driven-guardrails) |
| Loop demo workflow | [Event-chain depth (loop) demo](../../dev_docs/TRIGGERS.md#event-chain-depth-loop-demo) |

## Overview

A custom workflow trigger is owned and registered by a **plugin other than `workflows_extensions`**. The workflows-team plugin only hosts internal triggers; everything external must live in the owning plugin.

A trigger lives in three layers:

- **Common** — `id`, `eventSchema`, `title`, `description`, `stability`, optional `documentation` / `snippets`. Imported by both server and public to keep them in sync. Until event-driven triggers GA (#16714), set `stability: 'tech_preview'` (only value accepted).
- **Server** — registers the **same** common definition via `registerTriggerDefinition`; emits events with `emitEvent`.
- **Public** — spreads the common definition and adds **icon** only (browser-only UI).

Both sides register through the `workflowsExtensions` setup contract:

- Server: `registerTriggerDefinition(commonDefinition)`
- Public: `registerTriggerDefinition(definition | () => Promise<definition>)`

**Additional references:**

- Worked example: `examples/workflows_extensions_example/`
- Common base type: `src/platform/plugins/shared/workflows_extensions/common/trigger_registry/types.ts` (`CommonTriggerDefinition`, `TriggerDocumentation`, `TriggerSnippets`)
- Public trigger types: `src/platform/plugins/shared/workflows_extensions/public/trigger_registry/types.ts` (`PublicTriggerDefinition`)
- Emit API: `src/platform/packages/shared/kbn-workflows/server/types.ts` (`WorkflowsClient`, `WorkflowsApiRequestHandlerContext`, `emitEvent`)
- Event-chain guardrails: `src/platform/plugins/shared/workflows_extensions/server/event_chain_context.ts`
- Approval fixture: `src/platform/plugins/shared/workflows_extensions/test/scout/api/fixtures/approved_trigger_definitions.ts`

## 0. Locate the owning plugin (do this first)

**Before creating or editing any files**, ask the user for their **plugin id** (`plugin.id` from `kibana.jsonc`, camelCase — e.g. `cases`, `workflowsExtensionsExample`). Do not guess or assume a plugin.

If the user already named their plugin in the request, confirm it matches `plugin.id` before proceeding.

### Resolve the plugin root

Find the plugin directory by searching for the id in `kibana.jsonc`:

```bash
rg '"id": "<pluginId>"' --glob '**/kibana.jsonc'
```

The directory containing that `kibana.jsonc` is the **plugin root**. Read it to confirm `plugin.server` / `plugin.browser` and whether `workflowsExtensions` is already in `requiredPlugins`.

### Choose file locations inside the plugin

Inspect the plugin root for existing trigger or workflow extension layout. **Follow conventions already used in that plugin** rather than inventing new paths.

| If the plugin already has… | Add files there |
|---|---|
| `common/workflows/triggers/` (e.g. `cases`) | `common/workflows/triggers/<trigger_name>.ts` |
| `common/triggers/` (e.g. example plugin) | `common/triggers/<trigger_name>.ts` |
| No trigger files yet | Use `common/triggers/<trigger_name>.ts` and mirror under `server/triggers/` and `public/triggers/` |

Also check for existing registration hooks:

- `server/**/triggers/index.ts` or `server/plugin.ts` — server registration
- `public/**/triggers/` or `public/plugin.ts` — public registration

Wire new triggers into those existing index/setup files when present; only create new index files when the plugin has no trigger layout yet.

### Derive the trigger namespace

Trigger ids use `<namespace>.<event>` (kebab-case namespace, camelCase event). Prefer the namespace already used by that plugin's triggers. If none exist, derive kebab-case from `plugin.id` (e.g. `workflowsExtensionsExample` → `workflows-extensions-example`) and confirm with the user if ambiguous.

## File layout

Mirror the layout used by `examples/workflows_extensions_example/` so reviewers and the workflows team can find things:

```
your-plugin/
├── common/triggers/<trigger_name>.ts       # common definition (id + eventSchema + title + description)
├── server/triggers/index.ts                # registerTriggerDefinitions(setup)
├── public/triggers/<trigger_name>.ts       # spread common + icon
└── public/triggers/index.ts                # registerTriggerDefinitions(setup)
```

Keep `id`, `eventSchema`, `title`, `description`, `documentation`, and `snippets` in the **common** file only. Re-importing them on the public side is how server/public stay locked together.

## Agent-specific rules (beyond TRIGGERS.md)

These are easy to miss during implementation or review — they are not always spelled out in the contributing doc:

| Concern | Rule |
|---|---|
| `id` namespace | `cases.*` is owned by the Cases plugin — do not add new `cases.*` triggers outside that plugin |
| Server registration | Setup phase only — never call `registerTriggerDefinition` from `start()` |
| Public icon | **Must be a React component** via `React.lazy` from `@elastic/eui/es/components/icon/assets/*`. EUI icon name strings (`'star'`) are not supported — the build will not fail, the icon will simply be missing |
| Public async loader | Prefer async import to keep zod out of the main bundle. Loaders that reject are caught and logged; one broken loader does NOT prevent other triggers from registering — verify the log when a trigger is silently missing |
| Public loader skip | Unlike step loaders, trigger loaders do **not** support returning `undefined` to skip registration. Guard optional triggers by not calling `registerTriggerDefinition` |
| `emitEvent` request | Always pass the **same request** used for attribution/space so event-chain depth tracking works. Emitting without a real request when guardrails matter is an anti-pattern |
| Loop demo | Use `kibana.request` (not a generic HTTP connector) so event-chain headers propagate |

For naming conventions, schema rules, registration templates, emit patterns, and approval steps, follow [TRIGGERS.md](../../dev_docs/TRIGGERS.md).

## Quick rule reference

| Concern | Rule | Default if omitted | When wrong |
|---|---|---|---|
| `id` | `<kebab-namespace>.<camelEvent>`; stable for the life of the workflow | n/a | Renames break user YAML |
| Common file | Holds `id`, `eventSchema`, `title`, `description`, `documentation`, `snippets` | n/a | Drift between server and public |
| `eventSchema` | Zod object; `.describe()` on every field | n/a | Emit throws; bad editor/agent docs |
| `documentation.examples` | Only fields from `eventSchema` | none | Agents generate invalid YAML |
| `snippets.condition` | Valid KQL on `event.*` only | none | Registration fails or bad UX |
| Server registration | Register common definition in `setup()` | n/a | Trigger missing at runtime |
| Public registration | Spread common + `React.lazy` icon | n/a | Missing icon; duplicated strings |
| `emitEvent` | Payload matches `eventSchema`; use real request | n/a | Throws; broken chain guardrails |
| Public loader | Async import to keep zod out of main bundle | sync inline | Trigger module inflates plugin bundle |
| `APPROVED_TRIGGER_DEFINITIONS` | Add new ID + `schemaHash`; sorted by ID | test fails | CI blocks merge until updated |

## Author checklist

When adding a new trigger:

1. **Plugin location**
   - [ ] User's `plugin.id` confirmed; plugin root resolved from `kibana.jsonc`
   - [ ] File paths follow the plugin's existing trigger/workflow layout

2. **Common file** (`common/triggers/<trigger>.ts` or plugin convention) — see [TRIGGERS.md Step 1](../../dev_docs/TRIGGERS.md#step-1-define-common-trigger-id-eventschema-title-description-optional-documentation-and-snippets)
   - [ ] `id` is namespaced (`<kebab>.<camel>`) and exported as a `const` string
   - [ ] `title`, `description`, and any text in `documentation` use `i18n.translate`
   - [ ] Template syntax / trigger ids inside i18n strings go through `values:`
   - [ ] `eventSchema` declared with `z` from `@kbn/zod/v4`; every field has `.describe()`
   - [ ] `documentation.examples[]` reference only `eventSchema` fields
   - [ ] `snippets.condition` (if present) is valid KQL on `event.*` fields only

3. **Server** — see [TRIGGERS.md Step 2](../../dev_docs/TRIGGERS.md#step-2-register-on-server)
   - [ ] Registers common definition unchanged via `registerTriggerDefinition`
   - [ ] Registration happens in `setup()`, never `start()`
   - [ ] Emit sites call `emitEvent` with payloads matching `eventSchema`
   - [ ] Emit uses request context or `getClient(request)` with the attribution request

4. **Public** — see [TRIGGERS.md Step 3](../../dev_docs/TRIGGERS.md#step-3-register-on-public)
   - [ ] Spreads common definition — no duplicated `title`/schemas
   - [ ] Icon is a `React.lazy` import from `@elastic/eui/es/components/icon/assets/<name>`
   - [ ] Public registration uses async loader unless the module is trivially small

5. **Plugin wiring**
   - [ ] `workflowsExtensions` in `requiredPlugins` in `kibana.jsonc`
   - [ ] Server and public both register the same trigger `id`

6. **Approval gate** — see [TRIGGERS.md approval process](../../dev_docs/TRIGGERS.md#trigger-definition-approval-process)
   - [ ] Scout API test run or GET `internal/workflows_extensions/trigger_definitions` for `schemaHash`
   - [ ] Entry added to `APPROVED_TRIGGER_DEFINITIONS` (alphabetically sorted)
   - [ ] PR description requests review from `@elastic/workflows-eng`

## Reviewer checklist

When reviewing a PR that adds or modifies a custom trigger:

- [ ] No new trigger definitions inside `src/platform/plugins/shared/workflows_extensions/{server,public}/triggers/` — external triggers belong in the owning plugin
- [ ] `title`, `description`, `eventSchema`, `documentation`, `snippets` live in the common file, not duplicated on public
- [ ] `id` follows `<kebab>.<camel>`, has a fresh namespace, and does not collide with another plugin's prefix
- [ ] Every `eventSchema` field has `.describe()`; examples/snippets only use declared fields
- [ ] Server registers the common definition directly in `setup()`; no registration in `start()`
- [ ] Public spreads common definition; icon uses `React.lazy`, not EUI icon name strings
- [ ] `emitEvent` payloads match `eventSchema`; emit path uses the attribution request for chain guardrails
- [ ] Public registration uses an async loader unless the module is trivially small
- [ ] `APPROVED_TRIGGER_DEFINITIONS` is updated (sorted; new entry near related namespace); workflows-eng review requested
- [ ] Event-chain implications considered when workflows can re-emit this trigger

## Reference implementations

| Plugin | Path | Notable pattern |
|---|---|---|
| Workflows example | `examples/workflows_extensions_example/` | Canonical layout; async public loaders; `custom_trigger` docs/snippets; `loop_trigger` + emit route for chain-depth demo |
| Cases | `x-pack/platform/plugins/shared/cases/common/workflows/triggers/` | Multiple triggers in one module; shared base schema; rich i18n documentation examples |
| Cases (public) | `x-pack/platform/plugins/shared/cases/public/workflows/triggers/` | Spread common + lazy icon per trigger |
| Alerting v2 | `x-pack/platform/plugins/shared/alerting_v2/server/lib/workflow_extensions/register_trigger_definitions.ts` | Single registration loop over a catalog shared with runtime emit mapping |

## Additional resources

- Contributing guide (canonical): [dev_docs/TRIGGERS.md](../../dev_docs/TRIGGERS.md)
- Public Slack channel for questions: `#one-workflow`
