/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ColorMode } from '@xyflow/react';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery } from '@kbn/react-query';
import { useService } from '@kbn/core-di-browser';
import {
  SequenceNode,
  SequenceEdge,
  layoutSequence,
  RULE_DRAG_MIME_TYPE,
  generateStepId,
  WINDOW_OPTIONS,
} from '@kbn/alerting-v2-rule-form';
import type {
  SequenceFormValues,
  SequenceNodeType,
  SequenceEdgeType,
} from '@kbn/alerting-v2-rule-form';
import { RulesApi } from '../../services/rules_api';
import { toFindRulesRequest } from '../../hooks/use_fetch_rules';
import { useCanvasFitView } from './use_canvas_fit_view';
import { CollapsibleSidePanel } from './collapsible_side_panel';

const nodeTypes = { sequenceStage: SequenceNode };
const edgeTypes = { sequenceHop: SequenceEdge };

interface FetchedRule {
  id: string;
  name: string;
  groupingFields: string[];
  kind: 'alert' | 'signal';
}

interface CanvasContentProps {
  nodes: SequenceNodeType[];
  edges: SequenceEdgeType[];
  stepsLength: number;
  closeAllHopPopovers: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  colorMode: ColorMode;
}

const AlertCanvasContent: React.FC<CanvasContentProps> = ({
  nodes,
  edges,
  stepsLength,
  closeAllHopPopovers,
  onDrop,
  colorMode,
}) => {
  const { euiTheme } = useEuiTheme();
  useCanvasFitView(nodes.length);

  return (
    <div
      style={{ height: '100%', position: 'relative' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      data-test-subj="sequenceBuilderAlertCanvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={false}
        nodesDraggable={false}
        nodesConnectable={false}
        onPaneClick={closeAllHopPopovers}
        onNodeClick={closeAllHopPopovers}
        onMoveStart={closeAllHopPopovers}
        proOptions={{ hideAttribution: true }}
        colorMode={colorMode}
      >
        <Controls showInteractive={false} />
        <Background />
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
              id="xpack.alertingV2.sequenceBuilderPage.emptyCanvas"
              defaultMessage="Drag rules here to build a sequence"
            />
          </EuiText>
        </div>
      )}
    </div>
  );
};

const RuleListItem: React.FC<{ rule: FetchedRule }> = ({ rule }) => (
  <EuiPanel
    paddingSize="s"
    hasBorder
    draggable
    onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(
        RULE_DRAG_MIME_TYPE,
        JSON.stringify({
          id: rule.id,
          name: rule.name,
          groupingFields: rule.groupingFields,
          kind: rule.kind,
        })
      );
      e.dataTransfer.effectAllowed = 'copy';
    }}
    css={css`
      cursor: grab;
      &:active {
        cursor: grabbing;
      }
    `}
    data-test-subj={`sequenceBuilderRuleItem-${rule.id}`}
  >
    <EuiText size="s" className="eui-textTruncate">
      {rule.name}
    </EuiText>
  </EuiPanel>
);

export interface AlertConditionCanvasProps {
  seqValues: SequenceFormValues;
  setSeqValues: React.Dispatch<React.SetStateAction<SequenceFormValues>>;
  isRuleListOpen: boolean;
  onToggleRuleList: () => void;
  excludeRuleId?: string;
}

export const AlertConditionCanvas: React.FC<AlertConditionCanvasProps> = ({
  seqValues,
  setSeqValues,
  isRuleListOpen,
  onToggleRuleList,
  excludeRuleId,
}) => {
  const { colorMode } = useEuiTheme();
  const rulesApi = useService(RulesApi);

  // TODO: Add pagination or infinite scroll for users with more than 200 rules
  const {
    data: rulesData,
    isLoading: isLoadingRules,
    isError: isRulesError,
  } = useQuery({
    queryKey: ['sequence-builder-available-rules'],
    refetchOnWindowFocus: false,
    queryFn: () =>
      rulesApi.listRules(toFindRulesRequest({ perPage: 200, sortField: 'name', sortOrder: 'asc' })),
  });

  const fetchedRules = useMemo<FetchedRule[]>(
    () =>
      (rulesData?.items ?? []).map((r) => ({
        id: r.id,
        name: r.metadata.name,
        groupingFields: r.grouping?.fields ?? [],
        kind: r.kind,
      })),
    [rulesData]
  );

  const usedRuleIds = useMemo<Set<string>>(
    () => new Set(seqValues.steps.flatMap((s) => s.rules.map((r) => r.ruleId))),
    [seqValues.steps]
  );

  const availableRules = useMemo(
    () =>
      fetchedRules.filter(
        (r) => !usedRuleIds.has(r.id) && (excludeRuleId === undefined || r.id !== excludeRuleId)
      ),
    [fetchedRules, usedRuleIds, excludeRuleId]
  );

  const [closeAllHopPopoversTick, setCloseAllHopPopoversTick] = useState(0);
  const closeAllHopPopovers = useCallback(() => setCloseAllHopPopoversTick((t) => t + 1), []);

  const removeRule = useCallback(
    (stepId: string, ruleId: string) => {
      setSeqValues((prev) => {
        const removedIdx = prev.steps.findIndex((s) => s.id === stepId);
        const nextSteps = prev.steps
          .map((s) =>
            s.id === stepId ? { ...s, rules: s.rules.filter((r) => r.ruleId !== ruleId) } : s
          )
          .filter((s) => s.rules.length > 0);

        const hopWindows = [...prev.hopWindows];
        if (removedIdx !== -1 && nextSteps.length < prev.steps.length) {
          const hopToRemove = removedIdx > 0 ? removedIdx - 1 : 0;
          hopWindows.splice(hopToRemove, 1);
        }

        return {
          ...prev,
          steps: nextSteps,
          hopWindows: hopWindows.slice(0, Math.max(0, nextSteps.length - 1)),
          recoveryStepIndices: [Math.max(0, nextSteps.length - 1)],
        };
      });
    },
    [setSeqValues]
  );

  const changeStepOperator = useCallback(
    (stepId: string, operator: 'and' | 'or') => {
      setSeqValues((prev) => ({
        ...prev,
        steps: prev.steps.map((s) => (s.id === stepId ? { ...s, operator } : s)),
      }));
    },
    [setSeqValues]
  );

  const addRuleToStep = useCallback(
    (
      stepId: string,
      payload: { id: string; name: string; groupingFields: string[]; kind: 'alert' | 'signal' }
    ) => {
      setSeqValues((prev) => ({
        ...prev,
        steps: prev.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                rules: [
                  ...s.rules,
                  {
                    ruleId: payload.id,
                    ruleName: payload.name,
                    groupingFields: payload.groupingFields,
                    kind: payload.kind,
                  },
                ],
              }
            : s
        ),
      }));
    },
    [setSeqValues]
  );

  const updateHopWindow = useCallback(
    (hopIndex: number, value: string) => {
      const option = WINDOW_OPTIONS.find((o) => o.value === value);
      if (!option) return;
      const num = parseInt(value.slice(0, -1), 10);
      const unit = value.slice(-1) as 'm' | 'h' | 'd';
      if (isNaN(num)) return;
      setSeqValues((prev) => ({
        ...prev,
        hopWindows: prev.hopWindows.map((hw, i) => (i === hopIndex ? { value: num, unit } : hw)),
      }));
    },
    [setSeqValues]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const payload = e.dataTransfer.getData(RULE_DRAG_MIME_TYPE);
      if (!payload) return;
      try {
        const { id, name, groupingFields, kind } = JSON.parse(payload) as {
          id: string;
          name: string;
          groupingFields: string[];
          kind: 'alert' | 'signal';
        };
        setSeqValues((prev) => {
          if (prev.steps.some((s) => s.rules.some((r) => r.ruleId === id))) return prev;
          const newStep = {
            id: generateStepId(),
            rules: [{ ruleId: id, ruleName: name, groupingFields, kind }],
            operator: 'or' as const,
          };
          const nextSteps = [...prev.steps, newStep];
          return {
            ...prev,
            steps: nextSteps,
            hopWindows: [...prev.hopWindows, { value: 1, unit: 'h' as const }].slice(
              0,
              nextSteps.length - 1
            ),
            recoveryStepIndices: [nextSteps.length - 1],
          };
        });
      } catch {
        /* noop */
      }
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

  const { nodes, edges } = useMemo(
    () =>
      layoutSequence(stages, hopWindowStrings, {
        onRemoveRule: removeRule,
        onOperatorChange: changeStepOperator,
        onDropRule: addRuleToStep,
        onHopWindowChange: updateHopWindow,
        closeAllTick: closeAllHopPopoversTick,
      }),
    [
      stages,
      hopWindowStrings,
      removeRule,
      changeStepOperator,
      addRuleToStep,
      updateHopWindow,
      closeAllHopPopoversTick,
    ]
  );

  const availableRulesTitle = i18n.translate(
    'xpack.alertingV2.sequenceBuilderPage.availableRulesTitle',
    { defaultMessage: 'Available rules' }
  );

  return (
    <EuiFlexGroup gutterSize="none" style={{ height: '100%', overflow: 'hidden' }}>
      <CollapsibleSidePanel
        title={availableRulesTitle}
        isOpen={isRuleListOpen}
        onToggle={onToggleRuleList}
      >
        {isLoadingRules ? (
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: '100%' }}>
            <EuiLoadingSpinner size="m" />
          </EuiFlexGroup>
        ) : isRulesError ? (
          <EuiText size="s" color="danger">
            <FormattedMessage
              id="xpack.alertingV2.sequenceBuilderPage.rulesLoadError"
              defaultMessage="Failed to load rules"
            />
          </EuiText>
        ) : (
          <EuiFlexGroup direction="column" gutterSize="xs">
            {availableRules.map((rule) => (
              <EuiFlexItem key={rule.id} grow={false}>
                <RuleListItem rule={rule} />
              </EuiFlexItem>
            ))}
            {availableRules.length === 0 && (
              <EuiText size="s" color="subdued">
                {fetchedRules.length === 0 ? (
                  <FormattedMessage
                    id="xpack.alertingV2.sequenceBuilderPage.noRulesFound"
                    defaultMessage="No rules found"
                  />
                ) : (
                  <FormattedMessage
                    id="xpack.alertingV2.sequenceBuilderPage.allRulesUsed"
                    defaultMessage="All rules are placed on the canvas"
                  />
                )}
              </EuiText>
            )}
          </EuiFlexGroup>
        )}
      </CollapsibleSidePanel>

      <EuiFlexItem style={{ minWidth: 0 }}>
        <ReactFlowProvider>
          <AlertCanvasContent
            nodes={nodes}
            edges={edges}
            stepsLength={seqValues.steps.length}
            closeAllHopPopovers={closeAllHopPopovers}
            onDrop={handleDrop}
            colorMode={colorMode.toLowerCase() as ColorMode}
          />
        </ReactFlowProvider>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
