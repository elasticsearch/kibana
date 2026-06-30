/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Edge, Node } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { useMemo } from 'react';
import {
  computeTopologyFingerprint,
  ExecutionStatus,
  transformWorkflowToGraph,
} from '@kbn/workflows';
import type {
  HandleSide,
  LayoutDirection,
  TransformResult,
  WorkflowStepExecutionDto,
  WorkflowYaml,
} from '@kbn/workflows';
import { computeWorkflowLayout } from './workflow_layout_pipeline';
import type { LayoutSnapshot } from './workflow_layout_pipeline';

/** Stable empty result used when no workflow is loaded, avoiding `as TransformResult` casts. */
const EMPTY_TRANSFORM: TransformResult = {
  nodes: [],
  edges: [],
  foreachGroups: [],
  bypassLaneNodes: [],
  nodeRefs: {},
};

const HANDLE_SIDE_TO_POSITION: Record<HandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

interface UseWorkflowLayoutParams {
  workflow: WorkflowYaml | undefined;
  /**
   * Optional precomputed transform result for this exact workflow snapshot.
   * When provided, the hook will reuse it instead of calling `transformWorkflowToGraph`.
   */
  transformed?: TransformResult;
  stepExecutions?: WorkflowStepExecutionDto[];
  /** Dagre rank direction: `'TB'` (default) or `'LR'`. */
  direction?: LayoutDirection;
  onPerfMark?: (name: 'transform_ms' | 'layout_ms', ms: number) => void;
  onLayoutFailed?: (reason: string) => void;
}

interface UseWorkflowLayoutResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Memoized YAML→graph transform + dagre layout. Layout is keyed on the
 * topology fingerprint so non-structural edits (description, params, etc.)
 * never retrigger dagre.
 *
 * Step-execution status is merged onto node data without retriggering layout.
 */
export function useWorkflowLayout({
  workflow,
  transformed: transformedProp,
  stepExecutions,
  direction = 'TB',
  onPerfMark,
  onLayoutFailed,
}: UseWorkflowLayoutParams): UseWorkflowLayoutResult {
  const transformed: TransformResult = useMemo(() => {
    if (transformedProp) return transformedProp;
    if (!workflow) return EMPTY_TRANSFORM;
    const t0 = performance.now();
    const next = transformWorkflowToGraph(workflow);
    onPerfMark?.('transform_ms', performance.now() - t0);
    return next;
  }, [transformedProp, workflow, onPerfMark]);

  // Stable string capturing only topology (step names/types/nesting/trigger
  // types). Non-structural edits (descriptions, params, expressions) produce
  // the same fingerprint → dagre never re-runs for them.
  const topologyFingerprint = computeTopologyFingerprint(workflow);

  const layoutSnapshot = useMemo<LayoutSnapshot>(() => {
    if (!workflow) return { nodes: [], edges: [] };
    try {
      const t1 = performance.now();
      const snap = computeWorkflowLayout(transformed, { direction });
      onPerfMark?.('layout_ms', performance.now() - t1);
      return snap;
    } catch (err) {
      onLayoutFailed?.(err instanceof Error ? err.message : 'unknown');
      return { nodes: [], edges: [] };
    }
    // Keyed on the topology fingerprint string (not `workflow` or `transformed`
    // object identity) so that non-structural YAML edits never retrigger dagre.
    // `transformed` is read directly — it is always consistent with the
    // fingerprint because both are computed from the same `workflow`/
    // `transformedProp` on the same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyFingerprint, direction, onLayoutFailed, onPerfMark]);

  const stepExecutionMap = useMemo(() => {
    if (!stepExecutions) return null;
    return stepExecutions.reduce<Record<string, WorkflowStepExecutionDto>>((acc, e) => {
      acc[e.stepId] = e;
      return acc;
    }, {});
  }, [stepExecutions]);

  const syntheticTriggerExecution = useMemo<WorkflowStepExecutionDto | null>(() => {
    if (!stepExecutions || stepExecutions.length === 0) return null;
    return { status: ExecutionStatus.COMPLETED } as WorkflowStepExecutionDto;
  }, [stepExecutions]);

  // Topology-only metadata: computed once per structural change, never on
  // status polls. Avoids re-running the O(E) merge scan and inner-node index
  // builds for every live-execution update.
  const topologyMeta = useMemo(() => {
    const allBypassLaneIds = new Set([
      ...transformed.bypassLaneNodes.map((n) => n.id),
      ...transformed.foreachGroups.flatMap((g) => g.bypassLaneNodes.map((n) => n.id)),
    ]);

    const innerNodeToGroupId = new Map<string, string>();
    for (const g of transformed.foreachGroups) {
      for (const n of g.innerNodes) {
        innerNodeToGroupId.set(n.id, g.id);
      }
    }

    const allDomainNodes = [
      ...transformed.nodes,
      ...transformed.foreachGroups.flatMap((g) => g.innerNodes),
    ] as const;

    const nodeById = new Map(allDomainNodes.map((n) => [n.id, n]));

    const allEdges = [
      ...transformed.edges,
      ...transformed.foreachGroups.flatMap((g) => g.innerEdges),
    ] as const;

    const incomingByTarget = new Map<string, string[]>();
    for (const e of allEdges) {
      const arr = incomingByTarget.get(e.target);
      if (arr) arr.push(e.source);
      else incomingByTarget.set(e.target, [e.source]);
    }
    const mergeNodeIds = new Set<string>();
    for (const [target, sources] of incomingByTarget) {
      if (sources.length > 1 && sources.some((s) => allBypassLaneIds.has(s))) {
        mergeNodeIds.add(target);
      }
    }

    return {
      allBypassLaneIds,
      innerNodeToGroupId,
      allDomainNodes,
      nodeById,
      allEdges,
      mergeNodeIds,
    };
  }, [
    transformed.bypassLaneNodes,
    transformed.foreachGroups,
    transformed.nodes,
    transformed.edges,
  ]);

  const derivedNodes = useMemo<Node[]>(() => {
    const { allBypassLaneIds, innerNodeToGroupId, allDomainNodes } = topologyMeta;
    const positionedById = new Map(layoutSnapshot.nodes.map((n) => [n.id, n]));

    const isHorizontal = direction === 'LR';
    const targetPosition = HANDLE_SIDE_TO_POSITION[isHorizontal ? 'left' : 'top'];
    const sourcePosition = HANDLE_SIDE_TO_POSITION[isHorizontal ? 'right' : 'bottom'];

    const domainNodes = allDomainNodes.map((n) => {
      const pos = positionedById.get(n.id);
      if (!pos) {
        return { id: n.id, type: n.type, position: { x: 0, y: 0 }, data: n.data };
      }

      // dagLayout returns absolute coordinates. React Flow expects positions
      // relative to the parent when parentId is set, so subtract the parent's
      // absolute origin for inner nodes.
      const parentId = innerNodeToGroupId.get(n.id);
      let position: { x: number; y: number };
      if (parentId) {
        const parentPos = positionedById.get(parentId);
        position = parentPos
          ? { x: pos.x - parentPos.x, y: pos.y - parentPos.y }
          : { x: pos.x, y: pos.y };
      } else {
        position = { x: pos.x, y: pos.y };
      }

      const data = n.data as Record<string, unknown>;
      const label = typeof data.label === 'string' ? data.label : undefined;
      const explicitExec = stepExecutionMap?.[label ?? n.id] ?? stepExecutionMap?.[n.id];
      const exec =
        explicitExec ?? (n.type === 'trigger' ? syntheticTriggerExecution ?? undefined : undefined);

      return {
        id: n.id,
        type: n.type,
        position,
        parentId,
        extent: parentId ? ('parent' as const) : undefined,
        width: pos.width,
        height: pos.height,
        targetPosition,
        sourcePosition,
        data: {
          ...(n.data as Record<string, unknown>),
          stepExecution: exec,
        },
      };
    });

    // Bypass lane nodes: structural only — invisible pass-through nodes that
    // give dagre a lane to route through for unbalanced if/switch branches.
    const bypassLaneReactNodes: Node[] = [...allBypassLaneIds].map((id) => {
      const pos = positionedById.get(id);
      const parentId = innerNodeToGroupId.get(id);
      let position: { x: number; y: number };
      if (pos) {
        if (parentId) {
          const parentPos = positionedById.get(parentId);
          position = parentPos
            ? { x: pos.x - parentPos.x, y: pos.y - parentPos.y }
            : { x: pos.x, y: pos.y };
        } else {
          position = { x: pos.x, y: pos.y };
        }
      } else {
        position = { x: 0, y: 0 };
      }
      return {
        id,
        type: 'bypassLane',
        position,
        parentId,
        extent: parentId ? ('parent' as const) : undefined,
        width: pos?.width ?? 1,
        height: pos?.height ?? 1,
        selectable: false,
        style: {
          width: pos?.width ?? 1,
          height: pos?.height ?? 1,
          pointerEvents: 'none' as const,
        },
        targetPosition,
        sourcePosition,
        data: {},
      };
    });

    return [...domainNodes, ...bypassLaneReactNodes];
  }, [layoutSnapshot.nodes, stepExecutionMap, syntheticTriggerExecution, topologyMeta, direction]);

  const derivedEdges = useMemo<Edge[]>(() => {
    const { allBypassLaneIds, nodeById, allEdges, mergeNodeIds } = topologyMeta;
    const layoutEdgeById = new Map(layoutSnapshot.edges.map((e) => [e.id, e]));

    const getExec = (nodeId: string): WorkflowStepExecutionDto | undefined => {
      const nodeData = nodeById.get(nodeId)?.data as Record<string, unknown> | undefined;
      const label = typeof nodeData?.label === 'string' ? nodeData.label : undefined;
      return (label ? stepExecutionMap?.[label] : undefined) ?? stepExecutionMap?.[nodeId];
    };

    return allEdges.map((e) => {
      const laid = layoutEdgeById.get(e.id);
      const sourceExec = getExec(e.source);
      const traversed = sourceExec?.status === ExecutionStatus.COMPLETED;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'workflowEdge',
        data: {
          label: e.label,
          traversed,
          points: laid?.points,
          branchType: e.branchType,
          isMerge: mergeNodeIds.has(e.target),
          hideEndMarker: allBypassLaneIds.has(e.target),
        },
      };
    });
  }, [layoutSnapshot.edges, stepExecutionMap, topologyMeta]);

  return { nodes: derivedNodes, edges: derivedEdges };
}
