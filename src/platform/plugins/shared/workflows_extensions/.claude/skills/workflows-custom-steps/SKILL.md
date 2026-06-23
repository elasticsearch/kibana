---
name: workflows-custom-steps
description: Register and implement custom workflow steps from an external Kibana plugin using `@kbn/workflows-extensions`. Use when adding or modifying a step type with `registerStepDefinition`, designing input/output/config Zod schemas, implementing `createServerStepDefinition` / `createPublicStepDefinition`, choosing `StepCategory`, building `editorHandlers` (selection / dynamicSchema), wiring `callKibanaApi` / `onCancel`, deciding sync vs async loader registration, managing per-step approval files under `approved_step_definitions/`, or reviewing PRs that touch any of these.
---

# Workflows — Custom Step Registration

> Custom steps run inside the Kibana workflow engine and become part of the YAML the user writes. A misconfigured step can break workflows on every restart, pull heavy modules into the main bundle, leak resources on cancellation, or silently fail the approval gate. The defaults are not always right — verify each field below explicitly.

## Canonical guide — read this for implementation steps

Follow the end-to-end steps, code templates, naming conventions, and approval workflow in:

**[dev_docs/STEPS.md](../../dev_docs/STEPS.md)**

Sections to use while implementing:

| Task | STEPS.md section |
|---|---|
| Internal vs external boundary | [Important: Internal vs External Steps](../../dev_docs/STEPS.md#important-internal-vs-external-steps) |
| Define common step (`id`, schemas, `label`, `category`, `documentation`) | [Step 1](../../dev_docs/STEPS.md#step-1-define-common-step-definition) |
| Server handler (`createServerStepDefinition`) | [Step 2](../../dev_docs/STEPS.md#step-2-implement-server-side-handler) |
| Public definition (icon, editor handlers) | [Step 3](../../dev_docs/STEPS.md#step-3-implement-public-side-definition) |
| Custom property selection / dynamic schema | [Custom Property Selection](../../dev_docs/STEPS.md#custom-property-selection) |
| Plugin setup registration (sync vs async loader) | [Step 4](../../dev_docs/STEPS.md#step-4-register-in-plugin-setup) |
| YAML naming conventions (type / config / input) | [Workflow YAML Naming Conventions](../../dev_docs/STEPS.md#workflow-yaml-naming-conventions) |
| `config` vs `input` mental model | [Config vs Inputs: Mental Model](../../dev_docs/STEPS.md#config-vs-inputs-mental-model) |
| Error handling and `ExecutionError` | [Error Handling](../../dev_docs/STEPS.md#error-handling) |
| `callKibanaApi` usage | [Calling Kibana APIs](../../dev_docs/STEPS.md#calling-kibana-apis-callkibanaapi) |
| Cancellation cleanup | [Cancellation Cleanup (`onCancel`)](../../dev_docs/STEPS.md#cancellation-cleanup-oncancel) |
| Approval gate (per-step file workflow) | [Step Definition Approval Process](../../dev_docs/STEPS.md#step-definition-approval-process) |

## Overview

A custom workflow step is owned and registered by a **plugin other than `workflows_extensions`**. The workflows-team plugin only hosts internal steps; everything external must live in the owning plugin.

A step lives in three layers:

- **Common** — `id`, `label`, `description`, `category`, `inputSchema`, `outputSchema`, optional `configSchema` / `documentation` / `stability` / `deprecation`. Imported by both server and public to keep them in sync.
- **Server** — wraps the common definition with a `handler` (and optional `onCancel`) via `createServerStepDefinition`.
- **Public** — wraps the common definition with an `icon` and optional `editorHandlers` via `createPublicStepDefinition`.

Both sides register through the `workflowsExtensions` setup contract: `registerStepDefinition(definition | () => Promise<definition | undefined>)`.

**Additional references:**

- Extended code templates (full scaffold, selection handlers, dynamic schema): [reference.md](reference.md)
- Worked example: `examples/workflows_extensions_example/`
- Common base type: `src/platform/packages/shared/kbn-workflows/spec/step_definition_types.ts` (`BaseStepDefinition`, `StepCategory`, `StepStabilityLevel`, `StepDocumentation`)
- Editor handler types: `src/platform/packages/shared/kbn-workflows/types/v1.ts` (`EditorHandlers`, `StepPropertyHandler`, `PropertySelectionHandler`, `ConnectorIdSelectionHandler`, `DynamicSchema`)
- Reusable index selection handler: `src/platform/packages/shared/kbn-workflows-ui/src/lib/steps/editor_handlers/index_selection_handler.ts`
- Server step types: `src/platform/plugins/shared/workflows_extensions/server/step_registry/types.ts` (`ServerStepDefinition`, `StepHandler`, `StepHandlerContext`, `ContextManager`, `CallKibanaApiParams`, `OnCancelHandler`)
- Public step types: `src/platform/plugins/shared/workflows_extensions/public/step_registry/types.ts` (`PublicStepDefinition`)
- `ExecutionError`: `src/platform/packages/shared/kbn-workflows/server/errors/execution_error.ts`
- Approval fixtures (one file per step): `src/platform/plugins/shared/workflows_extensions/test/scout/api/fixtures/approved_step_definitions/`

## 0. Locate the owning plugin (do this first)

**Before creating or editing any files**, ask the user for their **plugin id** (`plugin.id` from `kibana.jsonc`, camelCase — e.g. `cases`, `agentBuilder`, `workflowsExtensionsExample`). Do not guess or assume a plugin.

If the user already named their plugin in the request, confirm it matches `plugin.id` before proceeding.

### Resolve the plugin root

```bash
rg '"id": "<pluginId>"' --glob '**/kibana.jsonc'
```

The directory containing that `kibana.jsonc` is the **plugin root**. Read it to confirm `plugin.server` / `plugin.browser` and whether `workflowsExtensions` is already in `requiredPlugins`.

### Choose file locations inside the plugin

Inspect the plugin root for existing step or workflow extension layout. **Follow conventions already used in that plugin** rather than inventing new paths.

| If the plugin already has… | Add files there |
|---|---|
| `common/workflows/steps/` (e.g. `cases`) | `common/workflows/steps/<step_name>.ts` |
| `common/step_types/` (e.g. example plugin) | `common/step_types/<step_name>.ts` |
| No step files yet | Use `common/step_types/<step_name>.ts` and mirror under `server/step_types/` and `public/step_types/` |

Also check for existing registration hooks:

- `server/**/step_types/index.ts` or `server/plugin.ts` — server registration
- `public/**/step_types/` or `public/plugin.ts` — public registration

Wire new steps into those existing index/setup files when present; only create new index files when the plugin has no step layout yet.

### Derive the step namespace

Step ids use `<namespace>.<action>` (kebab-case namespace, camelCase action). Prefer the namespace already used by that plugin's steps. If none exist, derive kebab-case from `plugin.id` (e.g. `agentBuilder` → `agent-builder`) and confirm with the user if ambiguous. Reserved internal prefixes (`ai`, `data`, `flowControl`, `external`, `elasticsearch`, `kibana`, `kibana.cases`) must not be used outside `workflows_extensions`.

## File layout

Mirror the layout used by `examples/workflows_extensions_example/` so reviewers and the workflows team can find things:

```
your-plugin/
├── common/step_types/<step_name>.ts        # common definition (id + schemas + label + category)
├── server/step_types/<step_name>.ts        # createServerStepDefinition + handler
├── server/step_types/index.ts              # registerStepDefinitions(setup)
├── public/step_types/<step_name>.ts        # createPublicStepDefinition + icon + editorHandlers
└── public/step_types/index.ts              # registerStepDefinitions(setup, deps)
```

Keep `id`, `inputSchema`, `outputSchema`, `configSchema` in the **common** file only. Re-importing them on both sides is how server/public stay locked together.

## Agent-specific rules (beyond STEPS.md)

These are easy to miss during implementation or review — they are not always spelled out in the contributing doc:

| Concern | Rule |
|---|---|
| `id` reserved prefixes | `ai`, `data`, `flowControl`, `external`, `elasticsearch`, `kibana`, `kibana.cases` are reserved for internal/categorized steps. The `elasticsearch.` prefix is also special-cased by the auto-generated step path. Use a fresh kebab-case namespace per plugin |
| `category` field name | The live enum is `StepCategory` from `@kbn/workflows` (values: `Elasticsearch`, `External`, `Ai`, `Kibana`, `KibanaCases`, `Data`, `FlowControl`). Some older docs still say `actionsMenuCatalog` / `StepMenuCatalog` — those names are stale |
| i18n template syntax | Strings in `documentation.details` / `documentation.examples[]` that contain `{{ ... }}` MUST be passed through i18n `values:` so the i18n linter does not interpret them as variables |
| Reserved config keys | `if`, `foreach`, `on-failure`, `timeout` are reserved by the engine — never redeclare them in `configSchema` |
| Real plugin clients beat `callKibanaApi` | When the target plugin exposes a request-scoped client (`alerting.getRulesClientWithRequest`, `cases.getCasesClientWithRequest`, etc.), pass `context.contextManager.getFakeRequest()` to it. `callKibanaApi` is the fallback when no client exists |
| `callKibanaApi` hard limits | No multipart / `form_data`, no streaming/SSE, no custom TLS or fetcher options. Caller-supplied `Authorization`, `Content-Type`, `kbn-xsrf`, `x-elastic-internal-origin`, and event-chain headers are dropped (engine owns them). Non-2xx (except 304) throws `Error('HTTP <status>: <body>')`. For unsupported transports use the `kibana.request` YAML step |
| `onCancel` semantics | Invoked **after** `abortSignal` fires AND `run()` resolves — never in parallel. Steps that complete normally skip it. MUST be idempotent; thrown errors are logged but never disrupt cancellation. An empty `onCancel` "just to be safe" is an anti-pattern |
| `ExecutionError` type discipline | Pick **specific** `type` values (`ValidationError`, `PermissionError`, `NetworkError`) — never `'Error'`. Plain `throw new Error(...)` is auto-converted; only reach for `ExecutionError` when you need a custom `type` or structured `details` |
| Public icon | **Must be a React component** via `React.lazy` from `@elastic/eui/es/components/icon/assets/*`. EUI icon name strings (`'star'`) are not supported — the build will not fail, the icon will simply be missing |
| `connectorIdSelection` placement | Only recognised on **`config['connector-id']`** (exact key, under `config`). Renaming to `connectorId`, `connector_id`, or `my-connector-id`, or moving under `input`, silently disables the picker. Verified in `workflows_management/public/shared/lib/connectors_utils.ts` |
| `getIndexSelectionHandler` wiring | Requires `dataViews` (`DataViewsContract`) and `application` (`ApplicationStart`) services — must be injected via a public-side factory. Attaches in the **`selection`** slot of any field whose value is an index pattern (not field-name restricted) |
| `selection.dependsOnValues` | List every sibling field (`config.foo` / `input.x` dot path) your `search` / `resolve` / `getDetails` read from `context.values`. Missing entries cause stale cache hits when the user edits the sibling |
| `selection.getDetails` | Avoid network calls when `option` is present — use `option.label` / `option.value` / `context.values`. Only fetch when `option === null`. The combined `resolve` + `getDetails` outcome is cached for ~30s per logical field |
| Dynamic output schema | Express via `editorHandlers.dynamicSchema.getOutputSchema({ input, config })` for autocomplete; **server still validates against the static `outputSchema`** in the common definition, so keep that schema as the union of all possible shapes |
| Public async loader | Prefer async import to keep zod + step module out of the plugin's main bundle. Loaders that reject (or throw inside the registry) are caught and logged; one broken loader does NOT prevent other steps from registering — verify the log when a step is silently missing |
| Conditional registration | Loaders returning `undefined` are skipped silently (unlike triggers, which do not support this). Use for feature flags |
| Registration timing | All `registerStepDefinition` calls happen in `setup()`, never `start()`. Engine and UI both `await workflowsExtensions.isReady()` before reading the registry |

For the YAML naming conventions (the single most common mistake — only the step type action is camelCase, config/input keys we own never are), follow [STEPS.md → Workflow YAML Naming Conventions](../../dev_docs/STEPS.md#workflow-yaml-naming-conventions).

## Quick rule reference

| Concern | Rule | Default if omitted | When wrong |
|---|---|---|---|
| `id` | `<kebab-namespace>.<camelAction>`; stable for the life of the workflow | n/a | Renames break user YAML; reserved prefixes collide with internals |
| Common file | Holds `id`, schemas, `label`, `description`, `category`, `documentation` | n/a | Drift between server and public side |
| `category` | Pick the `StepCategory` matching the actions-menu group users expect | n/a | Step hides in the wrong section |
| `configSchema` vs `inputSchema` | Config controls behavior; input carries payload | n/a | Awkward YAML; bad selection UX |
| Key casing (keys we own) | Config: kebab-case; input (`with:`): kebab-case or snake_case — never camelCase | n/a | camelCase args drift from the conventions; inherited OpenAPI/connector shapes excepted |
| `createServerStepDefinition` | Use it (don't hand-annotate types) | n/a | Loss of input/output type inference, drift |
| `abortSignal` | Pass to ES, HTTP, loops | n/a | Step runs past cancellation; blocks shutdown |
| `onCancel` | Implement only when the step holds resources beyond the signal | none | Leaks; or empty stub gives false confidence |
| `ExecutionError` | Use when you need a custom `type` or `details` | auto-conversion of raw errors | Useless `'Error'` type; lost debugging context |
| `callKibanaApi` | Use only when no request-scoped client exists | n/a | Re-invents auth; brittle on transport change |
| Icon | `React.lazy` from `@elastic/eui/es/components/icon/assets/*` | none | Missing icon in editor; bundles all EUI icons |
| Connector picker | `connectorIdSelection` on `config['connector-id']` | none | Hand-rolled selection misses "create connector" link + type filtering |
| Index picker | `getIndexSelectionHandler({ dataViews, application }, options)` in `selection` slot | none | Hand-rolled handler misses wildcard/alias/data-stream semantics |
| `selection.dependsOnValues` | List every sibling field your handlers read | `{ config: {}, input: {} }` | Stale cache hits on sibling edits |
| `selection.getDetails` | Avoid network calls when `option` is present | n/a | Slow hovers; redundant fetches |
| Public registration | Async loader to keep modules out of main bundle | sync inline | Step module + zod inflate plugin bundle |
| Conditional registration | Loader returns `undefined` to skip | always registers | Cannot feature-flag |
| Approval gate | Create/update `approved_step_definitions/<step.id>.txt` with the new `definitionHash` (one file per step) | test fails | CI blocks merge until updated |

## Author checklist

When adding a new step:

1. **Plugin location**
   - [ ] User's `plugin.id` confirmed; plugin root resolved from `kibana.jsonc`
   - [ ] File paths follow the plugin's existing step/workflow layout
   - [ ] `workflowsExtensions` is in `requiredPlugins` in `kibana.jsonc`

2. **Common file** (`common/step_types/<step>.ts` or plugin convention) — see [STEPS.md Step 1](../../dev_docs/STEPS.md#step-1-define-common-step-definition)
   - [ ] `id` is namespaced (`<kebab>.<camel>`) and exported as a `const` string
   - [ ] `category` matches the actions-menu group users expect (use `StepCategory` from `@kbn/workflows`)
   - [ ] `label`, `description`, and any text in `documentation` use `i18n.translate`
   - [ ] Template syntax (`{{ ... }}`) inside i18n strings goes through `values:`
   - [ ] `inputSchema` / `outputSchema` declared with `z` from `@kbn/zod/v4`
   - [ ] `configSchema` declared **only** for behavior-controlling step-level properties; no reserved keys (`if`, `foreach`, `on-failure`, `timeout`)
   - [ ] Workflow-owned config keys are kebab-case; workflow-owned input keys (under `with:`) are kebab-case or snake_case — **never camelCase**; inherited keys (OpenAPI/connector) keep their original shape (see [Workflow YAML Naming Conventions](../../dev_docs/STEPS.md#workflow-yaml-naming-conventions))

3. **Server file** (`server/step_types/<step>.ts`) — see [STEPS.md Step 2](../../dev_docs/STEPS.md#step-2-implement-server-side-handler)
   - [ ] Uses `createServerStepDefinition` (no explicit `ServerStepDefinition` annotation)
   - [ ] Spreads `myStepCommonDefinition` — no duplicated `label`/`category`/schemas
   - [ ] `context.abortSignal` is passed to every ES query, `fetch`, and tight loop
   - [ ] Uses `context.contextManager.getFakeRequest()` with a real plugin client when available, falls back to `callKibanaApi` only otherwise
   - [ ] Errors with custom categories or structured detail use `ExecutionError`; raw errors are fine for everything else
   - [ ] `onCancel` is implemented only if the step allocates resources outside the signal's reach, and is idempotent

4. **Public file** (`public/step_types/<step>.ts`) — see [STEPS.md Step 3](../../dev_docs/STEPS.md#step-3-implement-public-side-definition) and [Custom Property Selection](../../dev_docs/STEPS.md#custom-property-selection)
   - [ ] Uses `createPublicStepDefinition`
   - [ ] Spreads `myStepCommonDefinition`
   - [ ] Icon is a `React.lazy` import from `@elastic/eui/es/components/icon/assets/<name>`
   - [ ] If the step picks a Kibana connector, the property is `config['connector-id']` and uses `connectorIdSelection` with an explicit `connectorTypes` (and `enableCreation` only when intentional)
   - [ ] If the step picks an index / alias / data stream, the property uses `selection: getIndexSelectionHandler(services, options)` from `@kbn/workflows-ui`, with `dataViews` and `application` injected via a public-side factory
   - [ ] For other catalogs, `editorHandlers` provides full `selection: { search, resolve, getDetails }` per dot path
   - [ ] Every sibling property read inside the handlers is listed in `dependsOnValues`
   - [ ] `getDetails` does not make a network call when `option` is non-null
   - [ ] Dynamic output shape (if any) is expressed via `editorHandlers.dynamicSchema.getOutputSchema`, **not** by varying `outputSchema`

5. **Registration** (`{server,public}/step_types/index.ts`) — see [STEPS.md Step 4](../../dev_docs/STEPS.md#step-4-register-in-plugin-setup)
   - [ ] Public side uses async loader (`() => import('./...').then(...)`) to keep zod + step module out of the main bundle
   - [ ] Conditional/feature-flagged steps return `undefined` from the loader; they do not throw
   - [ ] All `registerStepDefinition` calls happen in `setup()`, never `start()`

6. **Approval gate** — see [STEPS.md Step Definition Approval Process](../../dev_docs/STEPS.md#step-definition-approval-process)
   - [ ] Local Scout API test was run; it printed an `echo … > approved_step_definitions/<step.id>.txt` command per offending step
   - [ ] Ran the printed `echo` command(s) from the kibana directory to create/update the per-step approval file(s)
   - [ ] PR description requests review from `@elastic/workflows-eng`

## Reviewer checklist

When reviewing a PR that adds or modifies a custom step:

- [ ] No new top-level files inside `src/platform/plugins/shared/workflows_extensions/{server,public}/steps/` — external steps belong in the owning plugin
- [ ] `label`, `description`, `category`, `schemas` live in the common file, not duplicated on server/public
- [ ] `id` follows `<kebab>.<camel>`, has a fresh namespace, and is not in a reserved prefix
- [ ] Workflow-owned config/input keys follow the [naming conventions](../../dev_docs/STEPS.md#workflow-yaml-naming-conventions) — config keys kebab-case, `with:` input keys kebab-case or snake_case, **no camelCase** for keys we own (inherited OpenAPI/connector shapes excepted)
- [ ] Server handler uses `createServerStepDefinition`; types are inferred, not restated
- [ ] `abortSignal` flows through every ES/HTTP call in the diff — search for new `esClient.search(` / `fetch(` without a `signal:`
- [ ] If `callKibanaApi` is used, check whether a request-scoped client from the target plugin would work instead
- [ ] Errors thrown inside the handler are either intentional plain errors or `ExecutionError` with a specific `type`
- [ ] Public file uses `React.lazy` for the icon; no inline `<EuiIcon type="..." />` references
- [ ] If a connector ID is in scope, the property is `config['connector-id']` and uses `connectorIdSelection` with explicit `connectorTypes` — not hand-rolled `selection`
- [ ] If an index / alias / data stream is in scope, the property uses `selection: getIndexSelectionHandler(...)` from `@kbn/workflows-ui` — not hand-rolled `selection`
- [ ] `editorHandlers.selection.dependsOnValues` covers every sibling field referenced inside `search` / `resolve` / `getDetails`
- [ ] `getDetails` does not call the network when `option` is present
- [ ] Public registration uses an async loader unless the step module is trivially small
- [ ] Conditional registration paths return `undefined`, not `null` or a rejected promise
- [ ] No `registerStepDefinition` call moved into `start()`
- [ ] Per-step approval file `approved_step_definitions/<step.id>.txt` is added or updated with the new `definitionHash`; workflows-eng review requested

## Reference implementations

| Plugin | Path | Notable pattern |
|---|---|---|
| Workflows example | `examples/workflows_extensions_example/` | Canonical layout; both sync and async loader; `editorHandlers.selection` with `dependsOnValues` |
| Agent Builder | `x-pack/platform/plugins/shared/agent_builder/public/step_types/run_agent_step.ts` | `connectorIdSelection` with restricted `connectorTypes` and `enableCreation: false`; `dynamicSchema.getOutputSchema` extending the base schema |
| Cases | `x-pack/platform/plugins/shared/cases/public/workflows/create_case_from_template.tsx` | Custom `input` `selection` with `dependsOnValues: ['input.owner']`; uses domain helpers (`collectSelectionSearchOptions`, `isValidOwner`) |
| Cases (server) | `x-pack/platform/plugins/shared/cases/server/workflows/` | Many handlers built from a factory `(getCasesClient) => createServerStepDefinition(...)` — use the typed `CasesClient`, not `callKibanaApi` |
| Internal index steps | `src/platform/plugins/shared/workflows_management/public/common/context/internal_steps/editor_handlers/editor_handlers.ts` | `getIndexSelectionHandler` constructed with different `allowWildcard` / `showAllIndices` per use case (search vs write vs delete) |
| Security Solution | `x-pack/solutions/security/plugins/security_solution/{server,public}/workflows/step_types/` | Async loader gated on a feature flag resolved from `core.getStartServices().featureFlags` |
| Alerting v2 | `x-pack/platform/plugins/shared/alerting_v2/server/lib/workflow_extensions/register_step_definitions.ts` | Multiple step definitions registered from a single plugin |

## Additional resources

- Contributing guide (canonical): [dev_docs/STEPS.md](../../dev_docs/STEPS.md)
- Extended code templates and selection/dynamic-schema examples: [reference.md](reference.md)
- Public Slack channel for questions: `#one-workflow`
