/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButton, EuiFlexGroup, EuiLoadingSpinner, useEuiTheme } from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import type { ApplicationStart, NotificationsStart } from '@kbn/core/public';
import { WORKFLOWS_APP_ID } from '@kbn/deeplinks-workflows';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { ToMountPointParams } from '@kbn/react-kibana-mount';
import type { RunWorkflowResponseDto, WorkflowListItemDto } from '@kbn/workflows';
import { getInputsFromDefinition } from '@kbn/workflows/spec/lib/field_conversion';
import { RunWorkflowInputsModal } from './run_workflow_inputs_modal';
import { requiresUserSuppliedInputs } from './run_workflow_panel_helpers';
import * as i18n from './translations';
import type { RunWorkflowOptions } from '../../api/types';
import { useRunWorkflow } from '../../hooks/use_run_workflow';
import { useWorkflows } from '../../hooks/use_workflows';
import { useWorkflowsCapabilities } from '../../hooks/use_workflows_capabilities';
import { WorkflowSelector } from '../workflow_selector/workflow_selector';
import {
  getWorkflowsListQueryParams,
  type WorkflowSelectorVisibility,
} from '../workflow_selector/workflow_utils';

/**
 * The inputs payload forwarded verbatim to the workflow execution API.
 * Aliased from RunWorkflowOptions['inputs'] so this type tracks any API changes automatically.
 */
export type WorkflowRunInputs = RunWorkflowOptions['inputs'];

export interface RunWorkflowExecutorParams {
  /** ID of the workflow to execute. */
  workflowId: string;
  /** Merged inputs to forward to the execution API. */
  inputs: WorkflowRunInputs;
}

/**
 * Optional executor that replaces the default `useRunWorkflow` mutation.
 * Useful when the caller needs to route execution through its own API endpoint
 * (e.g. the Cases-owned execution wrapper) rather than the shared Workflows API.
 */
export type RunWorkflowExecutor = (
  params: RunWorkflowExecutorParams
) => Promise<RunWorkflowResponseDto>;

export interface RunWorkflowPanelProps {
  /** The inputs payload to pass when executing the workflow. */
  inputs: WorkflowRunInputs;
  /**
   * Optional executor used instead of the default `useRunWorkflow` hook.
   * When provided the panel calls `runWorkflow({ workflowId, inputs })` and
   * handles success/error/settled internally so toast behaviour is unchanged.
   */
  runWorkflow?: RunWorkflowExecutor;
  /**
   * Server-side managed workflow visibility filter. Only managed workflows tagged with a
   * matching managedVisibilityContexts value (selector or solution) are returned by the server.
   * When omitted, no managed workflows are fetched — only user-created workflows are shown.
   */
  visibility?: WorkflowSelectorVisibility;
  /**
   * Comparator passed directly to Array.sort — return negative to rank `a` before `b`.
   * When omitted the list order is unchanged.
   */
  sortWorkflow?: (a: WorkflowListItemDto, b: WorkflowListItemDto) => number;
  /**
   * Client-side predicate applied after the server returns its visibility-filtered results.
   * Return false to hide a workflow from the list.
   * When omitted all fetched workflows that are enabled are shown.
   */
  filterWorkflow?: (workflow: WorkflowListItemDto) => boolean;
  onClose: () => void;
  /** Optional callback invoked when workflow execution is triggered. */
  onExecute?: () => void;
  /** Optional callback invoked after workflow execution settles while the panel is mounted. */
  onExecutionSettled?: () => void;
  /**
   * When false, the panel skips its built-in success toast so the caller can
   * report the outcome itself (e.g. a multi-target run). Defaults to true.
   */
  showSuccessToast?: boolean;
}

interface RunWorkflowPanelServices {
  application: ApplicationStart;
  notifications: NotificationsStart;
  rendering?: ToMountPointParams;
}

const getWorkflowExecutionError = (error: unknown): Error =>
  new Error(
    (error as { body?: { message?: string } })?.body?.message ??
      (error instanceof Error ? error.message : String(error))
  );

/** A shared panel that lets users select and execute a workflow with arbitrary inputs. */
export const RunWorkflowPanel = ({
  inputs,
  runWorkflow: runWorkflowExecutor,
  visibility,
  sortWorkflow,
  filterWorkflow,
  onClose,
  onExecute,
  onExecutionSettled,
  showSuccessToast = true,
}: RunWorkflowPanelProps) => {
  const {
    services: { application, notifications, rendering },
  } = useKibana<RunWorkflowPanelServices>();
  const { euiTheme } = useEuiTheme();

  const { mutate: runDefaultWorkflow } = useRunWorkflow();
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isInputsModalOpen, setIsInputsModalOpen] = React.useState<boolean>(false);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const { canReadManagedWorkflow } = useWorkflowsCapabilities();

  // Share the query key with WorkflowSelector so this is a cache hit — no extra fetch.
  const { data: workflowsData } = useWorkflows(
    getWorkflowsListQueryParams({ visibility, canReadManagedWorkflow })
  );
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

      const mergedInputs = { ...extraInputs, ...inputs };

      const onSuccess = (data: RunWorkflowResponseDto) => {
        if (!showSuccessToast) return;
        notifications.toasts.addSuccess({
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
      };

      const onSettled = () => {
        if (!isMounted.current) return;
        setIsLoading(false);
        onExecutionSettled?.();
        onClose();
      };

      if (runWorkflowExecutor) {
        void runWorkflowExecutor({ workflowId: selectedId, inputs: mergedInputs })
          .then(onSuccess, (err: unknown) => {
            notifications.toasts.addError(getWorkflowExecutionError(err), {
              title: i18n.WORKFLOW_START_FAILED_TOAST,
            });
          })
          .finally(onSettled);
      } else {
        runDefaultWorkflow(
          { id: selectedId, inputs: mergedInputs },
          {
            onSuccess,
            onError: (err) => {
              notifications.toasts.addError(getWorkflowExecutionError(err), {
                title: i18n.WORKFLOW_START_FAILED_TOAST,
              });
            },
            onSettled,
          }
        );
      }
    },
    [
      application,
      selectedId,
      runDefaultWorkflow,
      runWorkflowExecutor,
      inputs,
      notifications,
      rendering,
      onClose,
      onExecute,
      onExecutionSettled,
      showSuccessToast,
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
          visibility,
          filterFunction: (workflows) => {
            const enabled = workflows.filter((w) => w.enabled);
            return filterWorkflow ? enabled.filter(filterWorkflow) : enabled;
          },
          sortFunction: (workflows) =>
            sortWorkflow ? [...workflows].sort(sortWorkflow) : workflows,
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
    [selectedId, visibility, sortWorkflow, filterWorkflow]
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
        css={{ marginTop: euiTheme.size.xs }}
        data-test-subj="run-workflow-execute-button"
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
