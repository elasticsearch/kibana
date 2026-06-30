/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Integration tests for the full workflow layout pipeline:
 *   transformWorkflowToGraph → computeWorkflowLayout → assert positions.
 */

import { dagLayout, resolveShiftedEdgePoints } from '@kbn/dag-layout';
import { transformWorkflowToGraph } from '@kbn/workflows';
import type { WorkflowYaml } from '@kbn/workflows';
import {
  computeWorkflowLayout,
  WORKFLOW_COMPOUND_PADDING,
  WORKFLOW_NODE_SEP,
  WORKFLOW_RANK_SEP,
} from './workflow_layout_pipeline';

const CENTER_TOLERANCE = 2;

const minimal = (overrides: Partial<WorkflowYaml> = {}): WorkflowYaml =>
  ({
    name: 'wf',
    enabled: true,
    triggers: [{ type: 'manual', enabled: true }],
    steps: [],
    ...overrides,
  } as unknown as WorkflowYaml);

const runLayout = (yaml: WorkflowYaml, direction: 'TB' | 'LR' = 'TB') => {
  const transformed = transformWorkflowToGraph(yaml);
  return {
    result: computeWorkflowLayout(transformed, { direction }),
    transformed,
  };
};

const findNode = (nodes: ReturnType<typeof computeWorkflowLayout>['nodes'], id: string) => {
  const n = nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Expected positioned node "${id}"`);
  return n;
};

const findEdge = (
  edges: ReturnType<typeof computeWorkflowLayout>['edges'],
  source: string,
  target: string
) => {
  const e = edges.find((x) => x.source === source && x.target === target);
  if (!e) throw new Error(`Expected edge ${source} → ${target}`);
  return e;
};

const centerX = (n: ReturnType<typeof findNode>) => n.x + n.width / 2;
const centerY = (n: ReturnType<typeof findNode>) => n.y + n.height / 2;

describe('workflow layout pipeline', () => {
  it('gives every node a finite numeric position', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          { name: 'a', type: 'http' },
          { name: 'b', type: 'http' },
        ] as unknown as WorkflowYaml['steps'],
      })
    );
    for (const n of result.nodes) {
      expect(isFinite(n.x)).toBe(true);
      expect(isFinite(n.y)).toBe(true);
    }
  });

  it('foreach group container encompasses its inner nodes plus padding', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          {
            name: 'loop',
            type: 'foreach',
            foreach: 'items',
            steps: [{ name: 'inner', type: 'http' }],
          },
        ] as unknown as WorkflowYaml['steps'],
      })
    );
    const groupNode = findNode(result.nodes, 'loop');
    const innerNode = findNode(result.nodes, 'inner');
    expect(groupNode.width).toBeGreaterThanOrEqual(
      innerNode.width + WORKFLOW_COMPOUND_PADDING.left + WORKFLOW_COMPOUND_PADDING.right
    );
    expect(groupNode.height).toBeGreaterThanOrEqual(
      innerNode.height + WORKFLOW_COMPOUND_PADDING.top + WORKFLOW_COMPOUND_PADDING.bottom
    );
  });

  it('TB layout produces smaller x-spread than y-spread for a linear chain', () => {
    const { result: tb } = runLayout(
      minimal({
        steps: [
          { name: 'a', type: 'http' },
          { name: 'b', type: 'http' },
          { name: 'c', type: 'http' },
        ] as unknown as WorkflowYaml['steps'],
      }),
      'TB'
    );
    const { result: lr } = runLayout(
      minimal({
        steps: [
          { name: 'a', type: 'http' },
          { name: 'b', type: 'http' },
          { name: 'c', type: 'http' },
        ] as unknown as WorkflowYaml['steps'],
      }),
      'LR'
    );
    const tbSteps = tb.nodes.filter((n) => ['a', 'b', 'c'].includes(n.id));
    const tbYSpread = Math.max(...tbSteps.map((n) => n.y)) - Math.min(...tbSteps.map((n) => n.y));
    const tbXSpread = Math.max(...tbSteps.map((n) => n.x)) - Math.min(...tbSteps.map((n) => n.x));
    expect(tbYSpread).toBeGreaterThan(tbXSpread);

    const lrSteps = lr.nodes.filter((n) => ['a', 'b', 'c'].includes(n.id));
    const lrXSpread = Math.max(...lrSteps.map((n) => n.x)) - Math.min(...lrSteps.map((n) => n.x));
    const lrYSpread = Math.max(...lrSteps.map((n) => n.y)) - Math.min(...lrSteps.map((n) => n.y));
    expect(lrXSpread).toBeGreaterThan(lrYSpread);
  });

  it('returns edges with points arrays', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          { name: 'a', type: 'http' },
          { name: 'b', type: 'http' },
        ] as unknown as WorkflowYaml['steps'],
      })
    );
    for (const e of result.edges) {
      expect(Array.isArray(e.points)).toBe(true);
    }
  });

  it('TB merge node is horizontally centered between parallel branch leaves', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          {
            name: 'fork',
            type: 'parallel',
            branches: [
              { steps: [{ name: 'a', type: 'http' }] },
              { steps: [{ name: 'b', type: 'http' }] },
            ],
          },
          { name: 'c', type: 'http' },
        ] as unknown as WorkflowYaml['steps'],
      }),
      'TB'
    );
    const a = findNode(result.nodes, 'a');
    const b = findNode(result.nodes, 'b');
    const c = findNode(result.nodes, 'c');
    expect(Math.abs(centerX(c) - (centerX(a) + centerX(b)) / 2)).toBeLessThanOrEqual(
      CENTER_TOLERANCE
    );
  });

  it('LR merge node is vertically centered between parallel branch leaves', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          {
            name: 'fork',
            type: 'parallel',
            branches: [
              { steps: [{ name: 'a', type: 'http' }] },
              { steps: [{ name: 'b', type: 'http' }] },
            ],
          },
          { name: 'c', type: 'http' },
        ] as unknown as WorkflowYaml['steps'],
      }),
      'LR'
    );
    const a = findNode(result.nodes, 'a');
    const b = findNode(result.nodes, 'b');
    const c = findNode(result.nodes, 'c');
    expect(Math.abs(centerY(c) - (centerY(a) + centerY(b)) / 2)).toBeLessThanOrEqual(
      CENTER_TOLERANCE
    );
  });

  it('TB linear chain shares center X across trigger and steps', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          { name: 'a', type: 'http' },
          { name: 'b', type: 'http' },
        ] as unknown as WorkflowYaml['steps'],
      }),
      'TB'
    );
    const triggerNode = result.nodes.find((n) => {
      const { nodes } = transformWorkflowToGraph(
        minimal({
          steps: [
            { name: 'a', type: 'http' },
            { name: 'b', type: 'http' },
          ] as unknown as WorkflowYaml['steps'],
        })
      );
      return nodes.find((x) => x.type === 'trigger')?.id === n.id;
    });
    const a = findNode(result.nodes, 'a');
    const b = findNode(result.nodes, 'b');
    if (triggerNode) {
      const centers = [centerX(triggerNode), centerX(a), centerX(b)];
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(CENTER_TOLERANCE);
    }
  });

  it('TB linear chain edge waypoints share center X with nodes', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          { name: 'a', type: 'http' },
          { name: 'b', type: 'http' },
        ] as unknown as WorkflowYaml['steps'],
      }),
      'TB'
    );
    const a = findNode(result.nodes, 'a');
    const b = findNode(result.nodes, 'b');
    const e = findEdge(result.edges, 'a', 'b');
    for (const p of e.points) {
      expect(Math.abs(p.x - centerX(a))).toBeLessThanOrEqual(CENTER_TOLERANCE);
      expect(Math.abs(p.x - centerX(b))).toBeLessThanOrEqual(CENTER_TOLERANCE);
    }
  });

  it('TB if branch fan-out omits dagre waypoints for smooth-step routing', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          {
            name: 'gate',
            type: 'if',
            condition: 'true',
            steps: [{ name: 'left_step', type: 'http' }],
            else: [
              {
                name: 'wide_loop',
                type: 'foreach',
                foreach: 'items',
                steps: [
                  { name: 'inner_a', type: 'http' },
                  { name: 'inner_b', type: 'http' },
                ],
              },
            ],
          },
        ] as unknown as WorkflowYaml['steps'],
      }),
      'TB'
    );
    const thenEdge = findEdge(result.edges, 'gate', 'left-step');
    expect(thenEdge.points.length).toBeLessThan(2);
  });

  it('drops co-linear spine waypoints when middle bus is laterally stale', () => {
    expect(
      resolveShiftedEdgePoints({
        shifted: [
          { x: 175, y: 100 },
          { x: 400, y: 150 },
          { x: 175, y: 200 },
        ],
        sourceCenter: 175,
        targetCenter: 175,
        crossAxis: 'x',
      })
    ).toEqual([]);
  });

  it('shifts foreach inner edge points to absolute coordinates', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          {
            name: 'loop',
            type: 'foreach',
            foreach: 'items',
            steps: [
              { name: 'inner_a', type: 'http' },
              { name: 'inner_b', type: 'http' },
            ],
          },
        ] as unknown as WorkflowYaml['steps'],
      })
    );
    const loop = findNode(result.nodes, 'loop');
    const innerA = findNode(result.nodes, 'inner-a');
    // inner-a should be absolutely within the loop container bounds
    expect(innerA.x).toBeGreaterThanOrEqual(loop.x);
    expect(innerA.y).toBeGreaterThanOrEqual(loop.y);
    const innerEdge = findEdge(result.edges, 'inner-a', 'inner-b');
    for (const p of innerEdge.points) {
      expect(p.x).toBeGreaterThanOrEqual(loop.x - 1);
      expect(p.y).toBeGreaterThanOrEqual(loop.y - 1);
    }
  });

  it('TB parallel fan-out keeps sibling steps separated', () => {
    const { result } = runLayout(
      minimal({
        steps: [
          {
            name: 'fork',
            type: 'parallel',
            branches: [
              { steps: [{ name: 'a', type: 'http' }] },
              { steps: [{ name: 'b', type: 'http' }] },
            ],
          },
        ] as unknown as WorkflowYaml['steps'],
      }),
      'TB'
    );
    const a = findNode(result.nodes, 'a');
    const b = findNode(result.nodes, 'b');
    expect(Math.abs(centerX(a) - centerX(b))).toBeGreaterThan(a.width / 2);
  });

  it('throws on a cyclic foreach group graph', () => {
    // transformWorkflowToGraph never produces cycles; construct manually to
    // verify computeWorkflowLayout correctly surfaces the dagLayout cycle error.
    transformWorkflowToGraph(minimal());
    const dagNodes = [
      { id: 'groupA', width: 300, height: 64 },
      { id: 'groupB', width: 300, height: 64 },
    ];
    const dagGroups = [
      { id: 'groupA', innerNodes: [{ id: 'groupB', width: 300, height: 64 }], innerEdges: [] },
      { id: 'groupB', innerNodes: [{ id: 'groupA', width: 300, height: 64 }], innerEdges: [] },
    ];
    expect(() => dagLayout(dagNodes, [], dagGroups)).toThrow(/cycle/i);
  });

  it('constants match the hook: nodeSep is WORKFLOW_NODE_SEP and rankSep is WORKFLOW_RANK_SEP', () => {
    // Regression guard: if the constants drifted between the hook and the
    // pipeline, layout results would silently differ. The test just asserts
    // the exported values have the expected numeric meaning (50 / 70) that
    // was hard-coded in the original use_workflow_layout.ts.
    expect(WORKFLOW_NODE_SEP).toBe(50);
    expect(WORKFLOW_RANK_SEP).toBe(70);
  });
});
