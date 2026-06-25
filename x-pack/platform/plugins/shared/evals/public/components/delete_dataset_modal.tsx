/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiCallOut,
  EuiConfirmModal,
  EuiFieldText,
  EuiFormRow,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useDeleteDataset, useEvaluationExperiments } from '../hooks/use_evals_api';

export interface DeleteDatasetModalProps {
  datasetId: string;
  datasetName: string;
  examplesCount: number;
  onClose: () => void;
  onDeleted?: () => void;
}

const getTitle = (datasetName: string) =>
  i18n.translate('xpack.evals.deleteDatasetModal.title', {
    defaultMessage: 'Delete dataset "{datasetName}"?',
    values: { datasetName },
  });

const CALLOUT_TITLE = i18n.translate('xpack.evals.deleteDatasetModal.calloutTitle', {
  defaultMessage: 'This action cannot be undone',
});

const CANCEL = i18n.translate('xpack.evals.deleteDatasetModal.cancelButton', {
  defaultMessage: 'Cancel',
});

const CONFIRM = i18n.translate('xpack.evals.deleteDatasetModal.confirmButton', {
  defaultMessage: 'Delete dataset',
});

const CHECKING_USAGE = i18n.translate('xpack.evals.deleteDatasetModal.checkingUsage', {
  defaultMessage: 'Checking experiment usage…',
});

const getConfirmLabel = (datasetName: string) =>
  i18n.translate('xpack.evals.deleteDatasetModal.confirmInputLabel', {
    defaultMessage: 'Type "{datasetName}" to confirm',
    values: { datasetName },
  });

export const DeleteDatasetModal: React.FC<DeleteDatasetModalProps> = ({
  datasetId,
  datasetName,
  examplesCount,
  onClose,
  onDeleted,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deleteDataset = useDeleteDataset();

  // Only mounted while the modal is open, so this lazily fetches the usage count.
  const { data: usageData, isLoading: isUsageLoading } = useEvaluationExperiments({
    datasetId,
    page: 1,
    perPage: 1,
  });
  const usageCount = usageData?.total ?? 0;

  const onConfirm = async () => {
    try {
      setError(null);
      await deleteDataset.mutateAsync({ datasetId });
      onClose();
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const isConfirmed = confirmText.trim() === datasetName;

  return (
    <EuiConfirmModal
      aria-label={getTitle(datasetName)}
      title={getTitle(datasetName)}
      onCancel={onClose}
      onConfirm={onConfirm}
      cancelButtonText={CANCEL}
      confirmButtonText={CONFIRM}
      buttonColor="danger"
      confirmButtonDisabled={!isConfirmed || deleteDataset.isLoading}
      isLoading={deleteDataset.isLoading}
    >
      <EuiCallOut color="warning" iconType="warning" title={CALLOUT_TITLE}>
        <p>
          <FormattedMessage
            id="xpack.evals.deleteDatasetModal.permanentWarning"
            defaultMessage="Permanently deletes this dataset and its {examplesCount, plural, one {# example} other {# examples}}."
            values={{ examplesCount }}
          />
        </p>
        {isUsageLoading ? (
          <EuiText size="s">
            <EuiLoadingSpinner size="s" /> {CHECKING_USAGE}
          </EuiText>
        ) : usageCount > 0 ? (
          <p>
            <FormattedMessage
              id="xpack.evals.deleteDatasetModal.usageWarning"
              defaultMessage="{usageCount, plural, one {# experiment run has} other {# experiment runs have}} used this dataset. Deleting it keeps those results under Experiments, but they will reference a dataset that no longer exists."
              values={{ usageCount }}
            />
          </p>
        ) : (
          <p>
            <FormattedMessage
              id="xpack.evals.deleteDatasetModal.noUsage"
              defaultMessage="No experiment runs have used this dataset yet."
            />
          </p>
        )}
      </EuiCallOut>

      <EuiSpacer size="m" />

      {error ? (
        <>
          <EuiText color="danger" size="s">
            <p>{error}</p>
          </EuiText>
          <EuiSpacer size="m" />
        </>
      ) : null}

      <EuiFormRow label={getConfirmLabel(datasetName)}>
        <EuiFieldText
          autoFocus
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          isInvalid={confirmText.length > 0 && !isConfirmed}
          data-test-subj="deleteDatasetConfirmInput"
        />
      </EuiFormRow>
    </EuiConfirmModal>
  );
};
