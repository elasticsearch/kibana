/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiThemeComputed, UseEuiTheme } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  euiShadow,
  transparentize,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { Node } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import { ExecutionStatus } from '@kbn/workflows';
import type { EsWorkflowStepExecution, WorkflowYaml } from '@kbn/workflows';
import { getExecutionStatusColors } from '../../../shared/ui/status_badge';
import { StepIcon } from '../../../shared/ui/step_icons/step_icon';
import type { NodeType } from '../lib/get_layouted_nodes_and_edges';
import { flowNodeTypes } from '../lib/get_layouted_nodes_and_edges';

const triggerNodeTypes = ['manual', 'alert', 'scheduled'];

function getIconColors(nodeType: NodeType, euiTheme: EuiThemeComputed) {
  if (flowNodeTypes.includes(nodeType)) {
    return {
      backgroundColor: transparentize(euiTheme.colors.warning, 0.1),
      color: euiTheme.colors.warning,
    };
  }
  if (triggerNodeTypes.includes(nodeType)) {
    return {
      backgroundColor: transparentize(euiTheme.colors.vis.euiColorVis6, 0.1),
      color: euiTheme.colors.vis.euiColorVis6,
    };
  }
  return {
    backgroundColor: euiTheme.colors.backgroundBasePlain,
    color: euiTheme.colors.borderBaseSubdued,
  };
}

function NodeIcon({ nodeType }: { nodeType: NodeType }) {
  const { euiTheme } = useEuiTheme();
  const { backgroundColor, color } = getIconColors(nodeType, euiTheme);
  const stepType = nodeType.split('.')[0];
  const isFlowNode = flowNodeTypes.includes(nodeType);
  const isTriggerNode = triggerNodeTypes.includes(nodeType);
  return (
    <div
      css={{
        width: '36px',
        height: '36px',
        borderRadius: isFlowNode ? '8px' : '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${color}`,
        backgroundColor,
      }}
    >
      <StepIcon
        stepType={stepType}
        executionStatus={undefined}
        color={isTriggerNode || isFlowNode ? color : undefined}
      />
    </div>
  );
}

interface WorkflowNodeData {
  stepType: NodeType;
  label: string;
  step: WorkflowYaml['steps'][number];
  stepExecution?: EsWorkflowStepExecution;
}

const getNodeBorderColor = (status: ExecutionStatus | undefined, euiTheme: EuiThemeComputed) => {
  if (status === undefined) {
    return euiTheme.colors.borderBaseFloating;
  }
  return getExecutionStatusColors(euiTheme, status ?? null).color;
};

// @ts-expect-error - TODO: fix this
export function WorkflowGraphNode(node: Node<WorkflowNodeData>) {
  const euiThemeContext = useEuiTheme();
  const { euiTheme } = euiThemeContext;
  const styles = useMemoCss(componentStyles);
  const isTriggerNode = triggerNodeTypes.includes(node.data.stepType);
  return (
    <EuiFlexGroup
      css={{
        width: '100%',
        height: '100%',
      }}
    >
      {!isTriggerNode && <Handle type="target" position={Position.Top} />}
      <EuiFlexItem
        css={[
          styles.node,
          {
            border: `1px solid ${getNodeBorderColor(node.data.stepExecution?.status, euiTheme)}`,
          },
        ]}
      >
        <EuiFlexGroup css={{ flex: 1, width: '100%' }} alignItems="center" gutterSize="m">
          <EuiFlexItem grow={false}>
            <NodeIcon nodeType={node.data.stepType} />
          </EuiFlexItem>
          <EuiFlexItem css={{ flex: 1 }}>
            <EuiFlexGroup
              alignItems="flexStart"
              direction="column"
              css={{ gap: '4px', flex: 1, width: '100%' }}
            >
              <EuiFlexItem css={{ width: '100%' }}>
                <span
                  css={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: euiTheme.colors.textHeading,
                    lineHeight: '1.25',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    justifyContent: 'space-between',
                  }}
                >
                  {node.data.label}
                  {node.data.stepExecution?.status === ExecutionStatus.COMPLETED && (
                    <EuiIcon
                      type="checkCircleFill"
                      color="#16C5C0"
                      aria-label={i18n.translate(
                        'workflows.workflowNode.completedStatusIconAriaLabel',
                        { defaultMessage: 'Completed' }
                      )}
                    />
                  )}
                  {node.data.stepExecution?.status === ExecutionStatus.FAILED && (
                    <EuiIcon
                      type="warning"
                      color={euiTheme.colors.danger}
                      aria-label={i18n.translate(
                        'workflows.workflowNode.failedStatusIconAriaLabel',
                        { defaultMessage: 'Failed' }
                      )}
                    />
                  )}
                </span>
                <div
                  css={{
                    fontSize: '12px',
                    color: euiTheme.colors.textSubdued,
                  }}
                >
                  {node.data.stepType}
                </div>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <Handle type="source" position={Position.Bottom} />
    </EuiFlexGroup>
  );
}

const componentStyles = {
  node: (euiThemeContext: UseEuiTheme) => css`
    width: 100%;
    height: 100%;
    background-color: ${euiThemeContext.euiTheme.colors.backgroundBasePlain};
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    ${euiShadow(euiThemeContext, 'xs', { direction: 'down' })}
  `,
};
