/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import type { JsonValue } from '@kbn/utility-types';
import type { EsWorkflowStepExecution, SerializedError } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { scanForTemplateVariables } from '@kbn/workflows/common/utils';
import type { GraphNodeUnion, WorkflowGraph } from '@kbn/workflows/graph';
import {
  extractReferencedStepIds,
  extractReferencedStepIdsFromVariables,
} from './extract_referenced_step_ids';
import { EVICTION_EXEMPT_STEP_TYPES, LOOP_STEP_TYPES } from './step_io_pinned_types';
import type { StepExecutionMetadata, StepIoStateAccessor } from './workflow_execution_state';
import { WorkflowScopeStack } from './workflow_scope_stack';
import type { OutputSizeStats } from '../lib/telemetry/events/workflows_execution/types';
import type { StepExecutionRepository } from '../repositories/step_execution_repository';
import { formatBytes, safeOutputSize } from '../step/errors';
import { buildStepExecutionId } from '../utils';

/**
 * Resolves predecessors for a node — supplied at call time so the service
 * does not need to depend on `WorkflowGraph` directly.
 */
export type PredecessorsResolver = (node: GraphNodeUnion) => ReadonlyArray<GraphNodeUnion>;

export interface StepIoServiceInit {
  stepRepository: StepExecutionRepository;
  state: StepIoStateAccessor;
  pinnedStepTypes?: ReadonlySet<string>;
  /**
   * Minimum output size in bytes for a completed step to be eligible for eviction.
   * 0 = evict all completed step outputs. `Infinity` = disable eviction entirely.
   */
  evictionMinBytes?: number;
  logger?: Logger;
}

export interface PrepareForReadArgs {
  node: GraphNodeUnion;
  predecessorsResolver: PredecessorsResolver;
}

/**
 * Read-only IO surface used by node implementations and the context manager.
 * Constructor-inject this (instead of the full service) into consumers that
 * have no business mutating step state — the compiler then prevents an
 * accidental `flush()` or eviction call from a node implementation.
 */
export interface StepIoReader {
  getStepOutput(stepExecutionId: string): JsonValue | null | undefined;
  getStepInput(stepExecutionId: string): JsonValue | undefined;
  getStepError(stepExecutionId: string): SerializedError | undefined;
  getLatestStepIO(stepId: string):
    | {
        input: JsonValue | undefined;
        output: JsonValue | null | undefined;
        error: SerializedError | undefined;
      }
    | undefined;
  getDataSetVariables(): Record<string, unknown>;
}

/**
 * Reader + write surface used by the per-step runtime. Owns step IO data
 * (input/output) only — lifecycle metadata (status, finishedAt, error,
 * executionTimeMs, scopeStack) is the runtime's responsibility and goes
 * through `WorkflowExecutionState.upsertStep` directly. Splitting the
 * concerns keeps each writer focused: lifecycle is the runtime's job, IO
 * is the service's.
 */
export interface StepIoWriter extends StepIoReader {
  setStepInput(stepExecutionId: string, input: JsonValue): void;
  /**
   * Writes a step's output to the IO map and queues it for the next flush.
   * Optionally records the byte size for eviction/telemetry — pass
   * `sizeBytes` when the caller already measured the payload (Layer 2
   * enforcement) so we don't pay for a second `JSON.stringify`.
   */
  setStepOutput(stepExecutionId: string, output: JsonValue | null, sizeBytes?: number): void;
}

/**
 * Lifecycle surface used by the workflow execution loop and runtime manager.
 * Includes flush/load/eviction/rehydration entry points that node code must
 * never call. Kept disjoint from {@link StepIoReader} on purpose — a loop
 * step impl should not be able to drive a flush or evict outputs.
 */
export interface StepIoLifecycle {
  flush(): Promise<void>;
  flushStepChanges(): Promise<void>;
  load(): Promise<void>;
  prepareForRead(args: PrepareForReadArgs): Promise<void>;
  releaseTransientlyRehydratedOutputs(): void;
  evictStaleLoopOutputs(innerStepIds: Iterable<string>): void;
  evictCompletedLoopsOnResume(graph: {
    getInnerStepIds(loopStepId: string): Iterable<string>;
  }): void;
  hasEvictedOutputs(): boolean;
  getOutputSizeStats(): OutputSizeStats;
}

/**
 * Owns the IO lifecycle of a workflow run.
 *
 * Holds the canonical `inputs` / `outputs` maps in-house — `WorkflowExecutionState`
 * stores only step *metadata* (status, scopeStack, error, indices, etc.).
 * The two domains are merged at flush time: the service drains state's
 * pending lifecycle partials, joins them with its own IO partials by step
 * id, and runs a single `bulkUpsert` per cycle.
 *
 * Responsibilities:
 *   - in-memory `input`/`output` storage and reads
 *   - output size accounting for telemetry (`getOutputSizeStats`)
 *   - deferred output eviction (one-cycle deferral after flush)
 *   - immediate input eviction post-flush for terminal steps
 *   - on-demand rehydration of evicted outputs from ES
 *   - resume-time output orchestration (`load()`)
 *   - stale-loop iteration cleanup
 *   - bulk-upsert of merged lifecycle + IO partials
 *
 * Dependency direction: state → workflowExecutionRepository;
 * service → state (via narrow `StepIoStateAccessor`) and
 * stepExecutionRepository.
 */
export class StepIoService implements StepIoWriter, StepIoLifecycle {
  private readonly stepRepository: StepExecutionRepository;
  private readonly state: StepIoStateAccessor;
  private readonly pinnedStepTypes: ReadonlySet<string>;
  private readonly evictionMinBytes: number;
  private readonly logger?: Logger;

  // ----- Canonical IO storage ----------------------------------------------
  // These maps are the source of truth for step input/output. State holds
  // metadata only. The bulk-upsert at flush time merges the two halves.

  /** Per-step input. Cleared post-flush for terminal steps (input eviction). */
  private readonly inputs = new Map<string, JsonValue>();
  /**
   * Per-step output. `null` means FAILED (semantically distinct from absent).
   * Absent means evicted (or never set yet).
   */
  private readonly outputs = new Map<string, JsonValue | null>();
  /**
   * Pending IO partials for the next bulk-upsert. Decoupled from the
   * canonical `inputs` / `outputs` maps so eviction (which clears the
   * canonical maps) does NOT remove a write from the in-flight flush
   * payload — eviction is memory-only by contract; the doc keeps the
   * original value on disk.
   */
  private pendingIoChanges = new Map<string, { input?: JsonValue; output?: JsonValue | null }>();

  /**
   * Every step execution id whose `output` has been evicted from memory.
   * Reads against this Set are the authoritative "is this output evicted?"
   * answer — used by {@link hasEvictedOutputs} and the rehydration filter.
   */
  private readonly evictedOutputIds = new Set<string>();
  /**
   * Step execution ids that must not be evicted while a loop that references
   * them is active. A `foreach`/`while` re-evaluates its source expression on
   * every iteration (see `WorkflowContextManager.buildForeachContext`), so the
   * referenced output must stay resident for the loop's whole lifetime.
   * Without this, the concurrent persistence/eviction loop can evict the
   * source between an inner step's `prepareForRead` (which saw nothing evicted)
   * and the synchronous context re-evaluation, producing a blank loop item and
   * a corrupt downstream step input. Populated by {@link pinForeachSource} at
   * loop entry (and re-pinned on resume from the scope-walk in
   * {@link computeRehydrationTargets}); cleared by {@link unpinForeachScope}
   * when the loop exits.
   *
   * Keyed by the loop's `stepId` (a foreach cannot be nested inside itself, and
   * each (re-)entry pins before it exits) so nested/sibling loops referencing
   * the same source are unpinned independently — a source stays pinned until
   * every loop that pinned it has exited.
   */
  private readonly pinnedOutputIdsByScope = new Map<string, Set<string>>();
  /**
   * Sizes for evicted outputs that we actually measured. Resume-time
   * deferred outputs land in {@link evictedOutputIds} only — their size is
   * unknown and *deliberately not* recorded as 0 here, because that would
   * pollute {@link getOutputSizeStats} with phantom zero-entries.
   */
  private readonly evictedOutputSizes = new Map<string, number>();
  /** Recorded output sizes (Layer 2 enforcement). Used to gate eviction eligibility. */
  private readonly outputSizes = new Map<string, number>();
  /**
   * Running sum of every value held in {@link outputSizes} and
   * {@link evictedOutputSizes}. Maintained in lockstep with the two maps via
   * {@link setOutputSize} / {@link clearOutputSize} / {@link setEvicted} /
   * {@link clearEvicted} so {@link getOutputSizeStats} runs in `O(1)`
   * instead of iterating both maps on every call (the telemetry layer calls
   * this once per flush).
   */
  private totalRecordedBytes = 0;
  /** IDs queued for eviction on the NEXT flush cycle (one-cycle deferral). */
  private pendingOutputEvictionIds: ReadonlyArray<string> = [];
  /**
   * IDs that the most recent `prepareForRead` had to rehydrate from ES. Used
   * by `releaseTransientlyRehydratedOutputs` to drop those outputs back to
   * the evicted state once the consuming step has finished, so resume tasks
   * don't progressively grow in-memory state by accumulating predecessor
   * outputs they only briefly needed.
   */
  private transientlyRehydratedIds: string[] = [];

  /**
   * Per-execution `data.set` output, keyed by step execution id. Populated
   * incrementally on every `data.set` write (via `setStepOutput`) and on
   * resume (via `load()`). Iteration order is insertion order, which equals
   * `globalExecutionIndex` order on both fresh and resumed workflows — the
   * underlying `state.stepExecutions` is itself an insertion-ordered Map
   * driven by `globalExecutionIndex`-assigning `createStep` calls, and the
   * resume path replays the workflow's `stepExecutionIds` array in the same
   * order. That means `getDataSetVariables()` can walk this map directly
   * with no sort, in `O(K)` where K = number of `data.set` executions.
   */
  private readonly dataSetOutputs = new Map<string, JsonValue | null>();
  /**
   * Memoised aggregation of {@link dataSetOutputs}. Invalidated on every
   * `data.set` write — that is what makes the read path cheap in the common
   * case (the same context manager calls `getVariables` 5–10× per step but
   * the underlying data only changes when a `data.set` step runs).
   */
  private dataSetVariablesCache: Record<string, unknown> | undefined;

  constructor(init: StepIoServiceInit) {
    this.stepRepository = init.stepRepository;
    this.state = init.state;
    this.pinnedStepTypes = init.pinnedStepTypes ?? EVICTION_EXEMPT_STEP_TYPES;
    this.evictionMinBytes = init.evictionMinBytes ?? Infinity;
    this.logger = init.logger;
  }

  // ----- IO reads -----------------------------------------------------------
  // The service is the single chokepoint for IO reads as well as writes:
  // every consumer of step `input`/`output`/`error` goes through here, so any
  // future read-side concern (lazy rehydration, redaction, schema evolution)
  // has exactly one place to land.

  public getStepOutput(stepExecutionId: string): JsonValue | null | undefined {
    if (!this.outputs.has(stepExecutionId)) {
      return undefined;
    }
    return this.outputs.get(stepExecutionId);
  }

  public getStepInput(stepExecutionId: string): JsonValue | undefined {
    return this.inputs.get(stepExecutionId);
  }

  public getStepError(stepExecutionId: string): SerializedError | undefined {
    return this.state.getStepExecution(stepExecutionId)?.error;
  }

  /**
   * Returns the input/output/error of the latest execution of `stepId`, or
   * `undefined` when the step has not run.
   */
  public getLatestStepIO(stepId: string):
    | {
        input: JsonValue | undefined;
        output: JsonValue | null | undefined;
        error: SerializedError | undefined;
      }
    | undefined {
    const latest = this.state.getLatestStepExecution(stepId);
    if (!latest) {
      return undefined;
    }
    return {
      input: this.getStepInput(latest.id),
      output: this.getStepOutput(latest.id),
      error: latest.error,
    };
  }

  /**
   * Aggregates outputs from all `data.set` step executions in execution
   * order. `data.set` is pinned (never evicted), so this read does not need
   * rehydration. Walks {@link dataSetOutputs} in insertion order (which
   * matches `globalExecutionIndex` order) — `O(K)` where K is the number of
   * `data.set` executions, not the total number of step executions. The
   * result is memoised because the same context manager calls
   * `getVariables()` 5–10× per step.
   */
  public getDataSetVariables(): Record<string, unknown> {
    if (this.dataSetVariablesCache !== undefined) {
      return this.dataSetVariablesCache;
    }
    const result: Record<string, unknown> = {};
    for (const output of this.dataSetOutputs.values()) {
      if (output != null && typeof output === 'object' && !Array.isArray(output)) {
        Object.assign(result, output);
      }
    }
    this.dataSetVariablesCache = result;
    return result;
  }

  /**
   * Records a `data.set` write into the incremental index and invalidates
   * the memoised aggregation. Inserts on first write so the map's insertion
   * order matches `globalExecutionIndex` order; subsequent writes (e.g.
   * retries) update the value in place without changing the order.
   */
  private recordDataSetOutput(stepExecutionId: string, output: JsonValue | null): void {
    this.dataSetOutputs.set(stepExecutionId, output);
    this.dataSetVariablesCache = undefined;
  }

  // ----- IO writes ----------------------------------------------------------

  public setStepInput(stepExecutionId: string, input: JsonValue): void {
    this.inputs.set(stepExecutionId, input);
    const existing = this.pendingIoChanges.get(stepExecutionId) ?? {};
    existing.input = input;
    this.pendingIoChanges.set(stepExecutionId, existing);
  }

  /**
   * Writes a step's output to the IO map and marks it dirty for the next
   * flush. Lifecycle fields (status, finishedAt, error, etc.) are the
   * caller's responsibility and go through `state.upsertStep`.
   *
   * Atomicity with the lifecycle write is preserved because both writes
   * happen synchronously on the same tick — the persistence loop runs on a
   * separate microtask chain and cannot interleave between them. The flush
   * orchestrator merges state's lifecycle partials with the IO partials so
   * the bulk-upsert receives one combined entry per step id.
   *
   * `output: null` is the FAILED-step sentinel; the eviction layer
   * distinguishes it from `undefined` (evicted) so do not coerce. `sizeBytes`
   * is optional — pass it when Layer 2 has already measured the payload so
   * the eviction predicate can decide without re-serialising.
   */
  public setStepOutput(
    stepExecutionId: string,
    output: JsonValue | null,
    sizeBytes?: number
  ): void {
    // Fresh in-memory output is authoritative — do not let a subsequent
    // prepareForRead rehydrate from ES and overwrite with a stale doc
    // (common when a deferred step completes on resume before flush).
    this.clearEvicted(stepExecutionId);

    if (this.state.getStepExecution(stepExecutionId)?.stepType === 'data.set') {
      this.recordDataSetOutput(stepExecutionId, output);
    }
    if (sizeBytes !== undefined && Number.isFinite(sizeBytes) && sizeBytes >= 0) {
      this.setOutputSize(stepExecutionId, sizeBytes);
    }
    this.outputs.set(stepExecutionId, output);
    const existing = this.pendingIoChanges.get(stepExecutionId) ?? {};
    existing.output = output;
    this.pendingIoChanges.set(stepExecutionId, existing);
  }

  // ----- Size tracking & telemetry ------------------------------------------

  /**
   * Aggregate output size statistics across active and evicted steps. `O(1)`:
   * the running counter is maintained in lockstep with every write to
   * {@link outputSizes} / {@link evictedOutputSizes}, so this is safe
   * to call from a hot path (e.g. the persistence-loop telemetry tick).
   */
  public getOutputSizeStats(): OutputSizeStats {
    return {
      totalBytes: this.totalRecordedBytes,
      stepCount: this.outputSizes.size + this.evictedOutputSizes.size,
    };
  }

  public hasEvictedOutputs(): boolean {
    return this.evictedOutputIds.size > 0;
  }

  /**
   * Writes a recorded size into {@link outputSizes} and keeps the running
   * total in sync. Idempotent on rewrites — the previous value is subtracted
   * before the new one is added.
   */
  private setOutputSize(stepExecutionId: string, sizeBytes: number): void {
    const previous = this.outputSizes.get(stepExecutionId) ?? 0;
    this.outputSizes.set(stepExecutionId, sizeBytes);
    this.totalRecordedBytes += sizeBytes - previous;
  }

  /** Removes a recorded size and decrements the running total. */
  private clearOutputSize(stepExecutionId: string): void {
    const previous = this.outputSizes.get(stepExecutionId);
    if (previous === undefined) return;
    this.outputSizes.delete(stepExecutionId);
    this.totalRecordedBytes -= previous;
  }

  /**
   * Marks a step output as evicted and, when a size is provided, records it
   * for the telemetry running total. Pass `undefined` (or omit) to mark a
   * resume-deferred eviction whose size is genuinely unknown — those are
   * tracked in {@link evictedOutputIds} only, never as phantom-zero entries
   * in the size map.
   */
  private setEvicted(stepExecutionId: string, sizeBytes?: number): void {
    this.evictedOutputIds.add(stepExecutionId);
    if (sizeBytes !== undefined) {
      const previous = this.evictedOutputSizes.get(stepExecutionId) ?? 0;
      this.evictedOutputSizes.set(stepExecutionId, sizeBytes);
      this.totalRecordedBytes += sizeBytes - previous;
    }
  }

  /**
   * Clears the eviction tracking for a step (Set membership + size entry if
   * we had one). Decrements the running total only when a size had been
   * recorded.
   */
  private clearEvicted(stepExecutionId: string): void {
    this.evictedOutputIds.delete(stepExecutionId);
    const previous = this.evictedOutputSizes.get(stepExecutionId);
    if (previous === undefined) return;
    this.evictedOutputSizes.delete(stepExecutionId);
    this.totalRecordedBytes -= previous;
  }

  // ----- Lifecycle (public entry points) -----------------------------------

  /**
   * Flushes pending step-doc and workflow-doc changes to Elasticsearch and
   * runs IO bookkeeping (deferred output eviction + immediate input eviction)
   * on the freshly-flushed step IDs.
   */
  public async flush(): Promise<void> {
    await Promise.all([this.state.flushWorkflowDoc(), this.flushStepChanges()]);
  }

  /**
   * Step-doc-only flush. Drains state's pending lifecycle partials, merges
   * with this service's IO partials, and runs the combined bulk-upsert. Then
   * processes the deferred output-eviction cycle and immediate input
   * eviction. Even when there are no doc changes this still drains the
   * previous cycle's eviction queue — the deferral is one cycle, not one
   * bulk-upsert.
   */
  public async flushStepChanges(): Promise<void> {
    const flushedIds = await this.persistMergedStepChanges();
    this.runDeferredEvictionCycle(flushedIds);
  }

  /**
   * Resume-time entry point. Asks the repository for step metadata without
   * the (potentially large) `output` field, hands it to state, then eagerly
   * fetches outputs for pinned step types (data.set, waitForInput) so they
   * are immediately available without rehydration. Non-pinned steps are
   * marked deferred — their outputs will be rehydrated on demand by
   * `prepareForRead`.
   */
  public async load(): Promise<void> {
    this.dataSetOutputs.clear();
    this.dataSetVariablesCache = undefined;

    const stepExecutionIds = this.state.getWorkflowExecutionStepExecutionIds();
    if (!stepExecutionIds) {
      throw new Error(
        'StepIoService: Workflow execution must have step execution IDs to be loaded'
      );
    }

    const foundSteps = await this.stepRepository.getStepExecutionsByIds(
      stepExecutionIds,
      undefined,
      ['output']
    );

    // Capture inputs and hand `output`-stripped metadata to state. The
    // `output` sourceExclude above should already drop output from the
    // wire, but stripping defensively guards against a future caller
    // passing sourceIncludes that re-introduces it.
    //
    // We also pre-seed `dataSetOutputs` here so the map's insertion order
    // matches `globalExecutionIndex` order — `foundSteps` is returned in
    // workflow `stepExecutionIds` order, which is the same order. Values
    // are set to `null` as a placeholder and overwritten below once the
    // pinned-doc fetch returns each step's actual `output`.
    const metadata: StepExecutionMetadata[] = [];
    for (const step of foundSteps) {
      if (step.input !== undefined) {
        this.inputs.set(step.id, step.input);
      }
      if (step.stepType === 'data.set') {
        this.dataSetOutputs.set(step.id, null);
      }
      metadata.push(stripIo(step));
    }
    this.state.ingestLoadedStepDocs(metadata);

    const pinnedIdsToFetch = this.markDeferredAfterLoad(foundSteps);
    if (pinnedIdsToFetch.length > 0) {
      const pinnedDocs = await this.stepRepository.getStepExecutionsByIds(pinnedIdsToFetch, [
        'id',
        'output',
      ]);
      for (const doc of pinnedDocs) {
        const output: JsonValue | null = doc.output ?? null;
        this.outputs.set(doc.id, output);
        if (this.dataSetOutputs.has(doc.id)) {
          this.dataSetOutputs.set(doc.id, output);
        }
      }
    }
  }

  /**
   * Drops in-memory IO from non-latest executions of the given step IDs.
   * Used by foreach/while exit + loop break/continue to release memory after
   * an iteration completes. Memory-only — ES docs untouched. Pinned step
   * types and the latest execution per stepId are preserved.
   */
  public evictStaleLoopOutputs(innerStepIds: Iterable<string>): void {
    for (const stepId of innerStepIds) {
      const executionIds = this.state.getStepExecutionIdsByStepId(stepId);
      if (executionIds && executionIds.length > 1) {
        const staleIds = executionIds.slice(0, -1);
        for (const execId of staleIds) {
          this.dropStaleStepIo(execId);
        }
      }
    }
  }

  /**
   * Re-applies stale-iteration eviction for loops that completed before the
   * workflow suspended. Called from `WorkflowExecutionRuntimeManager.resume()`
   * after `load()` so resume tasks don't carry the full output of every past
   * loop iteration in memory — matching the in-memory state the initial task
   * had at the point of suspension.
   *
   * De-duplicates by stepId because nested loops produce one execution per
   * outer iteration, all COMPLETED — `getInnerStepIds` is per stepId.
   */
  public evictCompletedLoopsOnResume(graph: Pick<WorkflowGraph, 'getInnerStepIds'>): void {
    const completedLoopStepIds = new Set<string>();
    for (const exec of this.state.getAllStepExecutions()) {
      if (
        exec.stepType != null &&
        LOOP_STEP_TYPES.has(exec.stepType) &&
        exec.status === ExecutionStatus.COMPLETED
      ) {
        completedLoopStepIds.add(exec.stepId);
      }
    }
    for (const loopStepId of completedLoopStepIds) {
      this.evictStaleLoopOutputs(graph.getInnerStepIds(loopStepId));
    }
  }

  // ----- Rehydration --------------------------------------------------------

  /**
   * Pre-warms the in-memory state by rehydrating any evicted step outputs
   * that the upcoming step's context build will need. Targeted via static
   * template analysis (`extractReferencedStepIds`); falls back to all
   * predecessors when the analysis is ambiguous (dynamic bracket access,
   * etc.). Also rehydrates scope-stack entries used by
   * `enrichStepContextAccordingToStepScope`.
   *
   * **Deferred-release semantics.** Outputs rehydrated for the *previous*
   * step are released here, not at the end of the previous step's run.
   * That lets us keep predecessors resident across consecutive consumers
   * (fanout pattern: A → B, A → C, A → D — A stays in memory through C and
   * D instead of being re-fetched each time) and removes the need for a
   * "skip release on retry" hack: a retry attempt's `prepareForRead` will
   * recompute the same `neededIds` and naturally retain the same outputs.
   *
   * Workflow-end cleanup is handled by `releaseTransientlyRehydratedOutputs`
   * called from the execution loop's final-flush path.
   *
   * No-op (zero ES calls) when nothing is evicted and nothing is transiently
   * rehydrated from a previous step.
   */
  public async prepareForRead({ node, predecessorsResolver }: PrepareForReadArgs): Promise<void> {
    const noPriorTransients = this.transientlyRehydratedIds.length === 0;
    if (!this.hasEvictedOutputs() && noPriorTransients) {
      return;
    }

    const neededIds = this.computeRehydrationTargets(node, predecessorsResolver);

    // Drop the previous step's transient outputs that this step does not
    // need. Anything still in `neededIds` stays resident — `rehydrateOutputs`
    // will then skip those IDs because they are no longer in the evicted map.
    this.releaseTransientExcept(neededIds);

    // data.set / waitForInput outputs are pinned (never evicted), so they
    // never appear in evictedOutputIds — rehydrateOutputs filters
    // out non-evicted IDs cheaply.
    await this.rehydrateOutputs(Array.from(neededIds));
  }

  /**
   * Pins the source outputs referenced by a loop's source value for the
   * lifetime of the loop, keyed by the loop's `stepId`. Called unconditionally
   * when a loop is entered (before any eviction has happened) so the source
   * stays resident across the per-iteration source re-evaluation — the
   * eviction-gated rehydration path ({@link computeRehydrationTargets}) cannot
   * be relied on, because it is skipped entirely until something is evicted.
   */
  public pinForeachSource(foreachStepId: string, sourceValue: unknown): void {
    const referencedStepIds = this.extractReferencedStepIdsFromValue(sourceValue);
    if (referencedStepIds === null) {
      return;
    }
    this.pinLatestExecutionIdsForScope(foreachStepId, referencedStepIds);
  }

  /** True if any active loop scope has pinned this output. */
  private isPinned(stepExecutionId: string): boolean {
    for (const ids of this.pinnedOutputIdsByScope.values()) {
      if (ids.has(stepExecutionId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clears all pins recorded for the given loop `stepId`. Called when a loop
   * exits ({@link ExitForeachNodeImpl}) so its source output becomes evictable
   * again. Idempotent.
   */
  public unpinForeachScope(foreachStepId: string): void {
    this.pinnedOutputIdsByScope.delete(foreachStepId);
  }

  /**
   * Resolves the set of step execution IDs whose outputs need to be rehydrated
   * before the upcoming context build. Combines:
   *
   * 1. Template-referenced steps. Static analysis returns either:
   *    - a `Set<string>` of step IDs that the node's templates reference,
   *    - or `null` when bracket access defeats static analysis.
   *
   * 2. Active scope-stack frames consumed by `enrichStepContextAccordingToStepScope`.
   *
   * **Conservative fallback.** When the static analysis returns an empty set
   * but evicted outputs exist among the predecessors, we fall back to
   * rehydrating all predecessors. This guards against the analysis missing
   * a template reference (new node shape, unknown configuration key) — a
   * miss would otherwise produce `undefined` at template render time and
   * silently corrupt downstream step IO.
   */
  private computeRehydrationTargets(
    node: GraphNodeUnion,
    predecessorsResolver: PredecessorsResolver
  ): Set<string> {
    const neededIds = new Set<string>();
    const referencedStepIds = extractReferencedStepIds(node);

    const fallbackToPredecessors = (): void => {
      for (const pred of predecessorsResolver(node)) {
        const latestExec = this.state.getLatestStepExecution(pred.stepId);
        if (latestExec) {
          neededIds.add(latestExec.id);
        }
      }
    };

    if (referencedStepIds === null) {
      // Static analysis ambiguous (dynamic bracket access).
      fallbackToPredecessors();
    } else {
      this.addLatestExecutionIdsForStepIds(neededIds, referencedStepIds);
      // If the analysis found nothing but a predecessor is actually evicted,
      // the analysis missed a reference. Fall back conservatively rather
      // than trust an empty set.
      if (referencedStepIds.size === 0 && this.hasEvictedPredecessor(node, predecessorsResolver)) {
        fallbackToPredecessors();
      }
    }

    // Scope-stack entries — needed by enrichStepContextAccordingToStepScope.
    const executionId = this.state.getWorkflowExecutionId();
    let currentScope = WorkflowScopeStack.fromStackFrames(
      this.state.getWorkflowExecutionScopeStack()
    );
    while (!currentScope.isEmpty()) {
      const frame = currentScope.getCurrentScope();
      currentScope = currentScope.exitScope();
      const scopeStepExecutionId = buildStepExecutionId(
        executionId,
        frame.stepId,
        currentScope.stackFrames
      );
      neededIds.add(scopeStepExecutionId);

      const scopeStepExecution = this.state.getStepExecution(scopeStepExecutionId);
      if (scopeStepExecution?.stepType === 'foreach') {
        const scopeInputStepIds = this.extractReferencedStepIdsFromValue(
          this.getStepInput(scopeStepExecutionId)
        );
        if (scopeInputStepIds === null) {
          fallbackToPredecessors();
        } else {
          this.addLatestExecutionIdsForStepIds(neededIds, scopeInputStepIds);
          // Re-pin the loop's source outputs while the loop scope is active.
          // Primary pinning happens unconditionally at loop entry
          // (pinForeachSource); this re-pin covers resume, where the loop is
          // re-entered mid-iteration without going through enterForeach.
          this.pinLatestExecutionIdsForScope(frame.stepId, scopeInputStepIds);
        }
      }
    }

    return neededIds;
  }

  private addLatestExecutionIdsForStepIds(
    neededIds: Set<string>,
    referencedStepIds: ReadonlySet<string>
  ): void {
    for (const stepId of referencedStepIds) {
      const latestExec = this.state.getLatestStepExecution(stepId);
      if (latestExec) {
        neededIds.add(latestExec.id);
      }
    }
  }

  /**
   * Resolves the given step ids to their latest execution ids and pins them
   * under the owning loop scope so they survive eviction until the loop exits.
   */
  private pinLatestExecutionIdsForScope(
    foreachStepId: string,
    referencedStepIds: ReadonlySet<string>
  ): void {
    let pinned = this.pinnedOutputIdsByScope.get(foreachStepId);
    for (const stepId of referencedStepIds) {
      const latestExec = this.state.getLatestStepExecution(stepId);
      if (latestExec) {
        if (!pinned) {
          pinned = new Set<string>();
          this.pinnedOutputIdsByScope.set(foreachStepId, pinned);
        }
        pinned.add(latestExec.id);
      }
    }
  }

  private extractReferencedStepIdsFromValue(value: unknown): Set<string> | null {
    try {
      return extractReferencedStepIdsFromVariables(scanForTemplateVariables(value));
    } catch {
      return null;
    }
  }

  private hasEvictedPredecessor(
    node: GraphNodeUnion,
    predecessorsResolver: PredecessorsResolver
  ): boolean {
    for (const pred of predecessorsResolver(node)) {
      const latestExec = this.state.getLatestStepExecution(pred.stepId);
      if (latestExec && this.evictedOutputIds.has(latestExec.id)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Releases all transiently-rehydrated outputs unconditionally. Used at
   * workflow-end (final flush) as a safety net — by that point no further
   * `prepareForRead` is going to run, so any IDs left in the transient set
   * are dead weight.
   *
   * Memory-only: the doc is already on disk (it was evicted before we
   * rehydrated), so we just mark it evicted again and clear it from the
   * outputs map. Idempotent — calling with no transient rehydrations is a
   * no-op.
   */
  public releaseTransientlyRehydratedOutputs(): void {
    this.releaseTransientExcept(undefined);
  }

  /**
   * Releases transiently-rehydrated outputs that are *not* in `keepIds`,
   * leaving the kept ones resident for the next consumer.
   *
   * Called from `prepareForRead` to implement the deferred-release pattern:
   * the next step computes its `neededIds` first, then we drop only the
   * previous step's transient IDs that the next step does not need. Pass
   * `undefined` to release everything (workflow-end cleanup).
   *
   * Re-eviction is identical to eviction except the threshold gate does
   * not apply — the output is known to have been evictable since it came
   * back from ES. Pinned step types still cannot be re-evicted (guarded
   * by `isReleaseCandidate`).
   */
  private releaseTransientExcept(keepIds: ReadonlySet<string> | undefined): void {
    if (this.transientlyRehydratedIds.length === 0) {
      return;
    }

    const ids = this.transientlyRehydratedIds;
    const remaining: string[] = [];
    let releasedCount = 0;

    for (const id of ids) {
      if (keepIds?.has(id)) {
        // Keep this output resident; the upcoming step needs it. It will be
        // re-evaluated for release at the *next* prepareForRead.
        remaining.push(id);
      } else if (this.isReleaseCandidate(id)) {
        const sizeBytes = this.outputSizes.get(id);
        this.outputs.delete(id);
        this.clearOutputSize(id);
        this.setEvicted(id, sizeBytes);
        releasedCount++;
      }
    }

    this.transientlyRehydratedIds = remaining;

    if (releasedCount > 0) {
      this.logger?.debug(
        `Released ${releasedCount} transiently rehydrated step output(s); ${remaining.length} kept resident; total evicted: ${this.evictedOutputIds.size}`
      );
    }
  }

  /**
   * Re-fetches evicted output fields from Elasticsearch for the requested
   * step execution IDs. Only IDs that are actually evicted are fetched; if
   * none are, this is a no-op with zero ES calls.
   *
   * Defensively removes IDs not returned by ES so we don't loop forever
   * trying to rehydrate a doc that has been deleted/ILM'd. Logs `error`
   * (not `warn`) when the workflow is still RUNNING — that's the only
   * scenario where a missing evicted doc indicates active data loss.
   */
  public async rehydrateOutputs(stepExecutionIds: ReadonlyArray<string>): Promise<void> {
    const idsToRehydrate = stepExecutionIds.filter((id) => this.evictedOutputIds.has(id));
    if (idsToRehydrate.length === 0) {
      return;
    }

    const totalBytes = idsToRehydrate.reduce(
      (sum, id) => sum + (this.evictedOutputSizes.get(id) ?? 0),
      0
    );

    const startMs = performance.now();
    const expectedRunId = this.state.getWorkflowExecutionId();
    const fetched = await this.stepRepository.getStepExecutionsByIds(idsToRehydrate, [
      'id',
      'output',
      'workflowRunId',
    ]);
    // Defensive cross-execution filter: mget targets documents by `_id` only,
    // and step execution IDs are constructed from the workflow execution ID,
    // so a collision is improbable but not impossible (e.g. someone running
    // a custom resume path with mis-typed IDs). Drop any doc whose
    // workflowRunId disagrees with the current execution rather than
    // restoring foreign output into memory.
    const docs = fetched.filter((doc) => {
      if (doc.workflowRunId && doc.workflowRunId !== expectedRunId) {
        this.logger?.error(
          `Cross-execution doc skipped during rehydration: id=${doc.id} expected runId=${expectedRunId} got=${doc.workflowRunId}`
        );
        return false;
      }
      return true;
    });

    let restoredCount = 0;
    for (const doc of docs) {
      const previousBytes = this.evictedOutputSizes.get(doc.id);
      this.clearEvicted(doc.id);
      // The repository normalises absent `output` to `null` at the boundary,
      // so `doc.output` here is already `JsonValue | null`. FAILED steps are
      // not eviction candidates, so any rehydrated value was a COMPLETED
      // output, and `null` only occurs when ES legitimately stored null.
      this.outputs.set(doc.id, doc.output ?? null);
      // Track for transient release: predecessors brought back into memory
      // for one step's read should not stay there forever.
      this.transientlyRehydratedIds.push(doc.id);
      restoredCount++;

      // Restore size tracking so:
      //  1. getOutputSizeStats() remains accurate after rehydration
      //  2. The step is eligible for re-eviction next cycle
      // For live-execution evictions the original size is preserved; for
      // resume-path deferred outputs it's genuinely unknown (no entry in
      // `evictedOutputSizes`), so we measure via `safeOutputSize`.
      // Non-measurable outputs (`null` from `safeOutputSize`) are deliberately
      // not tracked rather than recorded as 0 — these came from ES so they
      // were serialisable when written; getting null here means a
      // JSON.stringify quirk, not a poison payload.
      if (previousBytes !== undefined) {
        this.setOutputSize(doc.id, previousBytes);
      } else {
        const sz = safeOutputSize(doc.output);
        if (sz !== null) {
          this.setOutputSize(doc.id, sz);
        }
      }
    }

    // Defensive: drop IDs not returned by ES so we don't retry forever.
    const stillEvictedAfterFetch = idsToRehydrate.filter((id) => this.evictedOutputIds.has(id));
    for (const id of stillEvictedAfterFetch) {
      this.clearEvicted(id);
    }

    const elapsedMs = Math.round(performance.now() - startMs);
    this.logger?.debug(
      `Rehydrated ${restoredCount}/${idsToRehydrate.length} step output(s) (${formatBytes(
        totalBytes
      )}) from ES in ${elapsedMs}ms, ${this.evictedOutputIds.size} still evicted`
    );

    if (stillEvictedAfterFetch.length > 0) {
      const message = `${
        stillEvictedAfterFetch.length
      } evicted step output(s) not found in ES during rehydration: ${stillEvictedAfterFetch.join(
        ', '
      )}`;
      // Missing-in-ES on a still-RUNNING workflow indicates active data loss
      // (a doc that was flushed has disappeared mid-execution). On terminal
      // workflows it's typically harmless ILM/cleanup.
      if (this.state.getWorkflowExecutionStatus() === ExecutionStatus.RUNNING) {
        this.logger?.error(message);
      } else {
        this.logger?.warn(message);
      }
    }
  }

  // ----- Internals ----------------------------------------------------------

  /**
   * Drains state's pending lifecycle partials, joins them with this service's
   * IO partials by step id, and runs the bulk-upsert. Returns the set of ids
   * actually persisted (used by the deferred-eviction cycle).
   *
   * IO is included in the upsert only when the step had a write since the
   * last flush — eviction-only events do not re-upsert the output.
   */
  private async persistMergedStepChanges(): Promise<ReadonlyArray<string>> {
    const lifecyclePartials = this.state.drainPendingStepChanges();
    const ioPartials = this.pendingIoChanges;
    this.pendingIoChanges = new Map();

    if (lifecyclePartials.size === 0 && ioPartials.size === 0) {
      return [];
    }

    const merged = new Map<string, Partial<EsWorkflowStepExecution>>();
    for (const [id, partial] of lifecyclePartials) {
      merged.set(id, { ...partial });
    }
    for (const [id, ioPart] of ioPartials) {
      const existing = merged.get(id) ?? { id };
      merged.set(id, { ...existing, ...ioPart });
    }

    const flushedIds = Array.from(merged.keys());
    await this.stepRepository.bulkUpsert(Array.from(merged.values()));
    return flushedIds;
  }

  /**
   * Marks non-pinned step outputs as deferred (rehydrated on demand) and
   * returns the IDs of pinned step types whose outputs the service should
   * eagerly mget.
   */
  private markDeferredAfterLoad(steps: ReadonlyArray<EsWorkflowStepExecution>): string[] {
    const pinnedIds: string[] = [];
    for (const step of steps) {
      if (step.stepType && this.pinnedStepTypes.has(step.stepType)) {
        pinnedIds.push(step.id);
      } else {
        // Size unknown on resume — tracked in evictedOutputIds only. Size is
        // measured on first rehydrate; until then it is omitted from
        // `getOutputSizeStats` rather than polluting it with phantom zero
        // entries.
        this.setEvicted(step.id);
      }
    }
    return pinnedIds;
  }

  /**
   * Drains the previous cycle's deferred output evictions, queues this
   * cycle's flushed IDs for next-cycle eviction, and runs immediate input
   * eviction on terminal steps. Called with `[]` when the flush had no doc
   * changes — the queue must still be drained on its scheduled cycle.
   */
  private runDeferredEvictionCycle(flushedIds: ReadonlyArray<string>): void {
    if (this.pendingOutputEvictionIds.length > 0) {
      const toEvict = this.pendingOutputEvictionIds;
      this.pendingOutputEvictionIds = [];
      this.evictCompletedStepOutputs(toEvict);
    }
    if (flushedIds.length > 0) {
      this.pendingOutputEvictionIds = flushedIds;
      this.evictCompletedStepInputs(flushedIds);
    }
  }

  /**
   * Drops in-memory IO without marking the step as rehydratable from ES.
   * Used by `evictStaleLoopOutputs` for non-latest loop executions whose
   * output and input no caller will ever read again — there's no value in
   * paying an ES round-trip to bring them back. Pinned-type guards live
   * here so the loop-cleanup caller doesn't have to know the rules.
   */
  private dropStaleStepIo(stepExecutionId: string): void {
    const step = this.state.getStepExecution(stepExecutionId);
    if (!step) return;
    if (step.stepType && this.pinnedStepTypes.has(step.stepType)) return;
    if (this.isPinned(stepExecutionId)) return;
    this.outputs.delete(stepExecutionId);
    this.inputs.delete(stepExecutionId);
    this.clearOutputSize(stepExecutionId);
  }

  private evictCompletedStepOutputs(candidateIds: ReadonlyArray<string>): void {
    let evictedCount = 0;
    for (const id of candidateIds) {
      const step = this.state.getStepExecution(id);
      if (step && this.isEvictionCandidate(id, step)) {
        const sizeBytes = this.outputSizes.get(id);
        this.outputs.delete(id);
        this.clearOutputSize(id);
        this.setEvicted(id, sizeBytes);
        evictedCount++;
        this.logger?.debug(
          `Evicted output of step '${step.stepId}' (${formatBytes(sizeBytes ?? 0)}) from memory`
        );
      }
    }
    if (evictedCount > 0) {
      this.logger?.debug(
        `Evicted ${evictedCount} step output(s), total evicted: ${this.evictedOutputIds.size}`
      );
    }
  }

  private evictCompletedStepInputs(candidateIds: ReadonlyArray<string>): void {
    let evictedCount = 0;
    for (const id of candidateIds) {
      const step = this.state.getStepExecution(id);
      if (step) {
        const isTerminal =
          step.status === ExecutionStatus.COMPLETED || step.status === ExecutionStatus.FAILED;
        if (isTerminal && this.inputs.has(id)) {
          this.inputs.delete(id);
          evictedCount++;
        }
      }
    }
    if (evictedCount > 0) {
      this.logger?.debug(`Evicted input from ${evictedCount} completed step(s)`);
    }
  }

  private isEvictionCandidate(stepExecutionId: string, step: StepExecutionMetadata): boolean {
    if (this.evictedOutputIds.has(stepExecutionId)) {
      return false;
    }
    // Pinned outputs (e.g. an active loop's source) must stay resident.
    if (this.isPinned(stepExecutionId)) {
      return false;
    }
    // Only evict COMPLETED steps. Failed steps have `output: null` (semantic
    // "no output") and evicting them would shift the meaning to `undefined`
    // (semantic "evicted"), which downstream code distinguishes.
    if (step.status !== ExecutionStatus.COMPLETED) {
      return false;
    }
    // Already cleared by evictStaleLoopOutputs.
    if (!this.outputs.has(stepExecutionId)) {
      return false;
    }
    if (step.stepType && this.pinnedStepTypes.has(step.stepType)) {
      return false;
    }
    const recordedSize = this.outputSizes.get(stepExecutionId);
    // No recorded size = not measured by Layer 2 = assumed small.
    if (recordedSize === undefined || recordedSize < this.evictionMinBytes) {
      return false;
    }
    return true;
  }

  /**
   * Eligibility check for releasing a transiently rehydrated output back to
   * the evicted state. Same shape as {@link isEvictionCandidate} minus the
   * size threshold — the output already met the threshold the first time it
   * was evicted, so it remains eligible regardless of recorded size.
   */
  private isReleaseCandidate(stepExecutionId: string): boolean {
    const step = this.state.getStepExecution(stepExecutionId);
    if (!step) return false;
    if (this.evictedOutputIds.has(stepExecutionId)) return false;
    // Pinned outputs (e.g. an active loop's source) must stay resident.
    if (this.isPinned(stepExecutionId)) return false;
    if (step.status !== ExecutionStatus.COMPLETED) return false;
    if (!this.outputs.has(stepExecutionId)) return false;
    if (step.stepType && this.pinnedStepTypes.has(step.stepType)) return false;
    return true;
  }
}

/**
 * Returns a copy of the step doc with `input` and `output` stripped. Used at
 * load time before handing the doc to state — IO ownership lives in the
 * service's input/output maps, never in state, so `StepExecutionMetadata`
 * (which is `Omit<EsWorkflowStepExecution, 'input' | 'output'>`) must not
 * carry those fields.
 */
function stripIo(step: EsWorkflowStepExecution): StepExecutionMetadata {
  const { input: _input, output: _output, ...metadata } = step;
  return metadata;
}
