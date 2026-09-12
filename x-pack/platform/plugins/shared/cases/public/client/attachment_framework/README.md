# Cases attachment framework

Register a custom attachment type so Cases can store it, validate it on write, and render it in the activity feed and attachment tabs.

This is the v2 unified registration API. Public HTTP still uses `/comments` and still accepts some legacy shapes. New types must register and write the unified payload.

## Who this is for

Plugin authors that own an attachment type. Security, Observability, ML, and osquery are the current ones. Cases owns the registry and the comment, file, lens, dashboard, map, discover-session, and stack-alert types.

## Concepts

Every type has a string `id`, for example `comment`, `file`, or `security.alert`. Plugin-owned types should use `owner.noun` (`security.endpoint`, `ml.anomaly_charts`). Cases-owned types may be a single noun (`file`, `lens`).

Payloads are one of:

| Kind | Discriminator | Stores | View props |
| --- | --- | --- | --- |
| Value | inline `data`, no `attachmentId` | All renderable content on the comment saved object | `UnifiedValueAttachmentViewProps` |
| Reference | required `attachmentId` | Pointer to another entity such as a file saved object, alert, or endpoint action. Optional `data` / `metadata` snapshot | `UnifiedReferenceAttachmentViewProps` |
| Hybrid | schema accepts both arms | Same `id` for by-value and by-reference. Lens is the example | `UnifiedHybridAttachmentViewProps` |

`defineAttachment({ schema })` infers kind from the Zod payload. An `attachmentId` field means reference. Inline `data` with no `attachmentId` means value. Both arms means hybrid. Hybrid renderers must narrow `data` at runtime.

`unified` is the v2 payload and view-prop vocabulary versus legacy `user`, `alert`, `externalReference`, and `persistableState` comments. It is not a product name.

## Register on both sides

Register the same `id` and the same Zod `schema` on server `setup` and public `setup`. The server validates writes. The public side renders the activity row, actions, and optional attachment-list tab.

Add `cases` to `optionalPlugins` or `requiredPlugins` in the plugin `kibana.jsonc`.

### Server (`setup`)

```ts
import type { CasesServerSetup } from '@kbn/cases-plugin/server';
import { MY_ATTACHMENT_TYPE } from '../common/constants';
import { MyAttachmentPayloadSchema } from '../common/attachments/my_type';

export const registerCaseAttachments = (cases?: CasesServerSetup): void => {
  cases?.attachmentFramework.registerAttachment({
    id: MY_ATTACHMENT_TYPE,
    schema: MyAttachmentPayloadSchema,
    // Omit to expose `schema` to workflow authors when it is a Zod object.
    // `false` excludes the type from workflow steps.
    // A narrower Zod object, typically the by-reference arm, is also valid.
    workflowSchema: false,
    // Opts this type into workflow-run origins. Reference types use attachmentId by default;
    // value types use the Cases attachment saved-object id.
    workflow: {},
  });
};
```

Call this from plugin `setup` when `plugins.cases` is present. Server registration is `{ id, schema, workflowSchema? }` only. No UI fields.

### Public (`setup`)

```ts
import { defineAttachment, type CasesPublicSetup } from '@kbn/cases-plugin/public';
import { MY_ATTACHMENT_TYPE } from '../../common/constants';
import { MyAttachmentPayloadSchema } from '../../common/attachments/my_type';

export const registerMyAttachment = (cases: CasesPublicSetup): void => {
  cases.attachmentFramework.registerAttachment(
    defineAttachment({
      id: MY_ATTACHMENT_TYPE,
      schema: MyAttachmentPayloadSchema,
      workflowSchema: false,
      getIcon: () => 'document',
      getLabel: () => 'Widgets',
      getCreationActivity: () => ({
        event: 'added a widget',
        children: LazyWidgetBody,
      }),
      getRemovalActivity: () => ({ event: 'removed a widget' }),
      workflow: {
        getActivityLabel: ({ workflowName }) => <>ran {workflowName} on a widget</>,
      },
    })
  );
};
```

Call this from public `setup` via `plugins.cases`. Wrap the object in `defineAttachment` so renderer props are inferred from `schema` at the call site. The registry then stores a widened type so many registrations can share one map.

Import UI types from `@kbn/cases-plugin/public`: `UnifiedValueAttachmentViewProps`, `UnifiedReferenceAttachmentViewProps`, `UnifiedHybridAttachmentViewProps`, `AttachmentActionType`, `AttachmentAction`, `DocumentActionProps`. Import type ids from `@kbn/cases-plugin/common` when Cases owns the constant.

`getLabel`, `event`, and `deleteSuccessToast` strings need `i18n.translate`. The snippet above skips that for brevity.

## Public fields

| Field | Required | Role |
| --- | --- | --- |
| `id` | yes | Type id. Same string as server. |
| `schema` | yes | Full-payload Zod schema. Writes are validated against this schema only. |
| `workflowSchema` | no | Schema shown to workflow authors. Unset falls back to `schema` if it is a Zod object. `false` excludes the type. |
| `getIcon(props)` | yes | Activity-row avatar. Return an EUI glyph string or a React node (`EuiCommentProps['timelineAvatar']`). Filter chips and attachment tabs use `getLabel()`, not `getIcon`. |
| `getLabel()` | yes | Filter / tab label. |
| `getCreationActivity(props)` | yes | Activity-row create event. |
| `getRemovalActivity(props)` | no | Activity-row delete event. |
| `getAttachmentList(props?)` | no | Case-view table/tab (`AttachmentList`). |
| `workflow.getActivityLabel(props)` | no | Opts the public registration into attachment workflow activity rendering. Receives the linked workflow name and an optional bulk count. |
| `getDocumentAction(props)` | no | Control that opens the ES document this type points at, rendered from activity rows that reference the document but are not the attachment's own row (e.g. workflow runs). Return `null` when the target can't be resolved. |

`getCreationActivity` may return:

| Field | Role |
| --- | --- |
| `event` | `EuiComment` event slot, string or node. |
| `eventColor` | `EuiComment` event color. |
| `children` | `React.LazyExoticComponent` for the comment body. |
| `getActions(props)` | Extra toolbar actions (`AttachmentActionType.BUTTON` or `CUSTOM`). |
| `hideDefaultActions` | Hide the default overflow actions. |
| `deleteSuccessToast` | Toast title after delete. |
| `className` / `css` | Row styling. |

View props are flattened. There is no `{ attachment, caseData }` wrapper. Common fields are `savedObjectId`, `caseData`, `permissions`, `createdBy`, `version`, and `rowContext`. Kind-specific fields are `attachmentId`, `data`, and `metadata`.

## Schema

Own the Zod schema next to the type in the plugin `common/` directory, not in Cases common, unless Cases owns the type.

- Bound strings and arrays (`max` / `maxLength` or equivalent).
- `z.literal(MY_ATTACHMENT_TYPE)` on `type`.
- `owner: z.string()`.
- Reference: `attachmentId` required. Value: `data` required, no `attachmentId`. Hybrid: union of both arms.
- Reuse the same schema module on server and public so validation and renderer props cannot drift.

Reference example, file-shaped:

```ts
export const MyAttachmentPayloadSchema = z
  .object({
    type: z.literal(MY_ATTACHMENT_TYPE),
    owner: z.string(),
    attachmentId: z.string(),
    metadata: MyMetadataSchema,
  })
  .strict();
```

Value example, comment-shaped:

```ts
export const MyAttachmentPayloadSchema = z
  .object({
    type: z.literal(MY_ATTACHMENT_TYPE),
    owner: z.string(),
    data: z.object({ content: z.string().max(30000) }).strict(),
  })
  .strict();
```

## `getIcon`

This is the activity-row visual only. Data-driven icons are allowed.

- Endpoint: `metadata?.command === 'isolate' ? 'lock' : 'lockOpen'`
- File: `image` vs `document` from mime type
- Comment: a React node for the user avatar, not a glyph

## Existing registrations

| Owner | Types |
| --- | --- |
| Cases, internal | `comment`, `file`, `lens`, `stack.alert`, `dashboard`, `map`, `discoverSession` |
| security_solution | `security.endpoint`, `security.event`, `security.indicator`, `security.alert`, `security.timeline`, `security.entity` |
| observability | `observability.alert` |
| ml | `ml.anomaly_swimlane`, `ml.anomaly_charts`, `ml.single_metric_viewer` |
| aiops | `aiops.change_point_chart`, `aiops.pattern_analysis`, `aiops.log_rate_analysis` |
| osquery | `osquery` |

Cases internals register in [`../../components/attachments/`](../../components/attachments/) and [`../../../server/attachment_framework/attachments/`](../../../server/attachment_framework/attachments/). External plugins register from their own `setup` via `attachmentFramework.registerAttachment`.

Copy a close sibling rather than inventing a third shape.

- Value with a custom avatar: [`../../components/attachments/comment/`](../../components/attachments/comment/)
- Reference with a tab and actions: [`../../components/attachments/file/`](../../components/attachments/file/)
- Hybrid, by-value embed plus by-ref saved object: [`../../components/attachments/lens/`](../../components/attachments/lens/)
- External plugin, both sides: `security_solution` `public/cases/attachments/` and `server/cases/attachments/`

## Legacy maps, back-compat only

Stored comments and the public `/comments` API still project through legacy type names: `user`, `alert`, `externalReference`, `persistableState`, plus ER/PS subtype ids.

Maps live in [`../../../common/constants/attachments.ts`](../../../common/constants/attachments.ts).

- `EXTERNAL_REFERENCE_TYPE_MAP`: legacy `externalReferenceAttachmentTypeId` to unified `id`
- `PERSISTABLE_STATE_LEGACY_TO_UNIFIED_MAP`: legacy persistable-state subtype to unified `id`
- `LEGACY_TO_UNIFIED_MAP` / `UNIFIED_TO_LEGACY_MAP`: top-level comment `type` field

New types with no v1 equivalent stay off these maps. `security.entity` is an example.

Replacing an existing ER/PS subtype requires map entries so stored documents and `/comments` keep projecting. Add them in the same PR as the type. See comments on [`../../../server/common/attachments/external_reference.ts`](../../../server/common/attachments/external_reference.ts).

Do not call `registerExternalReference` or `registerPersistableState`. Those APIs are gone.

## Checklist

1. Zod payload schema in plugin `common/`, shared by server and public.
2. Constant for `id`. Add it to Cases `common/constants/attachments.ts` only if Cases should own the id because more than one plugin uses it. Otherwise keep it in the owning plugin.
3. Server `registerAttachment({ id, schema, workflowSchema? })` in `setup`.
4. Public `registerAttachment(defineAttachment({ … }))` in `setup`.
5. Lazy-load `children` and heavy action UI.
6. `i18n.translate` for `getLabel`, `event` copy, and `deleteSuccessToast`.
7. Legacy map entries only if this type replaces a v1 ER/PS subtype.
8. Jest covering the registration object: `id`, `getLabel`, and a schema parse of a valid payload.
