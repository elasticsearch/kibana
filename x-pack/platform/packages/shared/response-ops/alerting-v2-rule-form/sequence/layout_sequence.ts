/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import dagre, { graphlib } from '@dagrejs/dagre';
import { MarkerType, Position } from '@xyflow/react';
import { getNodeHeight, type SequenceNodeType } from './sequence_node';
import type { SequenceEdgeType } from './sequence_edge';

const NODE_WIDTH = 220;
const COL_GAP = NODE_WIDTH + 130;
const MAX_STEPS_PER_ROW = 3;
const DEFAULT_HOP_WINDOW_STRING = '1h';

export interface StageItem {
  stepId: string;
  rules: Array<{ ruleId: string; ruleName: string }>;
  operator: 'and' | 'or';
}

const buildEdges = (
  stages: StageItem[],
  hopWindows: string[],
  onHopWindowChange: ((hopIndex: number, value: string) => void) | undefined,
  closeAllTick: number,
  interactive: boolean
): SequenceEdgeType[] => {
  const edges: SequenceEdgeType[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const source = stages[i].stepId;
    const target = stages[i + 1].stepId;
    const wrapsToNextRow =
      Math.floor(i / MAX_STEPS_PER_ROW) !== Math.floor((i + 1) / MAX_STEPS_PER_ROW);
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type: 'sequenceHop',
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {
        window: hopWindows[i] ?? DEFAULT_HOP_WINDOW_STRING,
        onChange: (value: string) => onHopWindowChange?.(i, value),
        isRowWrap: wrapsToNextRow,
        closeAllTick,
        interactive,
      },
    });
  }
  return edges;
};

export interface LayoutSequenceOptions {
  onRemoveRule?: (stepId: string, ruleId: string) => void;
  onOperatorChange?: (stepId: string, op: 'and' | 'or') => void;
  onDropRule?: (
    stepId: string,
    payload: { id: string; name: string; groupingFields: string[]; kind: 'alert' | 'signal' }
  ) => void;
  onHopWindowChange?: (hopIndex: number, value: string) => void;
  closeAllTick?: number;
  interactive?: boolean;
}

export const layoutSequence = (
  stages: StageItem[],
  hopWindows: string[],
  options: LayoutSequenceOptions = {}
): { nodes: SequenceNodeType[]; edges: SequenceEdgeType[] } => {
  const {
    onRemoveRule,
    onOperatorChange,
    onDropRule,
    onHopWindowChange,
    closeAllTick = 0,
    interactive = true,
  } = options;
  const edges = buildEdges(stages, hopWindows, onHopWindowChange, closeAllTick, interactive);

  const noop = () => {};
  const makeNodeData = (stage: StageItem, index: number): SequenceNodeType['data'] => ({
    stepId: stage.stepId,
    rules: stage.rules,
    operator: stage.operator,
    stageIndex: index,
    onRemoveRule: onRemoveRule ?? noop,
    onOperatorChange: onOperatorChange ?? noop,
    onDropRule: onDropRule ?? noop,
    interactive,
  });

  if (stages.length <= MAX_STEPS_PER_ROW) {
    const dagreGraph = new graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 130 });
    stages.forEach((s) =>
      dagreGraph.setNode(s.stepId, {
        width: NODE_WIDTH,
        height: getNodeHeight(s.rules.length),
      })
    );
    edges.forEach((e) => dagreGraph.setEdge(e.source, e.target));
    dagre.layout(dagreGraph);

    const nodes: SequenceNodeType[] = stages.map((stage, index) => {
      const dn = dagreGraph.node(stage.stepId);
      const nodeHeight = getNodeHeight(stage.rules.length);
      return {
        id: stage.stepId,
        type: 'sequenceStage' as const,
        position: { x: dn.x - NODE_WIDTH / 2, y: dn.y - nodeHeight / 2 },
        width: NODE_WIDTH,
        height: nodeHeight,
        style: { width: NODE_WIDTH, height: nodeHeight },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: makeNodeData(stage, index),
      };
    });
    return { nodes, edges };
  }

  const ROW_GAP = 130;
  const totalRows = Math.ceil(stages.length / MAX_STEPS_PER_ROW);
  const rowMaxHeights: number[] = Array.from({ length: totalRows }, (_, row) => {
    const start = row * MAX_STEPS_PER_ROW;
    const end = Math.min(start + MAX_STEPS_PER_ROW, stages.length);
    let max = 0;
    for (let i = start; i < end; i++) {
      max = Math.max(max, getNodeHeight(stages[i].rules.length));
    }
    return max;
  });

  const rowYOffsets: number[] = [0];
  for (let r = 1; r < totalRows; r++) {
    rowYOffsets[r] = rowYOffsets[r - 1] + rowMaxHeights[r - 1] + ROW_GAP;
  }

  const nodes: SequenceNodeType[] = stages.map((stage, index) => {
    const row = Math.floor(index / MAX_STEPS_PER_ROW);
    const col = index % MAX_STEPS_PER_ROW;
    const nodeHeight = getNodeHeight(stage.rules.length);
    return {
      id: stage.stepId,
      type: 'sequenceStage' as const,
      position: { x: col * COL_GAP, y: rowYOffsets[row] },
      width: NODE_WIDTH,
      height: nodeHeight,
      style: { width: NODE_WIDTH, height: nodeHeight },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      data: makeNodeData(stage, index),
    };
  });

  return { nodes, edges };
};
