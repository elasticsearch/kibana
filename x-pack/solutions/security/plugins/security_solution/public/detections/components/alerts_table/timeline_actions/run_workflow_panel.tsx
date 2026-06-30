/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';

import { EuiButton, EuiFlexGroup, EuiLoadingSpinner, useEuiTheme } from '@elastic/eui';
import { useRunWorkflow, useWorkflows, WorkflowSelector } from '@kbn/workflows-ui';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { RunWorkflowResponseDto } from '@kbn/workflows';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { WORKFLOWS_APP_ID } from '@kbn/deeplinks-workflows';
import type { RenderingService } from '@kbn/core-rendering-browser';
import { getInputsFromDefinition } from '@kbn/workflows/spec/lib/field_conversion';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import * as i18n from '../translations';
import { requiresUserSuppliedInputs } from './run_workflow_panel_helpers';
import { RunWorkflowInputsModal } from './run_workflow_inputs_modal';

export interface RunWorkflowPanelProps {
  /** The inputs payload to pass when executing the workflow. */
  inputs: Record<string, unknown>;
  /** The trigger type to sort to the top of the workflow list. */
  sortTriggerType: string;
  /** data-test-subj prefix for the execute button. */
  executeButtonTestSubj: string;
  onClose: () => void;
  /** Optional callback invoked when workflow execution is triggered. */
  onExecute?: () => void;
}

/** A shared panel that lets users select and execute a workflow with arbitrary inputs. */
export const RunWorkflowPanel = ({
  inputs,
  sortTriggerType,
  executeButtonTestSubj,
  onClose,
  onExecute,
}: RunWorkflowPanelProps) => {
  const {
    services: { application, rendering },
  } = useKibana<{ application: ApplicationStart; rendering: RenderingService }>();
  const { addSuccess: workflowTriggerSuccess, addError: workflowTriggerFailed } = useAppToasts();
  const { euiTheme } = useEuiTheme();

  const runWorkflow = useRunWorkflow();
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isInputsModalOpen, setIsInputsModalOpen] = React.useState<boolean>(false);

  // Share the query key with WorkflowSelector so this is a cache hit — no extra fetch.
  const { data: workflowsData } = useWorkflows({ size: 1000, page: 1, query: '' });
  const selectedWorkflow = useMemo(
    () => workflowsData?.results.find((w) => w.id === selectedId),
    [workflowsData, selectedId]
  );
  const normalizedInputs = useMemo(
    () => (selectedWorkflow ? getInputsFromDefinition(selectedWorkflow.definition) : undefined),
    [selectedWorkflow]
  );
  const needsManualInputs = useMemo(
    () => requiresUserSuppliedInputs(normalizedInputs),
    [normalizedInputs]
  );

  const executeWorkflow = useCallback(
    (extraInputs: Record<string, unknown>) => {
      if (!selectedId) return;
      setIsLoading(true);
      onExecute?.();

      runWorkflow.mutate(
        {
          id: selectedId,
          inputs: { ...extraInputs, ...inputs },
        },
        {
          onSuccess: (data: RunWorkflowResponseDto) => {
            workflowTriggerSuccess({
              title: i18n.WORKFLOW_START_SUCCESS_TOAST,
              ...(rendering && {
                text: toMountPoint(
                  <EuiFlexGroup justifyContent={'flexEnd'}>
                    <EuiButton
                      size="s"
                      onClick={() => {
                        application.navigateToApp(WORKFLOWS_APP_ID, {
                          openInNewTab: true,
                          path: `${selectedId}?executionId=${data.workflowExecutionId}`,
                        });
                      }}
                    >
                      {i18n.WORKFLOW_START_SUCCESS_BUTTON}
                    </EuiButton>
                  </EuiFlexGroup>,
                  rendering
                ),
              }),
            });
          },
          onError: (err) => {
            workflowTriggerFailed(err, {
              title: i18n.WORKFLOW_START_FAILED_TOAST,
            });
          },
          onSettled: () => {
            setIsLoading(false);
            onClose();
          },
        }
      );
    },
    [
      application,
      selectedId,
      runWorkflow,
      inputs,
      workflowTriggerSuccess,
      workflowTriggerFailed,
      rendering,
      onClose,
      onExecute,
    ]
  );

  const handleExecuteClick = useCallback(() => {
    if (!selectedId) return;
    if (needsManualInputs) {
      setIsInputsModalOpen(true);
    } else {
      executeWorkflow({});
    }
  }, [selectedId, needsManualInputs, executeWorkflow]);

  const workflowSelector = useMemo(
    () => (
      <WorkflowSelector
        config={{
          filterFunction: (workflows) => workflows.filter((w) => w.enabled),
          sortFunction: (workflows) =>
            workflows.sort((a, b) => {
              const aHasType = a.definition?.triggers?.some((t) => t.type === sortTriggerType);
              const bHasType = b.definition?.triggers?.some((t) => t.type === sortTriggerType);
              if (aHasType && !bHasType) return -1;
              if (!aHasType && bHasType) return 1;
              return 0;
            }),
          listView: true,
          hideTopRowHeader: true,
          hideViewWorkflowLink: true,
          listViewMaxHeight: 240,
          showSelectedInSearch: false,
        }}
        selectedWorkflowId={selectedId || undefined}
        onWorkflowChange={setSelectedId}
      />
    ),
    [selectedId, sortTriggerType]
  );

  return (
    <>
      <div css={{ position: 'relative' }}>
        {workflowSelector}
        {isLoading && (
          <div
            css={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: euiTheme.colors.backgroundBasePlain,
              opacity: 0.75,
              zIndex: euiTheme.levels.header,
            }}
          >
            <EuiLoadingSpinner size="m" />
          </div>
        )}
      </div>
      <EuiButton
        data-test-subj={executeButtonTestSubj}
        fullWidth
        size="s"
        onClick={handleExecuteClick}
        disabled={!selectedId || isLoading}
      >
        {i18n.RUN_WORKFLOW_BUTTON}
      </EuiButton>
      {isInputsModalOpen && selectedWorkflow && normalizedInputs && (
        <RunWorkflowInputsModal
          workflowName={selectedWorkflow.name}
          inputs={normalizedInputs}
          onSubmit={(values) => {
            setIsInputsModalOpen(false);
            executeWorkflow(values);
          }}
          onCancel={() => setIsInputsModalOpen(false)}
        />
      )}
    </>
  );
};
