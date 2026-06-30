/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DagPositionedEdge, DagPositionedNode } from '@kbn/dag-layout';
import { dagLayout } from '@kbn/dag-layout';
import type { LayoutDirection, TransformResult } from '@kbn/workflows';

// Workflow-specific layout constants. These encode domain knowledge (foreach
// header height, gutter widths) that does not belong in @kbn/dag-layout.
// Exported so tests can import the real values instead of re-declaring them.
export const WORKFLOW_COMPOUND_PADDING = { top: 70, right: 32, bottom: 32, left: 32 } as const;
export const WORKFLOW_NODE_SEP = 50;
export const WORKFLOW_RANK_SEP = 70;

export interface LayoutSnapshot {
  nodes: DagPositionedNode[];
  edges: DagPositionedEdge[];
}

/**
 * Pure data pipeline: TransformResult → dagLayout → positioned nodes + edges.
 *
 * Maps domain nodes/edges/groups to the @kbn/dag-layout format, runs the
 * layout engine, and derives `triggerNodeIds` / `leafNodeIds` from the domain
 * nodes. Throws on layout failure (e.g. a cyclic compound graph) — callers
 * are responsible for error handling and any perf instrumentation.
 */
export const computeWorkflowLayout = (
  transformed: TransformResult,
  { direction }: { direction: LayoutDirection }
): LayoutSnapshot => {
  const { nodes, edges, foreachGroups, bypassLaneNodes } = transformed;

  const dagNodes = [
    ...nodes.map((n) => ({
      id: n.id,
      width: n.style.width,
      height: n.style.height,
    })),
    // Bypass lane nodes live outside domain `nodes` — add them here so dagre
    // sees them and allocates lanes for unbalanced if/switch branches.
    ...bypassLaneNodes.map((n) => ({
      id: n.id,
      width: n.style.width,
      height: n.style.height,
    })),
  ];
  const dagEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
  const dagGroups = foreachGroups.map((g) => ({
    id: g.id,
    innerNodes: [
      ...g.innerNodes.map((n) => ({
        id: n.id,
        width: n.style.width,
        height: n.style.height,
      })),
      ...g.bypassLaneNodes.map((n) => ({
        id: n.id,
        width: n.style.width,
        height: n.style.height,
      })),
    ],
    innerEdges: g.innerEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }));

  const laid = dagLayout(dagNodes, dagEdges, dagGroups, {
    direction,
    nodeSep: WORKFLOW_NODE_SEP,
    rankSep: WORKFLOW_RANK_SEP,
    compoundPadding: WORKFLOW_COMPOUND_PADDING,
  });

  return { nodes: laid.nodes, edges: laid.edges };
};
