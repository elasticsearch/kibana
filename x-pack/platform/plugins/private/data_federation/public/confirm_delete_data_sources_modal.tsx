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

export interface ConfirmDeleteDataSourcesModalProps {
  dataSourceNames: readonly string[];
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteDataSourcesModal = ({
  dataSourceNames,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: ConfirmDeleteDataSourcesModalProps) => {
  const titleId = useGeneratedHtmlId({ prefix: 'confirmDeleteDataSourcesTitle' });
  const count = dataSourceNames.length;

  return (
    <EuiOverlayMask>
      <EuiConfirmModal
        title={mainTranslations.confirmDeleteDataSources.title}
        titleProps={{ id: titleId }}
        aria-labelledby={titleId}
        buttonColor="danger"
        confirmButtonText={mainTranslations.confirmDeleteDataSources.confirmButton}
        cancelButtonText={mainTranslations.confirmDeleteDataSources.cancelButton}
        defaultFocusedButton="cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmButtonDisabled={isDeleting || count === 0}
      >
        <EuiText size="s">
          <p>{mainTranslations.confirmDeleteDataSources.prompt(count)}</p>
          <ul>
            {dataSourceNames.map((name) => (
              <li key={name}>
                <strong>{name}</strong>
              </li>
            ))}
          </ul>
          <p>{mainTranslations.confirmDeleteDataSources.warning}</p>
        </EuiText>
        {error ? (
          <>
            <EuiSpacer size="m" />
            <EuiCallOut
              title={mainTranslations.confirmDeleteDataSources.errorTitle}
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
