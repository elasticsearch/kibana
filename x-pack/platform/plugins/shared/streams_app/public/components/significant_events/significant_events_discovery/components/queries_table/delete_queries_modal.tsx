/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiBasicTable,
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
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useMemo } from 'react';
import { QUERY_TYPE_MATCH } from '@kbn/significant-events-schema';
import type { SignificantEventQueryRow } from '../../../../../hooks/significant_events/use_fetch_discovery_queries';
import { SeverityBadge } from '../severity_badge/severity_badge';
import { QueryTypeBadge } from '../query_type_badge/query_type_badge';

interface DeleteQueriesModalProps {
  title: string;
  items: SignificantEventQueryRow[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function DeleteQueriesModal({
  title,
  items,
  onConfirm,
  onCancel,
  isLoading = false,
}: DeleteQueriesModalProps) {
  const columns = useMemo<Array<EuiBasicTableColumn<SignificantEventQueryRow>>>(
    () => [
      {
        field: 'query.title',
        name: TITLE_COLUMN_LABEL,
        truncateText: true,
      },
      {
        field: 'query.severity_score',
        name: SEVERITY_COLUMN_LABEL,
        width: '100px',
        render: (_: unknown, item: SignificantEventQueryRow) => (
          <SeverityBadge score={item.query.severity_score} />
        ),
      },
      {
        field: 'query.type',
        name: TYPE_COLUMN_LABEL,
        width: '80px',
        render: (_: unknown, item: SignificantEventQueryRow) => (
          <QueryTypeBadge type={item.query.type ?? QUERY_TYPE_MATCH} />
        ),
      },
      {
        field: 'stream_name',
        name: STREAM_COLUMN_LABEL,
        width: '130px',
        render: (_: unknown, item: SignificantEventQueryRow) => (
          <EuiBadge color="hollow">{item.stream_name}</EuiBadge>
        ),
      },
    ],
    []
  );

  return (
    <EuiModal
      onClose={isLoading ? () => {} : onCancel}
      aria-label={MODAL_ARIA_LABEL}
      maxWidth={780}
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle>{title}</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText>{CONSEQUENCE_MESSAGE}</EuiText>
        <EuiSpacer size="m" />
        <EuiCallOut announceOnMount color="warning" iconType="warning" title={WARNING_MESSAGE} />
        <EuiSpacer size="m" />
        <div css={TABLE_CONTAINER_CSS} aria-label={TABLE_CONTENT_ARIA_LABEL}>
          <EuiBasicTable
            items={items}
            columns={columns}
            itemId={(item) => item.query.id}
            tableCaption={TABLE_CONTENT_ARIA_LABEL}
            compressed
          />
        </div>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onCancel} disabled={isLoading}>
          {CANCEL_BUTTON_LABEL}
        </EuiButtonEmpty>
        <EuiButton color="danger" onClick={onConfirm} isLoading={isLoading} fill>
          {DELETE_BUTTON_LABEL}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
}

const MODAL_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.ariaLabel',
  { defaultMessage: 'Delete queries modal' }
);

const CONSEQUENCE_MESSAGE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.consequenceMessage',
  {
    defaultMessage:
      'This will stop scanning for the selected rules. The underlying queries will be preserved on the Knowledge Indicators tab.',
  }
);

const WARNING_MESSAGE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.warningMessage',
  { defaultMessage: 'You can re-promote these queries later to resume scanning.' }
);

const TABLE_CONTENT_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.tableContentAriaLabel',
  { defaultMessage: 'List of queries to delete' }
);

const CANCEL_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.cancelButton',
  { defaultMessage: 'Cancel' }
);

const DELETE_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.deleteButton',
  { defaultMessage: 'Delete' }
);

const TITLE_COLUMN_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.titleColumn',
  { defaultMessage: 'Title' }
);

const SEVERITY_COLUMN_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.severityColumn',
  { defaultMessage: 'Severity' }
);

const STREAM_COLUMN_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.streamColumn',
  { defaultMessage: 'Stream' }
);

const TYPE_COLUMN_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.deleteQueriesModal.typeColumn',
  { defaultMessage: 'Type' }
);

const TABLE_CONTAINER_CSS = css`
  max-height: 300px;
  overflow: auto;
`;
