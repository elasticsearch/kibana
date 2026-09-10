/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus, StepCategory } from '@kbn/workflows';
import { createPollServerStepDefinition } from '@kbn/workflows-extensions/server';
import { z } from '@kbn/zod/v4';
import { FakeConnectors } from '../mocks/actions_plugin_mock';
import { WorkflowRunFixture } from '../workflow_run_fixture';

/** Next wake-up must be >5s so the engine schedules `workflow:resume` instead of in-process sleep. */
const LONG_POLL_MS = 6_000;

const getExecution = (fixture: WorkflowRunFixture) =>
  fixture.workflowExecutionRepositoryMock.workflowExecutions.get('fake_workflow_execution_id');

const stepExecutionsFor = (fixture: WorkflowRunFixture, stepId: string) =>
  Array.from(fixture.stepExecutionRepositoryMock.stepExecutions.values()).filter(
    (se) => se.stepId === stepId
  );

/**
 * Re-ticks a parked parallel workflow until it leaves WAITING (or the guard trips).
 * Parallel branches with timers/waits park in WAITING and resume across ticks, so
 * tests must pump `resumeWorkflow()` to drive the step to a terminal state.
 */
const driveToTerminal = async (fixture: WorkflowRunFixture, maxGuard = 10): Promise<void> => {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'performance',
      'queueMicrotask',
      'hrtime',
    ],
  });
  try {
    for (
      let guard = 0;
      getExecution(fixture)?.status === ExecutionStatus.WAITING && guard < maxGuard;
      guard++
    ) {
      const deadlines = [...fixture.stepExecutionRepositoryMock.stepExecutions.values()].flatMap(
        (step) =>
          typeof step.state?.resumeAt === 'string' ? [new Date(step.state.resumeAt).getTime()] : []
      );
      jest.setSystemTime(Math.max(Date.now() + 1000, ...deadlines));
      await fixture.resumeWorkflow();
    }
  } finally {
    jest.useRealTimers();
  }
};

describe('workflow with parallel (dynamic fan-out) step', () => {
  describe('run-to-completion branches', () => {
    let workflowRunFixture: WorkflowRunFixture;
    const items = ['a', 'b', 'c'];

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    steps:
      - name: branchStep
        type: slack
        connector-id: ${FakeConnectors.slack1.name}
        with:
          message: 'item:{{ foreach.item }};index:{{ foreach.index }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
      expect(getExecution(workflowRunFixture)?.scopeStack).toEqual([]);
    });

    it('runs the branch body once per item', () => {
      expect(stepExecutionsFor(workflowRunFixture, 'branchStep').length).toBe(items.length);
    });

    it('exposes per-branch foreach.item / foreach.index in the branch context', () => {
      items.forEach((item, index) => {
        expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            id: FakeConnectors.slack1.id,
            params: { message: `item:${item};index:${index}` },
          })
        );
      });
    });

    it('writes an index-aligned aggregate result on the parallel step', () => {
      const [parallelExecution] = stepExecutionsFor(workflowRunFixture, 'fanOut');
      expect(parallelExecution.status).toBe(ExecutionStatus.COMPLETED);
      const output = parallelExecution.output as {
        total: number;
        succeeded: number;
        failed: number;
        status: string;
        results: Array<{ status: string }>;
      };
      expect(output.total).toBe(items.length);
      expect(output.succeeded).toBe(items.length);
      expect(output.failed).toBe(0);
      expect(output.status).toBe('completed');
      expect(output.results).toHaveLength(items.length);
      expect(output.results.every((r) => r.status === 'completed')).toBe(true);
    });
  });

  describe('downstream consumption of the aggregate output', () => {
    let workflowRunFixture: WorkflowRunFixture;
    const items = ['a', 'b', 'c'];

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    steps:
      - name: branchStep
        type: slack
        connector-id: ${FakeConnectors.slack1.name}
        with:
          message: 'item:{{ foreach.item }}'
  - name: summarize
    type: slack
    connector-id: ${FakeConnectors.slack1.name}
    with:
      message: 'status={{ steps.fanOut.output.status }};total={{ steps.fanOut.output.total }};succeeded={{ steps.fanOut.output.succeeded }};failed={{ steps.fanOut.output.failed }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
    });

    // Regression: a step after the parallel must be able to read the aggregate
    // via `steps.<id>.output.*`. It previously rendered empty because the
    // downstream context did not surface the parallel step's persisted output.
    it('renders steps.fanOut.output.* in a following step', () => {
      expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: FakeConnectors.slack1.id,
          params: {
            message: `status=completed;total=${items.length};succeeded=${items.length};failed=0`,
          },
        })
      );
    });
  });

  describe('downstream consumption when the parallel suspends across ticks', () => {
    let workflowRunFixture: WorkflowRunFixture;
    const items = ['a', 'b', 'c', 'd', 'e'];

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    concurrency: { max: 2 }
    steps:
      - name: branchStep
        type: slack
        connector-id: ${FakeConnectors.slack1.name}
        with:
          message: 'item:{{ foreach.item }}'
  - name: summarize
    type: slack
    connector-id: ${FakeConnectors.slack1.name}
    with:
      message: 'status={{ steps.fanOut.output.status }};total={{ steps.fanOut.output.total }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
      await driveToTerminal(workflowRunFixture);
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('renders the aggregate output in the following step after resuming', () => {
      expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: FakeConnectors.slack1.id,
          params: { message: `status=completed;total=${items.length}` },
        })
      );
    });
  });

  describe('fan-out larger than the concurrency window (advances across ticks)', () => {
    let workflowRunFixture: WorkflowRunFixture;
    const items = ['a', 'b', 'c', 'd', 'e'];

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    concurrency: { max: 2 }
    steps:
      - name: branchStep
        type: slack
        connector-id: ${FakeConnectors.slack1.name}
        with:
          message: 'item:{{ foreach.item }};index:{{ foreach.index }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
      // The concurrency window only admits `max` branches per tick, so the step
      // parks in WAITING and re-ticks via resume until every branch has run.
      await driveToTerminal(workflowRunFixture);
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
    });

    // Regression: only ONE parallel step execution exists across all ticks (the
    // step is re-entrant). It used to "complete" early because the shared cursor
    // leaked to a branch-body node when parking, so the resume re-ran the branch
    // instead of re-ticking the parallel and remaining branches never ran.
    it('keeps a single re-entrant parallel step execution that runs every branch', () => {
      const parallelExecutions = stepExecutionsFor(workflowRunFixture, 'fanOut');
      expect(parallelExecutions).toHaveLength(1);
      const state = parallelExecutions[0].state as {
        branches?: Array<{ status: string }>;
      };
      expect(state.branches?.map((b) => b.status)).toEqual(items.map(() => 'completed'));
    });

    // Regression: branches that ran in later ticks (beyond the first concurrency
    // window) used to collapse into the first window's step-execution ids — or be
    // recorded with the parallel step's own (scope-id-less) frame — because the
    // step execution recorded the live mutable global scope instead of its own
    // per-branch stack frames. The result was only `max` distinct branch records
    // plus a stray scope-id-less one, instead of one record per fan-out index.
    it('records exactly one distinct step execution per fan-out index', () => {
      const branchExecutions = stepExecutionsFor(workflowRunFixture, 'branchStep');
      expect(branchExecutions.length).toBe(items.length);

      const scopeIds = branchExecutions
        .map(
          (se) =>
            se.scopeStack
              ?.flatMap((frame) => frame.nestedScopes.map((s) => s.scopeId))
              .filter((id): id is string => id !== undefined)
              .at(-1) ?? undefined
        )
        .sort();
      expect(scopeIds).toEqual(items.map((_item, index) => index.toString()).sort());
    });

    it('runs the branch body once per item with the correct per-branch context', () => {
      items.forEach((item, index) => {
        expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            id: FakeConnectors.slack1.id,
            params: { message: `item:${item};index:${index}` },
          })
        );
      });
    });
  });

  describe('multi-step (straight-line) branch body', () => {
    let workflowRunFixture: WorkflowRunFixture;
    const items = ['a', 'b'];

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    steps:
      - name: firstNotify
        type: slack
        connector-id: ${FakeConnectors.slack1.name}
        with:
          message: 'first:{{ foreach.item }};index:{{ foreach.index }}'
      - name: secondNotify
        type: slack
        connector-id: ${FakeConnectors.slack1.name}
        with:
          message: 'second:{{ foreach.item }};index:{{ foreach.index }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('runs BOTH branch-body steps once per item (advances past the first step)', () => {
      expect(stepExecutionsFor(workflowRunFixture, 'firstNotify').length).toBe(items.length);
      expect(stepExecutionsFor(workflowRunFixture, 'secondNotify').length).toBe(items.length);
    });

    it('runs both steps with the per-branch foreach context', () => {
      items.forEach((item, index) => {
        expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            id: FakeConnectors.slack1.id,
            params: { message: `first:${item};index:${index}` },
          })
        );
        expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            id: FakeConnectors.slack1.id,
            params: { message: `second:${item};index:${index}` },
          })
        );
      });
    });
  });

  describe('suspendable (poll) branches resume across ticks', () => {
    let workflowRunFixture: WorkflowRunFixture;
    const items = ['x', 'y'];

    const pollOnlyStep = createPollServerStepDefinition({
      id: 'integration.parallelPoll',
      category: StepCategory.Kibana,
      label: 'Poll-only branch (integration)',
      description: 'Completes after two poll invocations',
      inputSchema: z.object({}),
      outputSchema: z.object({ pollsUsed: z.number() }),
      poll: async ({ state }) => {
        const count = (state as { count?: number } | undefined)?.count ?? 0;
        if (count + 1 >= 2) {
          return { output: { pollsUsed: count + 1 } };
        }
        return { state: { count: count + 1 } };
      },
      policy: { strategy: 'fixed', intervalMs: LONG_POLL_MS },
      ceilings: { maxAttempts: 10, maxWaitMs: 120_000 },
    });

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      (
        workflowRunFixture.dependencies.workflowsExtensions.getStepDefinition as jest.Mock
      ).mockImplementation((id: string) =>
        id === 'integration.parallelPoll' ? pollOnlyStep : undefined
      );
      (
        workflowRunFixture.dependencies.workflowsExtensions.hasStepDefinition as jest.Mock
      ).mockImplementation((id: string) => id === 'integration.parallelPoll');

      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    steps:
      - name: pollBranch
        type: integration.parallelPoll
        with: {}
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('parks the workflow in WAITING while branches poll', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.WAITING);
    });

    it('schedules a workflow:resume task', () => {
      expect(workflowRunFixture.taskManagerMock.schedule).toHaveBeenCalled();
    });

    describe('after resumes', () => {
      beforeAll(async () => {
        // Each branch needs a second poll to finish; resume until terminal.
        await driveToTerminal(workflowRunFixture);
      });

      it('completes the workflow', () => {
        expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
      });

      it('completes one poll branch execution per item', () => {
        const pollExecutions = stepExecutionsFor(workflowRunFixture, 'pollBranch');
        expect(pollExecutions.length).toBe(items.length);
        expect(pollExecutions.every((se) => se.status === ExecutionStatus.COMPLETED)).toBe(true);
      });
    });
  });

  describe('branch killed by branch-timeout records a terminal branch step', () => {
    // Regression: a branch terminated by `branch-timeout` left its underlying
    // branch step execution stuck in WAITING/RUNNING forever (spinner in the
    // UI) even though the parallel aggregate correctly reported `timed_out`.
    // The branch step must be transitioned to a terminal TIMED_OUT status.
    let workflowRunFixture: WorkflowRunFixture;
    const items = ['x', 'y'];

    // A poll step that never completes on its own; only `branch-timeout` ends it.
    const neverCompletingPoll = createPollServerStepDefinition({
      id: 'integration.parallelNeverPoll',
      category: StepCategory.Kibana,
      label: 'Never-completing poll branch (integration)',
      description: 'Always asks to poll again',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      poll: async ({ state }) => {
        const count = (state as { count?: number } | undefined)?.count ?? 0;
        return { state: { count: count + 1 } };
      },
      policy: { strategy: 'fixed', intervalMs: LONG_POLL_MS },
      ceilings: { maxAttempts: 100, maxWaitMs: 600_000 },
    });

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      (
        workflowRunFixture.dependencies.workflowsExtensions.getStepDefinition as jest.Mock
      ).mockImplementation((id: string) =>
        id === 'integration.parallelNeverPoll' ? neverCompletingPoll : undefined
      );
      (
        workflowRunFixture.dependencies.workflowsExtensions.hasStepDefinition as jest.Mock
      ).mockImplementation((id: string) => id === 'integration.parallelNeverPoll');

      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    mode: settled
    branch-timeout: '1ms'
    steps:
      - name: timeoutBranch
        type: integration.parallelNeverPoll
        with: {}
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
      await driveToTerminal(workflowRunFixture);
    });

    it('completes the workflow (parallel contains the branch timeouts)', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('records each branch step as TIMED_OUT, not left RUNNING/WAITING', () => {
      const branchExecutions = stepExecutionsFor(workflowRunFixture, 'timeoutBranch');
      expect(branchExecutions.length).toBeGreaterThan(0);
      expect(branchExecutions.every((se) => se.status === ExecutionStatus.TIMED_OUT)).toBe(true);
      expect(
        branchExecutions.some(
          (se) => se.status === ExecutionStatus.RUNNING || se.status === ExecutionStatus.WAITING
        )
      ).toBe(false);
    });

    it('aggregate output reports every branch timed_out', () => {
      const parallel = stepExecutionsFor(workflowRunFixture, 'fanOut')[0];
      const output = parallel?.output as { failed: number; status: string } | undefined;
      expect(output?.status).toBe('failed');
      expect(output?.failed).toBe(items.length);
    });
  });

  describe('timer-based wait inside a branch body', () => {
    let workflowRunFixture: WorkflowRunFixture;
    const items = ['a', 'b', 'c'];

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      // A >5s wait forces a durable park (workflow:resume) rather than an
      // in-process sleep, so we can drive resumes deterministically.
      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    steps:
      - name: waitBranch
        type: wait
        with:
          duration: '6s'
      - name: afterWait
        type: slack
        connector-id: ${FakeConnectors.slack1.name}
        with:
          message: 'done:{{ foreach.item }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('parks the workflow in WAITING while branches wait', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.WAITING);
    });

    it('schedules a workflow:resume task', () => {
      expect(workflowRunFixture.taskManagerMock.schedule).toHaveBeenCalled();
    });

    it('schedules the resume at the wait duration (not immediately)', () => {
      // The parked parallel must wake at the branch's wait deadline, so the
      // scheduled resume runAt is ~the wait duration out — not a near-immediate
      // re-tick. (Real wall-clock latency on top is Task Manager poll cadence.)
      const runAts = (workflowRunFixture.taskManagerMock.schedule as jest.Mock).mock.calls
        .map(([task]) => task?.runAt)
        .filter((d): d is Date => d instanceof Date);
      const maxDeltaMs = Math.max(...runAts.map((d) => d.getTime() - Date.now()));
      expect(maxDeltaMs).toBeGreaterThan(4_000);
    });

    describe('after resumes', () => {
      beforeAll(async () => {
        // Drive resumes until the workflow is no longer waiting. Each branch's
        // wait toggles closed on a later tick (resumeAt has passed), then the
        // post-wait step runs.
        await driveToTerminal(workflowRunFixture);
      });

      it('completes the workflow', () => {
        expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
      });

      it('runs the post-wait step once per item after the wait fires', () => {
        items.forEach((item) => {
          expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
            expect.objectContaining({
              id: FakeConnectors.slack1.id,
              params: { message: `done:${item}` },
            })
          );
        });
      });

      it('records one wait branch execution per item, all completed', () => {
        const waitExecutions = stepExecutionsFor(workflowRunFixture, 'waitBranch');
        expect(waitExecutions.length).toBe(items.length);
        expect(waitExecutions.every((se) => se.status === ExecutionStatus.COMPLETED)).toBe(true);
      });
    });
  });

  describe('mixed branches: some wait, some complete immediately', () => {
    let workflowRunFixture: WorkflowRunFixture;
    // Two items: a run-to-completion branch and a waiting branch coexist. The
    // parallel must park for the waiter (not finish early on the fast branch)
    // and complete both once the wait fires.
    const items = ['x', 'y'];

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      const yaml = `
consts:
  items: '${JSON.stringify(items)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    steps:
      - name: maybeWait
        type: wait
        with:
          duration: '6s'
      - name: branchDone
        type: slack
        connector-id: ${FakeConnectors.slack1.name}
        with:
          message: 'finished:{{ foreach.item }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
      await driveToTerminal(workflowRunFixture);
    });

    it('completes the workflow with both branches done', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
      items.forEach((item) => {
        expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            id: FakeConnectors.slack1.id,
            params: { message: `finished:${item}` },
          })
        );
      });
    });
  });
});

describe('workflow with parallel (static branches) step', () => {
  describe('heterogeneous branches (scatter-gather)', () => {
    let workflowRunFixture: WorkflowRunFixture;

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      // Two different branch bodies run concurrently: a "scan" branch and a
      // "geo" branch. This mirrors enriching an alert from two sources at once.
      const yaml = `
consts:
  alert:
    hash: 'deadbeef'
    ip: '8.8.8.8'
steps:
  - name: enrich
    type: parallel
    branches:
      - name: scan
        steps:
          - name: scanHash
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with:
              message: 'scan:{{ consts.alert.hash }}'
      - name: geo
        steps:
          - name: geoLookup
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with:
              message: 'geo:{{ consts.alert.ip }}'
  - name: summarize
    type: slack
    connector-id: ${FakeConnectors.slack1.name}
    with:
      message: 'status={{ steps.enrich.output.status }};total={{ steps.enrich.output.total }};scan={{ steps.enrich.output.branches.scan.status }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
      expect(getExecution(workflowRunFixture)?.scopeStack).toEqual([]);
    });

    it('runs each named branch body exactly once with its own context', () => {
      expect(stepExecutionsFor(workflowRunFixture, 'scanHash').length).toBe(1);
      expect(stepExecutionsFor(workflowRunFixture, 'geoLookup').length).toBe(1);
      expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: FakeConnectors.slack1.id,
          params: { message: 'scan:deadbeef' },
        })
      );
      expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: FakeConnectors.slack1.id,
          params: { message: 'geo:8.8.8.8' },
        })
      );
    });

    it('writes a name-keyed aggregate result on the parallel step', () => {
      const [parallelExecution] = stepExecutionsFor(workflowRunFixture, 'enrich');
      expect(parallelExecution.status).toBe(ExecutionStatus.COMPLETED);
      const output = parallelExecution.output as {
        total: number;
        succeeded: number;
        failed: number;
        status: string;
        results: Array<{ index: number; key: unknown; status: string }>;
      };
      expect(output).toMatchObject({ total: 2, succeeded: 2, failed: 0, status: 'completed' });
      expect(output.results.map((r) => r.key)).toEqual(['scan', 'geo']);
      expect(output.results.map((r) => r.status)).toEqual(['completed', 'completed']);
    });

    it('also exposes a `branches.<name>` keyed projection (#17834 contract)', () => {
      const [parallelExecution] = stepExecutionsFor(workflowRunFixture, 'enrich');
      const output = parallelExecution.output as {
        branches: Record<string, { status: string; output?: unknown; error?: unknown }>;
      };
      expect(Object.keys(output.branches).sort()).toEqual(['geo', 'scan']);
      expect(output.branches.scan.status).toBe('completed');
      expect(output.branches.geo.status).toBe('completed');
      expect(output.branches.scan).toHaveProperty('output');
      expect(output.branches.scan.error).toBeUndefined();
    });

    it('exposes the aggregate output (incl. `branches.<name>`) to a downstream step', () => {
      expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: FakeConnectors.slack1.id,
          params: { message: 'status=completed;total=2;scan=completed' },
        })
      );
    });
  });

  describe('multi-step branch body marks every step terminal', () => {
    let workflowRunFixture: WorkflowRunFixture;

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      // Repro for the "first step stuck RUNNING" bug: a branch with two
      // run-to-completion steps. The first step must end COMPLETED once the
      // second one has run.
      const yaml = `
steps:
  - name: enrich
    type: parallel
    branches:
      - name: scan
        steps:
          - name: first_step
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with:
              message: 'first'
          - name: second_step
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with:
              message: 'second'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('marks the FIRST branch step COMPLETED (not stuck RUNNING)', () => {
      const [firstStep] = stepExecutionsFor(workflowRunFixture, 'first_step');
      const [secondStep] = stepExecutionsFor(workflowRunFixture, 'second_step');
      expect(secondStep?.status).toBe(ExecutionStatus.COMPLETED);
      expect(firstStep?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('runs each branch step exactly once', () => {
      expect(stepExecutionsFor(workflowRunFixture, 'first_step').length).toBe(1);
      expect(stepExecutionsFor(workflowRunFixture, 'second_step').length).toBe(1);
    });
  });

  describe('multi-step branch with concurrency window (re-tick) keeps step status', () => {
    let workflowRunFixture: WorkflowRunFixture;

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      // Mirrors the real workflow: concurrency.max < number of branches, so the
      // parallel re-ticks. Branch 1 has a TWO-step body; its first step must not
      // get flipped back to RUNNING by a later re-tick.
      const yaml = `
steps:
  - name: enrich
    type: parallel
    concurrency: { max: 3 }
    branches:
      - name: multi
        steps:
          - name: first_step
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with: { message: 'first' }
          - name: second_step
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with: { message: 'second' }
      - name: b2
        steps:
          - name: s2
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with: { message: 'b2' }
      - name: b3
        steps:
          - name: s3
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with: { message: 'b3' }
      - name: b4
        steps:
          - name: s4
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with: { message: 'b4' }
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
      await driveToTerminal(workflowRunFixture);
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('keeps the FIRST step of the multi-step branch COMPLETED after re-ticks', () => {
      const [firstStep] = stepExecutionsFor(workflowRunFixture, 'first_step');
      const [secondStep] = stepExecutionsFor(workflowRunFixture, 'second_step');
      expect(secondStep?.status).toBe(ExecutionStatus.COMPLETED);
      expect(firstStep?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('runs each multi-branch step exactly once', () => {
      expect(stepExecutionsFor(workflowRunFixture, 'first_step').length).toBe(1);
      expect(stepExecutionsFor(workflowRunFixture, 'second_step').length).toBe(1);
    });
  });

  describe('branch steps render {{ inputs.* }} in their own context', () => {
    let workflowRunFixture: WorkflowRunFixture;

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      // A branch connector step that reads `{{ inputs.* }}` must render against
      // the workflow context, not leave the template literal. (Note: a `const`
      // whose VALUE references `{{ inputs.* }}` is NOT recursively re-rendered —
      // that is a pre-existing, mode-independent consts limitation; reference
      // inputs directly in the step instead.)
      const yaml = `
steps:
  - name: enrich
    type: parallel
    branches:
      - name: scan
        steps:
          - name: scanHash
            type: slack
            connector-id: ${FakeConnectors.slack1.name}
            with:
              message: 'hash:{{ inputs.file_hash }}'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({
        workflowYaml: yaml,
        inputs: { file_hash: 'abc123' },
      });
    });

    it('completes the workflow', () => {
      expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('renders {{ inputs.* }} directly in the branch step', () => {
      expect(workflowRunFixture.unsecuredActionsClientMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: FakeConnectors.slack1.id,
          params: { message: 'hash:abc123' },
        })
      );
    });
  });

  describe('failure modes', () => {
    // A parallel step over N items where EVERY branch fails (uses the
    // always-throwing fake connector), serialized with concurrency.max=1 so the
    // fail-fast vs settled difference is observable in how many branches ran.
    // NOTE: branches fail via a *step* failure (connector error) — NOT
    // `workflow.fail`, which terminates the whole workflow globally and so would
    // mask the per-mode branch-scheduling behaviour.
    const ITEMS = ['0', '1', '2', '3'];

    const buildFailingYaml = (mode?: 'fail-fast' | 'settled') => `
consts:
  items: '${JSON.stringify(ITEMS)}'
steps:
  - name: fanOut
    type: parallel
    foreach: '{{ consts.items }}'
    concurrency: { max: 1 }
    ${mode ? `mode: ${mode}` : ''}
    steps:
      - name: alwaysFail
        type: slack
        connector-id: ${FakeConnectors.constantlyFailing.name}
        with:
          message: 'branch {{ foreach.index }}'
`;

    describe('fail-fast (default): stops scheduling not-yet-started branches', () => {
      let workflowRunFixture: WorkflowRunFixture;

      beforeAll(async () => {
        workflowRunFixture = new WorkflowRunFixture();
        jest.clearAllMocks();
        await workflowRunFixture.runWorkflow({ workflowYaml: buildFailingYaml() });
        await driveToTerminal(workflowRunFixture, 20);
      });

      it('a branch failure fails the parallel step and the workflow (fail-fast)', () => {
        // fail-fast mirrors Promise.all: the first branch failure fails the STEP
        // so the failure propagates and the workflow fails (unless handled),
        // rather than silently succeeding. The aggregate is still persisted as the
        // failed step's output (see the next test).
        const [parallel] = stepExecutionsFor(workflowRunFixture, 'fanOut');
        expect(parallel.status).toBe(ExecutionStatus.FAILED);
        expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.FAILED);
      });

      it('does NOT run all branches (short-circuits after the first failure)', () => {
        // With max=1 and fail-fast, only the first branch starts; the remaining
        // branches are skipped rather than run.
        const branchRuns = stepExecutionsFor(workflowRunFixture, 'alwaysFail').length;
        expect(branchRuns).toBeLessThan(ITEMS.length);
      });

      it('still exposes the aggregate on the failed step (failed status, skipped branches)', () => {
        const [parallel] = stepExecutionsFor(workflowRunFixture, 'fanOut');
        const output = parallel.output as {
          total: number;
          succeeded: number;
          failed: number;
          status: string;
          results: Array<{ status: string }>;
        };
        expect(output.total).toBe(ITEMS.length);
        expect(output.status).toBe('failed');
        expect(output.failed).toBeGreaterThanOrEqual(1);
        expect(output.results.some((r) => r.status === 'skipped')).toBe(true);
      });
    });

    describe('settled: runs EVERY branch to a terminal state despite failures', () => {
      let workflowRunFixture: WorkflowRunFixture;

      beforeAll(async () => {
        workflowRunFixture = new WorkflowRunFixture();
        jest.clearAllMocks();
        await workflowRunFixture.runWorkflow({ workflowYaml: buildFailingYaml('settled') });
        await driveToTerminal(workflowRunFixture, 20);
      });

      it('contains branch failures: the parallel step completes and the workflow continues', () => {
        const [parallel] = stepExecutionsFor(workflowRunFixture, 'fanOut');
        expect(parallel.status).toBe(ExecutionStatus.COMPLETED);
        expect(getExecution(workflowRunFixture)?.status).toBe(ExecutionStatus.COMPLETED);
      });

      it('runs the branch body once per item (no branch is skipped)', () => {
        expect(stepExecutionsFor(workflowRunFixture, 'alwaysFail').length).toBe(ITEMS.length);
      });

      it('aggregate output reports every branch failed', () => {
        const [parallel] = stepExecutionsFor(workflowRunFixture, 'fanOut');
        const output = parallel.output as {
          total: number;
          succeeded: number;
          failed: number;
          status: string;
          results: Array<{ status: string }>;
        };
        expect(output.total).toBe(ITEMS.length);
        expect(output.failed).toBe(ITEMS.length);
        expect(output.succeeded).toBe(0);
        expect(output.status).toBe('failed');
        expect(output.results.every((r) => r.status === 'failed')).toBe(true);
      });
    });
  });
});
