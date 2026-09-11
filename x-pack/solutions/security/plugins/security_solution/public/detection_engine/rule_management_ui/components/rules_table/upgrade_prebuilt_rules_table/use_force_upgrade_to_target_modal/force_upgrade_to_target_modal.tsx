/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiConfirmModal, useGeneratedHtmlId } from '@elastic/eui';
import {
  FORCE_UPGRADE_TO_TARGET_MODAL_CANCEL,
  FORCE_UPGRADE_TO_TARGET_MODAL_CONFIRM,
  FORCE_UPGRADE_TO_TARGET_MODAL_TITLE,
  ForceUpgradeToTargetModalBody,
} from './translations';

export interface ForceUpgradeToTargetModalProps {
  total: number;
  customizedCount: number;
  dataTestSubj: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Danger-styled single-confirm-action modal warning that force-upgrading to the
 * Elastic version will permanently discard customizations on `customizedCount`
 * of the `total` rules in scope.
 */
export const ForceUpgradeToTargetModal = ({
  total,
  customizedCount,
  dataTestSubj,
  onConfirm,
  onCancel,
}: ForceUpgradeToTargetModalProps) => {
  const modalTitleId = useGeneratedHtmlId();

  return (
    <EuiConfirmModal
      aria-labelledby={modalTitleId}
      title={FORCE_UPGRADE_TO_TARGET_MODAL_TITLE}
      titleProps={{ id: modalTitleId }}
      onCancel={onCancel}
      onConfirm={onConfirm}
      cancelButtonText={FORCE_UPGRADE_TO_TARGET_MODAL_CANCEL}
      confirmButtonText={FORCE_UPGRADE_TO_TARGET_MODAL_CONFIRM}
      buttonColor="danger"
      defaultFocusedButton="confirm"
      data-test-subj={dataTestSubj}
    >
      <p>
        <ForceUpgradeToTargetModalBody total={total} customizedCount={customizedCount} />
      </p>
    </EuiConfirmModal>
  );
};
