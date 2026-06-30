/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { graphlib } from '@dagrejs/dagre';

export type CrossAxis = 'x' | 'y';

interface DagreLayoutNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AlignHelpers {
  g: graphlib.Graph;
  cross: (id: string) => number;
  crossSpan: (id: string) => number;
  setCross: (id: string, value: number) => void;
  prevCross: Record<string, number>;
  nodeSep: number;
}

const getNode = (g: graphlib.Graph, id: string): DagreLayoutNode => g.node(id) as DagreLayoutNode;

const getFilteredSuccessors = (g: graphlib.Graph, node: string): string[] =>
  (g.successors(node) ?? []).map((s) => s.toString());

const getFilteredPredecessors = (g: graphlib.Graph, node: string): string[] =>
  (g.predecessors(node) ?? []).map((p) => p.toString());

const roundCross = (value: number): number => Math.round(value);

const calculateCenterCross = (nodeIds: string[], cross: (id: string) => number): number => {
  if (nodeIds.length === 0) return 0;
  const first = nodeIds.reduce(
    (min, nodeId) => (cross(nodeId) < cross(min) ? nodeId : min),
    nodeIds[0]
  );
  const last = nodeIds.reduce(
    (max, nodeId) => (cross(nodeId) > cross(max) ? nodeId : max),
    nodeIds[0]
  );
  return cross(first) + (cross(last) - cross(first)) / 2;
};

const findSiblingsWithSharedChildren = (
  helpers: AlignHelpers,
  currNode: string,
  children: string[],
  parents: string[]
): string[] => {
  const { g } = helpers;
  const siblingsWithSharedChildren: string[] = [];

  for (const parent of parents) {
    const allSiblings = getFilteredSuccessors(g, parent);
    for (const sibling of allSiblings) {
      if (!siblingsWithSharedChildren.includes(sibling)) {
        const siblingChildren = getFilteredSuccessors(g, sibling);
        if (children.some((child) => siblingChildren.includes(child))) {
          siblingsWithSharedChildren.push(sibling);
        }
      }
    }
  }

  return siblingsWithSharedChildren;
};

function analyzeSiblings(
  siblings: string[],
  prevCross: Record<string, number>,
  cross: (id: string) => number,
  crossSpan: (id: string) => number
) {
  // Both sides of each comparison must use the same coordinate space.
  // `prevCross[id]` holds the pre-shift position when a node was moved earlier
  // in the reverse-topo pass; `cross(id)` is the live (possibly already-shifted)
  // position. Using `prevCross ?? cross` consistently on both candidate and
  // accumulator prevents the wrong first/last sibling being selected when the
  // accumulator was shifted in a prior iteration.
  const firstSibling = siblings.reduce(
    (min, siblingNode) =>
      (prevCross[siblingNode] ?? cross(siblingNode)) < (prevCross[min] ?? cross(min))
        ? siblingNode
        : min,
    siblings[0]
  );
  const lastSibling = siblings.reduce(
    (max, siblingNode) =>
      (prevCross[siblingNode] ?? cross(siblingNode)) > (prevCross[max] ?? cross(max))
        ? siblingNode
        : max,
    siblings[0]
  );

  const firstSiblingInfo = {
    id: firstSibling,
    span: crossSpan(firstSibling),
    top: (prevCross[firstSibling] ?? cross(firstSibling)) - crossSpan(firstSibling) / 2,
    middle: prevCross[firstSibling] ?? cross(firstSibling),
  };
  const lastSiblingInfo = {
    id: lastSibling,
    span: crossSpan(lastSibling),
    top: (prevCross[lastSibling] ?? cross(lastSibling)) - crossSpan(lastSibling) / 2,
    middle: prevCross[lastSibling] ?? cross(lastSibling),
  };
  return { lastSiblingInfo, firstSiblingInfo };
}

const handleMultipleChildren = (
  helpers: AlignHelpers,
  currNode: string,
  children: string[]
): void => {
  const { g, cross, crossSpan, setCross, prevCross, nodeSep } = helpers;
  const currCross = cross(currNode);
  const parents = getFilteredPredecessors(g, currNode);
  const siblingsWithSharedChildren = findSiblingsWithSharedChildren(
    helpers,
    currNode,
    children,
    parents
  );

  if (siblingsWithSharedChildren.length > 1) {
    const allChildrenSet = new Set<string>();
    for (const sibling of siblingsWithSharedChildren) {
      getFilteredSuccessors(g, sibling).forEach((child) => allChildrenSet.add(child));
    }
    const allChildren = Array.from(allChildrenSet);
    const commonCenter = calculateCenterCross(allChildren, cross);
    const siblingIndex = siblingsWithSharedChildren.indexOf(currNode);
    const siblingCount = siblingsWithSharedChildren.length;
    const spacing = crossSpan(currNode) + nodeSep;
    const totalSpan = (siblingCount - 1) * spacing;
    const newCross = commonCenter - totalSpan / 2 + siblingIndex * spacing;

    prevCross[currNode] = currCross;
    setCross(currNode, roundCross(newCross));
  } else {
    const centerCross = calculateCenterCross(children, cross);
    prevCross[currNode] = currCross;
    setCross(currNode, roundCross(centerCross));
  }
};

const handleSingleChild = (helpers: AlignHelpers, currNode: string, child: string): void => {
  const { g, cross, crossSpan, setCross, prevCross } = helpers;
  const currCross = cross(currNode);
  const siblings = getFilteredPredecessors(g, child);

  if (siblings.length > 1) {
    const { lastSiblingInfo, firstSiblingInfo } = analyzeSiblings(
      siblings,
      prevCross,
      cross,
      crossSpan
    );
    const edgesSpan = lastSiblingInfo.middle - firstSiblingInfo.middle;
    const finalChildCross = cross(child) - crossSpan(child) / 2;
    const firstSiblingNewCross = finalChildCross - (edgesSpan - crossSpan(child)) / 2;
    const finalFirstSiblingNewCross = firstSiblingNewCross - firstSiblingInfo.span / 2;
    const newCross = roundCross(finalFirstSiblingNewCross) + currCross - firstSiblingInfo.top;

    prevCross[currNode] = currCross;
    setCross(currNode, newCross);
  } else if (prevCross[child] !== undefined) {
    const newCross = currCross - (prevCross[child] - cross(child));
    prevCross[currNode] = currCross;
    setCross(currNode, newCross);
  }
};

const handleMultipleParents = (
  helpers: AlignHelpers,
  currNode: string,
  parents: string[]
): void => {
  const { g, cross, crossSpan, setCross, prevCross } = helpers;
  const currCross = cross(currNode);
  const hasSiblings = parents.some((parent) => getFilteredSuccessors(g, parent).length > 1);

  if (hasSiblings) {
    prevCross[currNode] = currCross;
  } else {
    const { firstSiblingInfo: firstParentInfo, lastSiblingInfo: lastParentInfo } = analyzeSiblings(
      parents,
      prevCross,
      cross,
      crossSpan
    );
    const edgesSpan = lastParentInfo.middle - firstParentInfo.middle;
    const newCross = firstParentInfo.middle + (edgesSpan - crossSpan(currNode)) / 2;

    prevCross[currNode] = currCross;
    setCross(currNode, roundCross(newCross));
  }
};

const handleSingleParent = (helpers: AlignHelpers, currNode: string, parent: string): void => {
  const { g, cross, setCross, prevCross } = helpers;
  const currCross = cross(currNode);
  const siblings = getFilteredSuccessors(g, parent);

  if (siblings.length > 1) {
    prevCross[currNode] = currCross;
  } else {
    // dagre coords are centers — a single child aligns center-to-center under
    // its only parent. (Previously `- crossSpan/2`, which drifted every chain
    // link left by half its width and desynced it from adjacent leaf lanes,
    // causing sibling subtrees to overlap.)
    const newCross = cross(parent);
    prevCross[currNode] = currCross;
    setCross(currNode, roundCross(newCross));
  }
};

const handleNoChildren = (helpers: AlignHelpers, currNode: string): void => {
  const { g, cross, setCross, prevCross } = helpers;
  const currCross = cross(currNode);
  const parents = getFilteredPredecessors(g, currNode);

  if (parents.length > 1) {
    handleMultipleParents(helpers, currNode, parents);
  } else if (parents.length === 1) {
    handleSingleParent(helpers, currNode, parents[0]);
  } else {
    prevCross[currNode] = currCross;
    setCross(currNode, roundCross(currCross));
  }
};

const topsort = (g: graphlib.Graph): string[] => {
  const visited: Record<string, boolean> = {};
  const stack: Record<string, boolean> = {};
  const results: string[] = [];

  const visit = (node: string): void => {
    if (Object.hasOwn(stack, node)) {
      throw new Error('CycleException');
    }
    if (!Object.hasOwn(visited, node)) {
      stack[node] = true;
      visited[node] = true;
      g.predecessors(node)?.forEach((preNode) => visit(preNode.toString()));
      delete stack[node];
      results.push(node);
    }
  };

  g.sinks().forEach((node) => visit(node.toString()));
  return results;
};

/**
 * Re-centre a Dagre-laid-out graph on the rank cross-axis so parents sit at the
 * barycenter of their children (and merge nodes at the barycenter of parents).
 * TB layouts pass crossAxis `'x'`; LR layouts pass `'y'`.
 */
export const alignDagreCrossAxisInPlace = (
  g: graphlib.Graph,
  crossAxis: CrossAxis,
  nodeSep: number
): void => {
  const helpers: AlignHelpers = {
    g,
    nodeSep,
    prevCross: {},
    cross: (id) => (crossAxis === 'x' ? getNode(g, id).x : getNode(g, id).y),
    crossSpan: (id) => (crossAxis === 'x' ? getNode(g, id).width : getNode(g, id).height),
    setCross: (id, value) => {
      const node = getNode(g, id);
      if (crossAxis === 'x') {
        node.x = value;
      } else {
        node.y = value;
      }
    },
  };

  const topo = topsort(g);
  for (const currNode of topo.reverse()) {
    const children = getFilteredSuccessors(g, currNode);
    if (children.length > 1) {
      handleMultipleChildren(helpers, currNode, children);
    } else if (children.length === 1) {
      handleSingleChild(helpers, currNode, children[0]);
    } else {
      handleNoChildren(helpers, currNode);
    }
  }
};

export const snapshotDagreNodeCenters = (
  g: graphlib.Graph,
  nodeIds: string[]
): Map<string, { x: number; y: number }> => {
  const snapshot = new Map<string, { x: number; y: number }>();
  for (const id of nodeIds) {
    const node = getNode(g, id);
    snapshot.set(id, { x: node.x, y: node.y });
  }
  return snapshot;
};

export const shiftEdgePointsOnCrossAxis = (
  points: Array<{ x: number; y: number }>,
  crossAxis: CrossAxis,
  delta: number
): Array<{ x: number; y: number }> =>
  points.map((p) => (crossAxis === 'x' ? { x: p.x + delta, y: p.y } : { x: p.x, y: p.y + delta }));

export interface ShiftEdgePointsInterpolatedParams {
  points: Array<{ x: number; y: number }>;
  crossAxis: CrossAxis;
  mainAxis: CrossAxis;
  sourceMain: number;
  targetMain: number;
  sourceDelta: number;
  targetDelta: number;
}

/**
 * Shifts each waypoint's cross-axis coordinate by an amount interpolated between
 * sourceDelta and targetDelta along the edge's main axis (Y for TB, X for LR).
 */
export const shiftEdgePointsInterpolated = ({
  points,
  crossAxis,
  mainAxis,
  sourceMain,
  targetMain,
  sourceDelta,
  targetDelta,
}: ShiftEdgePointsInterpolatedParams): Array<{ x: number; y: number }> => {
  const mainSpan = targetMain - sourceMain;
  return points.map((p) => {
    const mainCoord = mainAxis === 'x' ? p.x : p.y;
    const t =
      Math.abs(mainSpan) < 0.001
        ? 0.5
        : Math.max(0, Math.min(1, (mainCoord - sourceMain) / mainSpan));
    const delta = sourceDelta + t * (targetDelta - sourceDelta);
    return crossAxis === 'x' ? { x: p.x + delta, y: p.y } : { x: p.x, y: p.y + delta };
  });
};

export const translateEdgePoints = (
  points: ReadonlyArray<{ x: number; y: number }>,
  dx: number,
  dy: number
): Array<{ x: number; y: number }> => points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
