/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiModal, EuiModalBody, EuiModalHeader, EuiModalHeaderTitle } from '@elastic/eui';
import { RunWorkflowPanel } from '@kbn/workflows-ui';
import type { RunWorkflowPanelProps } from '@kbn/workflows-ui';
import { useFocusButtonTrap } from '../use_focus_button';
import * as i18n from './translations';

interface RunCaseWorkflowModalProps
  extends Pick<
    RunWorkflowPanelProps,
    | 'inputs'
    | 'runWorkflow'
    | 'sortWorkflow'
    | 'filterWorkflow'
    | 'onExecute'
    | 'onExecutionSettled'
    | 'showSuccessToast'
  > {
  onClose: () => void;
  /** Ref to the button that opened this modal; when set, focus is returned to it on close. */
  focusButtonRef?: React.Ref<HTMLButtonElement | HTMLAnchorElement>;
}

/**
 * Modal wrapper around `RunWorkflowPanel` for the case detail view and the
 * cases list page. Provides a standard "Select workflow" header and returns
 * focus to the trigger button on close when `focusButtonRef` is supplied.
 */
export const RunCaseWorkflowModal: React.FC<RunCaseWorkflowModalProps> = ({
  inputs,
  runWorkflow,
  sortWorkflow,
  filterWorkflow,
  onClose,
  onExecute,
  onExecutionSettled,
  showSuccessToast,
  focusButtonRef,
}) => {
  const focusTrapProps = useFocusButtonTrap(focusButtonRef);

  return (
    <EuiModal
      aria-label={i18n.SELECT_WORKFLOW_TITLE}
      onClose={onClose}
      css={{ width: '400px' }}
      data-test-subj="cases-run-workflow-modal"
      focusTrapProps={focusTrapProps}
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle size="xs">{i18n.SELECT_WORKFLOW_TITLE}</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <RunWorkflowPanel
          inputs={inputs}
          runWorkflow={runWorkflow}
          sortWorkflow={sortWorkflow}
          filterWorkflow={filterWorkflow}
          onClose={onClose}
          onExecute={onExecute}
          onExecutionSettled={onExecutionSettled}
          showSuccessToast={showSuccessToast}
        />
      </EuiModalBody>
    </EuiModal>
  );
};

RunCaseWorkflowModal.displayName = 'RunCaseWorkflowModal';
