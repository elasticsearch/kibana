/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  DEFAULT_PARALLEL_MAX_CONCURRENCY,
  DEFAULT_PARALLEL_MAX_FAN_OUT,
  ExecutionStatus,
} from '@kbn/workflows';
import type { EnterParallelNode, WorkflowGraph } from '@kbn/workflows/graph';
import type { StepExecutionRuntime } from '../../../workflow_context_manager/step_execution_runtime';
import type { StepExecutionRuntimeFactory } from '../../../workflow_context_manager/step_execution_runtime_factory';
import type { WorkflowExecutionCursor } from '../../../workflow_context_manager/workflow_execution_cursor';
import type { WorkflowExecutionRuntimeManager } from '../../../workflow_context_manager/workflow_execution_runtime_manager';
import { WorkflowScopeStack } from '../../../workflow_context_manager/workflow_scope_stack';
import type { IWorkflowEventLogger } from '../../../workflow_event_logger';
import { BranchExecutor } from '../../../workflow_execution_loop/branch_executor';
import type { WorkflowExecutionLoopParams } from '../../../workflow_execution_loop/types';
import type { NodeImplementation } from '../../node_implementation';
import type { NodesFactory } from '../../nodes_factory';
import { EnterParallelNodeImpl } from '../enter_parallel_node_impl';
import type { ParallelStepState } from '../types';

describe('EnterParallelNodeImpl', () => {
  const cursors = new AsyncLocalStorage<WorkflowExecutionCursor>();
  let node: EnterParallelNode;
  let workflowRuntime: jest.Mocked<WorkflowExecutionRuntimeManager>;
  let stepRuntime: jest.Mocked<StepExecutionRuntime>;
  let logger: jest.Mocked<IWorkflowEventLogger>;
  let factory: jest.Mocked<StepExecutionRuntimeFactory>;
  let nodesFactory: jest.Mocked<NodesFactory>;
  let workflowGraph: jest.Mocked<WorkflowGraph>;

  // The state the parallel step "persists"; kept in a closure so the impl can
  // read it back across ticks like the real step state store.
  let persistedState: ParallelStepState | undefined;

  // Per-branch status the fake branch step settles to when run.
  let branchOutcome: (index: number) => ExecutionStatus;
  let branchRunCalls: number[];

  const makeNode = (
    overrides: Partial<EnterParallelNode['configuration']> = {}
  ): EnterParallelNode =>
    ({
      id: 'enterParallel_fanOut',
      type: 'enter-parallel',
      stepId: 'fanOut',
      stepType: 'parallel',
      exitNodeId: 'exitParallel_fanOut',
      branchStartNodeId: 'branchStep',
      configuration: {
        name: 'fanOut',
        type: 'parallel',
        foreach: JSON.stringify(['a', 'b', 'c']),
        steps: [],
        ...overrides,
      },
    } as unknown as EnterParallelNode);

  beforeEach(() => {
    persistedState = undefined;
    branchRunCalls = [];
    branchOutcome = () => ExecutionStatus.COMPLETED;

    workflowRuntime = {
      withExecutionCursor: jest.fn((cursor, run) => cursors.run(cursor, run)),
      getWorkflowExecution: jest.fn(() => ({ status: ExecutionStatus.RUNNING })),
      navigateToNode: jest.fn(),
      getCurrentNodeScope: jest.fn().mockReturnValue([]),
      setScopeStack: jest.fn(),
      setWorkflowError: jest.fn(),
    } as unknown as jest.Mocked<WorkflowExecutionRuntimeManager>;

    stepRuntime = {
      abortController: new AbortController(),
      stepExecutionId: 'parallel-owner',
      startStep: jest.fn(),
      finishStep: jest.fn(),
      failStep: jest.fn(),
      setInput: jest.fn(),
      enterWaitUntil: jest.fn(),
      getCurrentStepState: jest.fn(() => persistedState),
      setCurrentStepState: jest.fn((s: ParallelStepState) => {
        persistedState = s;
      }),
      contextManager: {
        evaluateExpressionInContext: jest.fn((x) => x),
        renderValueAccordingToContext: jest.fn((x) => x),
      },
    } as unknown as jest.Mocked<StepExecutionRuntime>;

    logger = {
      logDebug: jest.fn(),
      logError: jest.fn(),
      logWarn: jest.fn(),
    } as unknown as jest.Mocked<IWorkflowEventLogger>;

    // Each branch run returns a runtime whose stepExecution status reflects the
    // configured outcome for that branch index.
    factory = {
      createStepExecutionRuntime: jest.fn(({ stackFrames }) => {
        const lastFrame = stackFrames[stackFrames.length - 1];
        const scopeId = lastFrame?.nestedScopes?.[lastFrame.nestedScopes.length - 1]?.scopeId;
        const index = Number(scopeId ?? 0);
        return {
          abortController: new AbortController(),
          contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
          get stepExecution() {
            return { status: branchOutcome(index), state: {} };
          },
          getCurrentStepResult: () => ({ output: { branch: index }, error: undefined }),
          timeoutStep: jest.fn(),
        } as unknown as StepExecutionRuntime;
      }),
    } as unknown as jest.Mocked<StepExecutionRuntimeFactory>;

    nodesFactory = {
      create: jest.fn(
        (branchRuntime: StepExecutionRuntime) =>
          ({
            run: jest.fn(() => {
              const status = (branchRuntime as unknown as { stepExecution: { status: string } })
                .stepExecution.status;
              // Record which branch index ran for concurrency assertions.
              const result = (
                branchRuntime as unknown as {
                  getCurrentStepResult: () => { output: { branch: number } };
                }
              ).getCurrentStepResult();
              branchRunCalls.push(result.output.branch);
              return status;
            }),
          } as unknown as NodeImplementation)
      ),
    } as unknown as jest.Mocked<NodesFactory>;

    // Single-step branch body: the branch start node's only successor is the
    // parallel exit node, so each branch completes after one node runs.
    workflowGraph = {
      getNode: jest.fn((nodeId: string) =>
        nodeId === node.id ? node : { id: nodeId, stepId: nodeId, type: 'atomic' }
      ),
      getNodeStack: jest.fn(() => [node.id]),
      get topologicalOrder() {
        const order = new Set<string>();
        const pending = node.branches?.map((branch) => branch.startNodeId) ?? ['branchStep'];
        while (pending.length > 0) {
          const nodeId = pending.shift();
          if (nodeId !== undefined && !order.has(nodeId) && nodeId !== node.exitNodeId) {
            order.add(nodeId);
            pending.push(
              ...workflowGraph.getDirectSuccessors(nodeId).map((successor) => successor.id)
            );
          }
        }
        return [...order, node.exitNodeId];
      },
      getDirectSuccessors: jest.fn((nodeId: string) =>
        nodeId === 'branchStep' ? [{ id: 'exitParallel_fanOut' }] : []
      ),
    } as unknown as jest.Mocked<WorkflowGraph>;

    node = makeNode();
  });

  const build = () => {
    const runtimeFactory = {
      createStepExecutionRuntime: (params) => {
        const runtime = factory.createStepExecutionRuntime(params);
        if (!runtime.abortController)
          Object.defineProperty(runtime, 'abortController', { value: new AbortController() });
        runtime.stepExecutionExists = () => false;
        Object.defineProperty(runtime, 'stepExecutionId', {
          value: `${params.nodeId}:${JSON.stringify(params.stackFrames)}`,
        });
        Object.defineProperty(runtime, 'node', { value: workflowGraph.getNode(params.nodeId) });
        Object.defineProperty(runtime, 'scopeStack', {
          value: WorkflowScopeStack.fromStackFrames(params.stackFrames),
        });
        runtime.flushEventLogs = jest.fn().mockResolvedValue(undefined);
        const original = runtime.stepExecution;
        if (original?.status === ExecutionStatus.WAITING) {
          Object.defineProperty(runtime, 'stepExecution', {
            get: () => ({ ...original, state: { resumeAt: '2000-01-01T00:00:00Z' } }),
          });
        }
        return runtime;
      },
    } as StepExecutionRuntimeFactory;
    const implementationFactory = {
      create: (runtime: StepExecutionRuntime) => {
        const implementation = nodesFactory.create(runtime);
        return {
          ...implementation,
          run: async () => {
            await implementation.run();
            // Atomic nodes normally set navigation/error through the runtime.
            const cursor = cursors.getStore();
            if (runtime.stepExecution?.status === ExecutionStatus.FAILED) {
              cursor?.captureError(new Error('Branch failed'));
            } else if (runtime.stepExecution?.status === ExecutionStatus.COMPLETED) {
              cursor?.navigateToNextNode();
            }
          },
        };
      },
    } as NodesFactory;
    workflowRuntime.branchExecutor = new BranchExecutor({
      workflowRuntime,
      workflowExecutionGraph: workflowGraph,
      stepExecutionRuntimeFactory: runtimeFactory,
      nodesFactory: implementationFactory,
      workflowLogger: logger,
      signal: stepRuntime.abortController.signal,
      workflowExecutionState: {
        getAllStepExecutions: jest.fn().mockReturnValue([]),
        getStepExecution: jest.fn(),
        getWorkflowExecution: jest.fn().mockReturnValue({ status: ExecutionStatus.RUNNING }),
        upsertStep: jest.fn(),
        flushWorkflowDoc: jest.fn().mockResolvedValue(undefined),
      },
      stepIoService: {
        flushStepChanges: jest.fn().mockResolvedValue(undefined),
        holdStepWrites: jest.fn().mockReturnValue(() => {}),
      },
    } as unknown as WorkflowExecutionLoopParams);
    return new EnterParallelNodeImpl(
      node,
      workflowRuntime,
      stepRuntime,
      logger,
      runtimeFactory,
      implementationFactory,
      workflowGraph
    );
  };

  // Re-tick the node until it finishes the step or stops making progress, mimicking
  // the resume-task loop that re-invokes a suspended parallel node across ticks.
  const runToCompletion = async (impl = build(), maxTicks = 20) => {
    for (let i = 0; i < maxTicks; i++) {
      await impl.run();
      if (stepRuntime.finishStep.mock.calls.length > 0) return;
    }
  };

  it('initializes one branch per item and starts the step', async () => {
    await build().run();
    expect(stepRuntime.startStep).toHaveBeenCalledTimes(1);
    expect(stepRuntime.setInput).toHaveBeenCalledWith({
      foreach: JSON.stringify(['a', 'b', 'c']),
    });
    expect(persistedState?.total).toBe(3);
  });

  it('throws a single clear "must evaluate to an array" error for a non-array foreach', async () => {
    // A foreach that renders to a scalar string (not a JSON array) used to leak a
    // raw "Unable to parse rendered parallel foreach value" JSON error. Both the
    // parse-failure and the non-array cases must now surface the same author-facing
    // message that names the offending expression.
    node = makeNode({ foreach: 'not-an-array' });
    await expect(build().run()).rejects.toThrow(
      /foreach expression must evaluate to an array, but "not-an-array" did not/
    );
  });

  it('finishes with index-aligned aggregate output when all branches complete', async () => {
    await build().run();
    expect(stepRuntime.finishStep).toHaveBeenCalledTimes(1);
    const output = stepRuntime.finishStep.mock.calls[0][0] as {
      total: number;
      succeeded: number;
      failed: number;
      status: string;
      results: Array<{ status: string; output: unknown }>;
    };
    expect(output).toMatchObject({ total: 3, succeeded: 3, failed: 0, status: 'completed' });
    expect(output.results.map((r) => r.status)).toEqual(['completed', 'completed', 'completed']);
    expect(workflowRuntime.navigateToNode).toHaveBeenCalledWith('exitParallel_fanOut');
  });

  it('emits per-branch index and key correlation in the results', async () => {
    await build().run();
    const output = stepRuntime.finishStep.mock.calls[0][0] as {
      results: Array<{ index: number; key: unknown; status: string }>;
    };
    expect(output.results.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(output.results.map((r) => r.key)).toEqual(['a', 'b', 'c']);
  });

  it('snapshots keys at init so a foreach that re-resolves differently cannot drift', async () => {
    // A template expression whose evaluation changes between init and a later
    // pass: the snapshotted per-branch keys must reflect the INIT resolution,
    // never the mutated one.
    node = makeNode({ foreach: '{{ steps.list.output }}' });
    const evaluate = stepRuntime.contextManager.evaluateExpressionInContext as jest.Mock;
    evaluate
      .mockReturnValueOnce(['a', 'b', 'c']) // init
      .mockReturnValue(['x', 'y', 'z']); // any later re-evaluation

    await runToCompletion();

    const output = stepRuntime.finishStep.mock.calls[0][0] as {
      results: Array<{ index: number; key: unknown }>;
    };
    expect(output.results.map((r) => r.key)).toEqual(['a', 'b', 'c']);
    // Persisted branch state carries the snapshot too.
    expect(persistedState?.branches.map((b) => b.key)).toEqual(['a', 'b', 'c']);
  });

  it('fail-fast: a failed branch fails the step (not complete) but still exposes the aggregate', async () => {
    branchOutcome = (index) => (index === 1 ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED);
    await build().run();
    // Default mode is fail-fast: a branch failure fails the STEP so it propagates.
    expect(stepRuntime.finishStep).not.toHaveBeenCalled();
    expect(stepRuntime.failStep).toHaveBeenCalledTimes(1);
    const [error, output] = stepRuntime.failStep.mock.calls[0] as [
      Error,
      { succeeded: number; failed: number; status: string; results: Array<{ status: string }> }
    ];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('fail-fast');
    // The aggregate is still persisted as the failed step's output.
    expect(output).toMatchObject({ succeeded: 2, failed: 1, status: 'failed' });
    expect(output.results.map((r) => r.status)).toEqual(['completed', 'failed', 'completed']);
  });

  it('runs a multi-step (straight-line) branch body to completion in order', async () => {
    // Body: branchStep -> step2 -> exit. Track which nodes each branch runs.
    const ranNodes: string[] = [];
    workflowGraph.getDirectSuccessors = jest.fn((nodeId: string) => {
      if (nodeId === 'branchStep') return [{ id: 'step2' }] as never;
      if (nodeId === 'step2') return [{ id: 'exitParallel_fanOut' }] as never;
      return [] as never;
    });
    factory.createStepExecutionRuntime = jest.fn(({ nodeId, stackFrames }) => {
      const lastFrame = stackFrames[stackFrames.length - 1];
      const scopeId = lastFrame?.nestedScopes?.[lastFrame.nestedScopes.length - 1]?.scopeId;
      const index = Number(scopeId ?? 0);
      return {
        contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
        get stepExecution() {
          return { status: ExecutionStatus.COMPLETED, state: {} };
        },
        getCurrentStepResult: () => ({ output: { node: nodeId, branch: index }, error: undefined }),
        timeoutStep: jest.fn(),
      } as unknown as StepExecutionRuntime;
    }) as unknown as typeof factory.createStepExecutionRuntime;
    nodesFactory.create = jest.fn(
      (branchRuntime: StepExecutionRuntime) =>
        ({
          run: jest.fn(() => {
            const result = (
              branchRuntime as unknown as {
                getCurrentStepResult: () => { output: { node: string } };
              }
            ).getCurrentStepResult();
            ranNodes.push(result.output.node);
          }),
        } as unknown as NodeImplementation)
    ) as unknown as typeof nodesFactory.create;

    await runToCompletion();

    expect(stepRuntime.finishStep).toHaveBeenCalledTimes(1);
    const output = stepRuntime.finishStep.mock.calls[0][0] as {
      total: number;
      succeeded: number;
      status: string;
    };
    expect(output).toMatchObject({ total: 3, succeeded: 3, status: 'completed' });
    // Each of the 3 branches ran both body nodes. Branches advance concurrently
    // within a tick, so the cross-branch order may interleave; we only require
    // each node to run once per branch and the first node before the second.
    expect(ranNodes.filter((n) => n === 'branchStep')).toHaveLength(3);
    expect(ranNodes.filter((n) => n === 'step2')).toHaveLength(3);
    expect(ranNodes.indexOf('branchStep')).toBeLessThan(ranNodes.indexOf('step2'));
  });

  it('advances eligible branches concurrently within a tick (no serialization)', async () => {
    // Each branch "blocks" on an async gate. If branches were advanced
    // sequentially, only one would be in-flight at a time. We assert all three
    // are in-flight simultaneously before any resolves.
    let inFlight = 0;
    let maxInFlight = 0;
    const gates: Array<() => void> = [];
    nodesFactory.create = jest.fn(
      () =>
        ({
          run: jest.fn(async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise<void>((resolve) => gates.push(resolve));
            inFlight -= 1;
          }),
        } as unknown as NodeImplementation)
    ) as unknown as typeof nodesFactory.create;

    const runPromise = build().run();
    // Let all three branch run() bodies start and register their gates.
    await new Promise((r) => setTimeout(r, 0));
    expect(maxInFlight).toBe(3);
    // Release all gates so the tick can finish.
    gates.forEach((release) => release());
    await runPromise;
  });

  it('aborts and times out a blocking branch that exceeds its branch-timeout', async () => {
    node = makeNode({ 'branch-timeout': '20ms', mode: 'settled' });
    const aborts: boolean[] = [];
    const timeoutStepCalls: jest.Mock[] = [];
    factory.createStepExecutionRuntime = jest.fn(({ stackFrames }) => {
      const lastFrame = stackFrames[stackFrames.length - 1];
      const scopeId = lastFrame?.nestedScopes?.[lastFrame.nestedScopes.length - 1]?.scopeId;
      const index = Number(scopeId ?? 0);
      const abortController = new AbortController();
      const timeoutStep = jest.fn();
      timeoutStepCalls.push(timeoutStep);
      return {
        abortController,
        contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
        get stepExecution() {
          // Never settles on its own; only the timeout abort ends it.
          return { status: ExecutionStatus.RUNNING, state: {} };
        },
        getCurrentStepResult: () => ({ output: { branch: index }, error: undefined }),
        timeoutStep,
      } as unknown as StepExecutionRuntime;
    }) as unknown as typeof factory.createStepExecutionRuntime;
    nodesFactory.create = jest.fn(
      (branchRuntime: StepExecutionRuntime) =>
        ({
          run: jest.fn(
            () =>
              new Promise<void>((resolve) => {
                // Resolve only when this branch's signal is aborted.
                branchRuntime.abortController.signal.addEventListener('abort', () => {
                  aborts.push(true);
                  resolve();
                });
              })
          ),
        } as unknown as NodeImplementation)
    ) as unknown as typeof nodesFactory.create;

    await runToCompletion();

    expect(aborts.length).toBeGreaterThan(0);
    const output = stepRuntime.finishStep.mock.calls[0][0] as {
      status: string;
      results: Array<{ status: string }>;
    };
    expect(output.status).toBe('failed');
    expect(output.results.every((r) => r.status === 'timed_out')).toBe(true);
    // Each timed-out branch's step execution must be marked terminal so it does
    // not leak in RUNNING (regression: branch http step stuck "running" in UI).
    expect(timeoutStepCalls.some((fn) => fn.mock.calls.length > 0)).toBe(true);
  });

  it('suspends (enterWaitUntil) and does not finish while a branch is still in flight', async () => {
    branchOutcome = (index) => (index === 2 ? ExecutionStatus.WAITING : ExecutionStatus.COMPLETED);
    await build().run();
    expect(stepRuntime.enterWaitUntil).toHaveBeenCalledTimes(1);
    expect(stepRuntime.finishStep).not.toHaveBeenCalled();
    // On suspend the parallel reclaims the shared cursor for its own enter node
    // (branch body steps advance the cursor as they run) so the resume task
    // re-ticks the parallel instead of re-entering a leaked branch-body node.
    expect(workflowRuntime.navigateToNode).toHaveBeenCalledWith('enterParallel_fanOut');
    expect(workflowRuntime.navigateToNode).not.toHaveBeenCalledWith('exitParallel_fanOut');
  });

  it('respects the concurrency window, starting at most `max` branches on a tick', async () => {
    node = makeNode({
      foreach: JSON.stringify(['a', 'b', 'c', 'd']),
      concurrency: { max: 2 },
    });
    // Keep every branch in flight so none free a slot within the tick.
    branchOutcome = () => ExecutionStatus.WAITING;
    await build().run();
    expect(branchRunCalls).toEqual([0, 1]);
  });

  it('count-waiting:true keeps a parked branch holding its slot so `max` still binds', async () => {
    // max: 1, two branches; branch 0 parks in a durable wait forever. With
    // count-waiting:true (default) the parked branch keeps its slot, so branch 1
    // must never start.
    node = makeNode({
      foreach: JSON.stringify(['a', 'b']),
      concurrency: { max: 1, 'count-waiting': true },
    });
    branchOutcome = () => ExecutionStatus.WAITING;
    const impl = build();
    await impl.run();
    await impl.run();
    expect(branchRunCalls).toEqual([0, 0]);
  });

  it('count-waiting:false frees a parked branch\u2019s slot so a queued branch can start', async () => {
    // max: 1, two branches; branch 0 parks in a durable wait. With
    // count-waiting:false the parked branch frees its slot, so branch 1 starts on
    // the next tick even though branch 0 has not reached a terminal state.
    node = makeNode({
      foreach: JSON.stringify(['a', 'b']),
      concurrency: { max: 1, 'count-waiting': false },
    });
    // Branch 0 always parks; branch 1 completes when it runs.
    branchOutcome = (index) => (index === 0 ? ExecutionStatus.WAITING : ExecutionStatus.COMPLETED);
    const impl = build();
    await impl.run(); // tick 1: only branch 0 starts (and parks)
    expect(branchRunCalls).toEqual([0]);
    await impl.run(); // tick 2: branch 0 re-ticks AND branch 1 starts (freed slot)
    expect(branchRunCalls).toContain(1);
  });

  it('finishes immediately with an empty aggregate when there are no items', async () => {
    node = makeNode({ foreach: JSON.stringify([]) });
    await build().run();
    expect(stepRuntime.finishStep).toHaveBeenCalledTimes(1);
    const output = stepRuntime.finishStep.mock.calls[0][0] as { total: number; status: string };
    expect(output).toMatchObject({ total: 0, status: 'completed' });
    expect(workflowRuntime.navigateToNode).toHaveBeenCalledWith('exitParallel_fanOut');
  });

  it('fail-fast (default): a failed branch skips not-yet-started branches and fails the step', async () => {
    // Sequential window so a failure on branch 0 is visible before 1/2 start.
    node = makeNode({ concurrency: { max: 1 } });
    branchOutcome = (index) => (index === 0 ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED);
    await runToCompletion();
    expect(branchRunCalls).toEqual([0]);
    // fail-fast fails the STEP (propagates); the aggregate is the failed output.
    expect(stepRuntime.finishStep).not.toHaveBeenCalled();
    const [, output] = stepRuntime.failStep.mock.calls[0] as [
      Error,
      { succeeded: number; failed: number; status: string; results: Array<{ status: string }> }
    ];
    expect(output).toMatchObject({ succeeded: 0, failed: 1, status: 'failed' });
    expect(output.results.map((r) => r.status)).toEqual(['failed', 'skipped', 'skipped']);
    expect(workflowRuntime.navigateToNode).toHaveBeenCalledWith('exitParallel_fanOut');
  });

  it('settled: every branch runs to terminal even after a failure', async () => {
    node = makeNode({ concurrency: { max: 1 }, mode: 'settled' });
    branchOutcome = (index) => (index === 0 ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED);
    await runToCompletion();
    expect(branchRunCalls).toEqual([0, 1, 2]);
    const output = stepRuntime.finishStep.mock.calls[0][0] as {
      succeeded: number;
      failed: number;
      status: string;
      results: Array<{ status: string }>;
    };
    expect(output).toMatchObject({ succeeded: 2, failed: 1, status: 'failed' });
    expect(output.results.map((r) => r.status)).toEqual(['failed', 'completed', 'completed']);
  });

  it('rejects a fan-out that exceeds the maximum', async () => {
    const items = Array.from({ length: DEFAULT_PARALLEL_MAX_FAN_OUT + 1 }, (_v, i) => i);
    node = makeNode({ foreach: JSON.stringify(items) });
    await expect(build().run()).rejects.toThrow(/exceeds the maximum/);
    expect(stepRuntime.finishStep).not.toHaveBeenCalled();
  });

  it('clamps an out-of-range concurrency to the ceiling', async () => {
    const size = DEFAULT_PARALLEL_MAX_CONCURRENCY + 5;
    const items = Array.from({ length: size }, (_v, i) => i);
    node = makeNode({
      foreach: JSON.stringify(items),
      // Bypasses schema validation to assert the runtime clamp directly.
      concurrency: { max: size + 100 },
    });
    branchOutcome = () => ExecutionStatus.WAITING;
    await build().run();
    expect(branchRunCalls).toHaveLength(DEFAULT_PARALLEL_MAX_CONCURRENCY);
  });

  describe('timeouts', () => {
    let nowMs: number;

    beforeEach(() => {
      nowMs = 1_000;
      jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('fails the step with timed_out branches when the overall timeout elapses', async () => {
      node = makeNode({ timeout: '5s' });
      // Branches park in a durable wait so they remain in flight across ticks.
      branchOutcome = () => ExecutionStatus.WAITING;
      const impl = build();

      await impl.run();
      expect(stepRuntime.enterWaitUntil).toHaveBeenCalled();
      expect(stepRuntime.finishStep).not.toHaveBeenCalled();

      // Advance past the 5s overall budget and re-tick.
      nowMs += 6_000;
      await impl.run();

      // Default mode is fail-fast: timed-out branches (counted as failures) fail
      // the step so it propagates rather than silently completing.
      expect(stepRuntime.finishStep).not.toHaveBeenCalled();
      expect(stepRuntime.failStep).toHaveBeenCalledTimes(1);
      const [, output] = stepRuntime.failStep.mock.calls[0] as [
        Error,
        { failed: number; status: string; results: Array<{ status: string }> }
      ];
      expect(output.status).toBe('failed');
      expect(output.results.every((r) => r.status === 'timed_out')).toBe(true);
      expect(workflowRuntime.navigateToNode).toHaveBeenCalledWith('exitParallel_fanOut');
    });

    it('times out only the branch that exceeds the per-branch budget', async () => {
      node = makeNode({
        foreach: JSON.stringify(['a', 'b']),
        concurrency: { max: 2, 'count-waiting': true },
        mode: 'settled',
        'branch-timeout': '3s',
      });
      // Branch 0 keeps polling; branch 1 completes on the first tick.
      branchOutcome = (index) =>
        index === 0 ? ExecutionStatus.WAITING : ExecutionStatus.COMPLETED;
      const impl = build();

      await impl.run();
      expect(stepRuntime.finishStep).not.toHaveBeenCalled();

      // Past the per-branch budget; the still-running branch 0 times out.
      nowMs += 4_000;
      await impl.run();

      expect(stepRuntime.finishStep).toHaveBeenCalledTimes(1);
      const output = stepRuntime.finishStep.mock.calls[0][0] as {
        results: Array<{ status: string }>;
        status: string;
      };
      expect(output.results.map((r) => r.status)).toEqual(['timed_out', 'completed']);
      expect(output.status).toBe('failed');
    });

    it('marks a branch parked in a durable wait TIMED_OUT when its budget elapses before re-tick', async () => {
      // Regression: a branch that parks in a wait/poll and whose per-branch
      // budget elapses *before* the next tick re-enters its body hits the
      // deadline-already-passed early return in advanceBranch. That path must
      // still transition the parked step execution to TIMED_OUT, otherwise the
      // per-branch `wait` record leaks in WAITING even though the step finishes.
      node = makeNode({
        foreach: JSON.stringify(['a']),
        mode: 'settled',
        'branch-timeout': '3s',
      });

      const timeoutStepCalls: jest.Mock[] = [];
      factory.createStepExecutionRuntime = jest.fn(({ stackFrames }) => {
        const lastFrame = stackFrames[stackFrames.length - 1];
        const scopeId = lastFrame?.nestedScopes?.[lastFrame.nestedScopes.length - 1]?.scopeId;
        const index = Number(scopeId ?? 0);
        const timeoutStep = jest.fn();
        timeoutStepCalls.push(timeoutStep);
        return {
          abortController: new AbortController(),
          contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
          get stepExecution() {
            // Parks in a durable wait and never settles on its own.
            return { status: ExecutionStatus.WAITING, state: {} };
          },
          getCurrentStepResult: () => ({ output: { branch: index }, error: undefined }),
          timeoutStep,
        } as unknown as StepExecutionRuntime;
      }) as unknown as typeof factory.createStepExecutionRuntime;

      const impl = build();

      // Tick 1: branch parks in WAITING (its wait step record is WAITING).
      await impl.run();
      expect(stepRuntime.enterWaitUntil).toHaveBeenCalled();
      expect(stepRuntime.finishStep).not.toHaveBeenCalled();

      // Jump past the per-branch budget so the next tick sees the deadline
      // already elapsed at the top of advanceBranch (before runBranchNode).
      nowMs += 5_000;
      await impl.run();

      expect(stepRuntime.finishStep).toHaveBeenCalledTimes(1);
      const output = stepRuntime.finishStep.mock.calls[0][0] as {
        results: Array<{ status: string }>;
        status: string;
      };
      expect(output.results.map((r) => r.status)).toEqual(['timed_out']);
      // The parked branch step execution must be transitioned to TIMED_OUT.
      expect(timeoutStepCalls.some((fn) => fn.mock.calls.length > 0)).toBe(true);
    });

    it('onCancel transitions parked branch records to TIMED_OUT (overall timeout-zone abort)', async () => {
      // The overall step `timeout` is enforced by a surrounding timeout zone that
      // aborts this step from the outside, so `tick()` never runs its own sweep.
      // onCancel must clean up branches parked in a wait so none leak in WAITING.
      node = makeNode({ foreach: JSON.stringify(['a', 'b']) });

      const timeoutStepCalls: jest.Mock[] = [];
      factory.createStepExecutionRuntime = jest.fn(({ stackFrames }) => {
        const lastFrame = stackFrames[stackFrames.length - 1];
        const scopeId = lastFrame?.nestedScopes?.[lastFrame.nestedScopes.length - 1]?.scopeId;
        const index = Number(scopeId ?? 0);
        const timeoutStep = jest.fn();
        timeoutStepCalls.push(timeoutStep);
        return {
          abortController: new AbortController(),
          contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
          get stepExecution() {
            return { status: ExecutionStatus.WAITING, state: {} };
          },
          getCurrentStepResult: () => ({ output: { branch: index }, error: undefined }),
          timeoutStep,
        } as unknown as StepExecutionRuntime;
      }) as unknown as typeof factory.createStepExecutionRuntime;

      const impl = build();

      // Both branches park in WAITING.
      await impl.run();
      expect(stepRuntime.enterWaitUntil).toHaveBeenCalled();

      // Simulate the timeout zone aborting the step from the outside.
      await impl.onCancel();

      // Every started branch's step record is transitioned to TIMED_OUT, so none
      // leaks in WAITING, and the persisted state reflects the terminal branches.
      expect(timeoutStepCalls.filter((fn) => fn.mock.calls.length > 0).length).toBe(2);
      expect(persistedState?.branches.every((b) => b.status === 'timed_out')).toBe(true);
    });

    it('invokes each parked branch node onCancel() during a timeout-zone abort', async () => {
      // Regression: a branch body may hold an external resource (e.g. a
      // `workflow.execute` whose onCancel cancels the child workflow). Marking the
      // branch step record TIMED_OUT is not enough — the node's onCancel() must
      // fire or the child keeps running orphaned.
      node = makeNode({ foreach: JSON.stringify(['a', 'b']) });

      factory.createStepExecutionRuntime = jest.fn(({ stackFrames }) => {
        const lastFrame = stackFrames[stackFrames.length - 1];
        const scopeId = lastFrame?.nestedScopes?.[lastFrame.nestedScopes.length - 1]?.scopeId;
        const index = Number(scopeId ?? 0);
        return {
          abortController: new AbortController(),
          contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
          get stepExecution() {
            return { status: ExecutionStatus.WAITING, state: {} };
          },
          getCurrentStepResult: () => ({ output: { branch: index }, error: undefined }),
          timeoutStep: jest.fn(),
        } as unknown as StepExecutionRuntime;
      }) as unknown as typeof factory.createStepExecutionRuntime;

      // Cancellable branch node (like workflow.execute): expose an onCancel spy.
      const onCancel = jest.fn();
      nodesFactory.create = jest.fn(
        () =>
          ({
            run: jest.fn(() => ExecutionStatus.WAITING),
            onCancel,
          } as unknown as NodeImplementation)
      ) as unknown as typeof nodesFactory.create;

      const impl = build();

      // Both branches park in WAITING.
      await impl.run();

      // The timeout zone aborts the step from the outside.
      await impl.onCancel();

      // Each started branch's node onCancel() fires so its external resource
      // (e.g. child workflow) is torn down rather than left running.
      expect(onCancel).toHaveBeenCalledTimes(2);
    });
  });

  describe('static branches (scatter-gather)', () => {
    const makeStaticNode = (
      branches: Array<{ name: string; startNodeId: string }>,
      configOverrides: Partial<EnterParallelNode['configuration']> = {}
    ): EnterParallelNode =>
      ({
        id: 'enterParallel_fanOut',
        type: 'enter-parallel',
        stepId: 'fanOut',
        stepType: 'parallel',
        exitNodeId: 'exitParallel_fanOut',
        // No branchStartNodeId in static mode.
        branches,
        configuration: {
          name: 'fanOut',
          type: 'parallel',
          ...configOverrides,
        },
      } as unknown as EnterParallelNode);

    beforeEach(() => {
      // Each branch is a single node whose only successor is the exit node.
      workflowGraph.getDirectSuccessors = jest.fn(() => [
        { id: 'exitParallel_fanOut' },
      ]) as unknown as typeof workflowGraph.getDirectSuccessors;
    });

    it('runs each named branch and emits name-keyed, index-aligned results', async () => {
      node = makeStaticNode([
        { name: 'virustotal', startNodeId: 'vt_step' },
        { name: 'geo', startNodeId: 'geo_step' },
      ]);

      await build().run();

      expect(stepRuntime.finishStep).toHaveBeenCalledTimes(1);
      const output = stepRuntime.finishStep.mock.calls[0][0] as {
        total: number;
        succeeded: number;
        status: string;
        results: Array<{ index: number; key: unknown; status: string }>;
        branches: Record<string, { status: string }>;
      };
      expect(output).toMatchObject({ total: 2, succeeded: 2, status: 'completed' });
      expect(output.results.map((r) => r.index)).toEqual([0, 1]);
      expect(output.results.map((r) => r.key)).toEqual(['virustotal', 'geo']);
      expect(output.results.map((r) => r.status)).toEqual(['completed', 'completed']);
      // Static mode also emits the name-keyed projection (#17834 contract).
      expect(output.branches).toMatchObject({
        virustotal: { status: 'completed' },
        geo: { status: 'completed' },
      });
    });

    it('starts each branch at its own start node (heterogeneous bodies)', async () => {
      node = makeStaticNode([
        { name: 'virustotal', startNodeId: 'vt_step' },
        { name: 'geo', startNodeId: 'geo_step' },
      ]);
      const startedNodes: string[] = [];
      factory.createStepExecutionRuntime = jest.fn(({ nodeId }) => {
        startedNodes.push(nodeId);
        return {
          contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
          get stepExecution() {
            return { status: ExecutionStatus.COMPLETED, state: {} };
          },
          getCurrentStepResult: () => ({ output: { node: nodeId }, error: undefined }),
          timeoutStep: jest.fn(),
        } as unknown as StepExecutionRuntime;
      }) as unknown as typeof factory.createStepExecutionRuntime;

      await build().run();

      expect(startedNodes).toEqual(expect.arrayContaining(['vt_step', 'geo_step']));
    });

    it('runs static branches concurrently within a tick', async () => {
      node = makeStaticNode(
        [
          { name: 'a', startNodeId: 'a_step' },
          { name: 'b', startNodeId: 'b_step' },
        ],
        { concurrency: { max: 2, 'count-waiting': true } }
      );
      let inFlight = 0;
      let maxInFlight = 0;
      const gates: Array<() => void> = [];
      nodesFactory.create = jest.fn(
        () =>
          ({
            run: jest.fn(async () => {
              inFlight += 1;
              maxInFlight = Math.max(maxInFlight, inFlight);
              await new Promise<void>((resolve) => gates.push(resolve));
              inFlight -= 1;
            }),
          } as unknown as NodeImplementation)
      ) as unknown as typeof nodesFactory.create;

      const runPromise = build().run();
      await new Promise((r) => setTimeout(r, 0));
      expect(maxInFlight).toBe(2);
      gates.forEach((release) => release());
      await runPromise;
    });

    it('reports a failed static branch in the aggregate', async () => {
      factory.createStepExecutionRuntime = jest.fn(({ nodeId }) => {
        const failed = nodeId === 'bad_step';
        return {
          contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
          get stepExecution() {
            return {
              status: failed ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED,
              state: {},
            };
          },
          getCurrentStepResult: () => ({
            output: failed ? undefined : { node: nodeId },
            error: failed ? { message: 'boom' } : undefined,
          }),
          timeoutStep: jest.fn(),
        } as unknown as StepExecutionRuntime;
      }) as unknown as typeof factory.createStepExecutionRuntime;

      node = makeStaticNode(
        [
          { name: 'ok', startNodeId: 'ok_step' },
          { name: 'bad', startNodeId: 'bad_step' },
        ],
        { mode: 'settled' }
      );

      await build().run();

      const output = stepRuntime.finishStep.mock.calls[0][0] as {
        succeeded: number;
        failed: number;
        status: string;
        results: Array<{ key: unknown; status: string }>;
      };
      expect(output).toMatchObject({ succeeded: 1, failed: 1, status: 'failed' });
      expect(output.results.map((r) => r.key)).toEqual(['ok', 'bad']);
      expect(output.results.map((r) => r.status)).toEqual(['completed', 'failed']);
    });
  });

  describe('releaseReadPins is called on every branch exit path', () => {
    // Captures every StepExecutionRuntime created by the factory. Note that
    // finish() and computeResumeAt() also call createStepExecutionRuntime for
    // read-only lookups — those runtimes never have ensureContextReady called.
    // Only runtimes that went through runBranchNode have both ensureContextReady
    // and releaseReadPins called. We filter on ensureContextReady call count to
    // distinguish the two populations.
    interface CapturedRuntime {
      contextManager: { ensureContextReady: jest.Mock; releaseReadPins: jest.Mock };
    }
    let createdRuntimes: CapturedRuntime[];

    const makeCapturingFactory = (branchStatus: (index: number) => ExecutionStatus) => {
      factory.createStepExecutionRuntime = jest.fn(({ stackFrames }) => {
        const lastFrame = stackFrames[stackFrames.length - 1];
        const scopeId = lastFrame?.nestedScopes?.[lastFrame.nestedScopes.length - 1]?.scopeId;
        const index = Number(scopeId ?? 0);
        const runtime = {
          abortController: new AbortController(),
          contextManager: { ensureContextReady: jest.fn(), releaseReadPins: jest.fn() },
          get stepExecution() {
            return { status: branchStatus(index), state: {} };
          },
          getCurrentStepResult: () => ({ output: { branch: index }, error: undefined }),
          timeoutStep: jest.fn(),
        } as unknown as StepExecutionRuntime;
        createdRuntimes.push(runtime as unknown as CapturedRuntime);
        return runtime;
      }) as unknown as typeof factory.createStepExecutionRuntime;
    };

    beforeEach(() => {
      createdRuntimes = [];
    });

    // Returns the subset of captured runtimes that went through runBranchNode —
    // identified by ensureContextReady having been called on them. Runtimes
    // used by finish() pass true to rehydrate their own terminal output.
    const branchNodeRuntimes = (): CapturedRuntime[] =>
      createdRuntimes.filter((rt) =>
        rt.contextManager.ensureContextReady.mock.calls.some((args) => args[0] !== true)
      );

    it('calls releaseReadPins on each branch runtime when branches complete', async () => {
      makeCapturingFactory(() => ExecutionStatus.COMPLETED);

      await build().run();

      const runRuntimes = branchNodeRuntimes();
      expect(runRuntimes.length).toBe(3); // one per branch
      for (const rt of runRuntimes) {
        expect(rt.contextManager.releaseReadPins).toHaveBeenCalledTimes(1);
      }
    });

    it('calls releaseReadPins on each branch runtime when branches fail', async () => {
      makeCapturingFactory(() => ExecutionStatus.FAILED);

      await build().run();

      const runRuntimes = branchNodeRuntimes();
      expect(runRuntimes.length).toBe(3); // one per branch
      for (const rt of runRuntimes) {
        expect(rt.contextManager.releaseReadPins).toHaveBeenCalledTimes(1);
      }
    });

    it('calls releaseReadPins on each branch runtime when branches park in a durable wait', async () => {
      makeCapturingFactory(() => ExecutionStatus.WAITING);

      await build().run();

      const runRuntimes = branchNodeRuntimes();
      expect(runRuntimes.length).toBe(3); // one per branch
      for (const rt of runRuntimes) {
        expect(rt.contextManager.releaseReadPins).toHaveBeenCalledTimes(1);
      }
    });

    it('calls releaseReadPins on each branch runtime when the per-branch timeout fires', async () => {
      node = makeNode({ 'branch-timeout': '20ms', mode: 'settled' });
      makeCapturingFactory(() => ExecutionStatus.RUNNING);
      nodesFactory.create = jest.fn(
        (branchRuntime: StepExecutionRuntime) =>
          ({
            run: jest.fn(
              () =>
                new Promise<void>((resolve) => {
                  branchRuntime.abortController.signal.addEventListener('abort', () => resolve());
                })
            ),
          } as unknown as NodeImplementation)
      ) as unknown as typeof nodesFactory.create;

      await runToCompletion();

      const runRuntimes = branchNodeRuntimes();
      expect(runRuntimes.length).toBe(3); // one per branch
      for (const rt of runRuntimes) {
        expect(rt.contextManager.releaseReadPins).toHaveBeenCalledTimes(1);
      }
    });
  });
});
