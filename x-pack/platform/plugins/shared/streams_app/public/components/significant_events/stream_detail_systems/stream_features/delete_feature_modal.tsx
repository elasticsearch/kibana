/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiBasicTable,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { upperFirst } from 'lodash';
import type { Feature } from '@kbn/streams-schema';
import React, { useMemo } from 'react';

interface DeleteFeatureModalProps {
  features: Feature[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function DeleteFeatureModal({
  features,
  onConfirm,
  onCancel,
  isLoading = false,
}: DeleteFeatureModalProps) {
  const { euiTheme } = useEuiTheme();

  const columns = useMemo(
    () => [
      {
        name: FEATURE_COLUMN_LABEL,
        truncateText: true,
        render: (feature: Feature) => {
          return Object.entries(feature.properties)
            .filter(([, value]) => typeof value === 'string')
            .map(([key, value]) => (
              <EuiText size="s" key={key}>
                <strong>{key}</strong> {value as string}
              </EuiText>
            ));
        },
      },
      {
        field: 'type',
        name: TYPE_COLUMN_LABEL,
        render: (type: string) => <EuiBadge color="hollow">{upperFirst(type)}</EuiBadge>,
      },
      {
        field: 'stream_name',
        name: STREAM_COLUMN_LABEL,
        render: (streamName: string) => <EuiBadge color="hollow">{streamName}</EuiBadge>,
      },
    ],
    []
  );

  return (
    <EuiModal onClose={onCancel} aria-label={MODAL_ARIA_LABEL} maxWidth={600}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          {i18n.translate('xpack.streams.deleteFeatureModal.title', {
            defaultMessage:
              'Are you sure you want to delete {count, plural, one {this feature} other {these features}}?',
            values: { count: features.length },
          })}
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText>
          {i18n.translate('xpack.streams.deleteFeatureModal.consequenceMessage', {
            defaultMessage:
              'This will permanently delete {count, plural, one {the feature} other {the selected features}}.',
            values: { count: features.length },
          })}
        </EuiText>
        <EuiSpacer size="m" />
        <EuiCallOut announceOnMount color="warning" iconType="warning" title={WARNING_MESSAGE} />
        <EuiSpacer size="m" />
        <EuiBasicTable
          css={css`
            max-height: 300px;
            overflow: auto;

            & thead {
              position: sticky;
              top: 0;
              background-color: ${euiTheme.colors.backgroundBasePlain};
              z-index: ${euiTheme.levels.content};
            }
          `}
          tableCaption={TABLE_CAPTION}
          items={features}
          columns={columns}
          data-test-subj="streamsAppDeleteFeatureModalTable"
        />
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty
          onClick={onCancel}
          disabled={isLoading}
          data-test-subj="streamsAppDeleteFeatureModalCancelButton"
        >
          {CANCEL_BUTTON_LABEL}
        </EuiButtonEmpty>
        <EuiButton
          color="danger"
          onClick={onConfirm}
          isLoading={isLoading}
          fill
          data-test-subj="streamsAppDeleteFeatureModalConfirmButton"
        >
          {i18n.translate('xpack.streams.deleteFeatureModal.deleteButton', {
            defaultMessage: 'Delete {count, plural, one {feature} other {features}}',
            values: { count: features.length },
          })}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
}

// i18n labels

const FEATURE_COLUMN_LABEL = i18n.translate('xpack.streams.deleteFeatureModal.featureColumn', {
  defaultMessage: 'Feature',
});

const TYPE_COLUMN_LABEL = i18n.translate('xpack.streams.deleteFeatureModal.typeColumn', {
  defaultMessage: 'Type',
});

const STREAM_COLUMN_LABEL = i18n.translate('xpack.streams.deleteFeatureModal.streamColumn', {
  defaultMessage: 'Stream',
});

const MODAL_ARIA_LABEL = i18n.translate(
  'xpack.streams.deleteFeatureModal.euiModal.deleteFeaturesModalLabel',
  { defaultMessage: 'Delete features modal' }
);

const WARNING_MESSAGE = i18n.translate('xpack.streams.deleteFeatureModal.warningMessage', {
  defaultMessage: 'This action cannot be undone.',
});

const TABLE_CAPTION = i18n.translate('xpack.streams.deleteFeatureModal.tableCaption', {
  defaultMessage: 'List of features to delete',
});

const CANCEL_BUTTON_LABEL = i18n.translate('xpack.streams.deleteFeatureModal.cancelButton', {
  defaultMessage: 'Cancel',
});
