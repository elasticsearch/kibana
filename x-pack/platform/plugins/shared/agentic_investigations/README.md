# Agentic investigations

Solution-agnostic base layer for the entities an agent and a human collaborate on. It owns their storage, their API, and their workflow steps, so a Worker in any solution can create them and any solution's UI can act on them.

Today it holds one entity, **proposals**. **Investigations** and **incidents** are next, which is why the plugin is an umbrella rather than one plugin per entity.

Consumed by AlertZero (Security) and intended for Nightshift (Observability). Nothing in this plugin is solution-specific.

## What belongs here, and what does not

This layer owns the record, the decision, and the guarantee that an approved action runs **as the approver**. It does not decide what to propose, when to propose it, or whether autonomy allows skipping the human gate — a Worker does all three.

## Entity directories

Every entity gets the same three homes, and nothing entity-specific lives above them:

```
common/
  constants.ts           umbrella: plugin id, API version, route base, workflow owner id
  index.ts               umbrella barrel, re-exports each entity barrel
  proposals/             constants, schemas, step definitions shared with the browser
server/
  plugin.ts config.ts types.ts
  features.ts            umbrella feature and its privileges
  proposals/             routes, services, step handlers, storage, managed workflows
public/
  plugin.ts index.ts types.ts
  proposals/             browser step definitions for the YAML editor
```

Adding an entity means adding a directory in each of the three, an entity barrel, its privileges in `features.ts`, and a getter on the start contract. It should not require restructuring the umbrella itself.

## Privileges

One Kibana feature, `agenticInvestigations`, shown in the Roles and Spaces pickers as **Proposed Actions** — named for proposals alone because action proposals move to their own plugin in a follow-up. Both privileges are declared inline on the feature:

| Feature privilege | API | UI |
| ----------------- | ------------------------------------ | ------------------------------------ |
| `all`             | `read_proposals`, `manage_proposals` | `showProposals`, `decideProposals`   |
| `read`            | `read_proposals`                     | `showProposals`                      |

So `read` can see the queue but cannot decide it. Because there are no sub-feature privileges to withhold, `minimal_all` and `minimal_read` grant the same as `all` and `read`. The feature carries `minimumLicense: 'enterprise'`.

When a second entity lands and needs to be grantable on its own, its capabilities belong in a sub-feature pulled up through `includeIn` rather than in more inline privileges.

## Proposals

### Model

- A **proposal** is a recommendation awaiting a human decision. It lives in `.kibana-investigation-proposals` and points at the conversation it belongs to.
- An **action proposal** additionally references a managed **action workflow** (`actionWorkflowId`) plus its `actionInput`. Approving it runs that workflow.
- A **non-action proposal** carries only its `comment` — instructions the analyst carries out themselves before approving. It is always gated: autonomy governs whether an action may run unattended, and there is no action here to govern, so `autoApprove` is ignored.
- Proposals are immutable once decided, and are never tuned: changing an action means dismissing the proposal and creating a new one.

### Architecture

```mermaid
flowchart TB
    subgraph solution["Solution plugin (e.g. alertzero)"]
        worker["Worker workflow"]
        ui["Pending-proposals UI"]
    end

    subgraph proposals["agenticInvestigations (this plugin)"]
        steps["investigations.createProposal<br/>investigations.updateProposal"]
        api["Internal HTTP API<br/>/internal/investigations/proposals"]
        service["ProposalsService<br/><i>the only writer</i>"]
        gate["system-create-investigation-proposal<br/><i>managed gate workflow</i>"]
    end

    subgraph platform["Workflows platform"]
        engine["Workflow engine"]
        agent["Agent<br/><i>ai.agent step</i>"]
        catalog["Action workflow catalog<br/><i>tagged `action`</i>"]
    end

    index[(".kibana-investigation-proposals")]

    worker -->|"ai.agent"| agent
    agent -->|"reads the catalog<br/>to pick an action"| catalog
    agent -->|"structured output"| worker
    worker -->|"workflow.execute"| gate
    gate --> steps
    steps --> service
    ui -->|"read / approve / dismiss"| api
    api --> service
    service --> index
    service -->|"resume, as the approver"| engine
    service -->|"reads consts.actionMetadata"| catalog
    gate -->|"workflow.execute"| catalog
```

Two boundaries are worth stating outright. `ProposalsService` is the **only** writer of the index — the steps and the routes both go through it, and there is no second path. And the solution plugin owns no storage: it contributes a Worker and a UI, and reaches the record only through the HTTP API.

The Agent is where the action is chosen. A Worker spawns it with an `ai.agent` step; the agent reads the action catalog to see which actions exist and what each one takes, then returns structured output naming an `actionWorkflowId` and its `actionInput`. Neither this plugin nor the gate workflow decides which action is appropriate.

### Lifecycle

```mermaid
sequenceDiagram
    participant W as Worker workflow
    participant G as Gate workflow
    participant S as ProposalsService
    participant I as Index
    participant A as Analyst
    participant AW as Action workflow

    W->>G: workflow.execute(conversationId, actionWorkflowId, actionInput)
    G->>S: investigations.createProposal
    S->>I: pending proposal (+ this execution id)
    S-->>G: proposalId
    G->>G: waitForApproval — parked, up to 72h

    A->>S: POST /approve
    S->>I: status=approved, decidedBy=<analyst>
    Note over S,I: The decision is written first.<br/>The workflow only ever gets a boolean.
    S->>G: resume(approved: true), as the analyst

    G->>S: investigations.updateProposal(executing)
    G->>AW: workflow.execute(actionInput)
    Note over AW: Runs under the analyst's API key,<br/>so the result is attributed to them.
    AW-->>G: output
    G->>S: investigations.updateProposal(succeeded)
```

Dismissal follows the same shape and releases the gate down its negative branch, so no action runs. A gate timeout surfaces as a step failure with an `ExecutionError` of type `TimeoutError`; the workflow-level `on-failure` reads that type and lands the proposal on `dismissed` — a decision that never came, rather than a malfunction — while any other failure becomes `failed`.

### How a Worker creates a proposal

Call the gate workflow; do not write proposals directly.

```yaml
- name: propose_action
  type: workflow.execute
  with:
    workflow-id: system-create-investigation-proposal
    inputs:
      conversationId: '{{ steps.investigate.output.conversation_id }}'
      comment: 'Tune the noisy rule that produced this alert'
      actionWorkflowId: '{{ steps.suggest_action.output.structured_output.actionWorkflowId }}'
      actionInput: '${{ steps.suggest_action.output.structured_output.actionInput }}'
      impact: low
      confidence: medium
```

The input contract:

| Input | Required | Notes |
| --- | --- | --- |
| `conversationId` | yes | The conversation the proposal belongs to. |
| `comment` | yes | Markdown explaining what is being proposed. A proposal a human cannot read is not reviewable. |
| `actionWorkflowId` | no | Omit for a proposal the analyst carries out themselves. |
| `actionInput` | no | Passed to the action workflow as its single `actionInput` object. |
| `impact`, `confidence` | no | Snapshotted at creation; used for queue ordering. |
| `autoApprove` | no | See below. Defaults to `false`, so the gate is fail-closed. |

You get back `proposalId` and `status`.

**The decision deadline is a fixed 72h, not a caller input.** The workflow engine does not template-render a step's `timeout`; it hands the raw string to the duration parser, so `timeout: "{{ inputs.expiresIn }}"` fails at execution time ([#290258](https://github.com/elastic/kibana/issues/290258)). The gate timeout and the `expiresIn` recorded on the proposal are therefore both hardcoded to `72h` and must stay equal — otherwise the deadline the queue shows an analyst is not the one the gate enforces. The `investigations.createProposal` step still accepts `expiresIn`, so a caller driving that step directly can set its own deadline; only this gate workflow is pinned.

**`autoApprove` is for callers that already resolved autonomy.** This plugin has no autonomy policy of its own; a Worker that has decided the action is permitted without a human passes `autoApprove: true` and the gate is skipped — the proposal is still recorded, and the action still runs. Anything else leaves it unset. It applies only to action proposals: a proposal with no `actionWorkflowId` is always gated regardless of the flag.

**The calling workflow must itself be managed.** An unmanaged parent can neither execute a managed child nor see globally-installed definitions, so a Worker registered outside `@kbn/workflows/managed` cannot reach the gate.

Omitting an optional input is safe. A Liquid template for an absent input still renders — as `''` — so every optional step input is declared with `optionalStepInput`, which treats `''` and `null` as absent. Without it, `actionInput: '${{ inputs.actionInput }}'` on a non-action proposal would fail schema validation before the handler ran.

### Authoring an action workflow

An action workflow is an ordinary managed workflow that:

1. carries the `action` tag, so the catalog can be discovered by tag;
2. declares `consts.actionMetadata` (`name`, `category` — any keyword the owning solution chooses — and optionally `description`, `impact`, `reversible`, `approvalPolicy`) — metadata has to live under `consts`, because unknown top-level YAML keys are stripped by the workflow schema;
3. takes a **single `actionInput` object** as its input, so the generic gate workflow never needs to know an action's parameter names;
4. ends in `workflow.output`, because `workflow.execute` cannot type a child's result.

Rule 3 is the non-obvious one and the easiest to get wrong: the gate passes exactly one key, `actionInput`. An action that declares `name`, `query` and `index` as top-level inputs will receive none of them. Declare them as properties of `actionInput` instead, and mark the ones that define the action's scope `required` — a default that matches everything is a demo shortcut, not a catalog entry.

See `definitions/alertzero/actions/action_create_detection_rule.yaml` for a worked example.

### API

All routes are internal and versioned (`/internal/investigations/proposals`, version `1`):

- `POST /internal/investigations/proposals` — create
- `GET /internal/investigations/proposals` — list (filter by `status`, `conversationId`, `excludeExpired`; paged with `from` and `size`)
- `GET /internal/investigations/proposals/{id}` — read one, with action metadata resolved
- `POST /internal/investigations/proposals/{id}/approve` — approve, then release the gate
- `POST /internal/investigations/proposals/{id}/dismiss` — dismiss with a structured reason

Reads need `read_proposals`; both decisions need `manage_proposals`. There is deliberately **no update route** — `status` is a consequence of deciding and executing, never something a caller sets.

### Invariants worth preserving

- **The decision is written before the workflow is resumed.** The gate only ever receives a boolean, so the record is the durable channel for what was decided.
- **The gate step is resolved explicitly.** The platform's waiting-step lookup only matches `waitForInput`; for a `waitForApproval` gate it returns nothing and would resume *without* claiming the step or stamping the audit envelope. `resumeGate` finds the step itself and passes `stepExecutionId`.
- **The decision actor is server-derived.** Never accepted from a request body. `createdBy` and `decidedBy` store `{ username, fullName, email, profileUid? }`, the shape Cases established: the profile uid is the stable identity a UI resolves an avatar from, and the names are stored rather than looked up so attribution survives a missing profile. The uid is genuinely often absent — security disabled, a `run-as` proxy, a session without a profile, or an API key whose creator has no activated profile, which is exactly what the resume path runs under.
- **Approval carries the action input the approver was shown**, so an approval that no longer matches the record is refused with a conflict.
- **Action metadata is resolved on read** from the action workflow's `consts.actionMetadata`, never copied onto the proposal, so a catalog change is picked up rather than going stale. `impact` is the exception: it is intrinsic to the action, so it is snapshotted from the metadata at creation.
- **`actionInput` is validated at creation**, against the schema the action declares on its manual trigger, so a proposal that could never run never reaches a human. Best-effort: the JSON Schema to zod conversion does not cover every keyword.
- **The queue's order lives in Elasticsearch.** `impact` and `confidence` are keywords, which sort alphabetically, so each is mirrored by a numeric rank written at creation. That is what makes the list pageable rather than capped at one fetch; the ranks are stripped before a proposal leaves the service.
- **`category` is an arbitrary keyword this plugin does not own.** Each solution defines the vocabulary its own actions declare and its own queries group by — AlertZero's set is not NightShift's — so there is no shared enum and no default to fall back on. It is absent on a proposal that carries no action. Consumers group and aggregate on it; nothing sorts on it, and which category is displayed first is a UI decision rather than a stored rank.

## Managed workflows

The plugin calls `registerManagedWorkflowOwner` in `setup()` and passes the same id to `initManagedWorkflowsClient`. Both must equal the `pluginId` on every definition it owns, or `assertPluginRegistration` throws on install.

Registering the owner is not optional. The startup sweep `cleanupUnregisteredOrphans` force-deletes any managed workflow whose `managedBy` is not in the setup-time owner registry, so an unregistered owner gets its own workflows deleted on every boot, racing its installs.

## Index naming

`.kibana-investigation-proposals` is permanent. `.kibana*` is already granted to the `kibana_system` role, so the index needs no Elasticsearch-side system index registration — a dedicated prefix such as `.investigation-proposals` would. `anonymization` ships `.kibana-anonymization-profiles` on the same reasoning. Each entity gets its own index rather than one index discriminated by a type field.

## Manual verification

The point of the exercise is the identity behaviour: a rule created by an approved action should be attributed to the **approving analyst**, not to whoever started the Worker. When a workflow parked on `waitForApproval` is resumed through the in-Kibana resume path, the engine schedules a fresh task with an API key granted on the resumer's behalf, and that identity propagates into child workflows.

**Prerequisites** — all four are load-bearing, and the identity behaviour degrades silently without them:

- **This plugin enabled** (`xpack.agenticInvestigations.enabled: true`). It is **off by default**, so without this the routes 404 and AlertZero's proposals panel renders its load error rather than a queue.
- **Security enabled.** With security off no API key is stored, the resume task gets no fake request, and the resume fails outright.
- **Encrypted Saved Objects configured** (`xpack.encryptedSavedObjects.encryptionKey`). Scheduling a task with an API key throws without it.
- **API keys enabled** in Elasticsearch.

**Privileges on the approving user:**

- `all` on **Proposed Actions** — to decide.
- Security → **Rules** `all` (`rules-all`) — the rule is created under *their* credentials. Worth exercising deliberately: an approver **without** it should see the proposal reach `failed`, not `succeeded`. That failure is the model working as designed.
- `workflowsManagement` execute — the resume route rides on `execute` until step-level privileges land ([#19134](https://github.com/elastic/security-team/issues/19134)).

**Steps:**

1. Start Kibana. On start this plugin installs `system-create-investigation-proposal` globally, and `alertzero` installs `system-alertzero-action-create-rule` and `system-alertzero-action-edit-rule`. Confirm all three appear in Workflows management, and that the log contains no `orphan_cleanup` deletion for them.
2. Trigger the gate workflow directly with `conversationId`, `actionWorkflowId: system-alertzero-action-create-rule`, and an `actionInput` carrying `name`, `description`, `query` and `index`.
3. Confirm the record: `GET .kibana-investigation-proposals/_search` should show `status: pending`, `category: tune`, the `actionWorkflowId`, and a `workflowExecutionId` pointing at a gate execution that is `waiting_for_input`.
4. Approve from the AlertZero app (`/app/alertzero`) — under "Awaiting your decision" on the landing page, or the investigation's Proposals tab.
5. Assert the outcome: the proposal reaches `succeeded`; a **disabled** rule with that name exists (`security.createRule` always creates rules disabled); **`created_by` on the rule is the approver**, not whoever triggered the gate; and the `waitForApproval` step execution carries `hitl.respondedBy`.
6. Repeat in a non-default space. Space scoping is invisible in `default`: every query filters on `spaceId`, and a missing filter would only show up elsewhere.

**Also worth exercising:** dismissal with a reason (reaches `dismissed`, records `dismissReason` and `rationale`, creates no rule); first-actor-wins (approve from two sessions at once — one `200`, one `409`, action runs once); a gate timeout (shorten the gate timeout and let it expire — the workflow-level `on-failure` should move the proposal to `dismissed`, not `failed`); and a non-action proposal created through the API with a `comment` and no `actionWorkflowId`, which should terminate at `approved` without executing anything.

## Known limitations

- **Deep paging stops at 10,000.** The list pages with `from`/`size` inside Elasticsearch's default result window. Going past that needs `search_after`, which the list does not expose yet.
- **`.kibana-*` index naming** buys us out of a system index registration, at the cost of living in a namespace we do not own.
- **No Scout API coverage yet.** The HTTP surface is covered by Jest only, as `anonymization` shipped.
- **Only one entity so far.** The directory convention is designed for investigations and incidents, but neither exists yet, so the umbrella's seams are unproven.
