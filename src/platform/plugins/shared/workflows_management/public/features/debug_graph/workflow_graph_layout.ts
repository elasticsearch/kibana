/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Node } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { dagLayout } from '@kbn/dag-layout';
import type { WorkflowGraph } from '@kbn/workflows/graph';

const BASE_WIDTH = 100;
const NODE_HEIGHT = 50;
const DEPTH_WIDTH_INCREMENT = 70;

interface NodeMeta {
  node: ReturnType<WorkflowGraph['getNode']>;
  currentDepth: number;
  width: number;
}

/**
 * Converts a workflow execution graph into positioned ReactFlow nodes and edges
 * using @kbn/dag-layout. Node widths are scaled by nesting depth: outer control-flow
 * nodes are wider than deeply-nested leaf nodes.
 *
 * Renders top-to-bottom (TB). The legacy BT orientation required reversed edges
 * and is not supported by @kbn/dag-layout.
 */
export function convertWorkflowGraphToReactFlow(graph: WorkflowGraph) {
  const topologySort = graph.topologicalOrder;

  // First pass: compute depth for each node via enter/exit scope stack.
  const stack: string[] = [];
  const nodeMeta = new Map<string, NodeMeta>();
  let maxDepth = 0;

  for (const nodeId of topologySort) {
    const node = graph.getNode(nodeId);
    if (node.type.startsWith('exit')) {
      stack.pop();
    }
    const currentDepth = stack.length;
    if (currentDepth > maxDepth) maxDepth = currentDepth;
    nodeMeta.set(nodeId, { node, currentDepth, width: 0 });
    if (node.type.startsWith('enter')) {
      stack.push(node.type);
    }
  }

  // Second pass: assign widths — outer nodes are wider, deepest nodes use BASE_WIDTH.
  for (const meta of nodeMeta.values()) {
    meta.width =
      meta.currentDepth === maxDepth
        ? BASE_WIDTH
        : BASE_WIDTH + (maxDepth - meta.currentDepth) * DEPTH_WIDTH_INCREMENT;
  }

  const dagNodes = Array.from(nodeMeta.entries()).map(([id, meta]) => ({
    id,
    width: meta.width,
    height: NODE_HEIGHT,
  }));

  const dagEdges = graph.getEdges().map((edge) => ({
    id: `${edge.v} -> ${edge.w}`,
    source: edge.v,
    target: edge.w,
  }));

  const { nodes: positionedNodes } = dagLayout(dagNodes, dagEdges, [], {
    direction: 'TB',
    nodeSep: 40,
    rankSep: 40,
  });

  const positionById = new Map(positionedNodes.map((n) => [n.id, n]));

  const nodes: Node[] = graph.getAllNodes().map((graphNode) => {
    const pos = positionById.get(graphNode.id);
    const meta = nodeMeta.get(graphNode.id);
    const width = meta?.width ?? BASE_WIDTH;

    return {
      id: graphNode.id,
      data: {
        node: graphNode,
        type: graphNode.type,
        currentDepth: meta?.currentDepth ?? 0,
        stepType: graphNode.type,
        step: 'configuration' in graphNode ? graphNode.configuration : undefined,
        label: graphNode.id,
        width,
        height: NODE_HEIGHT,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: { width, height: NODE_HEIGHT },
      type: graphNode.type,
      position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
    };
  });

  const edges = graph.getEdges().map((e) => ({
    id: `${e.v} -> ${e.w}`,
    source: e.v,
    target: e.w,
    label: graph.getEdge(e)?.label,
  }));

  return { nodes, edges };
}
