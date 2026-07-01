/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiPanel } from '@elastic/eui';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import useLocalStorage from 'react-use/lib/useLocalStorage';

import { useQueryClient } from '@kbn/react-query';
import {
  ResizableLayout,
  ResizableLayoutDirection,
  ResizableLayoutMode,
  ResizableLayoutOrder,
} from '@kbn/resizable-layout';
import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { ExecutionStatus, isTerminalStatus } from '@kbn/workflows';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { WorkflowExecutionPanel } from './workflow_execution_panel';
import {
  buildOverviewStepExecutionFromContext,
  buildTriggerStepExecutionFromContext,
} from './workflow_pseudo_step_context';
import { WorkflowStepExecutionDetails } from './workflow_step_execution_details';
import { useWorkflowExecutionPolling } from '../../../entities/workflows/model/use_workflow_execution_polling';
import {
  HIGHLIGHTED_STEP_TRIGGER,
  setHighlightedStepId,
} from '../../../entities/workflows/store/workflow_detail/slice';
import { useWorkflowUrlState } from '../../../hooks/use_workflow_url_state';
import { useChildWorkflowExecutions } from '../model/use_child_workflow_executions';
import { useStepExecution } from '../model/use_step_execution';

const WidthStorageKey = 'WORKFLOWS_EXECUTION_DETAILS_WIDTH';
const DefaultSidebarWidth = 300;

const PSEUDO_STEP_OVERVIEW = '__overview';
const PSEUDO_STEP_TRIGGER = 'trigger';

export interface WorkflowExecutionDetailProps {
  executionId: string;
  onClose: () => void;
}

function assignSelectedStepId(
  selectedStepExecutionId: string | undefined,
  executionIdToStepId: Map<string, string>
) {
  if (!selectedStepExecutionId || selectedStepExecutionId === PSEUDO_STEP_OVERVIEW) {
    return undefined;
  }
  if (selectedStepExecutionId === PSEUDO_STEP_TRIGGER) {
    return HIGHLIGHTED_STEP_TRIGGER;
  }
  return executionIdToStepId.get(selectedStepExecutionId);
}

export const WorkflowExecutionDetail: React.FC<WorkflowExecutionDetailProps> = React.memo(
  ({ executionId, onClose }) => {
    const dispatch = useDispatch();
    const { workflowExecution, error } = useWorkflowExecutionPolling(executionId);
    const queryClient = useQueryClient();

    const { activeTab, setSelectedStepExecution, selectedStepExecutionId, shouldAutoResume } =
      useWorkflowUrlState();
    const [sidebarWidth = DefaultSidebarWidth, setSidebarWidth] = useLocalStorage(
      WidthStorageKey,
      DefaultSidebarWidth
    );
    const showBackButton = activeTab === 'executions';

    // Clear cached step I/O data when switching to a different execution
    useEffect(() => {
      return () => {
        queryClient.removeQueries({ queryKey: ['stepExecution', executionId] });
      };
    }, [executionId, queryClient]);

    useEffect(() => {
      if (
        !selectedStepExecutionId &&
        executionId === workflowExecution?.id &&
        (workflowExecution?.stepExecutions?.length ||
          isTerminalStatus(workflowExecution?.status) ||
          workflowExecution?.status === ExecutionStatus.QUEUED)
      ) {
        setSelectedStepExecution(PSEUDO_STEP_OVERVIEW);
      }
    }, [workflowExecution, selectedStepExecutionId, setSelectedStepExecution, executionId]);

    const setSelectedStepExecutionId = useCallback(
      (stepExecutionId: string | null) => {
        setSelectedStepExecution(stepExecutionId);
      },
      [setSelectedStepExecution]
    );

    const workflowDefinition = useMemo(() => {
      if (workflowExecution) {
        return workflowExecution.workflowDefinition;
      }
      return null;
    }, [workflowExecution]);

    const { childExecutions, isLoading: isLoadingChildExecutions } =
      useChildWorkflowExecutions(workflowExecution);

    // Step execution row id for the active waitForInput pause (polling uses includeInput: false)
    const waitingStepExecutionId = useMemo(() => {
      if (!workflowExecution || workflowExecution.status !== ExecutionStatus.WAITING_FOR_INPUT) {
        return undefined;
      }
      return workflowExecution.stepExecutions?.find(
        (s) => s.status === ExecutionStatus.WAITING_FOR_INPUT
      )?.id;
    }, [workflowExecution]);

    // Fetch the paused step's full data (with input) independently of the selected step
    // waitForInput stores its `with` config as stepExecution.input on pause entry
    // consistent with every other step types
    const { data: pausedStepFullData } = useStepExecution(
      executionId,
      waitingStepExecutionId,
      ExecutionStatus.WAITING_FOR_INPUT
    );

    const { resumeMessage, resumeSchema } = useMemo<{
      resumeMessage: string | undefined;
      resumeSchema: JsonModelSchemaType | undefined;
    }>(() => {
      const stepInput = pausedStepFullData?.input as
        | { message?: string; schema?: JsonModelSchemaType }
        | undefined;
      return { resumeMessage: stepInput?.message, resumeSchema: stepInput?.schema };
    }, [pausedStepFullData]);

    // For pseudo-steps (overview, trigger), build from execution context directly
    const isPseudoStep =
      selectedStepExecutionId &&
      [PSEUDO_STEP_OVERVIEW, PSEUDO_STEP_TRIGGER].includes(selectedStepExecutionId);

    // Stable map: step-execution-id → workflow step-id (new ref only when entries change)
    const executionIdToStepId = useMemo(() => {
      const map = new Map<string, string>();
      for (const step of workflowExecution?.stepExecutions ?? []) {
        map.set(step.id, step.stepId);
      }
      return map;
    }, [workflowExecution?.stepExecutions]);

    // Sync selected step execution → Redux highlightedStepId for editor scroll & decorations.
    useEffect(() => {
      dispatch(
        setHighlightedStepId({
          stepId: assignSelectedStepId(selectedStepExecutionId, executionIdToStepId),
        })
      );
    }, [selectedStepExecutionId, executionIdToStepId, dispatch]);

    // Clear highlighted step when execution detail unmounts
    useEffect(() => {
      return () => {
        dispatch(setHighlightedStepId({ stepId: undefined }));
      };
    }, [dispatch]);

    // Find the lightweight step from the polled execution (has status/duration but no I/O).
    // If not found in root steps, check child workflow execution steps.
    const {
      lightweightStep,
      stepExecutionId: resolvedExecutionId,
      parentWorkflowExecution,
    } = useMemo(() => {
      if (!selectedStepExecutionId || isPseudoStep) {
        return {
          lightweightStep: undefined,
          stepExecutionId: executionId,
          parentWorkflowExecution: undefined,
        };
      }

      const parentStep = workflowExecution?.stepExecutions?.find(
        (step) => step.id === selectedStepExecutionId
      );
      if (parentStep) {
        return {
          lightweightStep: parentStep,
          stepExecutionId: executionId,
          parentWorkflowExecution: undefined,
        };
      }

      for (const childWorkflowExecution of childExecutions.values()) {
        const childStep = childWorkflowExecution.stepExecutions.find(
          (step) => step.id === selectedStepExecutionId
        );
        if (childStep) {
          return {
            lightweightStep: childStep,
            stepExecutionId: childWorkflowExecution.executionId,
            parentWorkflowExecution: childWorkflowExecution,
          };
        }
      }

      return {
        lightweightStep: undefined,
        stepExecutionId: executionId,
        parentWorkflowExecution: undefined,
      };
    }, [
      workflowExecution?.stepExecutions,
      selectedStepExecutionId,
      isPseudoStep,
      executionId,
      childExecutions,
    ]);

    // Lazy-load full step data (with input/output) for real steps
    const { data: fullStepData, isLoading: isLoadingStepData } = useStepExecution(
      resolvedExecutionId,
      isPseudoStep ? undefined : selectedStepExecutionId ?? undefined,
      lightweightStep?.status
    );

    const selectedStepChildExecution = useMemo(() => {
      if (!selectedStepExecutionId || isPseudoStep) return undefined;
      return childExecutions.get(selectedStepExecutionId);
    }, [selectedStepExecutionId, isPseudoStep, childExecutions]);

    const selectedStepExecution = useMemo<WorkflowStepExecutionDto | undefined>(() => {
      if (!selectedStepExecutionId) {
        return undefined;
      }

      if (selectedStepExecutionId === PSEUDO_STEP_OVERVIEW && workflowExecution) {
        return buildOverviewStepExecutionFromContext(workflowExecution);
      }

      if (selectedStepExecutionId === PSEUDO_STEP_TRIGGER && workflowExecution?.context) {
        return buildTriggerStepExecutionFromContext(workflowExecution) ?? undefined;
      }

      if (!lightweightStep) {
        return undefined;
      }

      // Merge: use lightweight step for structure/status, overlay full I/O when available
      if (fullStepData) {
        return { ...lightweightStep, input: fullStepData.input, output: fullStepData.output };
      }

      return lightweightStep;
    }, [workflowExecution, selectedStepExecutionId, lightweightStep, fullStepData]);

    return (
      <EuiPanel paddingSize="none" color="plain" hasShadow={false} style={{ height: '100%' }}>
        <ResizableLayout
          fixedPanel={
            <WorkflowExecutionPanel
              definition={workflowDefinition}
              execution={workflowExecution ?? null}
              showBackButton={showBackButton}
              error={error}
              onClose={onClose}
              onStepExecutionClick={setSelectedStepExecutionId}
              selectedId={selectedStepExecutionId ?? null}
              childExecutionsMap={childExecutions}
              isLoadingChildExecutions={isLoadingChildExecutions}
            />
          }
          fixedPanelSize={sidebarWidth}
          onFixedPanelSizeChange={setSidebarWidth}
          minFixedPanelSize={200}
          fixedPanelOrder={ResizableLayoutOrder.Start}
          flexPanel={
            <WorkflowStepExecutionDetails
              workflowExecutionId={executionId}
              stepExecution={selectedStepExecution}
              workflowExecutionDuration={workflowExecution?.duration ?? undefined}
              workflowExecutionUsage={workflowExecution?.usage}
              isLoadingStepData={isLoadingStepData && !isPseudoStep}
              workflowExecutionStatus={workflowExecution?.status}
              resumeMessage={resumeMessage}
              resumeSchema={resumeSchema}
              shouldAutoResume={shouldAutoResume}
              waitingStepExecutionId={waitingStepExecutionId}
              childWorkflowExecution={selectedStepChildExecution}
              parentWorkflowExecution={parentWorkflowExecution}
            />
          }
          minFlexPanelSize={200}
          mode={ResizableLayoutMode.Resizable}
          direction={ResizableLayoutDirection.Horizontal}
          resizeButtonClassName="workflowExecutionDetailResizeButton"
          data-test-subj="WorkflowEditorWithExecutionDetailLayout"
          className="workflowExecutionDetailResizableLayout"
        />
      </EuiPanel>
    );
  }
);
WorkflowExecutionDetail.displayName = 'WorkflowExecutionDetail';
