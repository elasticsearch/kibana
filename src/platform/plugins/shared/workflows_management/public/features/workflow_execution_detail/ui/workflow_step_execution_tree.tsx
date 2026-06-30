/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  EuiEmptyPromptProps,
  EuiThemeComputed,
  EuiTreeViewProps,
  UseEuiTheme,
} from '@elastic/eui';
import {
  EuiEmptyPrompt,
  EuiHorizontalRule,
  EuiIcon,
  EuiLoadingSpinner,
  EuiText,
  EuiTreeView,
  logicalCSS,
  transparentize,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';

import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type {
  ExecutionStatus,
  WorkflowExecutionDto,
  WorkflowStepExecutionDto,
  WorkflowYaml,
} from '@kbn/workflows';
import {
  isDangerousStatus,
  isFailedBeforeSteps,
  isInProgressStatus,
  isTerminalStatus,
} from '@kbn/workflows';
import type { StepExecutionTreeItem } from './build_step_executions_tree';
import { buildStepExecutionsTree, injectChildWorkflowSteps } from './build_step_executions_tree';
import { StepExecutionTreeItemLabel } from './step_execution_tree_item_label';
import {
  buildOverviewStepExecutionFromContext,
  buildTriggerStepExecutionFromContext,
} from './workflow_pseudo_step_context';
import { StepIcon } from '../../../shared/ui/step_icons/step_icon';
import type { ChildWorkflowExecutionsMap } from '../model/use_child_workflow_executions';

const TRIGGER_BOLT_ICON_SVG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="%23535966" d="M7.04 13.274a.5.5 0 1 0 .892.453l3.014-5.931a.5.5 0 0 0-.445-.727H5.316L8.03 1.727a.5.5 0 1 0-.892-.453L4.055 7.343a.5.5 0 0 0 .446.726h5.185L7.04 13.274Z"/></svg>';

function convertTreeToEuiTreeViewItems(
  treeItems: StepExecutionTreeItem[],
  stepExecutionMap: Map<string, WorkflowStepExecutionDto>,
  euiTheme: EuiThemeComputed,
  selectedId: string | null,
  onSelectStepExecution: (stepExecutionId: string) => void
): EuiTreeViewProps['items'] {
  return treeItems.map((item) => {
    const stepExecution = stepExecutionMap.get(item.stepExecutionId ?? '');
    const status = stepExecution?.status;
    const selected = selectedId === stepExecution?.id;

    const stepId = stepExecution?.stepId ?? item.stepId;
    const stepType = stepExecution?.stepType ?? item.stepType;

    // Check if this is a skeleton step (not yet received from server) or a loading placeholder
    const isSkeletonStep =
      (stepExecution?.id?.startsWith('skeleton-') ?? false) || stepType === '__loading';

    const selectStepExecution: React.MouseEventHandler = (e) => {
      // Prevent the click event from bubbling up to the tree view item so that the tree view item is not expanded/collapsed when selected
      e.preventDefault();
      e.stopPropagation();
      // Don't allow selecting skeleton steps
      if (stepExecution?.id) {
        onSelectStepExecution(stepExecution.id);
      }
    };

    // Check if this is a trigger pseudo-step
    const isTriggerPseudoStep = stepType.startsWith('trigger_');

    return {
      id: item.stepExecutionId ?? `${item.stepId}-${item.executionIndex}-no-step-execution`,
      css: [
        getStatusCss({ status, selected }, euiTheme),
        // Don't allow selecting skeleton steps using css, as we don't have a 'disabled' prop on the tree view item
        isSkeletonStep &&
          css`
            pointer-events: none;
            cursor: not-allowed;
          `,
        isTriggerPseudoStep &&
          css`
            .euiTreeView__arrowPlaceholder::before {
              content: '';
              display: inline-block;
              width: 16px;
              height: 16px;
              background-image: url('${TRIGGER_BOLT_ICON_SVG}');
              background-repeat: no-repeat;
              background-position: center;
              background-size: 12px 12px;
            }
          `,
      ],
      icon: (
        <StepIcon
          stepType={stepType}
          executionStatus={status ?? null}
          onClick={selectStepExecution}
        />
      ),
      label: (
        <StepExecutionTreeItemLabel
          stepId={stepId}
          selected={selected}
          status={status}
          executionTimeMs={stepExecution?.executionTimeMs ?? null}
          usage={stepExecution?.usage}
          onClick={selectStepExecution}
        />
      ),
      children:
        item.children.length > 0
          ? convertTreeToEuiTreeViewItems(
              item.children,
              stepExecutionMap,
              euiTheme,
              selectedId,
              onSelectStepExecution
            )
          : undefined,
      callback:
        // collapse/expand the tree view item when the button is clicked
        () => {
          let toOpen = item.stepExecutionId;
          if (!toOpen && item.children.length) {
            toOpen = item.children[0].stepExecutionId;
          }
          if (toOpen) {
            onSelectStepExecution(toOpen);
          }
          return toOpen ?? '';
        },
    };
  });
}

export interface WorkflowStepExecutionTreeProps {
  execution: WorkflowExecutionDto | null;
  definition: WorkflowYaml | null;
  error: Error | null;
  onStepExecutionClick: (stepExecutionId: string) => void;
  selectedId: string | null;
  childExecutionsMap?: ChildWorkflowExecutionsMap;
  isLoadingChildExecutions?: boolean;
}

const emptyPromptCommonProps: EuiEmptyPromptProps = { titleSize: 'xs', paddingSize: 's' };

export const WorkflowStepExecutionTree = ({
  error,
  execution,
  definition,
  onStepExecutionClick,
  selectedId,
  childExecutionsMap,
  isLoadingChildExecutions,
}: WorkflowStepExecutionTreeProps) => {
  const styles = useMemoCss(componentStyles);
  const { euiTheme } = useEuiTheme();

  const failedBeforeSteps =
    execution != null && isFailedBeforeSteps(execution.status, execution.stepExecutions);

  if (!execution) {
    return (
      <EuiEmptyPrompt
        {...emptyPromptCommonProps}
        icon={<EuiLoadingSpinner size="l" />}
        title={
          <h2>
            <FormattedMessage
              id="workflows.WorkflowStepExecutionTree.loadingStepExecutions"
              defaultMessage="Loading step executions..."
            />
          </h2>
        }
      />
    );
  } else if (error) {
    return (
      <EuiEmptyPrompt
        {...emptyPromptCommonProps}
        icon={<EuiIcon type="error" size="l" aria-hidden={true} />}
        title={
          <h2>
            <FormattedMessage
              id="workflows.WorkflowStepExecutionTree.errorLoadingStepExecutions"
              defaultMessage="Error loading step executions"
            />
          </h2>
        }
        body={<EuiText>{error.message}</EuiText>}
      />
    );
  } else if (
    execution?.stepExecutions?.length === 0 &&
    !isInProgressStatus(execution?.status) &&
    !failedBeforeSteps
  ) {
    return (
      <EuiEmptyPrompt
        {...emptyPromptCommonProps}
        icon={<EuiIcon type="listBullet" size="l" aria-hidden={true} />}
        title={
          <h2>
            <FormattedMessage
              id="workflows.WorkflowStepExecutionTree.noExecutionFound"
              defaultMessage="No step executions found"
            />
          </h2>
        }
      />
    );
  } else if (definition) {
    const stepExecutionNameMap = new Map<string, WorkflowStepExecutionDto>();
    const stepExecutionMap = new Map<string, WorkflowStepExecutionDto>();

    for (const stepExecution of execution.stepExecutions) {
      stepExecutionNameMap.set(stepExecution.stepId, stepExecution);
      stepExecutionMap.set(stepExecution.id, stepExecution);
    }

    if (!isTerminalStatus(execution.status) || failedBeforeSteps) {
      definition.steps
        .filter((step) => !stepExecutionNameMap.has(step.name)) // we put skeletons only for steps without execution
        .filter((step) => !execution.stepId || step.name === execution.stepId) // we create skeletons only for the executed step and its children
        .map((step, index) => ({
          stepId: step.name,
          stepType: step.type,
          status: 'pending' as WorkflowStepExecutionDto['status'],
          id: `skeleton-${step.name}-${step.type}-${index}`,
          scopeStack: [],
          workflowRunId: '',
          workflowId: '',
          startedAt: '',
          finishedAt: '',
          children: [],
          globalExecutionIndex: 0,
          stepExecutionIndex: 0,
          topologicalIndex: 0,
        }))
        .forEach((skeletonStepExecution) =>
          stepExecutionMap.set(skeletonStepExecution.id, skeletonStepExecution)
        );
    }

    let stepExecutionsTree = buildStepExecutionsTree(
      Array.from(stepExecutionMap.values()),
      execution.context,
      execution.status,
      execution.triggeredBy
    );

    const { tree: treeWithChildren, childStepExecutions } = injectChildWorkflowSteps(
      stepExecutionsTree,
      childExecutionsMap ?? new Map(),
      isLoadingChildExecutions ?? false
    );
    stepExecutionsTree = treeWithChildren;
    for (const childStep of childStepExecutions) {
      stepExecutionMap.set(childStep.id, childStep);
    }

    const overviewPseudoStep = stepExecutionsTree.find((item) => item.stepType === '__overview');
    if (overviewPseudoStep) {
      const executionOverview = buildOverviewStepExecutionFromContext(execution);
      stepExecutionMap.set('__overview', executionOverview);
    }

    const triggerTreeItem =
      stepExecutionsTree.find((item) => item.stepType === '__trigger') ??
      stepExecutionsTree.find((item) => item.stepType === '__inputs');
    if (triggerTreeItem && execution.context) {
      const triggerExecution = buildTriggerStepExecutionFromContext(execution);
      if (triggerExecution) {
        stepExecutionMap.set(triggerExecution.id, triggerExecution);
        triggerTreeItem.stepExecutionId = triggerExecution.id;
        triggerTreeItem.stepType = triggerExecution.stepType ?? '';
      }
    }
    const items: EuiTreeViewProps['items'] = convertTreeToEuiTreeViewItems(
      stepExecutionsTree,
      stepExecutionMap,
      euiTheme,
      selectedId,
      onStepExecutionClick
    );

    const overviewItem = items.find(
      (item) => stepExecutionMap.get(item.id)?.stepType === '__overview'
    );
    const regularItems = items.filter(
      (item) => stepExecutionMap.get(item.id)?.stepType !== '__overview'
    );

    return (
      <>
        <div css={styles.treeViewContainer}>
          {overviewItem && (
            <>
              <EuiTreeView
                showExpansionArrows
                expandByDefault
                items={[overviewItem]}
                aria-label={i18n.translate(
                  'workflows.WorkflowStepExecutionTree.overviewAriaLabel',
                  {
                    defaultMessage: 'Execution overview',
                  }
                )}
              />
              <EuiHorizontalRule
                margin="none"
                css={{ marginTop: euiTheme.size.xs, marginBottom: euiTheme.size.xs }}
              />
            </>
          )}

          {/* Regular steps */}
          {regularItems.length > 0 && (
            <EuiTreeView
              data-test-subj="workflowStepExecutionTree"
              showExpansionArrows
              expandByDefault
              items={regularItems}
              aria-label={i18n.translate(
                'workflows.WorkflowStepExecutionTree.workflowStepExecutionTreeAriaLabel',
                {
                  defaultMessage: 'Workflow step execution tree',
                }
              )}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <EuiEmptyPrompt
      {...emptyPromptCommonProps}
      icon={<EuiIcon type="error" size="l" aria-hidden={true} />}
      title={
        <h2>
          <FormattedMessage
            id="workflows.WorkflowStepExecutionTree.errorLoadingStepExecutions"
            defaultMessage="Error loading execution graph"
          />
        </h2>
      }
    />
  );
};

const componentStyles = {
  treeViewContainer: ({ euiTheme }: UseEuiTheme) => css`
    & .euiTreeView__expansionArrow {
      inline-size: 12px;
    }
    & .euiTreeView__nodeLabel {
      flex-grow: 1;
      text-align: left;
    }
    & .euiTreeView__nodeInner {
      gap: 6px;
      /* Absolutely position the horizontal tick connecting the item to the vertical line. */
      position: relative;
      padding-inline: ${euiTheme.size.s};

      &::after {
        position: absolute;
        content: '';
        ${logicalCSS('top', '14px')}
        ${logicalCSS('left', 0)}
        ${logicalCSS('width', euiTheme.size.s)}
        ${logicalCSS('border-bottom', euiTheme.border.thin)}
      }
    }

    & .euiTreeView__node {
      position: relative;

      /*
       * Override EUI's max-block-size: 100vh on expanded tree nodes.
       * Without this, expanded foreach nodes with many iterations get clipped
       * to the viewport height, causing sibling nodes after them to overlap
       * and appear interleaved between the last children.
       * See: https://github.com/elastic/eui/issues/9395
       */
      ${logicalCSS('max-height', 'none')}

      /* Draw the vertical line to group an expanded item's child items together. */
      &::after {
        position: absolute;
        content: '';
        ${logicalCSS('vertical', 0)}
        ${logicalCSS('left', 0)}
        ${logicalCSS('border-left', euiTheme.border.thin)}
      }

      /* If this is actually the last item, we don't want the vertical line to stretch all the way down */
      &:last-of-type::after {
        ${logicalCSS('height', '14px')}
      }
    }

    & > ul > li {
      // for the first level of the tree, we don't want lines
      &::after {
        display: none;
      }
      & > .euiTreeView__nodeInner::after {
        display: none;
      }
    }
  `,
};

const getStatusCss = (
  { status, selected }: { status?: ExecutionStatus; selected?: boolean },
  euiTheme: EuiThemeComputed
) => {
  if (!status) {
    return;
  }
  let background = euiTheme.colors.backgroundLightPrimary;
  if (isDangerousStatus(status)) {
    background = euiTheme.colors.backgroundBaseDanger;
  }

  if (selected) {
    return css`
      &,
      &:active,
      &:focus,
      &:hover {
        background-color: ${background};
      }
    `;
  }

  return css`
    &:hover {
      background-color: ${transparentize(background, 0.4)};
    }
  `;
};
