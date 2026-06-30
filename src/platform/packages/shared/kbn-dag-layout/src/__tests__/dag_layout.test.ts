/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dagLayout } from '../dag_layout';
import { resolveShiftedEdgePoints } from '../apply_dagre';
import type { DagCompoundGroup, DagEdge, DagNode } from '../types';

const NODE_W = 300;
const NODE_H = 64;
const CENTER_TOLERANCE = 2;

const node = (id: string): DagNode => ({ id, width: NODE_W, height: NODE_H });
const edge = (id: string, source: string, target: string): DagEdge => ({ id, source, target });

const findNode = (nodes: ReturnType<typeof dagLayout>['nodes'], id: string) => {
  const n = nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Expected positioned node "${id}"`);
  return n;
};

const centerX = (n: ReturnType<typeof findNode>) => n.x + n.width / 2;
const centerY = (n: ReturnType<typeof findNode>) => n.y + n.height / 2;

const findEdge = (edges: ReturnType<typeof dagLayout>['edges'], source: string, target: string) => {
  const e = edges.find((x) => x.source === source && x.target === target);
  if (!e) throw new Error(`Expected edge ${source} → ${target}`);
  return e;
};

// ─── Basic positioning ─────────────────────────────────────────────────────────

describe('dagLayout — basic positioning', () => {
  it('gives every node finite numeric coordinates', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')];
    const { nodes: laid } = dagLayout(nodes, edges);
    for (const n of laid) {
      expect(isFinite(n.x)).toBe(true);
      expect(isFinite(n.y)).toBe(true);
    }
  });

  it('returns edges with points arrays', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('ab', 'a', 'b')];
    const { edges: laid } = dagLayout(nodes, edges);
    for (const e of laid) {
      expect(Array.isArray(e.points)).toBe(true);
    }
  });

  it('TB layout — y-spread exceeds x-spread for a linear chain', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'TB' });
    const xs = laid.map((n) => n.x);
    const ys = laid.map((n) => n.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
  });

  it('LR layout — x-spread exceeds y-spread for a linear chain', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'LR' });
    const xs = laid.map((n) => n.x);
    const ys = laid.map((n) => n.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys));
  });
});

// ─── Barycenter centering ──────────────────────────────────────────────────────

describe('dagLayout — barycenter centering', () => {
  it('TB: merge node is horizontally centered between parallel branch leaves', () => {
    // fork → a, fork → b, a → merge, b → merge
    const nodes = [node('fork'), node('a'), node('b'), node('merge')];
    const edges = [
      edge('fa', 'fork', 'a'),
      edge('fb', 'fork', 'b'),
      edge('am', 'a', 'merge'),
      edge('bm', 'b', 'merge'),
    ];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'TB' });
    const a = findNode(laid, 'a');
    const b = findNode(laid, 'b');
    const merge = findNode(laid, 'merge');
    const expected = (centerX(a) + centerX(b)) / 2;
    expect(Math.abs(centerX(merge) - expected)).toBeLessThanOrEqual(CENTER_TOLERANCE);
  });

  it('LR: merge node is vertically centered between parallel branch leaves', () => {
    const nodes = [node('fork'), node('a'), node('b'), node('merge')];
    const edges = [
      edge('fa', 'fork', 'a'),
      edge('fb', 'fork', 'b'),
      edge('am', 'a', 'merge'),
      edge('bm', 'b', 'merge'),
    ];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'LR' });
    const a = findNode(laid, 'a');
    const b = findNode(laid, 'b');
    const merge = findNode(laid, 'merge');
    const expected = (centerY(a) + centerY(b)) / 2;
    expect(Math.abs(centerY(merge) - expected)).toBeLessThanOrEqual(CENTER_TOLERANCE);
  });

  it('TB linear chain: all nodes share the same center X', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'TB' });
    const centers = laid.map((n) => centerX(n));
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(CENTER_TOLERANCE);
  });

  it('TB parallel fan-out: sibling nodes are horizontally separated', () => {
    const nodes = [node('fork'), node('a'), node('b')];
    const edges = [edge('fa', 'fork', 'a'), edge('fb', 'fork', 'b')];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'TB' });
    const a = findNode(laid, 'a');
    const b = findNode(laid, 'b');
    expect(Math.abs(centerX(a) - centerX(b))).toBeGreaterThan(NODE_W / 2);
  });
});

// ─── Edge waypoints ────────────────────────────────────────────────────────────

describe('dagLayout — edge waypoints', () => {
  it('TB linear chain edge waypoints share center X with nodes', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('ab', 'a', 'b')];
    const { nodes: laid, edges: laidEdges } = dagLayout(nodes, edges, [], { direction: 'TB' });
    const a = findNode(laid, 'a');
    const b = findNode(laid, 'b');
    const e = findEdge(laidEdges, 'a', 'b');
    for (const p of e.points) {
      expect(Math.abs(p.x - centerX(a))).toBeLessThanOrEqual(CENTER_TOLERANCE);
      expect(Math.abs(p.x - centerX(b))).toBeLessThanOrEqual(CENTER_TOLERANCE);
    }
  });

  it('fan-out edge has no dagre waypoints (smooth-step routing)', () => {
    // fork fans out to a and b — branch edges should have empty points
    const nodes = [node('fork'), node('a'), node('b')];
    const edges = [edge('fa', 'fork', 'a'), edge('fb', 'fork', 'b')];
    const { edges: laidEdges } = dagLayout(nodes, edges, [], { direction: 'TB' });
    const fa = findEdge(laidEdges, 'fork', 'a');
    const fb = findEdge(laidEdges, 'fork', 'b');
    expect(fa.points.length).toBeLessThan(2);
    expect(fb.points.length).toBeLessThan(2);
  });
});

// ─── resolveShiftedEdgePoints ──────────────────────────────────────────────────

describe('resolveShiftedEdgePoints', () => {
  it('drops co-linear spine waypoints when middle bus is laterally stale', () => {
    const result = resolveShiftedEdgePoints({
      shifted: [
        { x: 175, y: 100 },
        { x: 400, y: 150 },
        { x: 175, y: 200 },
      ],
      sourceCenter: 175,
      targetCenter: 175,
      crossAxis: 'x',
    });
    expect(result).toEqual([]);
  });

  it('keeps shifted waypoints when middle bus stays within endpoint span', () => {
    const shifted = [
      { x: 175, y: 100 },
      { x: 180, y: 150 },
      { x: 175, y: 200 },
    ];
    expect(
      resolveShiftedEdgePoints({ shifted, sourceCenter: 175, targetCenter: 175, crossAxis: 'x' })
    ).toEqual(shifted);
  });
});

// ─── Compound groups ───────────────────────────────────────────────────────────

describe('dagLayout — compound groups', () => {
  it('inner nodes are positioned absolutely (not relative to group)', () => {
    const outerNodes = [node('trigger'), node('group'), node('end')];
    const outerEdges = [edge('tg', 'trigger', 'group'), edge('ge', 'group', 'end')];
    const innerNodes = [node('inner-a'), node('inner-b')];
    const innerEdges = [edge('ia-ib', 'inner-a', 'inner-b')];
    const groups: DagCompoundGroup[] = [{ id: 'group', innerNodes, innerEdges }];
    const { nodes: laid } = dagLayout(outerNodes, outerEdges, groups, {
      compoundPadding: { top: 70, right: 32, bottom: 32, left: 32 },
    });

    const groupNode = findNode(laid, 'group');
    const innerA = findNode(laid, 'inner-a');
    const innerB = findNode(laid, 'inner-b');

    // Inner nodes should be within the group container's absolute bounds
    expect(innerA.x).toBeGreaterThanOrEqual(groupNode.x);
    expect(innerA.y).toBeGreaterThanOrEqual(groupNode.y);
    expect(innerA.x + innerA.width).toBeLessThanOrEqual(groupNode.x + groupNode.width + 1);
    expect(innerA.y + innerA.height).toBeLessThanOrEqual(groupNode.y + groupNode.height + 1);
    expect(innerB.x).toBeGreaterThanOrEqual(groupNode.x);
    expect(innerB.y).toBeGreaterThanOrEqual(groupNode.y);
  });

  it('group container expands to encompass its inner nodes plus padding', () => {
    const padding = { top: 70, right: 32, bottom: 32, left: 32 };
    const outerNodes = [node('group')];
    const innerNodes = [node('inner')];
    const groups: DagCompoundGroup[] = [{ id: 'group', innerNodes, innerEdges: [] }];
    const { nodes: laid } = dagLayout(outerNodes, [], groups, { compoundPadding: padding });

    const groupNode = findNode(laid, 'group');
    expect(groupNode.width).toBeGreaterThanOrEqual(NODE_W + padding.left + padding.right);
    expect(groupNode.height).toBeGreaterThanOrEqual(NODE_H + padding.top + padding.bottom);
  });

  it('inner edge waypoints are in absolute coordinates', () => {
    const outerNodes = [node('group')];
    const innerNodes = [node('inner-a'), node('inner-b')];
    const innerEdges = [edge('e', 'inner-a', 'inner-b')];
    const groups: DagCompoundGroup[] = [{ id: 'group', innerNodes, innerEdges }];
    const { nodes: laid, edges: laidEdges } = dagLayout(outerNodes, [], groups, {
      compoundPadding: { top: 70, right: 32, bottom: 32, left: 32 },
    });

    const groupNode = findNode(laid, 'group');
    const e = findEdge(laidEdges, 'inner-a', 'inner-b');
    for (const p of e.points) {
      expect(p.x).toBeGreaterThanOrEqual(groupNode.x - 1);
      expect(p.y).toBeGreaterThanOrEqual(groupNode.y - 1);
    }
  });

  it('nested compound group (group-in-group) — all nodes have finite positions', () => {
    const outerNodes = [node('outer-group')];
    const innerGroupNode = node('inner-group');
    const innerInnerNodes = [node('deep-a'), node('deep-b')];
    const innerInnerEdges = [edge('da-db', 'deep-a', 'deep-b')];

    const groups: DagCompoundGroup[] = [
      { id: 'inner-group', innerNodes: innerInnerNodes, innerEdges: innerInnerEdges },
      { id: 'outer-group', innerNodes: [innerGroupNode], innerEdges: [] },
    ];

    const { nodes: laid } = dagLayout(outerNodes, [], groups, {
      compoundPadding: { top: 70, right: 32, bottom: 32, left: 32 },
    });

    for (const n of laid) {
      expect(isFinite(n.x)).toBe(true);
      expect(isFinite(n.y)).toBe(true);
    }
    // All 4 nodes should appear: outer-group, inner-group, deep-a, deep-b
    expect(laid.map((n) => n.id).sort()).toEqual(
      ['deep-a', 'deep-b', 'inner-group', 'outer-group'].sort()
    );
  });
});

// ─── Compact mode ─────────────────────────────────────────────────────────────

describe('dagLayout — compact mode', () => {
  it('inner nodes are absent from output in compact mode', () => {
    const outerNodes = [node('group')];
    const innerNodes = [node('inner-a'), node('inner-b')];
    const innerEdges = [edge('e', 'inner-a', 'inner-b')];
    const groups: DagCompoundGroup[] = [{ id: 'group', innerNodes, innerEdges }];

    const { nodes: laid } = dagLayout(outerNodes, [], groups, { compact: true });

    expect(laid.map((n) => n.id)).toEqual(['group']);
    expect(laid.find((n) => n.id === 'inner-a')).toBeUndefined();
  });

  it('container uses the caller-provided dimensions in compact mode', () => {
    const containerWidth = 200;
    const containerHeight = 100;
    const outerNodes = [{ id: 'group', width: containerWidth, height: containerHeight }];
    const innerNodes = [node('inner')];
    const groups: DagCompoundGroup[] = [{ id: 'group', innerNodes, innerEdges: [] }];

    const { nodes: laid } = dagLayout(outerNodes, [], groups, { compact: true });

    const groupNode = findNode(laid, 'group');
    expect(groupNode.width).toBe(containerWidth);
    expect(groupNode.height).toBe(containerHeight);
  });
});

// ─── align_cross_axis — uncovered branches ─────────────────────────────────────

describe('dagLayout — handleMultipleChildren with siblingsWithSharedChildren.length > 1', () => {
  // Topology (TB):
  //         root
  //        /    \
  //       a      b
  //      / \    / \
  //     c1  c2 c1  c2  ← a and b are siblings that BOTH fan into c1 and c2
  //
  // When the barycenter pass processes 'a', it has multiple children [c1, c2] AND
  // sibling 'b' shares those same children. This triggers the spacing formula in
  // handleMultipleChildren (siblingsWithSharedChildren.length > 1).
  // After layout, 'a' and 'b' must be horizontally separated and neither should
  // overlap 'c1' or 'c2'.
  it('sibling nodes that share multiple children do not overlap each other or their children', () => {
    const nodes = [node('root'), node('a'), node('b'), node('c1'), node('c2')];
    const edges = [
      edge('r-a', 'root', 'a'),
      edge('r-b', 'root', 'b'),
      edge('a-c1', 'a', 'c1'),
      edge('a-c2', 'a', 'c2'),
      edge('b-c1', 'b', 'c1'),
      edge('b-c2', 'b', 'c2'),
    ];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'TB' });

    // All pairs must be non-overlapping.
    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        const na = laid[i];
        const nb = laid[j];
        const overlapX = na.x < nb.x + nb.width && na.x + na.width > nb.x;
        const overlapY = na.y < nb.y + nb.height && na.y + na.height > nb.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }

    // Siblings 'a' and 'b' must be horizontally separated (they are on the same rank).
    const aNode = findNode(laid, 'a');
    const bNode = findNode(laid, 'b');
    expect(Math.abs(centerX(aNode) - centerX(bNode))).toBeGreaterThan(NODE_W / 2);
  });
});

describe('dagLayout — compound inner-node overlap invariant', () => {
  // The existing overlap tests run with compoundGroups = []. This test verifies
  // inner nodes inside a group container also remain non-overlapping after the
  // absolute-position translation (getGroupAbsolutePosition).
  it('inner nodes of a compound group do not overlap each other', () => {
    const outerNodes = [node('trigger'), node('group'), node('end')];
    const outerEdges = [edge('t-g', 'trigger', 'group'), edge('g-e', 'group', 'end')];
    // Diamond topology inside the group to exercise the barycenter pass on inner nodes.
    const innerNodes = [node('fork'), node('branch-a'), node('branch-b'), node('join')];
    const innerEdges = [
      edge('f-a', 'fork', 'branch-a'),
      edge('f-b', 'fork', 'branch-b'),
      edge('a-j', 'branch-a', 'join'),
      edge('b-j', 'branch-b', 'join'),
    ];
    const groups: DagCompoundGroup[] = [{ id: 'group', innerNodes, innerEdges }];
    const { nodes: laid } = dagLayout(outerNodes, outerEdges, groups, {
      compoundPadding: { top: 70, right: 32, bottom: 32, left: 32 },
    });

    const innerLaid = laid.filter((n) => ['fork', 'branch-a', 'branch-b', 'join'].includes(n.id));
    expect(innerLaid).toHaveLength(4);

    // No two inner nodes should overlap.
    for (let i = 0; i < innerLaid.length; i++) {
      for (let j = i + 1; j < innerLaid.length; j++) {
        const na = innerLaid[i];
        const nb = innerLaid[j];
        const overlapX = na.x < nb.x + nb.width && na.x + na.width > nb.x;
        const overlapY = na.y < nb.y + nb.height && na.y + na.height > nb.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }

    // The join node should be horizontally centered between branch-a and branch-b.
    const branchA = findNode(laid, 'branch-a');
    const branchB = findNode(laid, 'branch-b');
    const join = findNode(laid, 'join');
    const expectedCenter = (centerX(branchA) + centerX(branchB)) / 2;
    expect(Math.abs(centerX(join) - expectedCenter)).toBeLessThanOrEqual(CENTER_TOLERANCE);
  });
});

// ─── Cycle detection ──────────────────────────────────────────────────────────

describe('dagLayout — cycle detection', () => {
  it('throws when compound groups form a cycle', () => {
    const groupA = node('groupA');
    const groupB = node('groupB');
    const groups: DagCompoundGroup[] = [
      { id: 'groupA', innerNodes: [groupB], innerEdges: [] },
      { id: 'groupB', innerNodes: [groupA], innerEdges: [] },
    ];
    expect(() => dagLayout([groupA, groupB], [], groups)).toThrow(/cycle/i);
  });
});

// ─── analyzeSiblings asymmetric prevCross comparison ──────────────────────────
//
// Regression: the `firstSibling`/`lastSibling` reduce in `analyzeSiblings` was
// comparing the candidate in `prevCross ?? cross` space against the accumulator
// in raw `cross` space. This can pick the wrong outermost sibling when one sibling
// was shifted by an earlier pass — causing mis-centering in handleSingleChild and
// handleMultipleParents. The fix makes both sides of the comparison use
// `prevCross ?? cross` so both candidate and accumulator are always evaluated in
// the same pre-shift coordinate space.

describe('dagLayout — analyzeSiblings prevCross symmetry', () => {
  it('3-way merge node is horizontally centered between its outermost parents', () => {
    // Topology (TB):
    //   root → pa, root → pb, root → pc
    //   pa → merge, pb → merge, pc → merge
    //   pa → sideA (leaf)        ← forces pa into handleMultipleChildren
    //   pc → sideC (leaf)        ← forces pc into handleMultipleChildren
    //
    // After pa and pc are shifted by handleMultipleChildren, analyzeSiblings([pa,pb,pc])
    // is called. With the bug the asymmetric comparison can select the wrong outermost
    // parent, corrupting edgesSpan and centering merge between the wrong pair.
    const nodes = [
      node('root'),
      node('pa'),
      node('pb'),
      node('pc'),
      node('merge'),
      node('sideA'),
      node('sideC'),
    ];
    const edges = [
      edge('r-pa', 'root', 'pa'),
      edge('r-pb', 'root', 'pb'),
      edge('r-pc', 'root', 'pc'),
      edge('pa-m', 'pa', 'merge'),
      edge('pb-m', 'pb', 'merge'),
      edge('pc-m', 'pc', 'merge'),
      edge('pa-sA', 'pa', 'sideA'),
      edge('pc-sC', 'pc', 'sideC'),
    ];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'TB' });

    const pa = findNode(laid, 'pa');
    const pb = findNode(laid, 'pb');
    const pc = findNode(laid, 'pc');
    const merge = findNode(laid, 'merge');

    // All nodes must be non-overlapping.
    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        const a = laid[i];
        const b = laid[j];
        const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
        const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }

    // merge should be horizontally centered between the outermost parents.
    const leftMost = Math.min(centerX(pa), centerX(pb), centerX(pc));
    const rightMost = Math.max(centerX(pa), centerX(pb), centerX(pc));
    const expectedCenter = (leftMost + rightMost) / 2;
    expect(Math.abs(centerX(merge) - expectedCenter)).toBeLessThanOrEqual(CENTER_TOLERANCE);
  });
});

// ─── Invariants ───────────────────────────────────────────────────────────────

describe('dagLayout — layout invariants', () => {
  it('no two outer nodes overlap in TB layout', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const edges = [
      edge('ab', 'a', 'b'),
      edge('ac', 'a', 'c'),
      edge('bd', 'b', 'd'),
      edge('cd', 'c', 'd'),
    ];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'TB' });

    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        const a = laid[i];
        const b = laid[j];
        const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
        const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('no overlap when two sibling diamonds each have a chain lane next to a leaf lane', () => {
    // Regression for: handleSingleParent drift — chain-lane nodes were shifted
    // left by half their width, desyncing them from adjacent leaf lanes and
    // causing the inner lanes of adjacent diamonds to collide.
    //
    // Topology (TB):
    //   gate
    //   ├─ brA ─ chainA1 ─ chainA2   (chain lane)
    //   │   └─ leafA                  (leaf lane)
    //   └─ brB ─ chainB1 ─ chainB2   (chain lane)
    //       └─ leafB                  (leaf lane)
    //
    // Before the fix: leafA <> chainB1 overlap (−100px gap).
    const nodes = [
      node('gate'),
      node('brA'),
      node('brB'),
      node('chainA1'),
      node('leafA'),
      node('chainB1'),
      node('leafB'),
      node('chainA2'),
      node('chainB2'),
    ];
    const edges = [
      edge('g-brA', 'gate', 'brA'),
      edge('g-brB', 'gate', 'brB'),
      edge('brA-cA1', 'brA', 'chainA1'),
      edge('brA-lA', 'brA', 'leafA'),
      edge('brB-cB1', 'brB', 'chainB1'),
      edge('brB-lB', 'brB', 'leafB'),
      edge('cA1-cA2', 'chainA1', 'chainA2'),
      edge('cB1-cB2', 'chainB1', 'chainB2'),
    ];
    const { nodes: laid } = dagLayout(nodes, edges, [], { direction: 'TB' });

    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        const a = laid[i];
        const b = laid[j];
        const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
        const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });
});
