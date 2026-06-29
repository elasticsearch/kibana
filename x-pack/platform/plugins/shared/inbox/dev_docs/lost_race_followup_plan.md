# Follow-up plan: concurrent-response ("lost race") outcome surfacing

Status: **partially addressed in `inbox-history`**. The PR now uses the
`hitl.respondedAt` audit stamp as a first-writer-wins gate: a concurrent loser gets a
`409 Conflict` before `resumeWorkflowExecution` is called, and the winner's
`hitl.{respondedBy,respondedAt,channel}` fields are no longer overwritten. This document
tracks the remaining follow-up: recording loser attempts and exposing richer outcome
metadata in the history feed.

## 1. Problem statement

A single `waitForInput` step can be addressed by more than one responder at the same
time (the Kibana inbox UI, a Slack action, the agent-builder execution view, and the
raw API all resolve the **same** `source_id`). Today the respond flow in
`x-pack/platform/plugins/shared/inbox/server/routes/actions/respond_to_action.ts` →
`InboxActionRegistry.respondTo` → `createWorkflowsInboxProvider.respond`
(`src/platform/plugins/shared/workflows_management/server/inbox/workflows_inbox_provider.ts`)
guards against **stale** responses and now prevents a **concurrent** loser from
scheduling a second resume:

1. Both callers re-read the step doc via `api.getStepExecution` and both observe
   `status === WAITING_FOR_INPUT` with no `finishedAt`/`error` — so both pass the
   pre-respond conflict check.
2. Both call `api.markStepAsResponded(...)`. The current Painless script serializes on the
   step doc and only writes `hitl.{respondedBy,respondedAt,channel}` when
   `hitl.respondedAt` is unset.
3. The winner proceeds to `api.resumeWorkflowExecution(...)`; the loser sees the update
   result as `noop` and receives `409 Conflict`.

Remaining gap: the loser's attempted input/channel/user are not retained, and history
consumers only see the applied response rather than a richer "applied vs superseded"
outcome model.

## 2. Goals / non-goals

**Goals**
- Keep the audit stamp as the **compare-and-set** serialization point so exactly one
  responder is declared the winner deterministically. (Implemented in the current PR.)
- The **loser** receives a clear `409 Conflict` (not a misleading `200`), so clients can
  refetch and show "someone else already responded". (Implemented in the current PR.)
- The audit trail records the **lost attempt** (who, when, via which channel) so the
  history feed can render "also responded" context instead of losing it.
- Surface a per-row `outcome` on `InboxAction` so history consumers can distinguish a
  response that **applied** vs one that was **superseded** vs a **timeout-default**.
- Zero new ES mappings beyond what already exists on `hitl` (stay inside the
  `dynamic: false` step-executions mapping — see `mappings.ts`).

**Non-goals**
- True engine-level optimistic concurrency on the workflow **execution** doc (seq_no /
  primary_term on `resumeWorkflowExecution`). That lives in the workflows execution
  engine's ownership boundary; this plan stops the data loss at the inbox audit-stamp
  layer, which is sufficient because the audit stamp happens *before* the resume.
- Cross-provider lost-race semantics for non-workflows providers. The contract additions
  are generic, but only the workflows provider implements them in this phase.

## 3. Design overview

Promote the existing audit stamp into the **concurrency gate**:

```
respond(sourceId, input, ctx)
  ├─ getStepExecution → stale/terminal checks (unchanged: throws InboxActionConflictError)
  ├─ markStepAsResponded(...)  ← compare-and-set gate
  │     ├─ hitl.respondedAt UNSET  → stamp winner, return true
  │     └─ hitl.respondedAt SET    → noop, return false
  ├─ if false → throw InboxActionConflictError  (implemented: stop before resume)
  └─ resumeWorkflowExecution(...)  (only the winner reaches here)
```

Because the audit stamp is `refresh: 'wait_for'` and uses a scripted conditional update,
two concurrent updates to the same `_id` are serialized by Elasticsearch at the document
level — the second script execution observes the first's write and takes the
`already-responded` branch. No external lock required.

### 3.1 Remaining loser-attempt capture

The current script in `WorkflowExecutionQueryService.markStepAsResponded` already writes
the winning fields only when `hitl.respondedAt` is unset. Extend that loser branch from a
plain `noop` into a bounded `hitl.lostResponses` append:

```painless
if (ctx._source.spaceId != params.spaceId) { ctx.op = "noop"; }
else {
  if (ctx._source.hitl == null) { ctx._source.hitl = [:]; }
  if (ctx._source.hitl.respondedAt == null) {
    // winner
    ctx._source.hitl.respondedBy = params.respondedBy;
    ctx._source.hitl.respondedAt = params.respondedAt;
    ctx._source.hitl.channel     = params.channel;
  } else {
    // loser — append a bounded audit record, do NOT touch winner fields
    if (ctx._source.hitl.lostResponses == null) { ctx._source.hitl.lostResponses = []; }
    if (ctx._source.hitl.lostResponses.size() < params.maxLostResponses) {
      ctx._source.hitl.lostResponses.add([
        "respondedBy": params.respondedBy,
        "respondedAt": params.respondedAt,
        "channel":     params.channel
      ]);
    }
  }
}
```

`maxLostResponses` (e.g. `10`) caps unbounded array growth from pathological retry storms.
`hitl.lostResponses` is **not** mapped as a typed field (the step-exec index is
`dynamic: false`), so it rides along in `_source` exactly like the reasoning soft-interface
— readable from `_source`, never queried/aggregated.

To learn the **outcome of its own write**, `markStepAsResponded` must read back the
result. Two options:

- **Option A (preferred): scripted update + `_source` return.** Use
  `esClient.update({ ..., _source: true })` and inspect the returned `get._source.hitl`
  to determine whether *this* call's `respondedAt`/`respondedBy` match the winner. If they
  match → won; otherwise → lost (and `winner` = the stored `hitl.{respondedBy,respondedAt,channel}`).
- **Option B: `result: 'noop'|'updated'` heuristic.** This is sufficient for the current
  first-writer gate because losers are no-ops. It will stop being sufficient once the
  loser branch mutates the doc by appending `lostResponses`, so the follow-up needs
  Option A or an equivalent read-back.

### 3.2 New return type from `markStepAsResponded`

Replace the current `Promise<boolean>` with a structured result when loser attempts are
recorded:

```ts
// src/platform/plugins/shared/workflows_management/server/services/workflow_execution_query_service.ts
export interface MarkStepAsRespondedResult {
  /** False when the step doc was not found (already terminated / wrong space). */
  updated: boolean;
  /** True when THIS caller's stamp won the compare-and-set. */
  won: boolean;
  /** Populated only on a lost race — the audit metadata of the responder that won. */
  winner?: { respondedBy: string; respondedAt: string; channel: string };
}
```

Update the three call sites that currently treat the return as a boolean:
`workflows_management_api.ts`, `workflows_management_service.ts`, and the provider.
Keep the existing "doc not found / wrong space / already claimed ⇒ `updated: false`"
branch (today's `return false`).

### 3.3 Lost-race conflict signal

Extend the existing conflict-error machinery in
`x-pack/platform/plugins/shared/inbox/server/services/inbox_action_registry.ts` rather
than inventing a parallel path. Add a discriminator so clients can tell "stale/gone" from
"someone beat you":

```ts
export const INBOX_CONFLICT_REASON = {
  stale: 'stale',        // step advanced / not found / already settled
  lostRace: 'lost_race', // concurrent responder won the compare-and-set
} as const;
export type InboxConflictReason = (typeof INBOX_CONFLICT_REASON)[keyof typeof INBOX_CONFLICT_REASON];

export interface InboxActionConflictError extends Error {
  readonly sourceApp: string;
  readonly sourceId: string;
  readonly reason: InboxConflictReason; // NEW (default 'stale' for existing call sites)
}
```

`createInboxActionConflictError(sourceApp, sourceId, message, reason = 'stale')`. The
provider throws it with `reason: 'lost_race'` when `markStepAsResponded` returns
`won: false`. The respond route (`respond_to_action.ts`) already maps
`isInboxActionConflictError` → `response.conflict(...)`; extend the 409 body to include
`{ reason }` so the client can branch its toast/copy.

### 3.4 `outcome` on `InboxAction`

Add an optional, nullable `outcome` to the `InboxAction` schema
(`x-pack/platform/packages/shared/kbn-inbox-common/impl/schemas/actions/list_actions_route.schema.yaml`):

```yaml
        outcome:
          type: string
          enum:
            - applied      # this row's recorded response advanced the workflow
            - superseded   # a concurrent responder won; this row is a recorded lost attempt
            - timed_out    # resolved by the timeout-default (pairs with response_mode: timed_out)
          nullable: true
          description: |
            Resolution outcome from the recorded responder's perspective. `applied`
            for the winning response, `superseded` for a recorded lost attempt
            (see hitl.lostResponses), `timed_out` for a timeout-default resolution.
            Null while pending. Distinct from `status` (approve/reject decision) and
            `response_mode` (human vs timeout).
```

Regenerate `.gen.ts` (`yarn openapi:generate` in `kbn-inbox-common`, then eslint --fix the
generated files — see plugin README §"Regenerating OpenAPI schemas"). Thread `outcome`
through `toInboxHistoryAction` (`to_inbox_action.ts`):
- winner row → `outcome: 'applied'`,
- each `hitl.lostResponses[]` entry → a synthesized history row with `outcome: 'superseded'`
  (or, simpler v1: keep one row and expose `lostResponses` count — see Open Questions),
- timeout-default resolution → `outcome: 'timed_out'` (pairs with the existing
  `response_mode: 'timed_out'`, owned by the timeout work in security-team#16708).

### 3.5 UI

- **Respond flyout** (`respond_flyout.tsx`): on a `409 { reason: 'lost_race' }`, show a
  non-error info callout ("This action was just answered by {winner}.") + auto-refetch the
  pending list so the row drops, instead of the generic error toast used for stale/gone.
- **History feed** (`inbox_history_feed.tsx`): render an `outcome` badge — `Applied`
  (subdued/neutral), `Superseded` (warning hue), `Timed out` (subdued). i18n all strings
  per the repo i18n rule. If superseded rows are surfaced, group them under the winning
  row or tag them inline.

## 4. File-by-file change list

Server (workflows):
- `…/workflows_management/server/services/workflow_execution_query_service.ts`
  - `markStepAsResponded` → compare-and-set script + `_source: true` read-back; return
    `MarkStepAsRespondedResult`; add `maxLostResponses` param.
  - export `MarkStepAsRespondedResult`.
- `…/workflows_management/server/api/workflows_management_api.ts` &
  `…/workflows_management_service.ts`
  - propagate the new return type (no longer boolean).
- `…/workflows_management/server/inbox/workflows_inbox_provider.ts`
  - after `markStepAsResponded`, if `!won` throw `createInboxActionConflictError(…, 'lost_race')`
    **before** the resume; do not call `resumeWorkflowExecution`.
- `…/workflows_management/server/inbox/to_inbox_action.ts`
  - map `outcome` (`applied`/`superseded`/`timed_out`) onto the history action.

Server (inbox plugin):
- `…/inbox/server/services/inbox_action_registry.ts`
  - add `reason` to `InboxActionConflictError` + `INBOX_CONFLICT_REASON`; default `'stale'`.
- `…/inbox/server/routes/actions/respond_to_action.ts`
  - include `{ reason }` in the 409 body.
- `respond_to_action_route.schema.yaml` (+ regen): add optional `reason` to the conflict
  response body (and document the 409 shape).

Common:
- `…/kbn-inbox-common/impl/schemas/actions/list_actions_route.schema.yaml` → add `outcome`;
  regenerate `.gen.ts`.

Client:
- `…/inbox/public/pages/inbox_actions/components/respond_flyout.tsx` → lost-race UX.
- `…/inbox/public/pages/inbox_actions/components/inbox_history_feed.tsx` → `outcome` badge.
- `…/inbox/public/pages/inbox_actions/translations.ts` → new i18n strings.

## 5. Test plan

Unit (jest):
- **query service** (`workflow_execution_query_service.test.ts`):
  - winner branch stamps `hitl.*` and returns `{ updated: true, won: true }`.
  - loser branch (mock read-back showing a different `respondedAt`) returns
    `{ updated: true, won: false, winner }` and appends to `lostResponses` without
    overwriting the winner fields (assert the script source contains the
    `respondedAt == null` guard and the `lostResponses` cap).
  - doc-not-found still returns `{ updated: false, won: false }`.
- **provider** (`workflows_inbox_provider.test.ts`):
  - `won: false` ⇒ throws `InboxActionConflictError` with `reason: 'lost_race'` and
    **does not** call `resumeWorkflowExecution`.
  - `won: true` ⇒ proceeds to resume (existing behavior).
- **registry** (`inbox_action_registry.test.ts`): `createInboxActionConflictError`
  carries `reason`; default is `'stale'`.
- **respond route** (`respond_to_action.test.ts`): lost-race error → `409` body includes
  `{ reason: 'lost_race' }`; stale error → `409` with `{ reason: 'stale' }`.
- **to_inbox_action** (`to_inbox_action.test.ts`): `outcome` mapping for applied /
  superseded / timed_out.
- **client**: flyout shows the info callout + refetches on lost-race 409; history feed
  renders the `outcome` badge.

Integration/race (optional but recommended):
- A jest_integration test firing two near-simultaneous `respondTo` calls at one real ES
  step doc and asserting exactly one `won: true`, one `lost_race` 409, and a single
  `hitl.respondedAt`.

Validation gates (per repo rules): `node scripts/eslint --fix $(git diff --name-only)`,
`node scripts/type_check --project …` for `kbn-inbox-common`, `inbox`, and
`workflows_management`, `node scripts/i18n_check --fix`, and jest for all touched suites.

## 6. Edge cases & risks
- **Read-back cost**: `_source: true` on the update inflates the response slightly; fine
  for a per-respond write. Avoid fetching the full `output` blob — request only `hitl`
  via `_source: ['hitl']` if the client supports it on update (verify; otherwise filter
  in memory).
- **Audit-stamp failure is fail-closed.** The provider now aborts before
  `resumeWorkflowExecution` if `markStepAsResponded` throws; keep that invariant when the
  loser branch starts mutating `lostResponses`. Benign `false` results still map to a
  refreshable 409 conflict.
- **`lostResponses` unbounded growth**: capped by `maxLostResponses`.
- **Backwards compatibility**: pre-existing rows have no `outcome`/`lostResponses`; both
  are nullable/optional. Winner read-back must tolerate a `hitl` written by the old
  unconditional script (treat any set `respondedAt` matching this call as won).
- **Non-workflows providers**: `outcome` and the lost-race `reason` are optional in the
  contract; other providers omit them with no behavior change.

## 7. Open questions (resolve before implementation)
1. Do we surface each lost attempt as its **own** history row (`outcome: 'superseded'`), or
   keep a single winning row plus a `lostResponses` count badge? (Leaning: count badge in
   v1, separate rows only if product wants per-responder attribution.)
2. Should the lost-race 409 echo the **winner's identity** in the body, or only a generic
   "already answered" message (privacy/leak considerations across spaces/roles)?
3. Is `outcome` better modeled as a derived/computed field in `to_inbox_action` (no schema
   churn risk) vs a first-class schema field? (Leaning: first-class for client clarity.)

## 8. Tracking
- Parent epic: HITL GA — concurrent-response safety (extends the audit-trail work in
  [kibana#256603](https://github.com/elastic/kibana/pull/256603) and the conflict-error
  groundwork already merged on this branch).
- Pairs with the timeout-default work ([security-team#16708](https://github.com/elastic/security-team/issues/16708))
  for the `timed_out` outcome.
