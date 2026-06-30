# `workflow_service/`

Thin server-side adapter from `alerting_v2` into [`workflows_extensions`](../../../../../../../src/platform/plugins/shared/workflows_extensions).

This folder exposes one service, `WorkflowService`, whose job is narrowly scoped:

- resolve a workflows client from a caller-provided `KibanaRequest`
- forward a `(triggerId, payload)` pair to that client
- keep alerting-side code ignorant of `workflows_extensions` client details

It does **not** own trigger definitions, event subscription, or payload mapping.

## Scope and lifecycle

`WorkflowService` is a **singleton class** with a **request-bound method contract**:

- the class instance is singleton-scoped in DI
- each call to `emitEvent()` is keyed on the `KibanaRequest` passed by the caller
- the service holds no per-request state between calls

That distinction matters: this is not a request-scoped service instance. It is a stateless singleton adapter whose `emitEvent()` calls run in the auth context of the supplied request.

Today the main callers are the singleton workflow subscribers (`AlertActionWorkflowSubscriber`, `RuleWorkflowSubscriber`), which receive `{ request }` from the event bus context and forward it here.

## Where it sits in the flow

For alert-action events, the end-to-end flow is:

1. `AlertActionEventPublisher` publishes an alerting domain event together with `{ request }`.
2. `AlertActionWorkflowSubscriber` receives the event, selects the matching trigger binding, and builds the workflow payload.
3. `WorkflowService.emitEvent(request, triggerId, payload)` resolves a workflows client for that request and emits the trigger.

For rule-lifecycle events (create, update, delete, enable, disable):

1. `RuleEventPublisher` publishes a `rule.*` domain event together with `{ request }`.
2. `RuleWorkflowSubscriber` receives the event, selects the matching trigger binding, and maps the payload.
3. `WorkflowService.emitEvent(request, triggerId, payload)` emits the workflow trigger.

Trigger registration is handled separately during setup by [`register_trigger_definitions.ts`](../../workflow_extensions/register_trigger_definitions.ts), using the same trigger catalog the subscriber uses at runtime.

## When to use it

Use `WorkflowService` whenever code in `alerting_v2` has already decided:

- which workflow trigger id should be emitted
- what payload should be sent
- under which auth identity the workflow should run

Typical usage:

```ts
@injectable()
class SomeSubscriber {
  constructor(@inject(WorkflowServiceToken) private readonly workflows: WorkflowServiceContract) {}

  async onEvent(event: SomeDomainEvent, ctx: { request: KibanaRequest }) {
    await this.workflows.emitEvent(ctx.request, 'alerting_v2.some-trigger', {
      ...payload,
    });
  }
}
```

`emitEvent()` takes:

- `request`: the auth and space context to run under
- `triggerId`: the workflows trigger id, for example `alertingV2.episodeAssigned`
- `payload`: a plain object that must conform to the trigger's registered Zod schema

If workflows is unavailable for that request, the service logs a debug message and drops the emit.

## Auth model

The request is required because the workflows execution path derives critical metadata from it:

- active space resolution
- event-chain / cycle-guard context
- `authenticatedUser` metadata on the workflow execution document
- the API-key grant used when matched workflows are scheduled through Task Manager

Because of that, the choice of auth identity must stay explicit at the call site.

- If the caller is handling a real user request, pass that user's `KibanaRequest`.
- If the caller is a singleton background task or other non-HTTP flow, synthesise a system request at the call site and pass that.

Do **not** hide a default system-user fallback inside `WorkflowService`. If the service silently chose the system identity when a real user identity was available, it would make audit and privilege behaviour harder to reason about.

The event envelope may also carry alerting-specific metadata such as `actorUid`. That is complementary to the request and does not replace it. The request controls the auth context under which workflows runs.

## Adding a new trigger

This folder does not own the trigger catalog. New workflow triggers are added under the relevant subscriber catalog:

- Alert actions: [`server/lib/events/alert_action_workflow_subscriber/triggers/`](../../events/alert_action_workflow_subscriber/triggers/)
- Rule lifecycle: [`server/lib/events/rule_workflow_subscriber/triggers/`](../../events/rule_workflow_subscriber/triggers/)

Each catalog is the single source of truth used by both:

- [`register_trigger_definitions.ts`](../../workflow_extensions/register_trigger_definitions.ts) during setup
- The corresponding workflow subscriber during runtime dispatch

See the catalog JSDoc in each `triggers/index.ts` for the exact add-a-trigger workflow.
