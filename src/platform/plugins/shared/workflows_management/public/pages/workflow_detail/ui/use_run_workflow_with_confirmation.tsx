/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiCheckbox, EuiConfirmModal } from '@elastic/eui';
import React, { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { selectHasChanges } from '../../../entities/workflows/store/workflow_detail/selectors';

export const SkipUnsavedRunConfirmationStorageKey = 'workflows:skipUnsavedRunConfirmation';

/**
 * Manages the "run workflow with unsaved changes?" confirmation flow.
 * Owns the confirmation modal JSX; the caller just renders `runConfirmationModal`.
 *
 * @param onRun - Called when the user confirms (or when there are no unsaved changes).
 */
export const useRunWorkflowWithConfirmation = (onRun: () => void) => {
  const hasUnsavedChanges = useSelector(selectHasChanges);
  const [showRunConfirmation, setShowRunConfirmation] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleRunClick = useCallback(() => {
    const shouldSkip = localStorage.getItem(SkipUnsavedRunConfirmationStorageKey) === 'true';
    if (hasUnsavedChanges && !shouldSkip) {
      setDontAskAgain(false);
      setShowRunConfirmation(true);
    } else {
      onRun();
    }
  }, [hasUnsavedChanges, onRun]);

  const handleConfirmRun = useCallback(() => {
    if (dontAskAgain) {
      localStorage.setItem(SkipUnsavedRunConfirmationStorageKey, 'true');
    }
    setShowRunConfirmation(false);
    onRun();
  }, [dontAskAgain, onRun]);

  const handleCancelRun = useCallback(() => {
    setDontAskAgain(false);
    setShowRunConfirmation(false);
  }, []);

  const runConfirmationModal = showRunConfirmation ? (
    <EuiConfirmModal
      data-test-subj="runWorkflowWithUnsavedChangesConfirmationModal"
      aria-label={i18n.translate('workflows.workflowDetailEditor.runWithUnsavedChangesLabel', {
        defaultMessage: 'Run workflow with unsaved changes confirmation',
      })}
      title={i18n.translate('workflows.workflowDetailEditor.runWithUnsavedChangesQuestion', {
        defaultMessage: 'Run workflow with unsaved changes?',
      })}
      onCancel={handleCancelRun}
      onConfirm={handleConfirmRun}
      cancelButtonText={i18n.translate('workflows.workflowDetailEditor.runWorkflowCancel', {
        defaultMessage: 'Cancel',
      })}
      confirmButtonText={i18n.translate('workflows.workflowDetailEditor.runWorkflow', {
        defaultMessage: 'Run workflow',
      })}
      buttonColor="success"
      defaultFocusedButton="confirm"
    >
      <p>
        <FormattedMessage
          id="workflows.workflowDetailEditor.runWithUnsavedChanges.message"
          defaultMessage="You have unsaved changes. Running the workflow will not save your changes. Are you sure you want to continue?"
        />
      </p>
      <EuiCheckbox
        id="workflowsRunWithUnsavedChangesDontAskAgain"
        data-test-subj="runWorkflowWithUnsavedChangesDontAskAgain"
        label={i18n.translate('workflows.workflowDetailEditor.dontAskAgain', {
          defaultMessage: "Don't ask again",
        })}
        checked={dontAskAgain}
        onChange={(event) => setDontAskAgain(event.target.checked)}
      />
    </EuiConfirmModal>
  ) : null;

  return { handleRunClick, runConfirmationModal };
};
