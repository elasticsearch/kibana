/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSkeletonText,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { hasActiveModifierKey } from '@kbn/shared-ux-utility';
import type {
  ChildWorkflowExecutionItem,
  WorkflowStepExecutionDto,
  WorkflowTokenUsage,
} from '@kbn/workflows';
import { ExecutionStatus, isExecuteSyncStepType, isTerminalStatus } from '@kbn/workflows';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { ResumeExecutionButton } from './resume_execution_button';
import { StepExecutionDataView } from './step_execution_data_view';
import { WorkflowExecutionOverview } from './workflow_execution_overview';
import type { WorkflowExecutionLinkInfo } from '../../../hooks/navigation/use_navigate_to_execution';
import { useNavigateToExecution } from '../../../hooks/navigation/use_navigate_to_execution';
import { getExecutionStatusIcon } from '../../../shared/ui/status_badge';

interface WorkflowStepExecutionDetailsProps {
  workflowExecutionId: string;
  stepExecution?: WorkflowStepExecutionDto;
  workflowExecutionDuration?: number;
  /** Aggregated token usage across all `ai.*` steps, shown on the overview pseudo-step. */
  workflowExecutionUsage?: WorkflowTokenUsage;
  isLoadingStepData?: boolean;
  workflowExecutionStatus?: ExecutionStatus;
  resumeMessage?: string;
  resumeSchema?: JsonModelSchemaType;
  shouldAutoResume?: boolean;
  waitingStepExecutionId?: string;
  /** When the step is workflow.execute, the child workflow execution (to link to) */
  childWorkflowExecution?: ChildWorkflowExecutionItem;
  /** When viewing a step that belongs to a nested execution, the parent workflow execution (to link to) */
  parentWorkflowExecution?: WorkflowExecutionLinkInfo;
}

export const WorkflowStepExecutionDetails = React.memo<WorkflowStepExecutionDetailsProps>(
  ({
    workflowExecutionId,
    stepExecution,
    workflowExecutionDuration,
    workflowExecutionUsage,
    isLoadingStepData,
    workflowExecutionStatus,
    resumeMessage,
    resumeSchema,
    shouldAutoResume = false,
    waitingStepExecutionId,
    childWorkflowExecution,
    parentWorkflowExecution,
  }) => {
    const { euiTheme } = useEuiTheme();
    const workflowNav = useNavigateToExecution(
      childWorkflowExecution
        ? {
            workflowId: childWorkflowExecution.workflowId,
            executionId: childWorkflowExecution.executionId,
          }
        : { workflowId: '' }
    );
    const parentWorkflowNav = useNavigateToExecution(
      parentWorkflowExecution
        ? {
            workflowId: parentWorkflowExecution.workflowId,
            executionId: parentWorkflowExecution.executionId,
          }
        : { workflowId: '' }
    );

    const isWaitingForInput = stepExecution?.status === ExecutionStatus.WAITING_FOR_INPUT;

    // Show data for terminal steps OR steps paused for input (they have input but no output yet)
    const isFinished = useMemo(
      () =>
        Boolean(stepExecution?.status && isTerminalStatus(stepExecution.status)) ||
        isWaitingForInput,
      [stepExecution?.status, isWaitingForInput]
    );

    const isOverviewPseudoStep = stepExecution?.stepType === '__overview';
    const isTriggerPseudoStep = stepExecution?.stepType?.startsWith('trigger_');
    const isWorkflowExecuteStep = isExecuteSyncStepType(stepExecution?.stepType);

    const handleWorkflowLinkClick = useCallback(
      (e: React.MouseEvent) => {
        if (hasActiveModifierKey(e)) return;
        if (childWorkflowExecution) {
          e.preventDefault();
          workflowNav.navigate();
        }
      },
      [childWorkflowExecution, workflowNav]
    );

    const handleParentWorkflowLinkClick = useCallback(
      (e: React.MouseEvent) => {
        if (hasActiveModifierKey(e)) return;
        if (parentWorkflowExecution) {
          e.preventDefault();
          parentWorkflowNav.navigate();
        }
      },
      [parentWorkflowExecution, parentWorkflowNav]
    );

    // Extract trigger type from stepType (e.g., 'trigger_manual' -> 'manual')
    const triggerType = isTriggerPseudoStep
      ? stepExecution?.stepType?.replace('trigger_', '')
      : undefined;

    const hasInput = Boolean(stepExecution?.input);
    const hasOutput = Boolean(stepExecution?.output);
    const hasError = Boolean(stepExecution?.error);

    const tabs = useMemo(() => {
      if (isTriggerPseudoStep) {
        const pseudoTabs: { id: string; name: string }[] = [];
        if (hasError) {
          pseudoTabs.push({
            id: 'output',
            name: 'Error',
          });
        }
        if (hasInput) {
          // For non-manual triggers (alert/document/etc.), rename to "Event" when manual
          // inputs are also present — the output slot holds those inputs (see workflow_pseudo_step_context.ts)
          pseudoTabs.push({
            id: 'input',
            name: triggerType !== 'manual' && hasOutput ? 'Event' : 'Input',
          });
        }
        if (hasOutput) {
          // For non-manual triggers, output holds user-supplied manual inputs supplied alongside the event
          pseudoTabs.push({ id: 'output', name: triggerType !== 'manual' ? 'Input' : 'Output' });
        }
        return pseudoTabs;
      }
      return [
        {
          id: 'output',
          name: hasError ? 'Error' : 'Output',
        },
        {
          id: 'input',
          name: 'Input',
        },
      ];
    }, [isTriggerPseudoStep, hasError, hasInput, hasOutput, triggerType]);

    const defaultTabId = isWaitingForInput ? 'input' : tabs[0]?.id ?? 'input';
    const [selectedTabId, setSelectedTabId] = useState<string>(defaultTabId);

    useEffect(() => {
      // reset the tab to the default one on step change
      setSelectedTabId(isWaitingForInput ? 'input' : tabs[0]?.id ?? 'input');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepExecution?.stepId, stepExecution?.status, tabs[0].id]);

    if (!stepExecution) {
      return (
        <EuiPanel hasShadow={false} paddingSize="m">
          <EuiSkeletonText lines={1} />
          <EuiSpacer size="l" />
          <EuiSkeletonText lines={4} />
        </EuiPanel>
      );
    }

    if (isOverviewPseudoStep) {
      return (
        <WorkflowExecutionOverview
          stepExecution={stepExecution}
          workflowExecutionDuration={workflowExecutionDuration}
          workflowExecutionUsage={workflowExecutionUsage}
          showResumeUI={workflowExecutionStatus === ExecutionStatus.WAITING_FOR_INPUT}
          executionId={workflowExecutionId}
          resumeMessage={resumeMessage}
          resumeSchema={resumeSchema}
          shouldAutoResume={shouldAutoResume}
          waitingStepExecutionId={waitingStepExecutionId}
        />
      );
    }

    return (
      <EuiPanel
        hasShadow={false}
        paddingSize="m"
        css={{ height: '100%', paddingTop: '13px' /* overrides EuiPanel's paddingTop */ }}
        data-test-subj={
          isTriggerPseudoStep ? 'workflowExecutionTrigger' : 'workflowStepExecutionDetails'
        }
      >
        <EuiFlexGroup
          direction="column"
          gutterSize="m"
          css={{ height: '100%', overflow: 'hidden' }}
        >
          {isWorkflowExecuteStep && childWorkflowExecution && (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  {getExecutionStatusIcon(euiTheme, childWorkflowExecution.status)}
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="xs">
                    <h3>
                      <EuiLink href={workflowNav.href} onClick={handleWorkflowLinkClick}>
                        {`${stepExecution?.stepType}: ${childWorkflowExecution.workflowName}`}
                      </EuiLink>
                    </h3>
                  </EuiTitle>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          )}
          {parentWorkflowExecution && (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  {getExecutionStatusIcon(euiTheme, parentWorkflowExecution.status)}
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="xs">
                    <h3>
                      <EuiLink
                        href={parentWorkflowNav.href}
                        onClick={handleParentWorkflowLinkClick}
                      >
                        {`${parentWorkflowExecution.workflowName}: ${stepExecution?.stepId}`}
                      </EuiLink>
                    </h3>
                  </EuiTitle>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiTabs expand>
              {tabs.map((tab) => (
                <EuiTab
                  onClick={() => setSelectedTabId(tab.id)}
                  isSelected={tab.id === selectedTabId}
                  key={tab.id}
                  css={{ lineHeight: 'normal' }}
                  data-test-subj={`workflowStepTab_${tab.id}`}
                >
                  {tab.name}
                </EuiTab>
              ))}
            </EuiTabs>
          </EuiFlexItem>
          {isFinished ? (
            <EuiFlexItem css={{ overflowY: 'auto' }}>
              {isLoadingStepData ? (
                <EuiPanel hasShadow={false} paddingSize="m">
                  <EuiSkeletonText lines={4} />
                </EuiPanel>
              ) : (
                <>
                  {selectedTabId === 'output' && (
                    <>
                      {isTriggerPseudoStep && triggerType !== 'manual' && (
                        <>
                          <EuiCallOut
                            size="s"
                            title={i18n.translate(
                              'workflowsManagement.stepExecutionDetails.inputAccessTitle',
                              {
                                defaultMessage: 'Access this data in your workflow',
                              }
                            )}
                            iconType="info"
                            announceOnMount={false}
                          >
                            <FormattedMessage
                              id="workflowsManagement.stepExecutionDetails.manualInputsAccessDescription"
                              defaultMessage="You can reference these values using {code}"
                              values={{
                                code: <strong>{'{{ inputs.<field> }}'}</strong>,
                              }}
                            />
                          </EuiCallOut>
                          <EuiSpacer size="m" />
                        </>
                      )}
                      <StepExecutionDataView stepExecution={stepExecution} mode="output" />
                    </>
                  )}
                  {selectedTabId === 'input' && (
                    <>
                      {isWaitingForInput && (
                        <>
                          <ResumeExecutionButton
                            executionId={workflowExecutionId}
                            workflowId={stepExecution?.workflowId}
                            stepStartedAt={stepExecution?.startedAt}
                            resumeMessage={resumeMessage}
                            resumeSchema={resumeSchema}
                            autoOpen={shouldAutoResume}
                            waitingStepExecutionId={stepExecution?.id}
                          />
                          <EuiSpacer size="m" />
                        </>
                      )}
                      {isTriggerPseudoStep && (
                        <>
                          <EuiCallOut
                            size="s"
                            title={i18n.translate(
                              'workflowsManagement.stepExecutionDetails.inputAccessTitle',
                              {
                                defaultMessage: 'Access this data in your workflow',
                              }
                            )}
                            iconType="info"
                            announceOnMount={false}
                          >
                            <FormattedMessage
                              id="workflowsManagement.stepExecutionDetails.inputAccessDescription"
                              defaultMessage="You can reference these values using {code}"
                              values={{
                                code: (
                                  <strong>
                                    {triggerType === 'manual'
                                      ? `{{ inputs.<field> }}`
                                      : `{{ event.<field> }}`}
                                  </strong>
                                ),
                              }}
                            />
                          </EuiCallOut>
                          <EuiSpacer size="m" />
                        </>
                      )}
                      <StepExecutionDataView stepExecution={stepExecution} mode="input" />
                    </>
                  )}
                </>
              )}
            </EuiFlexItem>
          ) : (
            <EuiLoadingSpinner size="m" />
          )}
        </EuiFlexGroup>
      </EuiPanel>
    );
  }
);
WorkflowStepExecutionDetails.displayName = 'WorkflowStepExecutionDetails';
