/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { EuiButton, EuiCallOut, EuiConfirmModal, EuiSpacer } from '@elastic/eui';
import { useChangeHistoryRestore } from '../../hooks/use_change_history_restore';
import { useChangeHistoryConfig } from '../../provider/use_change_history_config';
import type { ChangeHistoryDetail } from '../../types/change_history_detail';
import { getRestoreVersionLabel } from '../../utils/get_restore_version_label';
import * as i18n from './restore_translations';

export interface ChangeHistoryRestoreButtonProps {
  change: ChangeHistoryDetail;
  /** Invoked after a successful restore (e.g. to refetch and re-select the current change). */
  onRestored?: () => Promise<void> | void;
}

export function ChangeHistoryRestoreButton({
  change,
  onRestored,
}: ChangeHistoryRestoreButtonProps): JSX.Element | null {
  const { objectId, supports } = useChangeHistoryConfig();
  const { restoreChange, isRestoring, error, clearError } = useChangeHistoryRestore({ onRestored });
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  const versionLabel = getRestoreVersionLabel(change);

  const handleOpenConfirm = useCallback(() => {
    clearError();
    setIsConfirmVisible(true);
  }, [clearError]);

  const handleCloseConfirm = useCallback(() => {
    if (isRestoring) {
      return;
    }
    setIsConfirmVisible(false);
    clearError();
  }, [clearError, isRestoring]);

  const handleConfirmRestore = useCallback(async () => {
    const succeeded = await restoreChange({ objectId, changeId: change.id });
    if (succeeded) {
      setIsConfirmVisible(false);
      clearError();
    }
  }, [change, clearError, objectId, restoreChange]);

  if (!supports.restore || change.isCurrent) {
    return null;
  }

  return (
    <>
      <EuiButton
        iconType="undo"
        fill
        color="primary"
        onClick={handleOpenConfirm}
        isLoading={isRestoring}
        data-test-subj="changeHistoryRestoreButton"
      >
        {i18n.RESTORE_BUTTON_LABEL}
      </EuiButton>

      {isConfirmVisible ? (
        <EuiConfirmModal
          title={i18n.RESTORE_CONFIRM_TITLE(versionLabel)}
          onCancel={handleCloseConfirm}
          onConfirm={handleConfirmRestore}
          cancelButtonText={i18n.RESTORE_CANCEL_BUTTON}
          confirmButtonText={i18n.RESTORE_CONFIRM_BUTTON}
          buttonColor="primary"
          isLoading={isRestoring}
          data-test-subj="changeHistoryRestoreConfirmModal"
        >
          <p>{i18n.RESTORE_CONFIRM_BODY(versionLabel)}</p>
          {error ? (
            <>
              <EuiSpacer size="m" />
              <EuiCallOut announceOnMount color="danger" iconType="alert">
                <p>{error.message}</p>
              </EuiCallOut>
            </>
          ) : null}
        </EuiConfirmModal>
      ) : null}
    </>
  );
}
