# Follow-up plan: cross-surface resume authorization consistency

Status: **note only — not addressed in `inbox-history`**. This documents a latent
authorization-consistency gap surfaced while consolidating the HITL resume path. No code
change is proposed for the current PR; it needs a product/security decision with the
workflows team before implementation.

## 1. Problem statement

This PR consolidated the HITL claim + resume into a single core API,
`WorkflowsManagementApi.resumeWorkflowExecution`
(`src/platform/plugins/shared/workflows_management/server/api/workflows_management_api.ts`).
All ES access on that path runs as the **internal user** (the query service is built with
`coreStart.elasticsearch.client.asInternalUser` — see `workflows_management_service.ts`),
with authorization enforced at the route layer and `spaceId` guards in the queries/script.

Three surfaces now funnel into that one consolidated resume, but with **different entry
gates**:

| Surface | Entry gate |
| --- | --- |
| Public `/resume` route (`resume_execution.ts`) | `workflowsManagement:execute` (`WORKFLOW_EXECUTION_RESUME_SECURITY`) |
| Agent Builder resume tool (`agent_builder_workflows/.../resume_workflow_execution.ts`) | Agent Builder builtin-tool authz |
| Inbox respond route (`inbox/.../respond_to_action.ts`) | `INBOX_API_PRIVILEGE_RESPOND` — an inbox feature privilege, **no** workflows privilege |

**Net effect:** a principal with inbox-respond but without workflows `execute` can advance
(resume) a workflow execution. Resume is bundled under `execute` for the public route, so
the inbox path is comparatively under-gated. Note the inbox already resumed directly before
this PR — the consolidation didn't introduce the gap, it made it more visible by unifying
the write path and adding channels.

### Bug or feature?
Both framings are defensible, which is why this needs a decision rather than a silent fix:
- **Feature:** the inbox is intentionally a decoupled surface — "respond to a HITL step
  routed to you" is its own narrow grant, orthogonal to "manage/execute workflows." A SOC
  analyst approving an isolation prompt arguably shouldn't need the full Workflows execute
  privilege, and server-derived `responded_by` keeps it accountable.
- **Bug:** we consolidated the *write* path but not the *authz posture*; one consolidated
  resume trusting three unequal gates is an inconsistency reviewers will flag.

## 2. Why not a scoped (`asCurrentUser`) client
Rejected. The `.workflows-*` indices are internal/hidden Kibana system indices; end users
don't (and shouldn't) hold ES index privileges on them. The plugin's model everywhere is
internal-user ES access + Kibana feature-privilege checks at the API layer + `spaceId`
guards. A scoped client would require granting raw ES roles on internal indices (an
anti-pattern) or would break the flow for everyone holding only the Kibana feature
privilege. Keep the internal client; fix this at the **feature-privilege** layer instead.

## 3. Options

- **Option A — Document as intentional (no code).** Declare inbox-respond a deliberate,
  independent grant; make the decoupling explicit in the inbox feature-privilege docs and
  the architecture review. Lowest effort; leaves the cross-surface asymmetry in place.
- **Option B — Enforce a baseline workflows privilege in the consolidated resume
  (preferred).** Make `resumeWorkflowExecution` the **authz chokepoint** as well as the
  write chokepoint: require `workflowsManagement:execute` (via `authzResult` /
  `security.authz.checkPrivileges`) regardless of channel. Mirrors the "one consolidated
  resume" philosophy already applied to the write path. Trade-off: inbox responders would
  then need workflows execute, coupling the two features.
- **Option C — Dedicated "Resume/Respond Workflow Execution" sub-feature privilege.** Add a
  precise privilege (alongside `execute` / `cancelExecution` in `WorkflowsManagementApiActions`
  and the workflows feature registration), and require it on **all** resume surfaces
  (public route, Agent Builder, inbox respond). Most precise and least over-granting, but
  the largest change and a new privilege to migrate/grant.

**Recommendation:** Option C if product wants precise control over "who can advance a HITL
step," otherwise Option B as a smaller consistent step. Either way, enforce it inside the
consolidated resume so every channel shares one gate. Keep the internal client.

## 4. Sketch of touch points (for B/C)
- `…/workflows_management/server/api/workflows_management_api.ts` — add the privilege check
  at the top of `resumeWorkflowExecution` (or accept an already-authorized flag from
  callers) so all channels are gated uniformly.
- `…/workflows_management/server/api/routes/utils/route_security.ts` &
  `WorkflowsManagementApiActions` (+ the workflows feature registration) — for Option C,
  register the new sub-feature privilege.
- `…/inbox/server/routes/actions/respond_to_action.ts` and the Agent Builder resume tool —
  ensure the principal carries the required workflows privilege (or rely on the
  consolidated check).
- `…/workflows_management/server/api/routes/tests/route_privilege_consistency.test.ts` —
  extend the privilege model/scope for the new privilege if Option C.
- (future, §6) `…/workflows_management/server/services/workflow_execution_query_service.ts` —
  instance-level responder check in the consolidated resume and role-aware filtering of the
  Awaiting/History feeds once steps carry assignment metadata.

## 5. Open questions
1. Is inbox-respond intended to be independent of workflows `execute` (feature), or a
   subset that should still require it (bug)? — the core product call.
2. If we add a dedicated privilege (C), do existing inbox/workflows roles get it by default
   (migration), or is it opt-in?
3. Should Agent Builder's resume require the same workflows privilege, or stay gated solely
   by Agent Builder tool authz?
4. Is role-targeted / escalating HITL (see §6) on the near-term roadmap? If so it argues for
   Option C now, so the coarse gate is stable before the instance-level policy lands on top.

## 6. Forward compatibility: targeted responders & escalation (future)

None of this exists in workflows today, but the AI-briefing PRD hints at HITL flows where a
`waitForInput` step is **routed to / answerable only by specific roles or users**, and where
an unanswered step **escalates** (broadens or reassigns its allowed responders after a
timeout). Calling it out here because it directly shapes which option above we should pick.

The key framing: this is a **second, instance-level (row-level) authorization axis** layered
on top of the coarse feature-privilege gate from §3 — not a replacement for it.

| Axis | Question it answers | Where it lives |
| --- | --- | --- |
| Feature privilege (§3) | "May this principal respond to HITL steps *at all*?" | Static Kibana privilege, checked at the resume chokepoint |
| Instance assignment (future) | "May this principal respond to *this* step right now?" | Data-driven: step carries assignment metadata, checked against the request principal's roles/username |

**Why this reinforces the recommendation.** A per-step responder policy must be evaluated on
*every* resume regardless of channel — exactly the property the consolidated
`resumeWorkflowExecution` chokepoint already gives us. Picking Option B/C (enforce inside the
consolidated resume) means the instance-level check has a single, obvious home later; leaving
three unequal gates (Option A) would force us to re-implement assignment logic per surface.

**Sketch of how it would land (do not build now):**
- **Assignment metadata on the step.** A future `waitForInput` definition would persist an
  allowed-responder set on the step doc — e.g. `hitl.assignedRoles` / `hitl.assignedUsers`
  (and optionally `hitl.requiredRoles` for "must be one of"). This rides on the existing
  `hitl.*` envelope, so no new top-level index concepts.
- **Enforcement at the chokepoint.** After the feature-privilege gate passes,
  `resumeWorkflowExecution` resolves the request principal's roles/username (via
  `security.authc.getCurrentUser()` — still in-memory, **internal ES client unchanged**) and
  rejects with a 403 when the principal isn't in the step's allowed set. The
  first-writer-wins claim already stamps `hitl.respondedBy`, so accountability is intact.
- **Escalation = time-based mutation of the allowed set.** A scheduled task (Task Manager)
  would widen/reassign the allowed-responder set on the step after a deadline and record an
  escalation entry; the resume path just reads the *current* set, so no resume-side logic
  changes. Audit each escalation alongside the existing HITL audit.
- **Feed filtering (defense-in-depth + UX).** Once steps are targeted, the Awaiting/History
  listings (`WorkflowExecutionQueryService`) should also filter by the principal's roles so
  users only see steps routed to them — a query-shaping concern, not a new authz boundary
  (the resume check stays authoritative).

**Implication for the choice in §3:** if targeted/escalating HITL is on the roadmap, Option C
(a dedicated, precise resume/respond privilege) ages best — the coarse gate stays stable
while the instance-level policy evolves independently on top of it.

## 7. Tracking
- Surfaced during the HITL resume consolidation in PR
  [#269218](https://github.com/elastic/kibana/pull/269218); pairs with the consolidated
  resume + first-writer-wins claim landed there.
- Companion to `lost_race_followup_plan.md` in this folder.
