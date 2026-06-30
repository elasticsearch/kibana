# Rule Executor

> **Prerequisite:** Read the [server-level README](../../README.md) first for the plugin-wide architecture and terminology.

The rule executor is the hot path for alerting v2. It runs one rule on its Task Manager schedule, executes ES|QL, converts rows into rule events, enriches alert rules with episode state, and persists the final append-only documents into `.rule-events`.

See also: [Director](../director/README.md) and [Dispatcher](../dispatcher/README.md).

## What the rule executor owns

- Running one rule execution from start to finish
- Building the ES|QL request from rule configuration
- Streaming result rows through the execution pipeline
- Materializing breach / recovery rule events
- Invoking the director for alert rules
- Writing rule events to `.rule-events`

## What the rule executor does not own

- Notification matching or dispatch
- Policy throttling / suppression
- Long-lived alert action history

Those responsibilities belong to the dispatcher.

## Signal vs alert rules

Rules declare a `kind` of `signal` or `alert`.

- `signal` rules are observation-only. They produce rule events but skip episode lifecycle and dispatcher processing.
- `alert` rules participate in recovery semantics, episode lifecycle enrichment, and downstream notification dispatch.

That split is the most important branch in the executor.

## Architecture

The executor combines three mechanisms:

- **steps** for domain work
- **middleware** for global cross-cutting concerns
- **decorators** for step-specific wrapping when needed

```text
Task Manager
   |
   v
RuleExecutorTaskRunner
   |
   v
RuleExecutionPipeline
   |
   +--> middleware chain wraps each step
   |
   +--> CheckEngineEnabledStep
   +--> WaitForResourcesStep
   +--> FetchRuleStep
   +--> ValidateRuleStep
   +--> ExecuteRuleQueryStep
   +--> CreateAlertEventsStep
   +--> CreateRecoveryEventsStep
   +--> CreateNoDataEventsStep
   +--> DirectorStep
   +--> StoreAlertEventsStep
```

## The most important design detail: streaming

The executor pipeline is streaming. `ExecuteRuleQueryStep` may emit multiple result batches, and downstream steps see each batch as it flows through the pipeline.

That means:

- later steps must tolerate multiple `continue` emissions for one logical execution
- `esqlRowBatch` and `alertEventsBatch` are per-batch, not global full-run accumulators
- a step must not assume it will be called exactly once per rule run

If you are adding a new step after `ExecuteRuleQueryStep`, design it with batch semantics in mind.

## How one execution works

Each run starts with Task Manager task params:

- `ruleId`
- `spaceId`
- schedule metadata

`RuleExecutorTaskRunner` turns that into `RuleExecutionInput` with:

- `ruleId`
- `spaceId`
- `scheduledAt`
- `executionContext` for cancellation and scoped cleanup

`RuleExecutionPipeline` then:

1. creates initial pipeline state
2. wraps every step with the middleware chain
3. streams state through the ordered steps
4. halts early on domain reasons when appropriate
5. refreshes `.rule-events` after the stream completes so freshly written documents become searchable

## Rule configuration

Rules are saved objects. Relevant attributes include:

- `kind`
- `metadata`
- `schedule`
- `query` — the new nested shape (see below)
- `grouping`
- `state_transition`
- server-managed flags such as `enabled`

The persisted shape lives in `saved_objects/schemas/rule_saved_object_attributes/`. API schemas live in `@kbn/alerting-v2-schemas`.

### Query shape

`query` is a discriminated union on `format`:

- `format: 'composed'` — `base` ES\|QL plus pipe-less segments for each phase.
- `format: 'standalone'` — independent ES\|QL queries for each phase.

In both formats the `breach` sub-object is required; the `recovery` sub-object is optional. Recovery and no-data behaviour are now controlled by **top-level rule fields** rather than fields nested inside `query`:

| Sub-object | Required? | Behavior |
| --- | --- | --- |
| `breach` | Yes | The breach query (composed: `segment`; standalone: `query`). Produces breached events on matching rows. |
| `recovery` | Optional | The recovery query payload only. Present when `recovery_strategy` is `'query'` and holds the leaf field: `segment` for composed, `query` for standalone. No `strategy` field — that is the top-level `recovery_strategy`. |
| `no_data` | Optional (standalone only) | Data-presence query. Present when `no_data_strategy` is not `'none'`. Composed queries do not have a `no_data` block. |

Top-level strategy fields (sit alongside `query` on the rule, not inside it):

| Top-level field | Values | Meaning |
| --- | --- | --- |
| `recovery_strategy` | `'no_breach'` \| `'query'` \| `'none'` | How the executor detects recovery. `'none'` disables recovery entirely. |
| `no_data_strategy` | `'emit'` \| `'last_known_status'` \| `'recover'` \| `'none'` | How the executor reacts when an active group is absent from the breach batch and the `no_data` query reports no data. See [No-data behavior](#no-data-behavior). |

## Operational parameters

| Parameter | Value | Source |
| --- | --- | --- |
| Task type | `alerting_v2:rule_executor` | [`task_definition.ts`](task_definition.ts) |
| Task timeout | `5m` | [`task_definition.ts`](task_definition.ts) |
| Schedule | Per rule | [`schedule.ts`](schedule.ts) |

## Pipeline state

`RulePipelineState` in `types.ts` is the data contract between steps.

| Field | Produced by | Meaning |
| --- | --- | --- |
| `input` | Pipeline / task runner | Rule id, space id, schedule, and execution context. |
| `rule` | `FetchRuleStep` | Current rule document. |
| `queryPayload` | `ExecuteRuleQueryStep` | ES\|QL query/filter/params for the current run. |
| `esqlRowBatch` | `ExecuteRuleQueryStep` | One streamed batch of ES\|QL rows. |
| `alertEventsBatch` | Event-creation steps and director | Materialized rule events for the current batch. |

## Execution steps

Step order is defined in `setup/bind_rule_executor.ts`.

| # | Step | Responsibility |
| --- | --- | --- |
| 1 | `CheckEngineEnabledStep` | Halt before any work when the `alerting:v2:enabled` advanced setting is off. |
| 2 | `WaitForResourcesStep` | Ensure required Elasticsearch resources exist before doing work. |
| 3 | `FetchRuleStep` | Load the current rule saved object. |
| 4 | `ValidateRuleStep` | Halt early if the rule cannot run, for example because it is disabled. |
| 5 | `ExecuteRuleQueryStep` | Build and run ES\|QL, emitting streamed row batches. |
| 6 | `CreateAlertEventsStep` | Turn a row batch into breached rule events. |
| 7 | `CreateRecoveryEventsStep` | Append recovery events for alert rules when configured. |
| 8 | `CreateNoDataEventsStep` | Apply `no_data_strategy` for alert rules: emit `no_data` events, force recovery, or leave the batch alone based on a data-presence check. |
| 9 | `DirectorStep` | Enrich alert-type events with episode state. |
| 10 | `StoreAlertEventsStep` | Persist the final batch into `.rule-events`. |

## Recovery behavior

Recovery is implemented in `CreateRecoveryEventsStep` after `CreateAlertEventsStep`, so the current batch already contains breach documents when recovery logic runs.

Recovery only applies to `kind: alert` rules and is optional. A rule with `recovery_strategy: 'none'` (or no `recovery_strategy`) never emits recovery events.

### `no_breach` recovery

Selected when `recovery_strategy === 'no_breach'`. The executor:

1. queries `.rule-events` for group hashes that still have non-inactive episode state
2. compares that active set to the current breach batch
3. emits one recovered event for each active group missing from the current breached set

No `query.recovery` block is needed for this mode.

### `query` recovery

Selected when `recovery_strategy === 'query'`. The executor runs the configured recovery query — composed `base` + `query.recovery.segment`, or standalone `query.recovery.query` — and only emits recovery events for rows whose computed `group_hash` matches the active set.

### Summary

| `recovery_strategy` | Recovery is emitted when |
| --- | --- |
| absent / `'none'` | Never. The executor skips the active-group lookup entirely. |
| `'no_breach'` | An active group is absent from the current breach batch. |
| `'query'` | A recovery query row matches a currently active group. |

Recovered documents are appended to `alertEventsBatch` before `DirectorStep` and storage.

## No-data behavior

No-data handling lives in `CreateNoDataEventsStep`, which runs after `CreateRecoveryEventsStep` and post-processes the events recovery emitted. It only runs for `kind: alert` rules.

Recovery answers "the group is absent from breach, was it because the group recovered?" The no-data step then asks the follow-up: "or was it because the group has no data at all?" — and rewrites the batch accordingly.

### How it classifies absent groups

For each active group missing from the current breach batch, the executor runs a data-presence query and partitions:

1. Standalone rules use the configured `query.no_data` block as the data-presence query. The API schema requires this block whenever `no_data_strategy` is not `'none'`.
2. Composed rules use `base` as the data-presence query — `breach.segment` is what filters `base` down to breaching rows, so any group that appears in `base` results has data.
3. Groups present in the data-presence result make up the **data-present partition**. Groups absent from it make up the **no-data partition**.

The step also keeps a defensive runtime skip if no data-presence query is available — this only protects against stale saved objects that pre-date the schema constraint or non-API write paths.

### Recovery takes priority

If the recovery step already emitted a `recovered` event for a group, the no-data step leaves that event intact regardless of the `no_data_strategy`. Only groups **without** an upstream recovered event receive a `no_data` event.

### `no_data_strategy` outcomes (no-data partition)

The executor emits a `no_data` rule event; the director's FSM consumes it and decides the next episode status based on the strategy.

| `no_data_strategy` | Rule event the step writes | Episode status the FSM lands on |
| --- | --- | --- |
| `'emit'` | Append a `no_data` event (groups that already have a `recovered` event are skipped — recovery takes priority). | Set the episode to `'active'` so downstream consumers (dispatcher, actions) keep treating the group as live during the data gap. |
| `'last_known_status'` | Same as `'emit'` — append a `no_data` event for groups without an upstream `recovered` event. | Preserves the prior episode status (e.g. an `active` episode stays `active`). |
| `'recover'` | Append a `no_data` event for groups without an upstream `recovered` event. The director applies the same FSM transitions as a `recovered` event would. | Follows the recovery transitions — the episode moves toward `inactive` via the normal lifecycle. |
| `'none'` | No-op. The recovery step's output stands. When `recovery_strategy` is also `'none'`, no event is written for this group and the episode drifts out of lookback windows over time. | n/a (no event is produced). |

The `no_data_strategy` branch lives in `BasicTransitionStrategy.getNextState`. There is no `'no_data'` episode status; the FSM sets the episode to `'active'` for `'emit'`, preserves the prior status for `'last_known_status'`, and mirrors the `'recovered'` FSM transitions for `'recover'`.

### Data-present partition

When the no-data query reports the group as still having data, the no-data step is a no-op regardless of the `recovery_strategy`. If recovery already emitted a `recovered` event for that group it passes through unchanged; if recovery did not fire (e.g. the recovery query did not match), no additional event is written. The episode drifts out of lookback windows over time if neither breach nor recovery fires — this is the documented trade-off of using a narrow recovery query.

### Summary

| `no_data_strategy` | What the step writes |
| --- | --- |
| absent / `'none'` | Nothing. The step is a no-op apart from the active-groups lookup, which is also skipped when both strategies are off. |
| `'emit'` | One `no_data` event per active-but-absent group with no data and no upstream `recovered` event. The FSM sets the episode to `'active'`. |
| `'last_known_status'` | One `no_data` event per active-but-absent group with no data and no upstream `recovered` event. The FSM preserves the prior episode status. |
| `'recover'` | One `no_data` event per active-but-absent group with no data and no upstream `recovered` event. The director FSM drives the episode toward recovery (`active → recovering → inactive`). |

## Severity behavior

Severity is a best-effort enrichment applied when the executor materializes
breached rule events in `CreateAlertEventsStep`.

The framework supports the following fixed severity values:

- `info`
- `low`
- `medium`
- `high`
- `critical`

Rules do **not** define arbitrary framework severities. Instead, the rule's
ES\|QL query is expected to map source data into one of the supported values and
emit that result as a `severity` column.

### How extraction works

For each breached ES\|QL row, the executor:

1. Looks for a `severity` column in the row payload returned by the ES\QL query.
2. Skips enrichment if the value is not a string.
3. Lowercases the string value.
4. Checks whether the normalized value matches the fixed supported set.
5. If it matches, writes it to the top-level event field `severity`.
6. If it does not match, leaves the top-level field unset.

### Important constraints

- Severity is only considered for `breached` events.
- `recovered` events do not carry severity.
- The original ES\|QL row is still stored in `data`, so `data.severity`
  is preserved even when the top-level `severity` field is absent or normalized.
- Unsupported values never fail the rule execution.

## Halt reasons

`HaltReason` is defined in `types.ts`.

| Reason | Meaning |
| --- | --- |
| `rule_deleted` | The saved object no longer exists. |
| `rule_disabled` | The rule is present but disabled. |
| `engine_disabled` | The `alerting:v2:enabled` advanced setting is off. Task state is preserved so execution resumes when it is turned back on. |
| `state_not_ready` | A step ran without required upstream state. Usually indicates ordering or stream wiring misuse. |

## Middleware vs decorators

| Mechanism | Use it for | Current examples |
| --- | --- | --- |
| Middleware | Global cross-cutting behavior for every step | cancellation, APM, error handling |
| Decorators | Optional wrapping for selected steps | step-specific extensions without changing middleware scope |

Choose the smallest tool that matches the concern.

## When to add a new step

Add a step when you need a new domain phase in the rule execution pipeline, especially if it:

- introduces a new piece of pipeline state
- needs to happen in a precise order relative to recovery or storage
- should remain understandable as a standalone unit of work

Do **not** add a step when:

- the logic is really global middleware
- the logic belongs inside the director
- the logic is only about notifications after events are written

## Creating a new rule executor step

### Step 1: Create the step class

```typescript
import { inject, injectable } from 'inversify';
import type { PipelineStateStream, RuleExecutionStep } from '../types';
import { mapStep, requireState } from '../stream_utils';
import type { RuleResponse } from '../../rules_client';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';

@injectable()
export class MyNewStep implements RuleExecutionStep {
  public readonly name = 'my_new_step';

  constructor(
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract
  ) {}

  public executeStream(input: PipelineStateStream): PipelineStateStream {
    return mapStep(input, async (state) => {
      const requiredState = requireState(state, ['rule']);

      if (!requiredState.ok) {
        this.logger.debug({ message: `[${this.name}] State not ready, halting` });
        return requiredState.result;
      }

      const { rule } = requiredState.state;
      const myResult = await this.doSomething(rule);

      return {
        type: 'continue',
        state: { ...requiredState.state, myNewField: myResult },
      };
    });
  }

  private async doSomething(_rule: RuleResponse): Promise<Record<string, unknown>> {
    return {};
  }
}
```

### Step 2: Extend pipeline state if needed

```typescript
export interface RulePipelineState {
  readonly input: RuleExecutionInput;
  readonly rule?: RuleResponse;
  readonly queryPayload?: QueryPayload;
  readonly esqlRowBatch?: ReadonlyArray<Record<string, unknown>>;
  readonly alertEventsBatch?: ReadonlyArray<AlertEvent>;
  readonly myNewField?: Record<string, unknown>;
}
```

### Step 3: Export and bind it in order

Add the export to `steps/index.ts`, then register it in `setup/bind_rule_executor.ts`.

```typescript
bind(RuleExecutionStepsToken).to(CheckEngineEnabledStep).inSingletonScope();
bind(RuleExecutionStepsToken).to(WaitForResourcesStep).inSingletonScope();
bind(RuleExecutionStepsToken).to(FetchRuleStep).inRequestScope();
bind(RuleExecutionStepsToken).to(ValidateRuleStep).inSingletonScope();
bind(RuleExecutionStepsToken).to(ExecuteRuleQueryStep).inRequestScope();
bind(RuleExecutionStepsToken).to(CreateAlertEventsStep).inSingletonScope();
bind(RuleExecutionStepsToken).to(MyNewStep).inSingletonScope();
bind(RuleExecutionStepsToken).to(CreateRecoveryEventsStep).inRequestScope();
bind(RuleExecutionStepsToken).to(CreateNoDataEventsStep).inRequestScope();
bind(RuleExecutionStepsToken).to(DirectorStep).inSingletonScope();
bind(RuleExecutionStepsToken).to(StoreAlertEventsStep).inSingletonScope();
```

Binding order is execution order. Match neighboring scope conventions unless you have a clear reason not to.

### Step 4: Add focused tests

```typescript
import { MyNewStep } from './my_new_step';
import {
  collectStreamResults,
  createPipelineStream,
  createRuleExecutionInput,
  createRuleResponse,
} from '../test_utils';
import { createLoggerService } from '../../services/logger_service/logger_service.mock';

describe('MyNewStep', () => {
  it('continues with data when successful', async () => {
    const { loggerService } = createLoggerService();
    const step = new MyNewStep(loggerService);

    const stream = step.executeStream(
      createPipelineStream([
        {
          input: createRuleExecutionInput(),
          rule: createRuleResponse(),
        },
      ])
    );

    const [result] = await collectStreamResults(stream);

    expect(result.type).toBe('continue');
    expect(result.state).toHaveProperty('myNewField');
  });
});
```

## Creating new middleware

Middleware is the right extension point for global concerns like tracing, timing, or cancellation-aware instrumentation.

```typescript
import { inject, injectable } from 'inversify';
import type { RuleExecutionMiddlewareContext, RuleExecutionMiddleware } from './types';
import type { PipelineStateStream } from '../types';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';

@injectable()
export class PerformanceMiddleware implements RuleExecutionMiddleware {
  public readonly name = 'performance';

  constructor(
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract
  ) {}

  public execute(
    ctx: RuleExecutionMiddlewareContext,
    next: (input: PipelineStateStream) => PipelineStateStream,
    input: PipelineStateStream
  ): PipelineStateStream {
    const stream = next(input);
    const logger = this.logger;

    return (async function* () {
      const start = performance.now();
      try {
        for await (const result of stream) {
          yield result;
        }
      } finally {
        logger.debug({
          message: `Step [${ctx.step.name}] took ${performance.now() - start}ms`,
        });
      }
    })();
  }
}
```

Register middleware in `setup/bind_rule_executor.ts` on `RuleExecutionMiddlewaresToken`. Binding order defines wrapping order.

## Current middleware

| Middleware | Purpose |
| --- | --- |
| `CancellationBoundaryMiddleware` | Cooperative cancellation / abort handling |
| `ApmMiddleware` | APM spans around step execution |
| `ErrorHandlingMiddleware` | Centralized logging for step failures |

## Testing guidance

Useful coverage points:

- `steps/*.test.ts` for step-local logic
- `execution_pipeline.test.ts` for pipeline ordering and halt semantics
- middleware tests for cross-cutting behavior
- `build_alert_events.test.ts`, `queries.test.ts`, and related helpers for event/query correctness

## Safe contribution guidelines

- Preserve the streaming contract. That is the easiest place to introduce subtle bugs.
- Prefer `requireState(...)` and explicit halts over assuming a field exists.
- Keep rule execution focused on event production. If a change is really about lifecycle transitions, move toward the director. If it is really about notifications, move toward the dispatcher.
- If you change stored event shape, verify the resources schema and downstream readers together.