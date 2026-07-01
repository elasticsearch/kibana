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

export interface ConfirmDeleteDataSourceModalProps {
  dataSourceName: string;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteDataSourceModal = ({
  dataSourceName,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: ConfirmDeleteDataSourceModalProps) => {
  const titleId = useGeneratedHtmlId({ prefix: 'confirmDeleteDataSourceTitle' });

  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title={mainTranslations.confirmDeleteDataSource.title}
        titleProps={{ id: titleId }}
        aria-labelledby={titleId}
        buttonColor="danger"
        confirmButtonText={mainTranslations.confirmDeleteDataSource.confirmButton}
        cancelButtonText={mainTranslations.confirmDeleteDataSource.cancelButton}
        defaultFocusedButton="cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmButtonDisabled={isDeleting}
      >
        <EuiText size="s">
          <p>{mainTranslations.confirmDeleteDataSource.prompt}</p>
          <p>
            <strong>{dataSourceName}</strong>
          </p>
          <p>{mainTranslations.confirmDeleteDataSource.warning}</p>
        </EuiText>
        {error ? (
          <>
            <EuiSpacer size="m" />
            <EuiCallOut
              title={mainTranslations.confirmDeleteDataSource.errorTitle}
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
