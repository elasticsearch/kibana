---
name: agent-builder-attachment-type
description: Register a new attachment type in the Kibana Agent Builder framework end-to-end — server `AttachmentTypeDefinition` (`agentBuilder.attachments.registerType`), browser `AttachmentUIDefinition` (`agentBuilder.attachments.addAttachmentType`, inline pill + inline card + canvas preview, `renderInlineContent` / `renderCanvasContent` / `getActionButtons`), optional SML discovery via `agentContextLayer.registerType`, optional per-type built-in tools (`getTools` / `getBoundedTools` / `agentBuilder.tools.register` + `AGENT_BUILDER_BUILTIN_TOOLS` allow list), and optional skills that orchestrate behaviour around the type (`agentBuilder.skills.register`). Use when adding or reviewing a new attachment type, wiring an inline card or canvas preview, exposing assets via SML, or touching `attachment_type_registry.ts`, `attachment_service.ts`, `getAgentDescription`, `prepare_conversation.ts`, `select_tools.ts`, or the `agent_builder_platform` / `agent_context_layer` plugins.
---

# Agent Builder — Attachment Type Registration (server + UI + SML + tools + skill)

> An attachment is an arbitrary piece of context — a viz, a doc, ES|QL, an SML hit — that is added to a conversation and shown to both the agent and the user. Registering a new type means wiring up to **five parallel surfaces**. Only two are required.

## 1. Mental model: five surfaces

| # | Surface | Required? | API | Lifecycle |
|---|---------|-----------|-----|-----------|
| 1 | **Server attachment type** — validates input, formats for LLM, optional `resolve`/`isStale` | **Yes** | `agentBuilder.attachments.registerType(...)` | plugin `setup()` |
| 2 | **Browser UI definition** — pill, inline card, canvas preview, action buttons | **Yes** (otherwise the attachment is invisible) | `agentBuilder.attachments.addAttachmentType(typeId, def)` | plugin `start()` |
| 3 | **SML discovery** — lets the agent *find* and `sml_attach` instances of this type | Only if instances live in Kibana saved objects / are searchable assets | `agentContextLayer.registerType(...)` | plugin `setup()` |
| 4 | **Built-in tool(s)** for this type | Only if the agent needs a custom action (e.g. `execute_esql`) | Per-type-instance: `getTools()` / `format().getBoundedTools()` on the definition; OR global: `agentBuilder.tools.register(...)` + allow list | per-instance: per turn; global: `setup()` |
| 5 | **Skill** that owns *when* to use / render the type | Only if you want LLM behaviour around the type baked into the platform | `agentBuilder.skills.register(...)` | plugin `setup()` |

**Surfaces 1 and 2 are mandatory and orthogonal.** SML, tools, and skills are independent — pick them à la carte based on what your type needs.

## 2. Source-of-truth files

Read these before quoting anything:

- Server attachment type contract: `x-pack/platform/packages/shared/agent-builder/agent-builder-server/attachments/type_definition.ts`
- Browser UI definition contract: `x-pack/platform/packages/shared/agent-builder/agent-builder-browser/attachments/contract.ts`
- Common `Attachment<Type, Data>` wrapper + built-in `AttachmentType` enum: `x-pack/platform/packages/shared/agent-builder/agent-builder-common/attachments/`
- Server registry: `x-pack/platform/plugins/shared/agent_builder/server/services/attachments/attachment_type_registry.ts`
- Server service / setup contract: `x-pack/platform/plugins/shared/agent_builder/server/services/attachments/attachment_service.ts` and `server/plugin.ts` (lines 195-197 expose `attachments.registerType`)
- LLM-facing presentation (inline vs summary mode based on attachment count, per-type `maxContentLength`): `server/services/execution/run_agent/utils/attachment_presentation.ts` (wired in `prepare_conversation.ts`)
- Per-instance tool dispatch from attachments: `server/services/execution/run_agent/utils/select_tools.ts`
- Browser-side registry: `public/services/attachments/attachements_service.tsx` + lookup site `public/application/components/conversations/conversation_input/attachment_pill.tsx`
- **Authoritative deep-dive doc**: `x-pack/platform/plugins/shared/agent_builder/CONTRIBUTOR_GUIDE.md` — sections **“Registering attachment types”** (~L328), **“Semantic Metadata Layer (SML) — Developer Guide”** (~L1075), **“Registering Built-in tools”** (~L33), **“Inline rendering guidance in skills”**.
  > **Doc trap**: the SML section uses `agentBuilder.sml.registerType(...)`. The **actual** API is `agentContextLayer.registerType(...)` on the `agentContextLayer` setup contract (see `x-pack/platform/plugins/shared/agent_context_layer/README.md`). All real call sites in the repo use `agentContextLayer.registerType` — search before copying from the guide.

## 3. Server-side attachment type (Surface 1)

### Contract

```12:82:x-pack/platform/packages/shared/agent-builder/agent-builder-server/attachments/type_definition.ts
import type {
  Attachment,
  VersionedAttachmentWithOrigin,
} from '@kbn/agent-builder-common/attachments';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { AttachmentBoundedTool } from './tools';

export interface AttachmentTypeDefinition<TType extends string = string, TContent = unknown> {
  id: TType;
  validate: (input: unknown) => MaybePromise<AttachmentValidationResult<TContent>>;
  format: (
    attachment: Attachment<TType, TContent>,
    context: AttachmentFormatContext
  ) => MaybePromise<AgentFormattedAttachment>;
  resolve?: (origin: string, context: AttachmentResolveContext) => MaybePromise<TContent | undefined>;
  isStale?: (
    attachment: VersionedAttachmentWithOrigin<TType, TContent>,
    context: AttachmentResolveContext
  ) => MaybePromise<boolean>;
  getTools?: () => string[];
  getAgentDescription?: () => string;
  isReadonly?: boolean;
  maxContentLength?: number;
}
```

### Rules

1. **`id`** is the discriminator on `Attachment.type` and must be globally unique. Use a reverse-DNS-style namespace for platform types (`platform.streams.significant_event`) so user-created tool ids cannot collide. For built-in platform types you may add to the `AttachmentType` enum in `agent-builder-common/attachments/attachment_types.ts`; for solution types **do not** extend the enum — keep the constant in your own `common/`.
2. **`validate`** runs on every `add` / `update` from HTTP routes. Return `{ valid: true, data }` with the **parsed** payload (typed `TContent`), or `{ valid: false, error }`. Use Zod (`schema.safeParse(...)`).
3. **`format`** is invoked once per turn by `prepare_conversation.ts` to build the system prompt. Prefer returning **raw data + `getBoundedTools`** over `getRepresentation` — `getRepresentation` is deprecated; the formatter will stringify `attachment.data` if you omit it. Use `getBoundedTools` for *per-instance* tools (scoped to the attachment id; one set per attachment in the conversation).
4. **By-value vs by-reference**: there is no `inline` / `reference` discriminator on the definition. By-value attachments are added with `data`. By-reference is opted into by implementing `resolve(origin, ctx)` — the framework calls it **once** at add time, stores the result as `data`, and records `origin` + `origin_snapshot_at`. `isStale` is checked separately to surface a “resync” affordance in the UI.
5. **`getAgentDescription`** documents *what* inline rendering looks like to the user (e.g. *“Rendering this inline displays the chart inside the conversation UI.”*). Do **not** put *when to render* here — that goes in a **skill** (Surface 5). The string is injected into the `ATTACHMENT TYPES` prompt block whenever an attachment of your type is present.
6. **`getTools`** returns ids of already-registered global tools to expose **whenever any attachment of this type is in the conversation** (e.g. ESQL → `executeEsql`). Use `getBoundedTools` on the `format()` result for instance-scoped tools.
7. **`maxContentLength`** defaults to `10 000` chars. Each attachment of your type is truncated to that ceiling before it’s inlined into the system prompt. Set lower for high-volume types to keep token budgets sane.
8. **`isReadonly: true`** disables `attachment_update` for the type — `attachment_read` will format via `definition.format()` instead. Use for snapshot-like types.

### Registration site

```ts
// your_plugin/server/plugin.ts
class MyPlugin implements Plugin {
  setup(core: CoreSetup, { agentBuilder }: { agentBuilder: AgentBuilderPluginSetup }) {
    agentBuilder.attachments.registerType(createMyAttachmentType());
  }
}
```

Batch reference (the platform plugin registers all built-ins this way):

```23:44:x-pack/platform/plugins/shared/agent_builder_platform/server/attachment_types/index.ts
export const registerAttachmentTypes = ({ coreSetup, setupDeps }) => {
  const { agentBuilder } = setupDeps;
  const attachmentTypes: AttachmentTypeDefinition<any, any>[] = [
    createTextAttachmentType(),
    createScreenContextAttachmentType(),
    createEsqlAttachmentType(),
    createVisualizationAttachmentType(),
    createGraphAttachmentType(),
    createConnectorAttachmentType(),
    createSkillAttachmentType(),
  ];
  attachmentTypes.forEach((attachmentType) => {
    agentBuilder.attachments.registerType(attachmentType);
  });
};
```

The generic CRUD tools (`attachment_add` / `attachment_read` / `attachment_update` / `attachment_list` / `attachment_diff`) dispatch on `attachment.type` via `attachmentsService.getTypeDefinition(...)` — no switch to edit, you just register and they work.

## 4. Browser UI definition (Surface 2)

### Contract (essentials)

```167:230:x-pack/platform/packages/shared/agent-builder/agent-builder-browser/attachments/contract.ts
export interface AttachmentUIDefinition<TAttachment extends UnknownAttachment = UnknownAttachment> {
  getLabel: (attachment: TAttachment) => string;
  getIcon?: () => IconType;
  getHeader?: (params: GetHeaderParams<TAttachment>) => HeaderData;
  onClick?: (args: { attachment: TAttachment; version?: AttachmentVersion }) => void;
  renderInlineContent?: (props: AttachmentRenderProps<TAttachment>, callbacks?: InlineRenderCallbacks) => ReactNode;
  canvasWidth?: string;
  renderCanvasContent?: (props: AttachmentRenderProps<TAttachment>, callbacks: CanvasRenderCallbacks) => ReactNode;
  getActionButtons?: (params: GetActionButtonsParams<TAttachment>) => ActionButton[];
  getMaxWidth?: (attachment: TAttachment) => number | undefined;
}
```

`AttachmentRenderProps` exposes `{ attachment, isSidebar, screenContext, openSidebarConversation }`. `CanvasRenderCallbacks` adds `{ registerActionButtons, updateOrigin, closeCanvas, setPreviewState }`. `GetActionButtonsParams` adds `{ isCanvas, openCanvas, agentId, updateOrigin, setPreviewBadgeState }`.

### What renders where

| UI surface | Renderer / lookup | File |
|---|---|---|
| **Pre-send pill** (chip shown in the composer) | `getLabel` + `getIcon` via `attachmentsService.getAttachmentUiDefinition(attachment.type)` | `public/application/components/conversations/conversation_input/attachment_pill.tsx` |
| **Inline card** in the conversation | `renderInlineContent` + `getActionButtons` (header from `getHeader`) | `round_response/attachments/inline_attachment_with_actions.tsx` |
| **Canvas preview / flyout** | `renderCanvasContent` + dynamic buttons from `registerActionButtons` | `round_response/attachments/canvas_flyout.tsx` |

Group pills (`attachment_group_pill.tsx`) use the `AttachmentGroup` label/icon, **not** the per-type definition — don’t expect your icon there.

### Registration site

```ts
// your_plugin/public/plugin.ts
class MyPlugin {
  start(core: CoreStart, { agentBuilder }: { agentBuilder: AgentBuilderPluginStart }) {
    agentBuilder.attachments.addAttachmentType('my_type', myAttachmentDefinition);
  }
}
```

### Rules

1. **`getLabel`** must be i18n’d (use `i18n.translate('xpack.yourPlugin.attachment.label', { ... })`). The label appears in pills, headers, screen-reader text, and the “Attachment added: …” line.
2. **`renderInlineContent`** should render a compact summary. It is **always** displayed when the LLM emits `<render_attachment id="..." />` — you do not control when. The LLM decides *when* based on the **skill** (Surface 5), not on this code.
3. **`renderCanvasContent`** is the full preview. Set `canvasWidth` if `50vw` is wrong for your content (e.g. `'600px'` for narrow forms, `'80vw'` for dense tables). Has no effect on the sidebar / narrow viewports.
4. **`getActionButtons`** receives `{ isCanvas, isSidebar, openCanvas, openSidebarConversation, updateOrigin, setPreviewBadgeState }`. Hide buttons that don’t apply (`openCanvas` is `undefined` when already in canvas; `openSidebarConversation` is `undefined` when already in sidebar). For dynamic buttons that depend on runtime state, register them from inside `renderCanvasContent` via `callbacks.registerActionButtons(...)`.
5. **`updateOrigin(origin: string)`** turns a by-value attachment into one linked to a saved object after a “Save to library” flow. `origin` is **always a string** (e.g. a saved-object id) on the wire — never an object. The same string is passed to your server `resolve` / `isStale` hooks.
6. **`getHeader`** is the cleanest place to put `subtitle` + badges (e.g. status, viz type). Pills use `getIcon`; the inline / canvas header uses `getHeader().icon` if set, falling back to `getIcon`.

Reference UI implementation (Significant Event): `x-pack/platform/plugins/shared/streams_app/public/components/sig_events/significant_event_attachment/significant_event_attachment.tsx`.

## 5. SML discovery (Surface 3, optional)

SML (Semantic Metadata Layer) is a separate indexing/search layer. An SML type is **not** an attachment type — its `toAttachment()` hook *returns* an attachment of one of your already-registered types. Add SML only if instances of your attachment live as Kibana assets the agent should be able to **find** (via `platform.core.sml_search`) and **attach** (via `platform.core.sml_attach`).

### Registration site (real API)

```ts
// your_plugin/server/plugin.ts
setup(core, { agentContextLayer }) {
  agentContextLayer.registerType(myAssetSmlType);
}
```

`SmlTypeDefinition` requires four things:

- `id` — `/^[a-z][a-z0-9_-]*$/` (e.g. `significant_event`, `visualization`)
- `list(ctx)` — `async function*` yielding pages of `{ id, updatedAt, spaces }`. Use `savedObjectsClient.createPointInTimeFinder({ namespaces: ['*'] })` and `try { for await (page of finder.find()) yield … } finally { await finder.close(); }`.
- `getSmlData(originId, ctx)` — return `{ chunks: [{ type, title, content, permissions: { kibana: { privileges: [...] }, elasticsearch: { indices: [...] } } }] }`, or `undefined` to skip / delete.
- `toAttachment(item, ctx)` — return `{ type: MY_ATTACHMENT_TYPE, origin: <savedObjectId>, data }`. Prefer `savedObjectsClient.resolve()` over `.get()` to handle space aliases.

Optional: `fetchFrequency: () => '10m'` (high-churn) … `'4h'` (low-churn). Default `10m`.

### Rules

1. Permissions are enforced **at query time**, not at index time. List the **minimum** Kibana feature privilege required to read the source (`saved_object:<type>/get`, etc.) in `permissions.kibana.privileges`. Missing privileges → user does not see the chunk in `sml_search`.
2. The crawler runs as **internal user** across **all spaces** (`namespaces: ['*']`). Don’t scope `list()` to the current space.
3. `chunk_id` format is `attachment_type:origin_id:uuid`. Users `@`-mention SML chunks via `sml://<chunk_id>` markdown links — the `sml_attach` tool resolves these.
4. Register during **setup()**, not start. The crawler schedules its task during setup and must see your type before that happens (`alerting_v2/server/setup/bind_agent_builder.ts` and `agent_builder_platform/server/plugin.ts` are the canonical examples).

Reference SML type: `x-pack/platform/plugins/shared/agent_builder_platform/server/sml_types/visualization.ts` (~130 lines, indexes Lens viz across all spaces).

## 6. Per-type tools (Surface 4, optional)

Three options, increasing in scope:

| Option | When | API |
|---|---|---|
| **Per-instance, scoped** | Each attachment in the conversation gets its own tool (e.g. `read_<attachment_id>`). Tool ids must be unique per instance; descriptions should mention the attachment id. | Return them from `AttachmentTypeDefinition.format(...).getBoundedTools()` |
| **Per-type, generic** | A single shared tool you always want exposed when *any* attachment of this type is present (e.g. `executeEsql` for ES|QL attachments) | `AttachmentTypeDefinition.getTools() => ['<existing_tool_id>']`. The tool must already be registered globally. |
| **Global built-in** | The tool is broadly useful, not bound to a single attachment instance (e.g. `sml_search`, `sml_attach`) | `agentBuilder.tools.register(...)` in `setup()` + add the id to `AGENT_BUILDER_BUILTIN_TOOLS` in `x-pack/platform/packages/shared/agent-builder/agent-builder-server/allow_lists.ts`. **Kibana will fail to start if you skip the allow list.** |

For built-in tool authoring (Zod schema, `availability` gate, scoped services on the context), follow `CONTRIBUTOR_GUIDE.md` *Registering Built-in tools* (~L33). Tool ids must live under a `protectedNamespaces` entry (`x-pack/platform/packages/shared/agent-builder/agent-builder-common/base/namespaces.ts`).

Reference tool tied to SML attaching: `x-pack/platform/plugins/shared/agent_builder/server/services/tools/builtin/sml/sml_attach.ts`.

## 7. Skills (Surface 5, optional)

A skill is a markdown instruction file (with optional inline tools) that tells the agent **when** to use your attachment type — including when to emit `<render_attachment id="..." />` inline. The attachment type’s `getAgentDescription` says *what* inline rendering does; the skill says *when* to do it. Without a skill the LLM falls back to general heuristics.

### Registration site

```ts
agentBuilder.skills.register({
  id: 'my-skill',
  name: 'my-skill',
  basePath: 'skills/platform',
  description: 'Describes when the agent should produce / render a my_type attachment.',
  experimental: true,
  content: 'Skill instructions in markdown…',
});
```

Set `experimental: true` to gate on `agentBuilder:experimentalFeatures`. Reference: `CONTRIBUTOR_GUIDE.md` § *Inline rendering guidance in skills* (~L1030) and `x-pack/platform/plugins/shared/streams/server/agent_builder/skills/register_skills.ts`.

There is also a built-in **`skill` attachment type** (`agent_builder_platform/server/attachment_types/skill.ts`) that snapshots a skill into a conversation. That is a separate, already-registered type — you do not need to touch it to add a new attachment type. The two systems are parallel.

## 8. Cross-cutting wiring

- **Plugin `kibana.jsonc`**: add `"agentBuilder"` (and `"agentContextLayer"` if you use SML) to `requiredPlugins` or `optionalPlugins`. Use `optionalPlugins` for cross-group code that must degrade gracefully when Agent Builder is absent (see `streams/kibana.jsonc`).
- **Shared constants & types**: put `MY_ATTACHMENT_TYPE = 'platform.<plugin>.<name>' as const` and `interface MyAttachmentData` in your plugin’s `common/`. Typed alias: `type MyAttachment = Attachment<typeof MY_ATTACHMENT_TYPE, MyAttachmentData>`. Export from your `common/index.ts`.
- **i18n**: every user-facing label (`getLabel`, header subtitle, badge text, action button labels, canvas aria labels) goes through `i18n.translate('xpack.<plugin>.attachment.*', …)`.
- **No HTTP route changes needed**: `server/routes/attachments.ts` is type-agnostic — it dispatches through the registry. The only hard-coded exception is `screen_context`, which cannot be deleted.
- **CI gates**:
  - Allow-list any new global built-in tool (Kibana fails to start otherwise).
  - The Tool / Skill registries throw on duplicate `id` registration — re-register only after a hot-reload.

## 9. Reference implementations

| Pattern | Plugin | File |
|---|---|---|
| **Plain by-value type** (text) | `agent_builder_platform` | `server/attachment_types/text.ts` |
| **By-reference with `resolve` + `isStale`** (Lens viz) | `agent_builder_platform` | `server/attachment_types/visualization.ts` |
| **Type-scoped tool via `getTools`** (ES|QL → `executeEsql`) | `agent_builder_platform` | `server/attachment_types/esql.ts` |
| **End-to-end SML + attachment + UI** (significant events) | `streams` (+ `streams_app`) | `server/agent_builder/{sml,attachments}/`, `public/components/sig_events/significant_event_attachment/` |
| **Solution-owned SML + per-instance attachment + workflow tools** | `alerting_v2` | `server/setup/bind_agent_builder.ts` |
| **Browser UI definition with canvas content + dynamic action buttons** | `streams_app` | `public/components/sig_events/significant_event_attachment/significant_event_attachment.tsx` |

## 10. Author checklist

When adding a new attachment type:

1. **Shared (`common/`)**
   - [ ] `MY_ATTACHMENT_TYPE = '…' as const` constant in `<plugin>/common/attachments/<type>.ts`
   - [ ] Zod schema for `data` (re-used by server `validate` and any UI form)
   - [ ] Typed `Attachment<typeof MY_ATTACHMENT_TYPE, MyData>` alias exported from `common/index.ts`

2. **Server type (Surface 1, required)**
   - [ ] `createMyAttachmentType(): AttachmentTypeDefinition<typeof MY_ATTACHMENT_TYPE, MyData>` in `<plugin>/server/attachment_types/<type>.ts`
   - [ ] `validate` returns parsed, typed `data` (Zod `safeParse`)
   - [ ] `format` returns raw data (or a `getRepresentation` only if you must override)
   - [ ] `resolve` + `isStale` defined iff your type is by-reference
   - [ ] `getAgentDescription` describes the *user-visible* rendering outcome (no “when”)
   - [ ] `maxContentLength` set if your inline payload can exceed 10 000 chars
   - [ ] `getTools` / `getBoundedTools` only when an existing or new tool is genuinely required
   - [ ] Registered in `setup()` via `agentBuilder.attachments.registerType(...)`

3. **Browser UI (Surface 2, required)**
   - [ ] `AttachmentUIDefinition<MyAttachment>` in `<plugin>/public/attachment_types/<type>.tsx`
   - [ ] `getLabel` + `getIcon` (both i18n’d / EUI icon)
   - [ ] `renderInlineContent` — compact summary, gracefully handles `isSidebar`
   - [ ] `renderCanvasContent` — full preview (set `canvasWidth` if `50vw` is wrong)
   - [ ] `getActionButtons` — hides buttons whose callback is `undefined` (`openCanvas`, `openSidebarConversation`)
   - [ ] `updateOrigin` called after “Save to library” / external persistence
   - [ ] Registered in `start()` via `agentBuilder.attachments.addAttachmentType('my_type', def)`

4. **SML (Surface 3, optional)**
   - [ ] `SmlTypeDefinition` in `<plugin>/server/sml_types/<type>.ts`
   - [ ] `list` uses `createPointInTimeFinder({ namespaces: ['*'] })` with `finder.close()` in `finally`
   - [ ] `getSmlData` sets the minimum `permissions.kibana.privileges`
   - [ ] `toAttachment` uses `savedObjectsClient.resolve(...)`, returns `{ type: MY_ATTACHMENT_TYPE, origin, data }`
   - [ ] Registered in **setup()** via `agentContextLayer.registerType(...)` (NOT `agentBuilder.sml.registerType` — that name in `CONTRIBUTOR_GUIDE.md` is stale)
   - [ ] `kibana.jsonc` lists `agentContextLayer` in `requiredPlugins` / `optionalPlugins`

5. **Tools (Surface 4, optional)**
   - [ ] If global built-in: id added to `AGENT_BUILDER_BUILTIN_TOOLS` allow list
   - [ ] If new namespace: added to `protectedNamespaces`
   - [ ] If per-instance: `getBoundedTools` returns instance-scoped tools with unique ids and descriptions that name the attachment id

6. **Skill (Surface 5, optional)**
   - [ ] Markdown content specifies *when* to produce / render the attachment
   - [ ] `experimental: true` if behind the experimental flag
   - [ ] Registered via `agentBuilder.skills.register(...)` in `setup()`

7. **Tests**
   - [ ] Unit test for `validate` (positive + negative) and `format`
   - [ ] Unit test for `resolve` + `isStale` when present
   - [ ] Scout API spec under `agent_builder/test/scout_agent_builder/api/` covering POST/GET/PUT/DELETE for the new type (mirror `attachments_api.spec.ts` / `sml_api.spec.ts`)
   - [ ] Browser snapshot / RTL test for `renderInlineContent` + `renderCanvasContent`

8. **i18n & docs**
   - [ ] All UI strings under `xpack.<plugin>.attachment.*`
   - [ ] Update `CONTRIBUTOR_GUIDE.md` if you introduce a new pattern worth documenting

## 11. Reviewer checklist

- [ ] Type id namespaced (no bare `text`, `my_thing` for platform / solution types — use `platform.<area>.<name>`)
- [ ] `validate` returns parsed `data`, not the raw input
- [ ] `getAgentDescription` describes the rendering outcome, **without** dictating *when* to render
- [ ] By-reference types implement *both* `resolve` and `isStale`, or document why staleness is intentionally unsupported
- [ ] `maxContentLength` justified if it diverges from the 10 000-char default
- [ ] Browser UI definition registered on **start**, not setup
- [ ] Server registration on **setup**, not start
- [ ] SML registration uses `agentContextLayer.registerType` (reject `agentBuilder.sml.registerType`)
- [ ] SML `list` uses `namespaces: ['*']` and closes its PIT finder
- [ ] SML `permissions.kibana.privileges` is minimal and specific
- [ ] New global tools land in the allow list in the same PR
- [ ] `updateOrigin` is called from canvas / button handlers where applicable; never passed an object
- [ ] All user-facing strings are i18n’d
- [ ] Tests cover validate/format/resolve and at least one UI render path

## 12. Common pitfalls

- **Registering UI on the server, or the type on the browser.** Server uses `agentBuilder.attachments.registerType` (setup); browser uses `agentBuilder.attachments.addAttachmentType` (start). The names look similar — they are different surfaces.
- **Forgetting the global tool allow list.** Kibana refuses to start with an explicit error pointing at `AGENT_BUILDER_BUILTIN_TOOLS` in `agent-builder-server/allow_lists.ts`. Fix in the same PR.
- **Putting *when to render* into `getAgentDescription`.** This bloats the system prompt for everyone using the type. Use a skill instead.
- **Treating SML as part of the attachment registry.** They are independent. An SML type *produces* attachments, but registering an SML type does not register an attachment type and vice versa.
- **Copying the SML registration call from `CONTRIBUTOR_GUIDE.md`.** It still shows `agentBuilder.sml.registerType(...)`; the actual API is `agentContextLayer.registerType(...)`. Search existing call sites before quoting the guide.
- **Returning `getRepresentation` instead of letting the formatter stringify.** `getRepresentation` is deprecated. Return raw data unless you need a custom textual encoding.
- **Forgetting `isStale` for by-reference types.** Without it the UI can never show a “resync” affordance; the framework does not fall back automatically.
- **Per-instance tools sharing a tool id.** The agent will see duplicate tools and behave unpredictably. Include the attachment id in the tool id and in its description.

## 13. Quick-start scaffold (≤ 10 minutes to a working stub)

```
your_plugin/
├── common/
│   └── attachments/
│       └── my_type.ts                     # const + data schema + typed alias
├── server/
│   ├── attachment_types/
│   │   ├── my_type.ts                     # createMyAttachmentType()
│   │   └── my_type.test.ts
│   ├── sml_types/                          # OPTIONAL — only if SML-discoverable
│   │   └── my_type.ts                     # createMyAssetSmlType()
│   └── plugin.ts                          # setup(): registerType + (sml) + (tools)
├── public/
│   ├── attachment_types/
│   │   └── my_type.tsx                    # AttachmentUIDefinition
│   └── plugin.ts                          # start(): addAttachmentType
└── kibana.jsonc                           # add agentBuilder (+ agentContextLayer)
```

Then run `node scripts/type_check --project <your_plugin>/tsconfig.json` and the relevant unit tests via `node scripts/jest <your_plugin>/server/attachment_types/my_type.test.ts`.
