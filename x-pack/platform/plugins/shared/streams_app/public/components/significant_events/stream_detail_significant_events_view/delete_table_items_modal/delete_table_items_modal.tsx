/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { upperFirst } from 'lodash';
import React, { useMemo } from 'react';
import { SeverityBadge } from '../../significant_events_discovery/components/severity_badge/severity_badge';

interface DeleteTableItemsModalProps {
  title: string;
  items: KnowledgeIndicator[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function DeleteTableItemsModal({
  title,
  items,
  onConfirm,
  onCancel,
  isLoading = false,
}: DeleteTableItemsModalProps) {
  const listItems = useMemo(
    () =>
      items.map((item) => {
        const titleValue =
          item.kind === 'feature'
            ? item.feature.title ?? item.feature.id
            : item.query.title ?? item.query.id;

        return {
          title: titleValue,
          description: (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              {item.kind === 'feature' ? (
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow" css={TYPE_BADGE_CSS}>
                    {upperFirst(item.feature.type)}
                  </EuiBadge>
                </EuiFlexItem>
              ) : null}
              {item.kind === 'query' ? (
                <EuiFlexItem grow={false}>
                  <SeverityBadge score={item.query.severity_score} />
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
          ),
        };
      }),
    [items]
  );

  return (
    <EuiModal
      onClose={isLoading ? () => {} : onCancel}
      aria-label={MODAL_ARIA_LABEL}
      maxWidth={600}
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle>{title}</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText>{CONSEQUENCE_MESSAGE}</EuiText>
        <EuiSpacer size="m" />
        <EuiCallOut announceOnMount color="warning" iconType="warning" title={WARNING_MESSAGE} />
        <EuiSpacer size="m" />
        <div css={MODAL_TABLE_CSS} aria-label={TABLE_CONTENT_ARIA_LABEL}>
          <EuiDescriptionList type="column" listItems={listItems} compressed />
        </div>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onCancel} disabled={isLoading}>
          {CANCEL_BUTTON_LABEL}
        </EuiButtonEmpty>
        <EuiButton color="danger" onClick={onConfirm} isLoading={isLoading} fill>
          {i18n.translate('xpack.streams.deleteTableItemsModal.confirmButtonLabel', {
            defaultMessage: 'Delete',
          })}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
}

const MODAL_ARIA_LABEL = i18n.translate(
  'xpack.streams.deleteTableItemsModal.euiModal.deleteTableItemsModalLabel',
  {
    defaultMessage: 'Delete items modal',
  }
);

const CONSEQUENCE_MESSAGE = i18n.translate(
  'xpack.streams.deleteTableItemsModal.consequenceMessage',
  {
    defaultMessage: 'This will permanently delete the selected items.',
  }
);

const WARNING_MESSAGE = i18n.translate('xpack.streams.deleteTableItemsModal.warningMessage', {
  defaultMessage: 'This action cannot be undone.',
});

const TABLE_CONTENT_ARIA_LABEL = i18n.translate(
  'xpack.streams.deleteTableItemsModal.tableContentAriaLabel',
  {
    defaultMessage: 'List of items to delete',
  }
);

const CANCEL_BUTTON_LABEL = i18n.translate('xpack.streams.deleteTableItemsModal.cancelButton', {
  defaultMessage: 'Cancel',
});

const MODAL_TABLE_CSS = css`
  max-height: 300px;
  overflow: auto;
`;

const TYPE_BADGE_CSS = css`
  text-transform: capitalize;
`;
