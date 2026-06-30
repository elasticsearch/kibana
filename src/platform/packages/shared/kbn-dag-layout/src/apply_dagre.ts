/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import dagre, { graphlib } from '@dagrejs/dagre';
import {
  alignDagreCrossAxisInPlace,
  type CrossAxis,
  shiftEdgePointsInterpolated,
  snapshotDagreNodeCenters,
} from './align_cross_axis';
import type {
  DagEdge,
  DagLayoutDirection,
  DagNode,
  DagPositionedEdge,
  DagPositionedNode,
} from './types';
import { CROSS_AXIS_DELTA_TOLERANCE, STRAIGHT_X_THRESHOLD } from './constants';

/** Drops Dagre waypoints when endpoints align but middle segments still spread laterally. */
export const resolveShiftedEdgePoints = ({
  shifted,
  sourceCenter,
  targetCenter,
  crossAxis,
}: {
  shifted: Array<{ x: number; y: number }>;
  sourceCenter: number;
  targetCenter: number;
  crossAxis: CrossAxis;
}): Array<{ x: number; y: number }> => {
  const endpointSpread = Math.abs(sourceCenter - targetCenter);
  const crossCoord = (p: { x: number; y: number }): number => (crossAxis === 'x' ? p.x : p.y);
  const allCrossCoords = [sourceCenter, targetCenter, ...shifted.map(crossCoord)];
  const waypointSpread = Math.max(...allCrossCoords) - Math.min(...allCrossCoords);
  if (endpointSpread < STRAIGHT_X_THRESHOLD && waypointSpread >= STRAIGHT_X_THRESHOLD) {
    return [];
  }
  return shifted;
};

export function applyDagre(
  nodes: readonly DagNode[],
  edges: readonly DagEdge[],
  direction: DagLayoutDirection,
  nodeSep: number,
  rankSep: number
): { nodes: DagPositionedNode[]; edges: DagPositionedEdge[] } {
  const g = new graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranker: 'tight-tree',
    nodesep: nodeSep,
    ranksep: rankSep,
    edgesep: 40,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: node.width, height: node.height });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, { label: edge.id });
  }

  dagre.layout(g);

  const crossAxis: CrossAxis = direction === 'LR' ? 'y' : 'x';
  const mainAxis: CrossAxis = direction === 'LR' ? 'x' : 'y';
  const nodeIds = nodes.map((n) => n.id);
  const centersBefore = snapshotDagreNodeCenters(g, nodeIds);
  alignDagreCrossAxisInPlace(g, crossAxis, nodeSep);

  const positioned: DagPositionedNode[] = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) {
      throw new Error(`Dagre layout produced no position for node "${node.id}"`);
    }
    return {
      id: node.id,
      x: dagreNode.x - dagreNode.width / 2,
      y: dagreNode.y - dagreNode.height / 2,
      width: dagreNode.width,
      height: dagreNode.height,
    };
  });

  const routedEdges: DagPositionedEdge[] = edges.map((edge) => {
    const dagreEdge = g.edge(edge.source, edge.target);
    const rawPoints = dagreEdge?.points;
    const beforeSource = centersBefore.get(edge.source);
    const beforeTarget = centersBefore.get(edge.target);
    const afterSource = g.node(edge.source);
    const afterTarget = g.node(edge.target);

    let points: Array<{ x: number; y: number }> = [];
    if (
      rawPoints &&
      rawPoints.length >= 2 &&
      beforeSource &&
      beforeTarget &&
      afterSource &&
      afterTarget
    ) {
      const sourceDelta =
        crossAxis === 'x' ? afterSource.x - beforeSource.x : afterSource.y - beforeSource.y;
      const targetDelta =
        crossAxis === 'x' ? afterTarget.x - beforeTarget.x : afterTarget.y - beforeTarget.y;
      const successorCount = (g.successors(edge.source) ?? []).length;
      const predecessorCount = (g.predecessors(edge.target) ?? []).length;
      // Fan-out/fan-in edges keep stale multi-rank Dagre buses after barycenter; smooth-step instead.
      const isBranchOrMergeEdge = successorCount > 1 || predecessorCount > 1;
      const useDagreWaypoints =
        !isBranchOrMergeEdge && Math.abs(sourceDelta - targetDelta) <= CROSS_AXIS_DELTA_TOLERANCE;
      if (useDagreWaypoints) {
        const shifted = shiftEdgePointsInterpolated({
          points: rawPoints.map((p) => ({ x: p.x, y: p.y })),
          crossAxis,
          mainAxis,
          sourceMain: mainAxis === 'x' ? afterSource.x : afterSource.y,
          targetMain: mainAxis === 'x' ? afterTarget.x : afterTarget.y,
          sourceDelta,
          targetDelta,
        });
        const sourceCenter = crossAxis === 'x' ? afterSource.x : afterSource.y;
        const targetCenter = crossAxis === 'x' ? afterTarget.x : afterTarget.y;
        points = resolveShiftedEdgePoints({ shifted, sourceCenter, targetCenter, crossAxis });
      }
    }

    return { id: edge.id, source: edge.source, target: edge.target, points };
  });

  return { nodes: positioned, edges: routedEdges };
}
