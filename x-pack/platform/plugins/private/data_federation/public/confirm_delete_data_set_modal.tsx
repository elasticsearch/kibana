/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiCallOut,
  EuiConfirmModal,
  EuiOverlayMask,
  EuiSpacer,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';

import { mainTranslations } from './main_i18n';

export interface ConfirmDeleteDataSetModalProps {
  dataSetName: string;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteDataSetModal = ({
  dataSetName,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: ConfirmDeleteDataSetModalProps) => {
  const titleId = useGeneratedHtmlId({ prefix: 'confirmDeleteDataSetTitle' });

  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title={mainTranslations.confirmDeleteDataSet.title}
        titleProps={{ id: titleId }}
        aria-labelledby={titleId}
        buttonColor="danger"
        confirmButtonText={mainTranslations.confirmDeleteDataSet.confirmButton}
        cancelButtonText={mainTranslations.confirmDeleteDataSet.cancelButton}
        defaultFocusedButton="cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmButtonDisabled={isDeleting}
      >
        <EuiText size="s">
          <p>{mainTranslations.confirmDeleteDataSet.prompt}</p>
          <p>
            <strong>{dataSetName}</strong>
          </p>
          <p>{mainTranslations.confirmDeleteDataSet.warning}</p>
        </EuiText>
        {error ? (
          <>
            <EuiSpacer size="m" />
            <EuiCallOut
              title={mainTranslations.confirmDeleteDataSet.errorTitle}
              color="danger"
              iconType="warning"
              size="s"
              announceOnMount
            >
              <p>{error}</p>
            </EuiCallOut>
          </>
        ) : null}
      </EuiConfirmModal>
    </EuiOverlayMask>
  );
};
