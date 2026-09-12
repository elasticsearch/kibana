/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiIcon, EuiTextColor } from '@elastic/eui';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import type { CasesUI } from '../../../containers/types';
import { MAX_CASES_PER_WORKFLOW_RUN } from '../../../../common/constants';
import { useRunCasesWorkflow } from '../../workflows/use_run_cases_workflow';
import * as i18n from './translations';
import { RUN_WORKFLOW } from '../../workflows/translations';
import type { RunCaseWorkflowModalProps } from './types';

export interface UseRunWorkflowActionResult {
  /** Per-row or per-selection menu item descriptor. */
  getAction: (selectedCases: CasesUI) => EuiContextMenuPanelItemDescriptor;
  /** Whether the current user is allowed to run workflows. */
  canRunWorkflow: boolean;
  /** Whether the workflow-selection modal is currently open. */
  isModalVisible: boolean;
  /** Props to spread onto `RunCaseWorkflowModal`. */
  modalProps: RunCaseWorkflowModalProps;
}

interface UseRunWorkflowActionProps {
  /** Called immediately when the menu item is clicked (before the modal opens). Typically closes the popover. */
  onAction: () => void;
  /** Called after all workflow executions have settled. Typically refreshes the table. */
  onActionSuccess: () => void;
}

/**
 * Shared action hook for the cases list row menu and the bulk-actions menu.
 * Delegates execution to `useRunCasesWorkflow`, which fires a single workflow
 * execution over all selected cases via the multi-case endpoint.
 */
export const useRunWorkflowAction = ({
  onAction,
  onActionSuccess,
}: UseRunWorkflowActionProps): UseRunWorkflowActionResult => {
  const {
    canRunWorkflow,
    isModalOpen,
    openModal,
    closeModal,
    runWorkflow,
    filterWorkflow,
    sortWorkflow,
    showSuccessToast,
  } = useRunCasesWorkflow();

  const handleOpen = useCallback(
    (selectedCasesForRun: CasesUI) => {
      onAction();
      openModal(selectedCasesForRun);
    },
    [onAction, openModal]
  );

  const getAction = useCallback(
    (selectedCasesForRun: CasesUI): EuiContextMenuPanelItemDescriptor => {
      const overLimit = selectedCasesForRun.length > MAX_CASES_PER_WORKFLOW_RUN;
      return {
        name: <EuiTextColor>{RUN_WORKFLOW}</EuiTextColor>,
        onClick: () => handleOpen(selectedCasesForRun),
        disabled: overLimit,
        toolTipContent: overLimit ? i18n.MAX_CASES_TOOLTIP(MAX_CASES_PER_WORKFLOW_RUN) : undefined,
        'data-test-subj': 'cases-bulk-action-run-workflow',
        icon: <EuiIcon type="play" size="m" aria-hidden={true} />,
        key: 'cases-bulk-action-run-workflow',
      };
    },
    [handleOpen]
  );

  // Inputs are injected per-case by useRunWorkflowOnCases; pass an empty object here.
  const inputs = useMemo(() => ({}), []);

  const modalProps: RunCaseWorkflowModalProps = useMemo(
    () => ({
      inputs,
      runWorkflow,
      filterWorkflow,
      sortWorkflow,
      showSuccessToast,
      onClose: closeModal,
      onExecutionSettled: onActionSuccess,
    }),
    [
      inputs,
      runWorkflow,
      filterWorkflow,
      sortWorkflow,
      showSuccessToast,
      closeModal,
      onActionSuccess,
    ]
  );

  return {
    getAction,
    canRunWorkflow,
    isModalVisible: isModalOpen,
    modalProps,
  };
};

export type UseRunWorkflowAction = ReturnType<typeof useRunWorkflowAction>;
