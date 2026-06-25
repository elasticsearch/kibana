/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import type { JsonValue } from '@kbn/utility-types';
import { ExecutionStatus } from '@kbn/workflows';
import type {
  ConnectorStep,
  EsWorkflowExecution,
  EsWorkflowStepExecution,
  StackFrame,
  WorkflowYaml,
} from '@kbn/workflows';
import { WorkflowGraph } from '@kbn/workflows/graph';
import type { StepExecutionRepository } from '../../repositories/step_execution_repository';
import type { WorkflowExecutionRepository } from '../../repositories/workflow_execution_repository';
import { buildStepExecutionId } from '../../utils';
import { StepIoService } from '../step_io_service';
import { WorkflowExecutionState } from '../workflow_execution_state';

/**
 * Builds a state + service pair backed by jest-mock repositories. Returns
 * the service under test plus the state so suites can seed step docs via
 * the existing `upsertStep` API.
 */
function buildHarness(opts: { evictionMinBytes?: number; logger?: Logger } = {}) {
  const workflowExecutionRepository = {
    updateWorkflowExecution: jest.fn(),
  } as unknown as jest.Mocked<WorkflowExecutionRepository>;

  const stepExecutionRepository = {
    bulkUpsert: jest.fn().mockResolvedValue(undefined),
    getStepExecutionsByIds: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<StepExecutionRepository>;

  const fakeWorkflowExecution = {
    id: 'test-workflow-execution-id',
    workflowId: 'test-workflow-id',
    status: ExecutionStatus.RUNNING,
    startedAt: '2025-08-05T20:00:00.000Z',
    isTestRun: false,
  } as EsWorkflowExecution;

  const state = new WorkflowExecutionState(fakeWorkflowExecution, workflowExecutionRepository);
  // The type requires scopeStack but tests construct via the standard `as`
  // cast — set an empty stack here so prepareForRead can read it.
  state.updateWorkflowExecution({ scopeStack: [] });
  const service = new StepIoService({
    stepRepository: stepExecutionRepository,
    state,
    evictionMinBytes: opts.evictionMinBytes ?? Infinity,
    logger: opts.logger,
  });

  return { state, service, stepExecutionRepository, workflowExecutionRepository };
}

/**
 * Convenience helper: seeds a COMPLETED step's metadata through state and
 * its output through the service. Mirrors the production split — state
 * owns lifecycle, service owns IO.
 */
function createCompletedStep(
  state: WorkflowExecutionState,
  service: StepIoService,
  id: string,
  stepId: string,
  output: JsonValue | null,
  stepType?: string
): void {
  state.upsertStep({
    id,
    stepId,
    stepType,
    status: ExecutionStatus.COMPLETED,
  });
  service.setStepOutput(id, output);
}

/**
 * Test helper that mirrors the production flow: state holds lifecycle
 * (status/stepId/stepType), the service holds IO (output + size). Use this
 * instead of `createCompletedStep + service.recordOutputSize(...)` so the
 * test seeds size through the supported `setStepOutput` API.
 */
function seedCompletedStepWithSize(
  state: WorkflowExecutionState,
  service: StepIoService,
  id: string,
  stepId: string,
  output: JsonValue | null,
  sizeBytes: number,
  stepType?: string
): void {
  state.upsertStep({
    id,
    stepId,
    stepType,
    status: ExecutionStatus.COMPLETED,
  } as Partial<EsWorkflowStepExecution>);
  service.setStepOutput(id, output, sizeBytes);
}

describe('StepIoService', () => {
  const EVICTION_THRESHOLD = 100; // bytes

  describe('IO reads/writes', () => {
    it('returns step output via service when state owns the doc', () => {
      const { state, service } = buildHarness();
      createCompletedStep(state, service, 'step-1', 'myStep', { hello: 'world' }, 'connector');
      expect(service.getStepOutput('step-1')).toEqual({ hello: 'world' });
    });

    it('returns step input via service', () => {
      const { service } = buildHarness();
      service.setStepInput('step-1', { foo: 'bar' });
      expect(service.getStepInput('step-1')).toEqual({ foo: 'bar' });
    });

    it('writes step input through state.upsertStep', () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        status: ExecutionStatus.RUNNING,
      } as Partial<EsWorkflowStepExecution>);
      service.setStepInput('step-1', { foo: 'bar' });
      expect(service.getStepInput('step-1')).toEqual({ foo: 'bar' });
    });

    it('returns step error via service when state holds the error', () => {
      const { state, service } = buildHarness();
      // The service no longer owns lifecycle metadata (status / error /
      // scopeStack) — that's the runtime's job now. The service still surfaces
      // the error through `getStepError` by reading current state.
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.FAILED,
        error: { type: 'BadThing', message: 'boom' },
      } as Partial<EsWorkflowStepExecution>);
      expect(service.getStepError('step-1')).toEqual({ type: 'BadThing', message: 'boom' });
    });

    it('returns undefined for unknown step error', () => {
      const { service } = buildHarness();
      expect(service.getStepError('does-not-exist')).toBeUndefined();
    });

    it('getLatestStepIO returns input/output/error for the latest execution by stepId', () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'exec-1',
        stepId: 'loopStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      });
      service.setStepInput('exec-1', { i: 1 });
      service.setStepOutput('exec-1', { o: 'first' });
      state.upsertStep({
        id: 'exec-2',
        stepId: 'loopStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      });
      service.setStepInput('exec-2', { i: 2 });
      service.setStepOutput('exec-2', { o: 'second' });

      expect(service.getLatestStepIO('loopStep')).toEqual({
        input: { i: 2 },
        output: { o: 'second' },
        error: undefined,
      });
    });

    it('getLatestStepIO returns undefined when no execution exists', () => {
      const { service } = buildHarness();
      expect(service.getLatestStepIO('never-ran')).toBeUndefined();
    });

    it('getDataSetVariables aggregates outputs from data.set steps in execution order', () => {
      const { state, service } = buildHarness();
      createCompletedStep(state, service, 'exec-1', 'setA', { foo: 1 }, 'data.set');
      createCompletedStep(state, service, 'exec-2', 'setB', { bar: 2 }, 'data.set');
      // Later data.set wins on conflict.
      createCompletedStep(state, service, 'exec-3', 'setA', { foo: 99 }, 'data.set');
      // Non-data.set should be ignored.
      createCompletedStep(state, service, 'exec-4', 'connector', { ignored: true }, 'connector');

      expect(service.getDataSetVariables()).toEqual({ foo: 99, bar: 2 });
    });

    it('getDataSetVariables ignores non-object data.set outputs', () => {
      const { state, service } = buildHarness();
      createCompletedStep(state, service, 'exec-1', 'setA', { foo: 1 }, 'data.set');
      createCompletedStep(state, service, 'exec-2', 'setB', ['arr'], 'data.set');
      createCompletedStep(state, service, 'exec-3', 'setC', null, 'data.set');

      expect(service.getDataSetVariables()).toEqual({ foo: 1 });
    });

    it('setStepOutput writes the output through state and records the size', () => {
      const { state, service } = buildHarness();
      // The runtime would write the lifecycle fields first; tests exercise
      // the IO half in isolation.
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      service.setStepOutput('step-1', { result: 'ok' }, 12);

      expect(service.getStepOutput('step-1')).toEqual({ result: 'ok' });
      expect(service.getOutputSizeStats()).toEqual({ totalBytes: 12, stepCount: 1 });
    });

    it('setStepOutput accepts the FAILED-step null sentinel', () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.FAILED,
      } as Partial<EsWorkflowStepExecution>);
      service.setStepOutput('step-1', null);

      expect(service.getStepOutput('step-1')).toBeNull();
      // No size recorded for FAILED steps (the caller passed no sizeBytes).
      expect(service.getOutputSizeStats()).toEqual({ totalBytes: 0, stepCount: 0 });
    });

    it('setStepOutput ignores negative or non-finite sizeBytes', () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      service.setStepOutput('step-1', { ok: true }, -1);
      service.setStepOutput('step-1', { ok: true }, NaN);
      service.setStepOutput('step-1', { ok: true }, Infinity);

      expect(service.getOutputSizeStats()).toEqual({ totalBytes: 0, stepCount: 0 });
    });

    it('clears the evicted flag so rehydration does not overwrite fresh output', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: 0,
      });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'run_health_check',
        { stale: true },
        1,
        'workflow.execute'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();
      expect(service.hasEvictedOutputs()).toBe(true);

      service.setStepOutput('step-1', { health: 'ok' });

      expect(service.hasEvictedOutputs()).toBe(false);
      expect(service.getStepOutput('step-1')).toEqual({ health: 'ok' });

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        {
          id: 'step-1',
          output: { stale: true },
          workflowRunId: 'test-workflow-execution-id',
        } as unknown as EsWorkflowStepExecution,
      ]);

      await service.rehydrateOutputs(['step-1']);

      expect(service.getStepOutput('step-1')).toEqual({ health: 'ok' });
      expect(stepExecutionRepository.getStepExecutionsByIds).not.toHaveBeenCalled();
    });
  });

  describe('size threshold (driven through setStepOutput)', () => {
    it('stores size for later threshold check', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'something' },
        50,
        'connector'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();
      expect(service.hasEvictedOutputs()).toBe(false);

      seedCompletedStepWithSize(
        state,
        service,
        'step-2',
        'myStep2',
        { data: 'large' },
        200,
        'connector'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();
      expect(service.hasEvictedOutputs()).toBe(true);
      expect(service.getStepOutput('step-2')).toBeUndefined();
    });
  });

  describe('getOutputSizeStats', () => {
    it('returns zeros when nothing recorded', () => {
      const { service } = buildHarness();
      expect(service.getOutputSizeStats()).toEqual({ totalBytes: 0, stepCount: 0 });
    });

    it('sums sizes from non-evicted steps', () => {
      const { state, service } = buildHarness();
      seedCompletedStepWithSize(state, service, 'step-1', 's1', { data: 'a' }, 100, 'connector');
      seedCompletedStepWithSize(state, service, 'step-2', 's2', { data: 'b' }, 200, 'connector');

      expect(service.getOutputSizeStats()).toEqual({ totalBytes: 300, stepCount: 2 });
    });

    it('combines sizes from active and evicted steps', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(state, service, 'step-1', 's1', { data: 'a' }, 150, 'connector');
      seedCompletedStepWithSize(state, service, 'step-2', 's2', { data: 'b' }, 250, 'connector');

      // Drive step-2 through the deferral cycle so it ends up evicted.
      await service.flushStepChanges();
      await service.flushStepChanges();

      const stats = service.getOutputSizeStats();
      expect(stats.totalBytes).toBe(400);
      expect(stats.stepCount).toBe(2);
    });
  });

  describe('hasEvictedOutputs', () => {
    it('returns false when nothing is evicted', () => {
      const { service } = buildHarness();
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('returns true after eviction', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'large' },
        250,
        'connector'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.hasEvictedOutputs()).toBe(true);
    });
  });

  describe('eviction policy', () => {
    it('evicts output above threshold from completed step', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { largeData: 'x'.repeat(200) },
        250,
        'connector'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeUndefined();
      expect(service.hasEvictedOutputs()).toBe(true);
    });

    it('evicts output exactly at threshold (minPayloadSize is inclusive)', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'at-boundary' },
        EVICTION_THRESHOLD,
        'connector'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeUndefined();
      expect(service.hasEvictedOutputs()).toBe(true);
    });

    it('retains output below threshold', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      const smallOutput = { key: 'val' };
      seedCompletedStepWithSize(state, service, 'step-1', 'myStep', smallOutput, 10, 'connector');

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toEqual(smallOutput);
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('retains output from running steps', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.RUNNING,
      } as Partial<EsWorkflowStepExecution>);
      // Record an above-threshold size to prove the eviction predicate still
      // gates on COMPLETED status, not on size alone.
      service.setStepOutput('step-1', { data: 'x'.repeat(200) }, 250);

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeDefined();
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('retains output from data.set steps regardless of size (pinned)', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myDataSet',
        { largeData: 'x'.repeat(200) },
        250,
        'data.set'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeDefined();
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('retains output from waitForInput steps regardless of size (pinned)', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'wait',
        { answer: 'x'.repeat(200) },
        250,
        'waitForInput'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeDefined();
    });

    it('skips steps with no recorded size (assumes small)', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      createCompletedStep(state, service, 'step-1', 'myStep', { data: 'something' }, 'connector');
      // No recordOutputSize call

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeDefined();
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    describe('loop source pinning (pinForeachSource / unpinForeachScope)', () => {
      it('keeps a pinned loop source resident across an eviction cycle', async () => {
        const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
        // A >threshold source output the loop iterates over.
        seedCompletedStepWithSize(
          state,
          service,
          'source-exec',
          'bigSource',
          { items: 'x'.repeat(200) },
          250,
          'connector'
        );

        // Pin it as a foreach source (the expression references `bigSource`).
        service.pinForeachSource('myForeach', '{{ steps.bigSource.output.items }}');

        await service.flushStepChanges();
        await service.flushStepChanges();

        // Without the pin this would be evicted (it is above threshold); the
        // pin must keep it resident for the lifetime of the loop.
        expect(service.getStepOutput('source-exec')).toEqual({ items: 'x'.repeat(200) });
        expect(service.hasEvictedOutputs()).toBe(false);
      });

      it('allows the source to be evicted again after the loop scope is unpinned', async () => {
        const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
        seedCompletedStepWithSize(
          state,
          service,
          'source-exec',
          'bigSource',
          { items: 'x'.repeat(200) },
          250,
          'connector'
        );

        service.pinForeachSource('myForeach', '{{ steps.bigSource.output.items }}');

        await service.flushStepChanges();
        await service.flushStepChanges();
        expect(service.getStepOutput('source-exec')).toBeDefined();

        // Loop exits -> release the pin. The output is no longer protected:
        // re-touching it re-queues it for the deferred eviction cycle (mirrors a
        // subsequent step write in the same flush), and it is now evicted.
        service.unpinForeachScope('myForeach');
        service.setStepOutput('source-exec', { items: 'x'.repeat(200) }, 250);

        await service.flushStepChanges();
        await service.flushStepChanges();

        expect(service.getStepOutput('source-exec')).toBeUndefined();
        expect(service.hasEvictedOutputs()).toBe(true);
      });

      it('keeps the source pinned until every loop scope that pinned it has unpinned', async () => {
        const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
        seedCompletedStepWithSize(
          state,
          service,
          'source-exec',
          'bigSource',
          { items: 'x'.repeat(200) },
          250,
          'connector'
        );

        // Two distinct loop scopes pin the same source (nested/sibling loops).
        service.pinForeachSource('loopA', '{{ steps.bigSource.output.items }}');
        service.pinForeachSource('loopB', '{{ steps.bigSource.output.items }}');

        // Inner loop exits — source must stay resident for the outer loop. Even
        // re-touching it (re-queuing for eviction) must not evict while loopA
        // still holds the pin.
        service.unpinForeachScope('loopB');
        service.setStepOutput('source-exec', { items: 'x'.repeat(200) }, 250);
        await service.flushStepChanges();
        await service.flushStepChanges();
        expect(service.getStepOutput('source-exec')).toBeDefined();
        expect(service.hasEvictedOutputs()).toBe(false);

        // Outer loop exits — now nothing pins it and it can be evicted.
        service.unpinForeachScope('loopA');
        service.setStepOutput('source-exec', { items: 'x'.repeat(200) }, 250);
        await service.flushStepChanges();
        await service.flushStepChanges();
        expect(service.getStepOutput('source-exec')).toBeUndefined();
      });
    });

    it('does not evict failed steps (output: null is semantic)', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.FAILED,
      } as Partial<EsWorkflowStepExecution>);
      // Even with a recorded size, the eviction predicate must keep null:
      // null is the FAILED-step sentinel, distinct from `undefined` (evicted).
      service.setStepOutput('step-1', null, 250);

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeNull();
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('does not add to stepDocumentsChanges when evicting', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'x'.repeat(200) },
        250,
        'connector'
      );

      // Cycle 1: persists + queues for eviction.
      await service.flushStepChanges();
      jest.clearAllMocks();

      // Cycle 2: drains eviction; no new doc change should be sent.
      await service.flushStepChanges();
      expect(stepExecutionRepository.bulkUpsert).not.toHaveBeenCalled();
    });
  });

  describe('rehydrateOutputs', () => {
    it('calls repository and restores output', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      const originalOutput = { restored: true, data: 'x'.repeat(200) };
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        originalOutput,
        250,
        'connector'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();
      expect(service.getStepOutput('step-1')).toBeUndefined();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        {
          id: 'step-1',
          stepId: 'myStep',
          output: originalOutput,
        } as unknown as EsWorkflowStepExecution,
      ]);

      await service.rehydrateOutputs(['step-1']);

      expect(service.getStepOutput('step-1')).toEqual(originalOutput);
      expect(service.hasEvictedOutputs()).toBe(false);
      expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledWith(
        ['step-1'],
        ['id', 'output', 'workflowRunId']
      );
    });

    it('is a no-op when no requested IDs are evicted', async () => {
      const { state, service, stepExecutionRepository } = buildHarness();
      createCompletedStep(state, service, 'step-1', 'myStep', { data: 'small' }, 'connector');

      await service.rehydrateOutputs(['step-1']);

      expect(stepExecutionRepository.getStepExecutionsByIds).not.toHaveBeenCalled();
    });

    it('handles missing documents from ES gracefully', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'large' },
        250,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([]);

      await service.rehydrateOutputs(['step-1']);

      expect(service.hasEvictedOutputs()).toBe(false);
      expect(service.getStepOutput('step-1')).toBeUndefined();
    });

    it('drops cross-execution docs returned by mget instead of restoring foreign output', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'mine' },
        250,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      // ES returns a doc for the same `_id` but a different workflowRunId.
      // The service must refuse to restore it (defends against a custom
      // resume path with mis-typed IDs or a hash collision).
      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValueOnce([
        {
          id: 'step-1',
          stepId: 'myStep',
          stepType: 'connector',
          workflowRunId: 'some-other-execution',
          output: { data: 'NOT MINE' },
        } as unknown as EsWorkflowStepExecution,
      ]);

      await service.rehydrateOutputs(['step-1']);

      expect(service.getStepOutput('step-1')).toBeUndefined();
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('logs missing-doc as warn (not error) when workflow is in a terminal status', async () => {
      const logger = loggerMock.create();
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
        logger,
      });

      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'large' },
        250,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([]);
      state.updateWorkflowExecution({ status: ExecutionStatus.COMPLETED });

      await service.rehydrateOutputs(['step-1']);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not found in ES during rehydration')
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs missing-doc as error when workflow is still RUNNING (active data loss)', async () => {
      const logger = loggerMock.create();
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
        logger,
      });

      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'large' },
        250,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([]);
      // Workflow remains RUNNING — missing doc indicates active data loss.

      await service.rehydrateOutputs(['step-1']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('not found in ES during rehydration')
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('releaseTransientlyRehydratedOutputs', () => {
    it('re-evicts outputs that were transiently rehydrated, without an ES call', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      const originalOutput = { restored: true, data: 'x'.repeat(200) };
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        originalOutput,
        250,
        'connector'
      );

      // Get to evicted state.
      await service.flushStepChanges();
      await service.flushStepChanges();
      expect(service.getStepOutput('step-1')).toBeUndefined();

      // Rehydrate.
      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'step-1', output: originalOutput } as unknown as EsWorkflowStepExecution,
      ]);
      await service.rehydrateOutputs(['step-1']);
      expect(service.getStepOutput('step-1')).toEqual(originalOutput);
      expect(service.hasEvictedOutputs()).toBe(false);
      stepExecutionRepository.getStepExecutionsByIds.mockClear();

      // Release should drop back to evicted with no ES round-trip.
      service.releaseTransientlyRehydratedOutputs();
      expect(service.getStepOutput('step-1')).toBeUndefined();
      expect(service.hasEvictedOutputs()).toBe(true);
      expect(stepExecutionRepository.getStepExecutionsByIds).not.toHaveBeenCalled();
    });

    it('is a no-op when nothing was transiently rehydrated', () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      createCompletedStep(state, service, 'step-1', 'myStep', { data: 'x' }, 'connector');

      service.releaseTransientlyRehydratedOutputs();
      expect(service.getStepOutput('step-1')).toEqual({ data: 'x' });
    });

    it('does not release pinned step types', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      // Pinned types are never evicted, so rehydrateOutputs would be a no-op
      // for them — but if a future code path mistakenly added them to the
      // transient set, release must guard against re-evicting them.
      seedCompletedStepWithSize(state, service, 'step-1', 'pinnedStep', { v: 1 }, 250, 'data.set');

      await service.flushStepChanges();
      await service.flushStepChanges();
      // data.set is pinned — output is still present.
      expect(service.getStepOutput('step-1')).toEqual({ v: 1 });

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([]);
      await service.rehydrateOutputs(['step-1']); // no-op, ID isn't evicted

      service.releaseTransientlyRehydratedOutputs();
      expect(service.getStepOutput('step-1')).toEqual({ v: 1 });
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('releases everything when called with no surviving consumer (workflow-end cleanup)', async () => {
      // Mirrors the workflow-end safety release in workflow_execution_loop:
      // after the last step, no further prepareForRead is going to run, so a
      // direct call to releaseTransientlyRehydratedOutputs must drop any
      // outputs left in the transient set.
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      const originalOutput = { restored: true, data: 'x'.repeat(200) };
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        originalOutput,
        250,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'step-1', output: originalOutput } as unknown as EsWorkflowStepExecution,
      ]);
      await service.rehydrateOutputs(['step-1']);
      expect(service.getStepOutput('step-1')).toEqual(originalOutput);

      service.releaseTransientlyRehydratedOutputs();
      expect(service.getStepOutput('step-1')).toBeUndefined();
      expect(service.hasEvictedOutputs()).toBe(true);
    });

    it('clears the transient set after release (idempotent)', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'x'.repeat(200) },
        250,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'step-1', output: { data: 'x'.repeat(200) } } as unknown as EsWorkflowStepExecution,
      ]);
      await service.rehydrateOutputs(['step-1']);

      service.releaseTransientlyRehydratedOutputs();
      expect(service.getStepOutput('step-1')).toBeUndefined();

      // Rehydrate again, then release — second cycle should still work.
      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'step-1', output: { data: 'x'.repeat(200) } } as unknown as EsWorkflowStepExecution,
      ]);
      await service.rehydrateOutputs(['step-1']);
      expect(service.getStepOutput('step-1')).toBeDefined();
      service.releaseTransientlyRehydratedOutputs();
      expect(service.getStepOutput('step-1')).toBeUndefined();
    });
  });

  describe('deferred output eviction via flushStepChanges', () => {
    it('does NOT evict output on the flush that persists it', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'x'.repeat(200) },
        250,
        'connector'
      );

      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeDefined();
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('evicts output on the second flush', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'x'.repeat(200) },
        250,
        'connector'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeUndefined();
      expect(service.hasEvictedOutputs()).toBe(true);
    });

    it('does not evict small outputs even after two flushes', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      const smallOutput = { key: 'val' };
      seedCompletedStepWithSize(state, service, 'step-1', 'myStep', smallOutput, 10, 'connector');

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toEqual(smallOutput);
      expect(service.hasEvictedOutputs()).toBe(false);
    });

    it('evicts previous batch and queues new batch on successive flushes', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-a',
        'sA',
        { data: 'a'.repeat(200) },
        250,
        'connector'
      );
      await service.flushStepChanges();

      seedCompletedStepWithSize(
        state,
        service,
        'step-b',
        'sB',
        { data: 'b'.repeat(200) },
        300,
        'connector'
      );
      await service.flushStepChanges();

      expect(service.getStepOutput('step-a')).toBeUndefined();
      expect(service.getStepOutput('step-b')).toBeDefined();

      await service.flushStepChanges();
      expect(service.getStepOutput('step-b')).toBeUndefined();
    });

    it('processes pending eviction on empty flush (no new changes)', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myStep',
        { data: 'x'.repeat(200) },
        250,
        'connector'
      );

      await service.flushStepChanges();
      expect(service.getStepOutput('step-1')).toBeDefined();

      await service.flushStepChanges();
      expect(service.getStepOutput('step-1')).toBeUndefined();
      expect(service.hasEvictedOutputs()).toBe(true);
    });

    it('does not evict data.set outputs even after deferral', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      seedCompletedStepWithSize(
        state,
        service,
        'step-1',
        'myDataSet',
        { largeData: 'x'.repeat(200) },
        250,
        'data.set'
      );

      await service.flushStepChanges();
      await service.flushStepChanges();

      expect(service.getStepOutput('step-1')).toBeDefined();
      expect(service.hasEvictedOutputs()).toBe(false);
    });
  });

  describe('input eviction', () => {
    it('evicts input from completed step after flush', async () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      });
      service.setStepInput('step-1', { message: 'hello' });
      service.setStepOutput('step-1', { result: 'ok' });

      await service.flushStepChanges();

      expect(service.getStepInput('step-1')).toBeUndefined();
    });

    it('evicts input from failed step after flush', async () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.FAILED,
      });
      service.setStepInput('step-1', { message: 'hello' });
      service.setStepOutput('step-1', null);

      await service.flushStepChanges();

      expect(service.getStepInput('step-1')).toBeUndefined();
    });

    it('does NOT evict input from running step after flush', async () => {
      const { state, service } = buildHarness();
      const input = { foreach: '{{steps.data.output}}' };
      state.upsertStep({
        id: 'step-1',
        stepId: 'loopStep',
        stepType: 'foreach',
        status: ExecutionStatus.RUNNING,
      });
      service.setStepInput('step-1', input);

      await service.flushStepChanges();

      expect(service.getStepInput('step-1')).toEqual(input);
    });

    it('does NOT evict input from waiting step after flush', async () => {
      const { state, service } = buildHarness();
      const input = { duration: '20m' };
      state.upsertStep({
        id: 'step-1',
        stepId: 'waitStep',
        stepType: 'wait',
        status: ExecutionStatus.WAITING,
      });
      service.setStepInput('step-1', input);

      await service.flushStepChanges();

      expect(service.getStepInput('step-1')).toEqual(input);
    });

    it('does not cause stepDocumentsChanges on subsequent flush after input eviction', async () => {
      const { state, service, stepExecutionRepository } = buildHarness();
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      });
      service.setStepInput('step-1', { message: 'hello' });

      await service.flushStepChanges();
      jest.clearAllMocks();

      await service.flushStepChanges();
      expect(stepExecutionRepository.bulkUpsert).not.toHaveBeenCalled();
    });

    it('evicts input immediately and output on the next flush', async () => {
      const { state, service } = buildHarness({ evictionMinBytes: EVICTION_THRESHOLD });
      state.upsertStep({
        id: 'step-1',
        stepId: 'myStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      });
      service.setStepInput('step-1', { message: 'hello' });
      service.setStepOutput('step-1', { data: 'x'.repeat(200) }, 250);

      await service.flushStepChanges();
      expect(service.getStepInput('step-1')).toBeUndefined();
      expect(service.getStepOutput('step-1')).toBeDefined();

      await service.flushStepChanges();
      expect(service.getStepOutput('step-1')).toBeUndefined();
      expect(service.hasEvictedOutputs()).toBe(true);
    });
  });

  describe('interaction with evictStaleLoopOutputs', () => {
    it('handles both eviction systems acting on the same step', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({
        evictionMinBytes: EVICTION_THRESHOLD,
      });
      state.upsertStep({
        id: 'iter-1',
        stepId: 'loopStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      service.setStepOutput('iter-1', { data: 'x'.repeat(200) }, 250);

      state.upsertStep({
        id: 'iter-2',
        stepId: 'loopStep',
        stepType: 'connector',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      service.setStepOutput('iter-2', { data: 'y'.repeat(200) }, 250);

      // Stale-loop eviction nullifies iter-1 (non-latest).
      service.evictStaleLoopOutputs(['loopStep']);
      expect(service.getStepOutput('iter-1')).toBeUndefined();
      expect(service.getStepOutput('iter-2')).toBeDefined();

      // Run the deferral cycle on both — iter-1 won't be added to evicted set
      // (output already undefined), iter-2 will.
      await service.flushStepChanges();
      await service.flushStepChanges();
      expect(service.hasEvictedOutputs()).toBe(true);
      expect(service.getStepOutput('iter-2')).toBeUndefined();

      // iter-2 can be rehydrated from ES.
      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'iter-2', output: { data: 'y'.repeat(200) } } as unknown as EsWorkflowStepExecution,
      ]);
      await service.rehydrateOutputs(['iter-2']);
      expect(service.getStepOutput('iter-2')).toBeDefined();
    });
  });

  describe('evictCompletedLoopsOnResume', () => {
    // Logic moved here from WorkflowExecutionRuntimeManager — see B.6 in the
    // review. The runtime manager test now only verifies delegation; the
    // behavioural assertions live next to the implementation.

    function makeGraph(innerStepIdsByLoop: Record<string, Set<string>>) {
      return {
        getInnerStepIds: jest.fn(
          (loopStepId: string) => innerStepIdsByLoop[loopStepId] ?? new Set()
        ),
      };
    }

    it('evicts inner step outputs for completed foreach loops', () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'foreach-1',
        stepId: 'myForeach',
        stepType: 'foreach',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      const graph = makeGraph({ myForeach: new Set(['inner']) });

      service.evictCompletedLoopsOnResume(graph);

      expect(graph.getInnerStepIds).toHaveBeenCalledWith('myForeach');
    });

    it('evicts inner step outputs for completed while loops', () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'while-1',
        stepId: 'myWhile',
        stepType: 'while',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      const graph = makeGraph({ myWhile: new Set(['body']) });

      service.evictCompletedLoopsOnResume(graph);

      expect(graph.getInnerStepIds).toHaveBeenCalledWith('myWhile');
    });

    it('skips loops still running at resume time', () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'foreach-1',
        stepId: 'midForeach',
        stepType: 'foreach',
        status: ExecutionStatus.RUNNING,
      } as Partial<EsWorkflowStepExecution>);
      const graph = makeGraph({});

      service.evictCompletedLoopsOnResume(graph);

      expect(graph.getInnerStepIds).not.toHaveBeenCalled();
    });

    it('de-duplicates by stepId when a nested loop has multiple COMPLETED executions', () => {
      const { state, service } = buildHarness();
      // 3 executions of the same inner loop, all COMPLETED.
      state.upsertStep({
        id: 'inner-1',
        stepId: 'innerForeach',
        stepType: 'foreach',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      state.upsertStep({
        id: 'inner-2',
        stepId: 'innerForeach',
        stepType: 'foreach',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      state.upsertStep({
        id: 'inner-3',
        stepId: 'innerForeach',
        stepType: 'foreach',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      const graph = makeGraph({ innerForeach: new Set(['deepAction']) });

      service.evictCompletedLoopsOnResume(graph);

      expect(graph.getInnerStepIds).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when there are no loop steps', () => {
      const { state, service } = buildHarness();
      state.upsertStep({
        id: 'a',
        stepId: 'action1',
        stepType: 'slack',
        status: ExecutionStatus.COMPLETED,
      } as Partial<EsWorkflowStepExecution>);
      const graph = makeGraph({});

      service.evictCompletedLoopsOnResume(graph);

      expect(graph.getInnerStepIds).not.toHaveBeenCalled();
    });
  });

  describe('load (resume-time deferred outputs)', () => {
    /**
     * Drives the public `service.load()` path with mocked repository
     * responses, exercising the same deferred/eager registration logic
     * `markDeferredAfterLoad` does internally.
     */
    async function driveLoad(
      steps: EsWorkflowStepExecution[],
      pinnedOutputs: Array<{ id: string; output: unknown }> = []
    ) {
      const harness = buildHarness();
      harness.state.updateWorkflowExecution({ stepExecutionIds: steps.map((s) => s.id) });
      const calls = harness.stepExecutionRepository.getStepExecutionsByIds as jest.Mock;
      calls.mockReset();
      // First call: load without outputs.
      calls.mockResolvedValueOnce(steps);
      // Second call (only if pinned IDs are returned): eager output fetch.
      if (pinnedOutputs.length > 0) {
        calls.mockResolvedValueOnce(
          pinnedOutputs.map((p) => ({ id: p.id, output: p.output } as EsWorkflowStepExecution))
        );
      }
      await harness.service.load();
      return harness;
    }

    it('marks non-pinned step outputs as deferred', async () => {
      const { service } = await driveLoad([
        {
          id: '11',
          stepId: 'connectorStep',
          stepType: 'connector',
          status: ExecutionStatus.COMPLETED,
        } as EsWorkflowStepExecution,
      ]);
      expect(service.hasEvictedOutputs()).toBe(true);
    });

    it('eagerly fetches outputs for data.set step types', async () => {
      const { service, stepExecutionRepository } = await driveLoad(
        [
          {
            id: '11',
            stepId: 'setVar',
            stepType: 'data.set',
            status: ExecutionStatus.COMPLETED,
          } as EsWorkflowStepExecution,
        ],
        [{ id: '11', output: { v: 1 } }]
      );
      expect(service.hasEvictedOutputs()).toBe(false);
      expect(service.getStepOutput('11')).toEqual({ v: 1 });
      expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenNthCalledWith(
        2,
        ['11'],
        ['id', 'output']
      );
    });

    it('eagerly fetches outputs for waitForInput step types', async () => {
      const { service } = await driveLoad(
        [
          {
            id: '11',
            stepId: 'wait',
            stepType: 'waitForInput',
            status: ExecutionStatus.COMPLETED,
          } as EsWorkflowStepExecution,
        ],
        [{ id: '11', output: { reply: 'ok' } }]
      );
      expect(service.hasEvictedOutputs()).toBe(false);
      expect(service.getStepOutput('11')).toEqual({ reply: 'ok' });
    });

    it('treats undefined stepType as non-pinned', async () => {
      const { service } = await driveLoad([
        {
          id: '11',
          stepId: 'legacyStep',
          status: ExecutionStatus.COMPLETED,
        } as EsWorkflowStepExecution,
      ]);
      expect(service.hasEvictedOutputs()).toBe(true);
    });
  });

  describe('prepareForRead', () => {
    function buildGraphWorkflow() {
      const workflow = {
        name: 'Targeted',
        version: '1',
        description: 'test',
        enabled: true,
        triggers: [],
        steps: [
          { name: 'step_a', type: 'console', with: { message: 'A' } } as ConnectorStep,
          {
            name: 'step_b',
            type: 'console',
            with: { message: '{{steps.step_a.output}}' },
          } as ConnectorStep,
          {
            name: 'step_c',
            type: 'console',
            with: { message: '{{steps.step_b.output}}' },
          } as ConnectorStep,
        ],
      } as unknown as WorkflowYaml;
      const graph = WorkflowGraph.fromWorkflowDefinition(workflow);
      const stepCNode = graph.topologicalOrder
        .map((nodeId) => graph.getNode(nodeId))
        .find((n) => n.stepId === 'step_c')!;
      return { graph, stepCNode };
    }

    it('is a no-op when nothing is evicted', async () => {
      const { service, stepExecutionRepository } = buildHarness();
      const { graph, stepCNode } = buildGraphWorkflow();
      await service.prepareForRead({
        node: stepCNode,
        predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
      });
      expect(stepExecutionRepository.getStepExecutionsByIds).not.toHaveBeenCalled();
    });

    it('preserves fresh output when a deferred step completes on resume before flush', async () => {
      const { state, service, stepExecutionRepository } = buildHarness();
      state.updateWorkflowExecution({ stepExecutionIds: ['exec-child'] });

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValueOnce([
        {
          id: 'exec-child',
          stepId: 'run_health_check',
          stepType: 'workflow.execute',
          status: ExecutionStatus.WAITING_FOR_CHILD,
        } as EsWorkflowStepExecution,
      ]);
      await service.load();

      expect(service.hasEvictedOutputs()).toBe(true);
      expect(service.getStepOutput('exec-child')).toBeUndefined();

      state.upsertStep({
        id: 'exec-child',
        stepId: 'run_health_check',
        stepType: 'workflow.execute',
        status: ExecutionStatus.COMPLETED,
      });
      const childOutput = { health: 'ok' };
      service.setStepOutput('exec-child', childOutput);

      const workflow = {
        name: 'Parent',
        version: '1',
        description: 'test',
        enabled: true,
        triggers: [],
        steps: [
          {
            name: 'run_health_check',
            type: 'workflow.execute',
            with: { 'workflow-id': 'child' },
          } as ConnectorStep,
          {
            name: 'log_result',
            type: 'console',
            with: { message: '{{steps.run_health_check.output | json}}' },
          } as ConnectorStep,
        ],
      } as unknown as WorkflowYaml;
      const graph = WorkflowGraph.fromWorkflowDefinition(workflow);
      const logResultNode = graph.topologicalOrder
        .map((nodeId) => graph.getNode(nodeId))
        .find((n) => n.stepId === 'log_result')!;

      stepExecutionRepository.getStepExecutionsByIds.mockClear();
      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        {
          id: 'exec-child',
          output: null,
          workflowRunId: 'test-workflow-execution-id',
        } as unknown as EsWorkflowStepExecution,
      ]);

      await service.prepareForRead({
        node: logResultNode,
        predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
      });

      expect(service.getStepOutput('exec-child')).toEqual(childOutput);
      expect(stepExecutionRepository.getStepExecutionsByIds).not.toHaveBeenCalled();
    });

    it('rehydrates only the step IDs referenced in template expressions', async () => {
      const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
      const { graph, stepCNode } = buildGraphWorkflow();

      // Seed two completed predecessors and drive them through the deferred
      // eviction cycle so they end up in the evicted-outputs map.
      seedCompletedStepWithSize(state, service, 'exec-a', 'step_a', { v: 'a' }, 1, 'connector');
      seedCompletedStepWithSize(state, service, 'exec-b', 'step_b', { v: 'b' }, 1, 'connector');
      await service.flushStepChanges();
      await service.flushStepChanges();
      expect(service.hasEvictedOutputs()).toBe(true);
      stepExecutionRepository.bulkUpsert.mockClear();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'exec-b', output: { v: 'b' } } as unknown as EsWorkflowStepExecution,
      ]);

      await service.prepareForRead({
        node: stepCNode,
        predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
      });

      // Only step_b is referenced by step_c — exec-a should not be rehydrated.
      expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledWith(
        ['exec-b'],
        ['id', 'output', 'workflowRunId']
      );
    });

    it('rehydrates outputs referenced by the active foreach source expression', async () => {
      const workflow: WorkflowYaml = {
        name: 'Foreach source dependency',
        version: '1',
        description: 'test',
        enabled: true,
        triggers: [],
        steps: [
          {
            name: 'get_active_alerts',
            type: 'console',
            with: { message: 'alerts' },
          } as ConnectorStep,
          {
            name: 'foreach_alert',
            type: 'foreach',
            foreach: '{{steps.get_active_alerts.output.hits.hits}}',
            steps: [
              {
                name: 'create_new_case',
                type: 'console',
                with: { message: 'case' },
              } as ConnectorStep,
              {
                name: 'add_alert_to_case',
                type: 'console',
                with: {
                  message: 'case={{steps.create_new_case.output.id}} alert={{foreach.item._id}}',
                },
              } as ConnectorStep,
            ],
          },
        ],
      };
      const graph = WorkflowGraph.fromWorkflowDefinition(workflow);
      const addAlertNode = graph.topologicalOrder
        .map((nodeId) => graph.getNode(nodeId))
        .find((n) => n.stepId === 'add_alert_to_case')!;

      const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
      const alertsOutput = { hits: { hits: [{ _id: 'alert-1' }] } };
      seedCompletedStepWithSize(
        state,
        service,
        'exec-alerts',
        'get_active_alerts',
        alertsOutput,
        1,
        'connector'
      );
      seedCompletedStepWithSize(
        state,
        service,
        'exec-case',
        'create_new_case',
        { id: 'case-1' },
        1,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      const scopeStack: StackFrame[] = [
        {
          stepId: 'foreach_alert',
          nestedScopes: [
            {
              nodeId: 'enterForeach_foreach_alert',
              nodeType: 'enter-foreach',
              scopeId: '0',
            },
          ],
        },
      ];
      const foreachExecutionId = buildStepExecutionId(
        state.getWorkflowExecutionId(),
        'foreach_alert',
        []
      );
      state.updateWorkflowExecution({ scopeStack });
      state.upsertStep({
        id: foreachExecutionId,
        stepId: 'foreach_alert',
        stepType: 'foreach',
        status: ExecutionStatus.RUNNING,
        state: { index: 0, total: 1 },
      } as Partial<EsWorkflowStepExecution>);
      service.setStepInput(foreachExecutionId, {
        foreach: '{{steps.get_active_alerts.output.hits.hits}}',
      });

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'exec-alerts', output: alertsOutput } as unknown as EsWorkflowStepExecution,
        { id: 'exec-case', output: { id: 'case-1' } } as unknown as EsWorkflowStepExecution,
      ]);

      await service.prepareForRead({
        node: addAlertNode,
        predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
      });

      const rehydratedIds = stepExecutionRepository.getStepExecutionsByIds.mock.calls[0][0];
      expect(rehydratedIds).toEqual(expect.arrayContaining(['exec-alerts', 'exec-case']));
      expect(rehydratedIds).toHaveLength(2);
    });

    it('rehydrates outputs referenced by nested active foreach source expressions', async () => {
      const workflow = {
        name: 'Nested foreach source dependencies',
        version: '1',
        description: 'test',
        enabled: true,
        triggers: [],
        steps: [
          {
            name: 'get_outer_source',
            type: 'console',
            with: { message: 'outer' },
          } as ConnectorStep,
          {
            name: 'get_inner_source',
            type: 'console',
            with: { message: 'inner' },
          } as ConnectorStep,
          {
            name: 'outer_loop',
            type: 'foreach',
            foreach: '{{steps.get_outer_source.output.items}}',
            steps: [
              {
                name: 'create_new_case',
                type: 'console',
                with: { message: 'case' },
              } as ConnectorStep,
              {
                name: 'inner_loop',
                type: 'foreach',
                foreach: '{{steps.get_inner_source.output.items}}',
                steps: [
                  {
                    name: 'deep_step',
                    type: 'console',
                    with: {
                      message: 'case={{steps.create_new_case.output.id}} item={{foreach.item._id}}',
                    },
                  } as ConnectorStep,
                ],
              },
            ],
          },
        ],
      } as unknown as WorkflowYaml;
      const graph = WorkflowGraph.fromWorkflowDefinition(workflow);
      const deepStepNode = graph.topologicalOrder
        .map((nodeId) => graph.getNode(nodeId))
        .find((n) => n.stepId === 'deep_step')!;

      const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
      const outerOutput = { items: [{ group: 'a' }] };
      const innerOutput = { items: [{ _id: 'alert-1' }] };
      seedCompletedStepWithSize(
        state,
        service,
        'exec-outer-source',
        'get_outer_source',
        outerOutput,
        1,
        'connector'
      );
      seedCompletedStepWithSize(
        state,
        service,
        'exec-inner-source',
        'get_inner_source',
        innerOutput,
        1,
        'connector'
      );
      seedCompletedStepWithSize(
        state,
        service,
        'exec-case',
        'create_new_case',
        { id: 'case-1' },
        1,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      const outerFrame: StackFrame = {
        stepId: 'outer_loop',
        nestedScopes: [
          {
            nodeId: 'enterForeach_outer_loop',
            nodeType: 'enter-foreach',
            scopeId: '0',
          },
        ],
      };
      const innerFrame: StackFrame = {
        stepId: 'inner_loop',
        nestedScopes: [
          {
            nodeId: 'enterForeach_inner_loop',
            nodeType: 'enter-foreach',
            scopeId: '0',
          },
        ],
      };
      const outerExecutionId = buildStepExecutionId(
        state.getWorkflowExecutionId(),
        'outer_loop',
        []
      );
      const innerExecutionId = buildStepExecutionId(state.getWorkflowExecutionId(), 'inner_loop', [
        outerFrame,
      ]);
      state.updateWorkflowExecution({ scopeStack: [outerFrame, innerFrame] });
      state.upsertStep({
        id: outerExecutionId,
        stepId: 'outer_loop',
        stepType: 'foreach',
        status: ExecutionStatus.RUNNING,
        state: { index: 0, total: 1 },
      } as Partial<EsWorkflowStepExecution>);
      service.setStepInput(outerExecutionId, {
        foreach: '{{steps.get_outer_source.output.items}}',
      });
      state.upsertStep({
        id: innerExecutionId,
        stepId: 'inner_loop',
        stepType: 'foreach',
        status: ExecutionStatus.RUNNING,
        state: { index: 0, total: 1 },
      } as Partial<EsWorkflowStepExecution>);
      service.setStepInput(innerExecutionId, {
        foreach: '{{steps.get_inner_source.output.items}}',
      });

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'exec-outer-source', output: outerOutput } as unknown as EsWorkflowStepExecution,
        { id: 'exec-inner-source', output: innerOutput } as unknown as EsWorkflowStepExecution,
        { id: 'exec-case', output: { id: 'case-1' } } as unknown as EsWorkflowStepExecution,
      ]);

      await service.prepareForRead({
        node: deepStepNode,
        predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
      });

      const rehydratedIds = stepExecutionRepository.getStepExecutionsByIds.mock.calls[0][0];
      expect(rehydratedIds).toEqual(
        expect.arrayContaining(['exec-outer-source', 'exec-inner-source', 'exec-case'])
      );
      expect(rehydratedIds).toHaveLength(3);
    });

    it('rehydrates outputs referenced by switch case match templates', async () => {
      const workflow = {
        name: 'Switch match dependency',
        version: '1',
        description: 'test',
        enabled: true,
        triggers: [],
        steps: [
          {
            name: 'get_active_alerts',
            type: 'console',
            with: { message: 'alerts' },
          },
          {
            name: 'expected_relation',
            type: 'console',
            with: { message: 'eq' },
          },
          {
            name: 'choose_branch',
            type: 'switch',
            expression: '{{steps.expected_relation.output}}',
            cases: [
              {
                match: '{{steps.get_active_alerts.output.hits.total.relation}}',
                steps: [
                  {
                    name: 'matched_branch',
                    type: 'console',
                    with: { message: 'matched' },
                  },
                ],
              },
            ],
            default: [
              {
                name: 'default_branch',
                type: 'console',
                with: { message: 'default' },
              },
            ],
          },
        ],
      } as unknown as WorkflowYaml;
      const graph = WorkflowGraph.fromWorkflowDefinition(workflow);
      const switchNode = graph.topologicalOrder
        .map((nodeId) => graph.getNode(nodeId))
        .find((n) => n.stepId === 'choose_branch' && n.type === 'enter-switch')!;

      const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
      const alertsOutput = { hits: { total: { relation: 'eq' } } };
      seedCompletedStepWithSize(
        state,
        service,
        'exec-alerts',
        'get_active_alerts',
        alertsOutput,
        1,
        'connector'
      );
      seedCompletedStepWithSize(
        state,
        service,
        'exec-relation',
        'expected_relation',
        'eq',
        1,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'exec-alerts', output: alertsOutput } as unknown as EsWorkflowStepExecution,
        { id: 'exec-relation', output: 'eq' } as unknown as EsWorkflowStepExecution,
      ]);

      await service.prepareForRead({
        node: switchNode,
        predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
      });

      const rehydratedIds = stepExecutionRepository.getStepExecutionsByIds.mock.calls[0][0];
      expect(rehydratedIds).toEqual(expect.arrayContaining(['exec-alerts', 'exec-relation']));
      expect(rehydratedIds).toHaveLength(2);
    });

    it('rehydrates outputs referenced by while exit conditions', async () => {
      const workflow = {
        name: 'While exit dependency',
        version: '1',
        description: 'test',
        enabled: true,
        triggers: [],
        steps: [
          {
            name: 'get_active_alerts',
            type: 'console',
            with: { message: 'alerts' },
          },
          {
            name: 'create_new_case',
            type: 'console',
            with: { message: 'case' },
          },
          {
            name: 'check_while',
            type: 'while',
            condition: '{{steps.get_active_alerts.output.hits.total.value}}',
            'max-iterations': 2,
            steps: [
              {
                name: 'while_log',
                type: 'console',
                with: { message: 'case={{steps.create_new_case.output.id}}' },
              },
            ],
          },
        ],
      } as unknown as WorkflowYaml;
      const graph = WorkflowGraph.fromWorkflowDefinition(workflow);
      const exitWhileNode = graph.topologicalOrder
        .map((nodeId) => graph.getNode(nodeId))
        .find((n) => n.stepId === 'check_while' && n.type === 'exit-while')!;

      const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
      const alertsOutput = { hits: { total: { value: 5 } } };
      seedCompletedStepWithSize(
        state,
        service,
        'exec-alerts',
        'get_active_alerts',
        alertsOutput,
        1,
        'connector'
      );
      seedCompletedStepWithSize(
        state,
        service,
        'exec-case',
        'create_new_case',
        { id: 'case-1' },
        1,
        'connector'
      );
      await service.flushStepChanges();
      await service.flushStepChanges();

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'exec-alerts', output: alertsOutput } as unknown as EsWorkflowStepExecution,
      ]);

      await service.prepareForRead({
        node: exitWhileNode,
        predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
      });

      expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledWith(
        ['exec-alerts'],
        ['id', 'output', 'workflowRunId']
      );
    });

    it('falls back to all predecessors when dynamic access is detected', async () => {
      const dynamicWorkflow: WorkflowYaml = {
        name: 'Dynamic Access',
        version: '1',
        description: 'test',
        enabled: true,
        triggers: [],
        steps: [
          { name: 'step_a', type: 'console', with: { message: 'A' } } as ConnectorStep,
          {
            name: 'step_b',
            type: 'console',
            with: { message: '{{steps[variables.name].output}}' },
          } as ConnectorStep,
        ],
      };
      const graph = WorkflowGraph.fromWorkflowDefinition(dynamicWorkflow);
      const stepBNode = graph.topologicalOrder
        .map((nodeId) => graph.getNode(nodeId))
        .find((n) => n.stepId === 'step_b')!;

      const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
      seedCompletedStepWithSize(state, service, 'exec-a', 'step_a', { v: 'a' }, 1, 'connector');
      await service.flushStepChanges();
      await service.flushStepChanges();
      expect(service.hasEvictedOutputs()).toBe(true);

      stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
        { id: 'exec-a', output: { v: 'a' } } as unknown as EsWorkflowStepExecution,
      ]);

      await service.prepareForRead({
        node: stepBNode,
        predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
      });

      expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledWith(
        ['exec-a'],
        ['id', 'output', 'workflowRunId']
      );
    });

    describe('deferred-release: keeps shared predecessors resident', () => {
      // Workflow: step_a -> step_b, step_c, step_d (fanout, all consume step_a)
      function buildFanoutWorkflow() {
        const workflow: WorkflowYaml = {
          name: 'Fanout',
          version: '1',
          description: 'test',
          enabled: true,
          triggers: [],
          steps: [
            { name: 'step_a', type: 'console', with: { message: 'A' } } as ConnectorStep,
            {
              name: 'step_b',
              type: 'console',
              with: { message: '{{steps.step_a.output}}' },
            } as ConnectorStep,
            {
              name: 'step_c',
              type: 'console',
              with: { message: '{{steps.step_a.output}}' },
            } as ConnectorStep,
            {
              name: 'step_d',
              type: 'console',
              with: { message: '{{steps.step_a.output}}' },
            } as ConnectorStep,
          ],
        };
        const graph = WorkflowGraph.fromWorkflowDefinition(workflow);
        const lookup = (stepId: string) =>
          graph.topologicalOrder
            .map((nodeId) => graph.getNode(nodeId))
            .find((n) => n.stepId === stepId)!;
        return {
          graph,
          stepBNode: lookup('step_b'),
          stepCNode: lookup('step_c'),
          stepDNode: lookup('step_d'),
        };
      }

      it('rehydrates a shared predecessor only on the first consumer', async () => {
        const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
        const { graph, stepBNode, stepCNode, stepDNode } = buildFanoutWorkflow();

        // Seed step_a, drive through deferred eviction so it ends up evicted.
        seedCompletedStepWithSize(state, service, 'exec-a', 'step_a', { v: 'a' }, 1, 'connector');
        await service.flushStepChanges();
        await service.flushStepChanges();
        expect(service.hasEvictedOutputs()).toBe(true);

        stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
          { id: 'exec-a', output: { v: 'a' } } as unknown as EsWorkflowStepExecution,
        ]);

        // Step B reads step_a — first rehydration.
        await service.prepareForRead({
          node: stepBNode,
          predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
        });
        expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledTimes(1);

        // Step C also reads step_a — should reuse the in-memory copy.
        await service.prepareForRead({
          node: stepCNode,
          predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
        });
        expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledTimes(1);

        // Step D too.
        await service.prepareForRead({
          node: stepDNode,
          predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
        });
        expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledTimes(1);
        expect(service.getStepOutput('exec-a')).toEqual({ v: 'a' });
      });

      it('releases a transient predecessor that the next step does not need', async () => {
        // Workflow: step_a -> step_b, step_a -> step_c. step_b reads step_a,
        // step_c does not. After step_c's prepareForRead, step_a should be
        // re-evicted (it was transient for step_b, not needed by step_c).
        const workflow: WorkflowYaml = {
          name: 'Selective release',
          version: '1',
          description: 'test',
          enabled: true,
          triggers: [],
          steps: [
            { name: 'step_a', type: 'console', with: { message: 'A' } } as ConnectorStep,
            {
              name: 'step_b',
              type: 'console',
              with: { message: '{{steps.step_a.output}}' },
            } as ConnectorStep,
            {
              name: 'step_c',
              type: 'console',
              with: { message: 'static text' },
            } as ConnectorStep,
          ],
        };
        const graph = WorkflowGraph.fromWorkflowDefinition(workflow);
        const stepBNode = graph.topologicalOrder
          .map((nodeId) => graph.getNode(nodeId))
          .find((n) => n.stepId === 'step_b')!;
        const stepCNode = graph.topologicalOrder
          .map((nodeId) => graph.getNode(nodeId))
          .find((n) => n.stepId === 'step_c')!;

        const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
        seedCompletedStepWithSize(state, service, 'exec-a', 'step_a', { v: 'a' }, 1, 'connector');
        await service.flushStepChanges();
        await service.flushStepChanges();

        stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
          { id: 'exec-a', output: { v: 'a' } } as unknown as EsWorkflowStepExecution,
        ]);

        // step_b rehydrates step_a.
        await service.prepareForRead({
          node: stepBNode,
          predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
        });
        expect(service.getStepOutput('exec-a')).toEqual({ v: 'a' });

        stepExecutionRepository.getStepExecutionsByIds.mockClear();
        // step_c does not reference step_a — release should kick in.
        await service.prepareForRead({
          node: stepCNode,
          predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
        });

        expect(service.getStepOutput('exec-a')).toBeUndefined();
        expect(service.hasEvictedOutputs()).toBe(true);
        // step_c didn't need step_a, so no rehydration was triggered.
        expect(stepExecutionRepository.getStepExecutionsByIds).not.toHaveBeenCalled();
      });

      it('does not refetch on a retry attempt of the same step', async () => {
        // Retry semantics: when a step fails and retries, its predecessors are
        // already resident from the first attempt's prepareForRead. The second
        // call must compute the same neededIds, not re-evict-then-rehydrate.
        const { state, service, stepExecutionRepository } = buildHarness({ evictionMinBytes: 0 });
        const { graph, stepBNode } = buildFanoutWorkflow();

        seedCompletedStepWithSize(state, service, 'exec-a', 'step_a', { v: 'a' }, 1, 'connector');
        await service.flushStepChanges();
        await service.flushStepChanges();

        stepExecutionRepository.getStepExecutionsByIds.mockResolvedValue([
          { id: 'exec-a', output: { v: 'a' } } as unknown as EsWorkflowStepExecution,
        ]);

        // Attempt 1.
        await service.prepareForRead({
          node: stepBNode,
          predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
        });
        expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledTimes(1);

        // Attempt 2 (retry) — same node, same predecessors. No second ES hit.
        await service.prepareForRead({
          node: stepBNode,
          predecessorsResolver: (n) => graph.getAllPredecessors(n.id),
        });
        expect(stepExecutionRepository.getStepExecutionsByIds).toHaveBeenCalledTimes(1);
      });
    });
  });
});
