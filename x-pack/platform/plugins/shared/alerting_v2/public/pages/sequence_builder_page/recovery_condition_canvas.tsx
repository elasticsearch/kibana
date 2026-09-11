/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { css } from '@emotion/react';
import {
  EuiBadge,
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ColorMode } from '@xyflow/react';
import {
  Background,
  Controls,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutSequence, SequenceEdge, SequenceNode } from '@kbn/alerting-v2-rule-form';
import type {
  SequenceEdgeType,
  SequenceFormValues,
  SequenceNodeType,
} from '@kbn/alerting-v2-rule-form';
import { useCanvasFitView } from './use_canvas_fit_view';
import { CollapsibleSidePanel } from './collapsible_side_panel';

const nodeTypes = { sequenceStage: SequenceNode };
const edgeTypes = { sequenceHop: SequenceEdge };

type RecoveryMode = 'last' | 'all' | 'custom';

export interface RecoveryConfig {
  mode: RecoveryMode;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  mode: 'last',
};

export const resolveRecoveryIndices = (
  mode: RecoveryMode,
  stepsLength: number,
  currentIndices: number[]
): { recoveryStepIndices: number[] } => {
  if (mode === 'all') {
    return { recoveryStepIndices: Array.from({ length: stepsLength }, (_, i) => i) };
  }
  if (mode === 'custom' && currentIndices.length > 0) {
    const valid = currentIndices.filter((i) => i < stepsLength).sort((a, b) => a - b);
    if (valid.length > 0) {
      return { recoveryStepIndices: valid };
    }
  }
  return { recoveryStepIndices: [Math.max(0, stepsLength - 1)] };
};

const RECOVERY_MODE_OPTIONS = [
  {
    id: 'last',
    label: i18n.translate('xpack.alertingV2.sequenceBuilderPage.recovery.mode.last', {
      defaultMessage: 'Last step',
    }),
  },
  {
    id: 'all',
    label: i18n.translate('xpack.alertingV2.sequenceBuilderPage.recovery.mode.all', {
      defaultMessage: 'All steps',
    }),
  },
  {
    id: 'custom',
    label: i18n.translate('xpack.alertingV2.sequenceBuilderPage.recovery.mode.custom', {
      defaultMessage: 'Custom',
    }),
  },
];

interface RecoveryCanvasContentProps {
  nodes: SequenceNodeType[];
  edges: SequenceEdgeType[];
  activeNodeIds: string[];
  stepsLength: number;
  colorMode: ColorMode;
  onNodeClick?: (event: React.MouseEvent, node: SequenceNodeType) => void;
}

const RecoveryCanvasContent: React.FC<RecoveryCanvasContentProps> = ({
  nodes,
  edges,
  activeNodeIds,
  stepsLength,
  colorMode,
  onNodeClick,
}) => {
  const { euiTheme } = useEuiTheme();
  useCanvasFitView(nodes.length);

  return (
    <div
      style={{ height: '100%', position: 'relative' }}
      data-test-subj="sequenceBuilderRecoveryCanvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={false}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={onNodeClick}
        proOptions={{ hideAttribution: true }}
        colorMode={colorMode}
      >
        <Controls showInteractive={false} />
        <Background />

        {activeNodeIds.map((nodeId) => (
          <NodeToolbar key={nodeId} nodeId={nodeId} isVisible position={Position.Bottom} offset={8}>
            <EuiBadge color="success" style={{ whiteSpace: 'nowrap' }}>
              <FormattedMessage
                id="xpack.alertingV2.sequenceBuilderPage.recovery.tracks"
                defaultMessage="Tracks recovery"
              />
            </EuiBadge>
          </NodeToolbar>
        ))}
      </ReactFlow>

      {stepsLength === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: euiTheme.levels.header,
          }}
        >
          <EuiText color="subdued" textAlign="center">
            <FormattedMessage
              id="xpack.alertingV2.sequenceBuilderPage.recovery.noSteps"
              defaultMessage="No steps defined. Go back to alert condition to add rules."
            />
          </EuiText>
        </div>
      )}
    </div>
  );
};

export interface RecoveryConditionCanvasProps {
  seqValues: SequenceFormValues;
  setSeqValues: React.Dispatch<React.SetStateAction<SequenceFormValues>>;
  recoveryConfig: RecoveryConfig;
  setRecoveryConfig: React.Dispatch<React.SetStateAction<RecoveryConfig>>;
  isRuleListOpen: boolean;
  onToggleRuleList: () => void;
}

export const RecoveryConditionCanvas: React.FC<RecoveryConditionCanvasProps> = ({
  seqValues,
  setSeqValues,
  recoveryConfig,
  setRecoveryConfig,
  isRuleListOpen,
  onToggleRuleList,
}) => {
  const { colorMode, euiTheme } = useEuiTheme();

  const activeIndices = useMemo<Set<number>>(() => {
    if (recoveryConfig.mode === 'last') {
      return new Set([seqValues.steps.length - 1]);
    }
    if (recoveryConfig.mode === 'all') {
      return new Set(seqValues.steps.map((_, i) => i));
    }
    return new Set(seqValues.recoveryStepIndices.filter((i) => i < seqValues.steps.length));
  }, [recoveryConfig.mode, seqValues.steps, seqValues.recoveryStepIndices]);

  const handleModeChange = useCallback(
    (id: string) => {
      const mode = id as RecoveryMode;
      setRecoveryConfig({ mode });
      setSeqValues((prev) => ({
        ...prev,
        ...resolveRecoveryIndices(mode, prev.steps.length, prev.recoveryStepIndices),
      }));
    },
    [setRecoveryConfig, setSeqValues]
  );

  const recoveryModeRef = useRef(recoveryConfig.mode);
  recoveryModeRef.current = recoveryConfig.mode;

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: SequenceNodeType) => {
      if (recoveryModeRef.current !== 'custom') return;
      const idx = node.data.stageIndex;

      setSeqValues((prev) => {
        const current = prev.recoveryStepIndices;
        const already = current.includes(idx);
        if (already && current.length <= 1) return prev;
        const next = already ? current.filter((i) => i !== idx) : [...current, idx];
        return { ...prev, recoveryStepIndices: next.sort((a, b) => a - b) };
      });
    },
    [setSeqValues]
  );

  const stages = useMemo(
    () =>
      seqValues.steps.map((step) => ({
        stepId: step.id,
        rules: step.rules.map((r) => ({ ruleId: r.ruleId, ruleName: r.ruleName ?? r.ruleId })),
        operator: step.operator,
      })),
    [seqValues.steps]
  );

  const hopWindowStrings = useMemo(
    () => seqValues.hopWindows.map((h) => `${h.value}${h.unit}`),
    [seqValues.hopWindows]
  );

  const { nodes: baseNodes, edges } = useMemo(
    () => layoutSequence(stages, hopWindowStrings, { interactive: false }),
    [stages, hopWindowStrings]
  );

  const recoveryNodes = useMemo<SequenceNodeType[]>(
    () =>
      baseNodes.map((n) => {
        const isActive = activeIndices.has(n.data.stageIndex);
        return {
          ...n,
          style: {
            ...n.style,
            ...(isActive
              ? {
                  outline: `2px solid ${euiTheme.colors.success}`,
                  outlineOffset: '3px',
                  borderRadius: euiTheme.border.radius.medium,
                }
              : {}),
            ...(recoveryConfig.mode === 'custom' ? { cursor: 'pointer' } : {}),
          },
        };
      }),
    [baseNodes, activeIndices, euiTheme, recoveryConfig.mode]
  );

  const activeNodeIds = useMemo(
    () => recoveryNodes.filter((n) => activeIndices.has(n.data.stageIndex)).map((n) => n.id),
    [recoveryNodes, activeIndices]
  );

  const modeSelectorCss = css`
    padding: ${euiTheme.size.s} ${euiTheme.size.m};
    border-bottom: ${euiTheme.border.thin};
    display: flex;
    align-items: center;
    gap: ${euiTheme.size.m};
    flex-shrink: 0;
  `;

  const sequenceRulesTitle = i18n.translate(
    'xpack.alertingV2.sequenceBuilderPage.recovery.rulesTitle',
    { defaultMessage: 'Sequence rules' }
  );

  return (
    <EuiFlexGroup gutterSize="none" style={{ height: '100%', overflow: 'hidden' }}>
      <CollapsibleSidePanel
        title={sequenceRulesTitle}
        isOpen={isRuleListOpen}
        onToggle={onToggleRuleList}
      >
        <EuiFlexGroup direction="column" gutterSize="xs">
          {seqValues.steps.flatMap((step, si) =>
            step.rules.map((rule) => (
              <EuiFlexItem key={`${si}-${rule.ruleId}`} grow={false}>
                <EuiPanel paddingSize="s" hasBorder>
                  <EuiText size="s" className="eui-textTruncate">
                    {rule.ruleName ?? rule.ruleId}
                  </EuiText>
                  <EuiText size="xs" color="subdued">
                    <FormattedMessage
                      id="xpack.alertingV2.sequenceBuilderPage.recovery.stepLabel"
                      defaultMessage="Step {step}"
                      values={{ step: si + 1 }}
                    />
                  </EuiText>
                </EuiPanel>
              </EuiFlexItem>
            ))
          )}
        </EuiFlexGroup>
      </CollapsibleSidePanel>

      <EuiFlexItem style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div css={modeSelectorCss}>
          <EuiText size="s">
            <strong>
              <FormattedMessage
                id="xpack.alertingV2.sequenceBuilderPage.recovery.modeLabel"
                defaultMessage="Recovery when:"
              />
            </strong>
          </EuiText>
          <EuiButtonGroup
            legend={i18n.translate('xpack.alertingV2.sequenceBuilderPage.recovery.modeLegend', {
              defaultMessage: 'Recovery mode',
            })}
            options={RECOVERY_MODE_OPTIONS}
            idSelected={recoveryConfig.mode}
            onChange={handleModeChange}
            buttonSize="compressed"
            data-test-subj="recoveryModeSelector"
          />
          {recoveryConfig.mode === 'custom' && (
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="xpack.alertingV2.sequenceBuilderPage.recovery.customHint"
                defaultMessage="Click steps to toggle"
              />
            </EuiText>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactFlowProvider>
            <RecoveryCanvasContent
              nodes={recoveryNodes}
              edges={edges}
              activeNodeIds={activeNodeIds}
              stepsLength={seqValues.steps.length}
              colorMode={colorMode.toLowerCase() as ColorMode}
              onNodeClick={handleNodeClick}
            />
          </ReactFlowProvider>
        </div>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
