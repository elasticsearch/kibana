/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  EsWorkflowExecution,
  EsWorkflowStepExecution,
  WorkflowTokenUsage,
} from '@kbn/workflows';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import { sumTokenUsage } from '../utils';

/** Context for the step that failed during this run; used to build workflow_execution_failed event. */
export interface FailedStepContext {
  stepId: string;
  stepName: string;
  stepExecutionId: string;
}

/**
 * Step-execution metadata held by `WorkflowExecutionState`. Excludes
 * `input` / `output` — those live in `StepIoService` and are merged in only
 * at flush time. Callers that need IO must go through the service.
 */
export type StepExecutionMetadata = Omit<EsWorkflowStepExecution, 'input' | 'output'>;

/**
 * Narrow shape required by `createStep`: `id` is mandatory at creation time;
 * `stepId` is *expected* but historically allowed to be undefined (status-only
 * seed writes that fill it in on a later upsert). `input` / `output` are
 * deliberately rejected — IO writes go through `StepIoService.setStepInput`
 * / `setStepOutput`, never through `state.upsertStep`.
 */
type CreateStepInput = Omit<Partial<EsWorkflowStepExecution>, 'input' | 'output'> &
  Pick<EsWorkflowStepExecution, 'id'>;

/**
 * Narrow view of `WorkflowExecutionState` used by `StepIoService`. Implemented
 * structurally via `Pick<WorkflowExecutionState, …>` rather than a separate
 * interface — the boundary is enforced by the type but costs nothing at
 * runtime (no closure bag, no extra allocation per state instance). State
 * still has no dependency on the IO layer.
 *
 * Surfaces metadata reads, workflow-level reads, and the lifecycle
 * change-tracking primitives that the service merges with its own IO
 * partials at flush time. IO storage and ES persistence (bulk upsert /
 * mget) belong to the service.
 */
export type StepIoStateAccessor = Pick<
  WorkflowExecutionState,
  | 'getStepExecution'
  | 'getLatestStepExecution'
  | 'getAllStepExecutions'
  | 'getStepExecutionIdsByStepId'
  | 'getWorkflowExecutionStatus'
  | 'getWorkflowExecutionId'
  | 'getWorkflowExecutionScopeStack'
  | 'getWorkflowExecutionStepExecutionIds'
  | 'drainPendingStepChanges'
  | 'ingestLoadedStepDocs'
  | 'flushWorkflowDoc'
>;

/**
 * In-memory step/workflow document store with deferred ES persistence.
 *
 * Owns step *metadata* (status, scopeStack, error, indices, etc.) and the
 * workflow-level document. **Does not own `input` / `output`** — those live
 * in `StepIoService`, which:
 *   - holds the canonical IO maps,
 *   - drives the step-execution bulk-upsert (merging state's lifecycle
 *     partials with its own IO partials),
 *   - owns eviction / rehydration.
 *
 * The dependency is strictly one-way: state → workflowExecutionRepository;
 * service → state (via the structural `StepIoStateAccessor` type) and
 * stepExecutionRepository.
 */
export class WorkflowExecutionState {
  private stepExecutions: Map<string, StepExecutionMetadata> = new Map();
  private workflowExecution: EsWorkflowExecution;
  private workflowDocumentChanges: Partial<EsWorkflowExecution> | undefined = undefined;
  private stepDocumentsChanges: Map<string, Partial<StepExecutionMetadata>> = new Map();

  private lastFailedStepContext: FailedStepContext | undefined = undefined;

  /**
   * Maps step IDs to their execution IDs in chronological order. Enables
   * efficient lookup of all executions for a step that runs multiple times
   * (loops, retries).
   */
  private stepIdExecutionIdIndex = new Map<string, string[]>();

  constructor(
    initialWorkflowExecution: EsWorkflowExecution,
    private workflowExecutionRepository: WorkflowExecutionRepository
  ) {
    this.workflowExecution = initialWorkflowExecution;
  }

  public getWorkflowExecution(): EsWorkflowExecution {
    return this.workflowExecution;
  }

  public getWorkflowExecutionStatus(): EsWorkflowExecution['status'] {
    return this.workflowExecution.status;
  }

  public getWorkflowExecutionId(): string {
    return this.workflowExecution.id;
  }

  public getWorkflowExecutionScopeStack(): EsWorkflowExecution['scopeStack'] {
    return this.workflowExecution.scopeStack;
  }

  public getWorkflowExecutionStepExecutionIds(): string[] | undefined {
    return this.workflowExecution.stepExecutionIds;
  }

  public getStepExecutionIdsByStepId(stepId: string): ReadonlyArray<string> | undefined {
    return this.stepIdExecutionIdIndex.get(stepId);
  }

  public setLastFailedStepContext(ctx: FailedStepContext): void {
    this.lastFailedStepContext = ctx;
  }

  public getLastFailedStepContext(): FailedStepContext | undefined {
    return this.lastFailedStepContext;
  }

  public updateWorkflowExecution(workflowExecution: Partial<EsWorkflowExecution>): void {
    this.workflowExecution = {
      ...this.workflowExecution,
      ...workflowExecution,
    };
    this.workflowDocumentChanges = {
      ...(this.workflowDocumentChanges || {}),
      ...workflowExecution,
    };
  }

  /**
   * Accumulates a step's normalized token usage into the per-execution total.
   * Called once per token-consuming step as it finishes (success or failure
   * with partial counts). The new total is written through
   * `updateWorkflowExecution`, so it is included in the next workflow-doc
   * flush and persisted to `.workflows-executions`. No-op when `usage` is
   * absent, so executions with zero `ai.*` steps keep `usage` unset.
   */
  public accumulateUsage(usage: WorkflowTokenUsage | undefined): void {
    if (!usage) {
      return;
    }
    const accumulated = sumTokenUsage(this.workflowExecution.usage, usage);
    if (accumulated) {
      this.updateWorkflowExecution({ usage: accumulated });
    }
  }

  public getAllStepExecutions(): StepExecutionMetadata[] {
    return Array.from(this.stepExecutions.values());
  }

  public getStepExecution(stepExecutionId: string): StepExecutionMetadata | undefined {
    return this.stepExecutions.get(stepExecutionId);
  }

  /**
   * Retrieves all executions for a workflow step in chronological order.
   * Returns `[]` when the step has not executed yet.
   *
   * Skips IDs missing from the canonical map (rather than asserting them
   * with a cast). The index and the canonical map are kept in sync by
   * `createStep` / `buildStepIdExecutionIdIndex`, but a defensive skip
   * keeps a future bug from surfacing as a downstream `undefined`.
   */
  public getStepExecutionsByStepId(stepId: string): StepExecutionMetadata[] {
    const executionIds = this.stepIdExecutionIdIndex.get(stepId);
    if (!executionIds?.length) {
      return [];
    }
    const result: StepExecutionMetadata[] = [];
    for (const executionId of executionIds) {
      const exec = this.stepExecutions.get(executionId);
      if (exec) result.push(exec);
    }
    return result;
  }

  public getLatestStepExecution(stepId: string): StepExecutionMetadata | undefined {
    const allExecutions = this.getStepExecutionsByStepId(stepId);
    return allExecutions.length ? allExecutions[allExecutions.length - 1] : undefined;
  }

  /**
   * Records a step-metadata change. `input` / `output` are *not* permitted
   * here — those flow through `StepIoService.setStepInput` /
   * `setStepOutput`. The compile-time `Omit` already excludes them; this
   * runtime guard catches stray callers that bypass typing via casts.
   */
  public upsertStep(step: Partial<StepExecutionMetadata>): void {
    if (!step.id) {
      throw new Error('WorkflowExecutionState: Step execution must have an ID to be upserted');
    }
    if ('input' in step || 'output' in step) {
      throw new Error(
        'WorkflowExecutionState: input/output writes must go through StepIoService, not upsertStep'
      );
    }

    if (this.stepExecutions.has(step.id)) {
      this.updateStep(step.id, step);
      return;
    }

    this.createStep({ ...step, id: step.id });
  }

  // ----- ES persistence primitives -----------------------------------------

  /**
   * Drains pending step-document changes. Returns a `Map<id, partial>` whose
   * values are pure metadata (no `input` / `output`). The caller (the IO
   * service) merges this with its own IO partials and runs the combined
   * `bulkUpsert`. Returns an empty map when nothing is pending.
   */
  public drainPendingStepChanges(): Map<string, Partial<StepExecutionMetadata>> {
    if (!this.stepDocumentsChanges.size) {
      return new Map();
    }
    const drained = this.stepDocumentsChanges;
    this.stepDocumentsChanges = new Map();
    return drained;
  }

  /**
   * Ingests step docs loaded from ES at resume time. The caller (the IO
   * service) is responsible for stripping `output` (and ingesting it into
   * its own IO map for pinned step types). State stores the metadata only.
   */
  public ingestLoadedStepDocs(steps: ReadonlyArray<StepExecutionMetadata>): void {
    for (const step of steps) {
      this.stepExecutions.set(step.id, step);
    }
    this.buildStepIdExecutionIdIndex();
  }

  public async flushWorkflowDoc(): Promise<void> {
    if (!this.workflowDocumentChanges) {
      return;
    }
    const changes = this.workflowDocumentChanges;
    this.workflowDocumentChanges = undefined;

    await this.workflowExecutionRepository.updateWorkflowExecution({
      ...changes,
      id: this.workflowExecution.id,
    });
  }

  private createStep(step: CreateStepInput) {
    const { id, stepId } = step;
    // Index entry is keyed by stepId — only register when we actually have
    // one (a partial seed write may not). The index is rebuilt on resume.
    let previousExecutionCount = 0;
    if (stepId) {
      let executionIds = this.stepIdExecutionIdIndex.get(stepId);
      previousExecutionCount = executionIds?.length ?? 0;
      if (!executionIds) {
        executionIds = [];
        this.stepIdExecutionIdIndex.set(stepId, executionIds);
      }
      executionIds.push(id);
    }

    // `scopeStack` is required on the doc; default to an empty array so we
    // never write `undefined` into ES (callers in the engine always supply
    // it, but this guards against a future Partial caller).
    //
    // The cast is intentional: `EsWorkflowStepExecution` requires
    // `status` / `startedAt` / `topologicalIndex`, but a minimal "create
    // shell" call (e.g. just to seed `state`) may not have them. Those
    // fields are populated on the next `updateStep`, and ES partial-update
    // semantics tolerate missing fields on doc_as_upsert.
    const newStep = {
      ...step,
      id,
      scopeStack: step.scopeStack ?? [],
      globalExecutionIndex: this.stepExecutions.size,
      stepExecutionIndex: previousExecutionCount,
      workflowRunId: this.workflowExecution.id,
      workflowId: this.workflowExecution.workflowId,
      spaceId: this.workflowExecution.spaceId,
      isTestRun: Boolean(this.workflowExecution.isTestRun),
    } as StepExecutionMetadata;
    this.stepExecutions.set(id, newStep);
    this.stepDocumentsChanges.set(id, newStep);
    // Execution and flushes are synchronous, so an incremental update here
    // preserves the global execution order without depending on what was
    // loaded by the resume task.
    this.updateWorkflowExecution({
      stepExecutionIds: [...(this.workflowExecution.stepExecutionIds || []), id],
    });
  }

  private updateStep(stepId: string, step: Partial<StepExecutionMetadata>) {
    const existingStep = this.stepExecutions.get(stepId);
    if (!existingStep) {
      // upsertStep already routed us through createStep when the step was
      // missing — reaching this branch with no existing step is a logic bug.
      throw new Error(`WorkflowExecutionState: updateStep called for ${stepId} but no step exists`);
    }
    const updatedStep: StepExecutionMetadata = {
      ...existingStep,
      ...step,
    };
    this.stepExecutions.set(stepId, updatedStep);
    // Accumulate changes for the next flush — merge with any pending changes.
    // ES partial update (doc_as_upsert) preserves fields not included.
    this.stepDocumentsChanges.set(stepId, {
      ...(this.stepDocumentsChanges.get(stepId) || {}),
      ...step,
    });
  }

  private buildStepIdExecutionIdIndex(): void {
    this.stepIdExecutionIdIndex.clear();
    for (const step of this.stepExecutions.values()) {
      let idsList = this.stepIdExecutionIdIndex.get(step.stepId);
      if (!idsList) {
        idsList = [];
        this.stepIdExecutionIdIndex.set(step.stepId, idsList);
      }
      idsList.push(step.id);
    }
    for (const [stepId, stepExecutionIds] of this.stepIdExecutionIdIndex.entries()) {
      this.stepIdExecutionIdIndex.set(
        stepId,
        stepExecutionIds.sort((a, b) => {
          const aExecution = this.stepExecutions.get(a);
          const bExecution = this.stepExecutions.get(b);
          return (aExecution?.stepExecutionIndex ?? 0) - (bExecution?.stepExecutionIndex ?? 0);
        })
      );
    }
  }
}
