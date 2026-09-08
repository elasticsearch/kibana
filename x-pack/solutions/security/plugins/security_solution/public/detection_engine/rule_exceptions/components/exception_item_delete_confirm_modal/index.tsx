/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiConfirmModal, useGeneratedHtmlId } from '@elastic/eui';

import * as i18n from './translations';

export interface ExceptionItemDeleteConfirmModalProps {
  exceptionItemName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ExceptionItemDeleteConfirmModal = React.memo(
  ({ exceptionItemName, onCancel, onConfirm }: ExceptionItemDeleteConfirmModalProps) => {
    const modalTitleId = useGeneratedHtmlId();

    return (
      <EuiConfirmModal
        aria-labelledby={modalTitleId}
        titleProps={{ id: modalTitleId }}
        title={i18n.DELETE_EXCEPTION_ITEM_CONFIRMATION_TITLE}
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmButtonText={i18n.DELETE_EXCEPTION_ITEM_CONFIRMATION_CONFIRM}
        cancelButtonText={i18n.DELETE_EXCEPTION_ITEM_CONFIRMATION_CANCEL}
        buttonColor="danger"
        defaultFocusedButton="confirm"
        data-test-subj="exceptionItemDeleteConfirmModal"
      >
        {i18n.DELETE_EXCEPTION_ITEM_CONFIRMATION_BODY(exceptionItemName)}
      </EuiConfirmModal>
    );
  }
);

ExceptionItemDeleteConfirmModal.displayName = 'ExceptionItemDeleteConfirmModal';
