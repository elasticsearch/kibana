/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { graphlib } from '@dagrejs/dagre';
import { type ConnectorStep, type ParallelStep, type WorkflowYaml } from '../../../spec/schema';
import type { EnterParallelNode, ExitParallelNode } from '../../types/nodes/parallel_nodes';
import { convertToWorkflowGraph } from '../build_execution_graph';

describe('convertToWorkflowGraph - parallel step', () => {
  const buildGraph = (parallelStep: ParallelStep) =>
    convertToWorkflowGraph({
      steps: [parallelStep],
    } as WorkflowYaml);

  const baseParallel: ParallelStep = {
    name: 'fanOut',
    type: 'parallel',
    foreach: '{{ steps.list.output }}',
    steps: [
      {
        name: 'branchStep',
        type: 'slack',
        connectorId: 'slack',
        with: { message: 'hello' },
      } as ConnectorStep,
    ],
  };

  it('compiles enter-parallel -> branch body -> exit-parallel', () => {
    const executionGraph = buildGraph(baseParallel);
    const topSort = graphlib.alg.topsort(executionGraph);
    expect(topSort).toEqual(['enterParallel_fanOut', 'branchStep', 'exitParallel_fanOut']);
  });

  it('sets exitNodeId and branchStartNodeId on the enter node', () => {
    const executionGraph = buildGraph(baseParallel);
    const enterNode = executionGraph.node('enterParallel_fanOut') as EnterParallelNode;
    expect(enterNode.type).toBe('enter-parallel');
    expect(enterNode.exitNodeId).toBe('exitParallel_fanOut');
    expect(enterNode.branchStartNodeId).toBe('branchStep');
  });

  it('keeps foreach/concurrency/mode in the enter node configuration but drops steps', () => {
    const executionGraph = buildGraph({
      ...baseParallel,
      concurrency: { max: 3, 'count-waiting': false },
      mode: 'settled',
    });
    const enterNode = executionGraph.node('enterParallel_fanOut') as EnterParallelNode;
    expect(enterNode.configuration.foreach).toBe('{{ steps.list.output }}');
    expect(enterNode.configuration.concurrency).toEqual({ max: 3, 'count-waiting': false });
    expect(enterNode.configuration.mode).toBe('settled');
    expect('steps' in enterNode.configuration).toBe(false);
  });

  it('points the exit node back at the enter node', () => {
    const executionGraph = buildGraph(baseParallel);
    const exitNode = executionGraph.node('exitParallel_fanOut') as ExitParallelNode;
    expect(exitNode.type).toBe('exit-parallel');
    expect(exitNode.startNodeId).toBe('enterParallel_fanOut');
  });

  it('compiles a multi-step (straight-line) branch body in order', () => {
    const executionGraph = buildGraph({
      ...baseParallel,
      steps: [
        {
          name: 'first',
          type: 'slack',
          connectorId: 'slack',
          with: { message: 'a' },
        } as ConnectorStep,
        {
          name: 'second',
          type: 'slack',
          connectorId: 'slack',
          with: { message: 'b' },
        } as ConnectorStep,
      ],
    });
    const topSort = graphlib.alg.topsort(executionGraph);
    expect(topSort).toEqual(['enterParallel_fanOut', 'first', 'second', 'exitParallel_fanOut']);
  });

  it('compiles nested flow-control inside a branch body', () => {
    expect(() =>
      buildGraph({
        ...baseParallel,
        steps: [
          {
            name: 'branchIf',
            type: 'if',
            condition: 'true',
            steps: [{ name: 'a', type: 'slack', connectorId: 'slack', with: {} } as ConnectorStep],
            else: [{ name: 'b', type: 'slack', connectorId: 'slack', with: {} } as ConnectorStep],
          } as unknown as ConnectorStep,
        ],
      })
    ).not.toThrow();
  });

  it('compiles a timer-based wait step inside a branch body', () => {
    const executionGraph = buildGraph({
      ...baseParallel,
      steps: [{ name: 'w', type: 'wait', with: { duration: '1s' } } as unknown as ConnectorStep],
    });
    const topSort = graphlib.alg.topsort(executionGraph);
    expect(topSort).toEqual(['enterParallel_fanOut', 'w', 'exitParallel_fanOut']);
  });

  it('compiles a wait step followed by another step inside a branch body', () => {
    const executionGraph = buildGraph({
      ...baseParallel,
      steps: [
        { name: 'w', type: 'wait', with: { duration: '1s' } } as unknown as ConnectorStep,
        {
          name: 'after',
          type: 'slack',
          connectorId: 'slack',
          with: { message: 'done' },
        } as ConnectorStep,
      ],
    });
    const topSort = graphlib.alg.topsort(executionGraph);
    expect(topSort).toEqual(['enterParallel_fanOut', 'w', 'after', 'exitParallel_fanOut']);
  });

  it('rejects a waitForInput step inside a branch body', () => {
    expect(() =>
      buildGraph({
        ...baseParallel,
        steps: [
          {
            name: 'ask',
            type: 'waitForInput',
            with: { message: 'continue?' },
          } as unknown as ConnectorStep,
        ],
      })
    ).toThrow(/not supported inside a parallel branch/);
  });

  it('rejects a waitForApproval step inside a branch body', () => {
    expect(() =>
      buildGraph({
        ...baseParallel,
        steps: [
          {
            name: 'approve',
            type: 'waitForApproval',
            with: { message: 'approve?' },
          } as unknown as ConnectorStep,
        ],
      })
    ).toThrow(/not supported inside a parallel branch/);
  });

  it('compiles a workflow.fail step inside a dynamic branch body', () => {
    expect(() =>
      buildGraph({
        ...baseParallel,
        steps: [
          {
            name: 'always_fail',
            type: 'workflow.fail',
            with: { message: 'boom' },
          } as unknown as ConnectorStep,
        ],
      })
    ).not.toThrow();
  });

  it('compiles a workflow.output step inside a dynamic branch body', () => {
    expect(() =>
      buildGraph({
        ...baseParallel,
        steps: [
          {
            name: 'emit',
            type: 'workflow.output',
            with: { result: 'x' },
          } as unknown as ConnectorStep,
        ],
      })
    ).not.toThrow();
  });

  it('compiles static branches into one chain per branch between enter and exit', () => {
    const executionGraph = buildGraph({
      name: 'fanOut',
      type: 'parallel',
      branches: [
        {
          name: 'vt',
          steps: [
            { name: 'vt_step', type: 'slack', connectorId: 'slack', with: { message: 'vt' } },
          ],
        },
        {
          name: 'geo',
          steps: [
            { name: 'geo_step', type: 'slack', connectorId: 'slack', with: { message: 'geo' } },
          ],
        },
      ],
    } as unknown as ParallelStep);

    const enterNode = executionGraph.node('enterParallel_fanOut') as EnterParallelNode;
    expect(enterNode.type).toBe('enter-parallel');
    expect(enterNode.branchStartNodeId).toBeUndefined();
    expect(enterNode.branches).toEqual([
      { name: 'vt', startNodeId: 'vt_step' },
      { name: 'geo', startNodeId: 'geo_step' },
    ]);
    // Both branch bodies sit between enter and exit.
    const nodes = executionGraph.nodes();
    expect(nodes).toEqual(
      expect.arrayContaining(['enterParallel_fanOut', 'vt_step', 'geo_step', 'exitParallel_fanOut'])
    );
  });

  it('compiles a multi-step static branch body in order', () => {
    const executionGraph = buildGraph({
      name: 'fanOut',
      type: 'parallel',
      branches: [
        {
          name: 'chain',
          steps: [
            { name: 'a', type: 'slack', connectorId: 'slack', with: { message: 'a' } },
            { name: 'b', type: 'slack', connectorId: 'slack', with: { message: 'b' } },
          ],
        },
      ],
    } as unknown as ParallelStep);
    const enterNode = executionGraph.node('enterParallel_fanOut') as EnterParallelNode;
    expect(enterNode.branches).toEqual([{ name: 'chain', startNodeId: 'a' }]);
    const topSort = graphlib.alg.topsort(executionGraph);
    expect(topSort).toEqual(['enterParallel_fanOut', 'a', 'b', 'exitParallel_fanOut']);
  });

  it('compiles nested flow-control inside a static branch body', () => {
    expect(() =>
      buildGraph({
        name: 'fanOut',
        type: 'parallel',
        branches: [
          {
            name: 'bad',
            steps: [
              {
                name: 'branchIf',
                type: 'if',
                condition: 'true',
                steps: [{ name: 'a', type: 'slack', connectorId: 'slack', with: {} }],
                else: [{ name: 'b', type: 'slack', connectorId: 'slack', with: {} }],
              },
            ],
          },
        ],
      } as unknown as ParallelStep)
    ).not.toThrow();
  });

  it('compiles an on-failure handler inside a static branch body', () => {
    expect(() =>
      buildGraph({
        name: 'fanOut',
        type: 'parallel',
        branches: [
          {
            name: 'vt',
            steps: [
              {
                name: 'scan',
                type: 'slack',
                connectorId: 'slack',
                with: {},
                'on-failure': { retry: { 'max-attempts': 2, delay: '3s' }, continue: true },
              },
            ],
          },
        ],
      } as unknown as ParallelStep)
    ).not.toThrow();
  });

  it('rejects a step-level timeout inside a static branch body', () => {
    expect(() =>
      buildGraph({
        name: 'fanOut',
        type: 'parallel',
        branches: [
          {
            name: 'vt',
            steps: [
              { name: 'scan', type: 'slack', connectorId: 'slack', with: {}, timeout: '30s' },
            ],
          },
        ],
      } as unknown as ParallelStep)
    ).toThrow(/unsupported flow-control|timeout/);
  });

  it('rejects a waitForApproval step inside a static branch body', () => {
    expect(() =>
      buildGraph({
        name: 'fanOut',
        type: 'parallel',
        branches: [
          {
            name: 'approval',
            steps: [
              {
                name: 'approve',
                type: 'waitForApproval',
                with: { message: 'approve?' },
              },
            ],
          },
        ],
      } as unknown as ParallelStep)
    ).toThrow(/not supported inside a parallel branch/);
  });

  it('compiles a workflow.fail step inside a static branch body', () => {
    expect(() =>
      buildGraph({
        name: 'fanOut',
        type: 'parallel',
        branches: [
          {
            name: 'vt',
            steps: [{ name: 'scan', type: 'slack', connectorId: 'slack', with: {} }],
          },
          {
            name: 'boom',
            steps: [{ name: 'die', type: 'workflow.fail', with: { message: 'x' } }],
          },
        ],
      } as unknown as ParallelStep)
    ).not.toThrow();
  });

  it('wraps the parallel block in a timeout zone when timeout is set', () => {
    const executionGraph = buildGraph({ ...baseParallel, timeout: '30s' });
    const topSort = graphlib.alg.topsort(executionGraph);
    expect(topSort).toEqual([
      'enterTimeoutZone_fanOut',
      'enterParallel_fanOut',
      'branchStep',
      'exitParallel_fanOut',
      'exitTimeoutZone_fanOut',
    ]);
  });

  it('wraps the parallel block in an if zone when a step-level `if` is set', () => {
    const executionGraph = buildGraph({ ...baseParallel, if: 'inputs.enabled : true' });
    const topSort = graphlib.alg.topsort(executionGraph);
    expect(topSort).toEqual([
      'enterCondition_if_fanOut',
      'enterThen_if_fanOut',
      'enterParallel_fanOut',
      'branchStep',
      'exitParallel_fanOut',
      'exitThen_if_fanOut',
      'exitCondition_if_fanOut',
    ]);
  });

  it('compiles a step-level `if` inside a dynamic branch body', () => {
    expect(() =>
      buildGraph({
        ...baseParallel,
        steps: [
          {
            name: 'branchStep',
            type: 'slack',
            connectorId: 'slack',
            with: {},
            if: 'inputs.enabled : true',
          } as unknown as ConnectorStep,
        ],
      })
    ).not.toThrow();
  });

  it('compiles a step-level `if` inside a static branch body', () => {
    expect(() =>
      buildGraph({
        name: 'fanOut',
        type: 'parallel',
        branches: [
          {
            name: 'vt',
            steps: [
              {
                name: 'scan',
                type: 'slack',
                connectorId: 'slack',
                with: {},
                if: 'inputs.enabled : true',
              },
            ],
          },
        ],
      } as unknown as ParallelStep)
    ).not.toThrow();
  });
});

describe('parallel loop control boundary', () => {
  it.each(['loop.break', 'loop.continue'] as const)(
    'rejects %s targeting a loop outside the branch',
    (type) => {
      expect(() =>
        convertToWorkflowGraph({
          steps: [
            {
              name: 'outer',
              type: 'foreach',
              foreach: [1, 2],
              steps: [
                {
                  name: 'parallel',
                  type: 'parallel',
                  foreach: [1, 2],
                  steps: [{ name: 'escape', type }],
                } as ParallelStep,
              ],
            },
          ],
        } as WorkflowYaml)
      ).toThrow('same parallel branch');
    }
  );
});
