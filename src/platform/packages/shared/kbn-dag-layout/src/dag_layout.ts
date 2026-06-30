/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { applyDagre } from './apply_dagre';
import { translateEdgePoints } from './align_cross_axis';
import { DEFAULT_COMPOUND_PADDING } from './constants';
import type {
  DagCompoundGroup,
  DagEdge,
  DagLayoutOptions,
  DagNode,
  DagPositionedEdge,
  DagPositionedNode,
} from './types';

const DEFAULT_NODE_SEP = 50;
const DEFAULT_RANK_SEP = 70;

interface CompoundGroupLayout {
  layoutedInnerNodes: DagPositionedNode[];
  innerEdges: DagPositionedEdge[];
  groupWidth: number;
  groupHeight: number;
}

function layoutCompoundGroup(
  group: DagCompoundGroup,
  direction: 'TB' | 'LR',
  nodeSep: number,
  rankSep: number,
  compoundPadding: Required<NonNullable<DagLayoutOptions['compoundPadding']>>
): CompoundGroupLayout {
  const { top: padTop, right: padRight, bottom: padBottom, left: padLeft } = compoundPadding;

  const { nodes: innerLayouted, edges: innerEdges } = applyDagre(
    group.innerNodes,
    group.innerEdges,
    direction,
    nodeSep,
    rankSep
  );

  const minX = Math.min(...innerLayouted.map((n) => n.x));
  const minY = Math.min(...innerLayouted.map((n) => n.y));
  const maxX = Math.max(...innerLayouted.map((n) => n.x + n.width));
  const maxY = Math.max(...innerLayouted.map((n) => n.y + n.height));

  const shiftX = -minX + padLeft;
  const shiftY = -minY + padTop;

  const shifted = innerLayouted.map((n) => ({
    ...n,
    x: n.x + shiftX,
    y: n.y + shiftY,
  }));

  const shiftedInnerEdges = innerEdges.map((e) => ({
    ...e,
    points: translateEdgePoints(e.points, shiftX, shiftY),
  }));

  return {
    layoutedInnerNodes: shifted,
    innerEdges: shiftedInnerEdges,
    groupWidth: maxX - minX + padLeft + padRight,
    groupHeight: maxY - minY + padTop + padBottom,
  };
}

/**
 * @returns Positioned nodes and edges with absolute coordinates.
 * In compact mode (`options.compact === true`), inner nodes of compound groups
 * are excluded from the returned `nodes` array.
 * @throws If the input graph contains a cycle.
 */
export function dagLayout(
  nodes: readonly DagNode[],
  edges: readonly DagEdge[],
  compoundGroups: readonly DagCompoundGroup[] = [],
  options: DagLayoutOptions = {}
): { nodes: DagPositionedNode[]; edges: DagPositionedEdge[] } {
  const direction = options.direction ?? 'TB';
  const compact = options.compact ?? false;
  const nodeSep = options.nodeSep ?? DEFAULT_NODE_SEP;
  const rankSep = options.rankSep ?? DEFAULT_RANK_SEP;
  const compoundPadding: Required<NonNullable<DagLayoutOptions['compoundPadding']>> = {
    ...DEFAULT_COMPOUND_PADDING,
    ...options.compoundPadding,
  };

  // Sort compound groups deepest-first (innermost first) so outer groups can
  // use the already-computed sizes of nested groups.
  const groupIds = new Set(compoundGroups.map((g) => g.id));
  const groupById = new Map(compoundGroups.map((g) => [g.id, g]));
  const visited = new Set<string>();
  const currentlyVisiting = new Set<string>();
  const sortedGroups: DagCompoundGroup[] = [];

  const visit = (group: DagCompoundGroup): void => {
    if (visited.has(group.id)) return;
    if (currentlyVisiting.has(group.id)) {
      throw new Error(`Compound group graph contains a cycle at node "${group.id}"`);
    }
    currentlyVisiting.add(group.id);
    for (const node of group.innerNodes) {
      if (groupIds.has(node.id)) {
        const child = groupById.get(node.id);
        if (child) visit(child);
      }
    }
    currentlyVisiting.delete(group.id);
    visited.add(group.id);
    sortedGroups.push(group);
  };
  for (const group of compoundGroups) visit(group);

  const groupSizing = new Map<string, { width: number; height: number }>();
  const groupInnerById = new Map<
    string,
    { layoutedInnerNodes: DagPositionedNode[]; innerEdges: DagPositionedEdge[] }
  >();

  // Index input nodes by id for O(1) lookups in the group-layout loop.
  const inputNodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const group of sortedGroups) {
    if (compact) {
      // In compact mode use the caller-provided dimensions as-is and skip
      // inner layout. Inner nodes are not included in the output.
      const containerNode = inputNodeById.get(group.id);
      if (containerNode) {
        groupSizing.set(group.id, { width: containerNode.width, height: containerNode.height });
      }
      continue;
    }

    if (group.innerNodes.length === 0) {
      // No inner content — preserve the caller-provided container dimensions.
      groupInnerById.set(group.id, {
        layoutedInnerNodes: [],
        innerEdges: group.innerEdges.map((e) => ({ ...e, points: [] })),
      });
      continue;
    }

    // Replace any nested compound group placeholder with its computed size so
    // the parent's dagre layout reserves the correct bounding box.
    const sizedInnerNodes = group.innerNodes.map((n) => {
      const childSize = groupSizing.get(n.id);
      if (childSize) {
        return { ...n, width: childSize.width, height: childSize.height };
      }
      return n;
    });

    const r = layoutCompoundGroup(
      { ...group, innerNodes: sizedInnerNodes },
      direction,
      nodeSep,
      rankSep,
      compoundPadding
    );
    groupSizing.set(group.id, { width: r.groupWidth, height: r.groupHeight });
    groupInnerById.set(group.id, {
      layoutedInnerNodes: r.layoutedInnerNodes,
      innerEdges: r.innerEdges,
    });
  }

  // Run the outer graph layout, using computed sizes for compound nodes.
  const outerNodes = nodes.map((n) => {
    const sizing = groupSizing.get(n.id);
    if (sizing) {
      return { ...n, width: sizing.width, height: sizing.height };
    }
    return n;
  });

  const outerLayout = applyDagre(outerNodes, edges, direction, nodeSep, rankSep);

  // Index outer nodes by id once so lookups below are O(1) instead of O(n).
  const outerNodeById = new Map(outerLayout.nodes.map((n) => [n.id, n]));

  // Memoize absolute positions to avoid O(M²) re-computation for nested groups.
  const absPositionCache = new Map<string, { x: number; y: number }>();
  const getGroupAbsolutePosition = (groupId: string): { x: number; y: number } => {
    const cached = absPositionCache.get(groupId);
    if (cached) return cached;
    const outerNode = outerNodeById.get(groupId);
    if (outerNode) {
      const pos = { x: outerNode.x, y: outerNode.y };
      absPositionCache.set(groupId, pos);
      return pos;
    }
    for (const [parentGroupId, inner] of groupInnerById) {
      const childInParent = inner.layoutedInnerNodes.find((n) => n.id === groupId);
      if (childInParent) {
        const parentAbs = getGroupAbsolutePosition(parentGroupId);
        const pos = {
          x: parentAbs.x + childInParent.x,
          y: parentAbs.y + childInParent.y,
        };
        absPositionCache.set(groupId, pos);
        return pos;
      }
    }
    return { x: 0, y: 0 };
  };

  // Translate inner node positions from group-relative to absolute.
  const finalNodes: DagPositionedNode[] = [...outerLayout.nodes];
  const finalEdges: DagPositionedEdge[] = [...outerLayout.edges];

  for (const [groupId, inner] of groupInnerById) {
    const groupAbs = getGroupAbsolutePosition(groupId);
    finalNodes.push(
      ...inner.layoutedInnerNodes.map((n) => ({
        ...n,
        x: groupAbs.x + n.x,
        y: groupAbs.y + n.y,
      }))
    );
    finalEdges.push(
      ...inner.innerEdges.map((e) => ({
        ...e,
        points: translateEdgePoints(e.points, groupAbs.x, groupAbs.y),
      }))
    );
  }

  return { nodes: finalNodes, edges: finalEdges };
}
