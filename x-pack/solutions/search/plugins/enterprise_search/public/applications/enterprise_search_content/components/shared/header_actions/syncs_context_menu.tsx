/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useState } from 'react';

import { useActions, useValues } from 'kea';

import type { EuiContextMenuProps } from '@elastic/eui';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPopover,
  EuiContextMenu,
  EuiIcon,
  EuiText,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';

import { ConnectorStatus, IngestionStatus } from '@kbn/search-connectors';

import { Status } from '../../../../../../common/types/api';
import { KibanaLogic } from '../../../../shared/kibana';
import { CancelSyncsApiLogic } from '../../../api/connector/cancel_syncs_api_logic';
import { ConnectorViewLogic } from '../../connector_detail/connector_view_logic';

import { IndexViewLogic } from '../../search_index/index_view_logic';

import { SyncsLogic } from './syncs_logic';

export interface SyncsContextMenuProps {
  disabled?: boolean;
}

export const SyncsContextMenu: React.FC<SyncsContextMenuProps> = ({ disabled = false }) => {
  const { productFeatures, isAgentlessEnabled } = useValues(KibanaLogic);
  const { ingestionStatus, isCanceling, isSyncing, isWaitingForSync } = useValues(IndexViewLogic);
  const { connector, hasDocumentLevelSecurityFeature, hasIncrementalSyncFeature } =
    useValues(ConnectorViewLogic);
  const { status } = useValues(CancelSyncsApiLogic);
  const { startSync, startIncrementalSync, startAccessControlSync, cancelSyncs } =
    useActions(SyncsLogic);

  const [isPopoverOpen, setPopover] = useState(false);
  const togglePopover = () => setPopover(!isPopoverOpen);
  const closePopover = () => setPopover(false);

  const getSyncButtonText = () => {
    if (isWaitingForSync) {
      return i18n.translate(
        'xpack.enterpriseSearch.content.index.syncButton.waitingForSync.label',
        {
          defaultMessage: 'Waiting for sync',
        }
      );
    }
    if (isSyncing && connector?.status !== ConnectorStatus.ERROR) {
      return i18n.translate('xpack.enterpriseSearch.content.index.syncButton.syncing.label', {
        defaultMessage: 'Syncing',
      });
    }
    return i18n.translate('xpack.enterpriseSearch.content.index.syncButton.label', {
      defaultMessage: 'Sync',
    });
  };

  const syncLoading = (isSyncing || isWaitingForSync) && ingestionStatus !== IngestionStatus.ERROR;

  const isWaitingForConnector = !connector?.status || connector?.status === ConnectorStatus.CREATED;

  const shouldShowDocumentLevelSecurity =
    productFeatures.hasDocumentLevelSecurityEnabled && hasDocumentLevelSecurityFeature;
  const shouldShowIncrementalSync =
    productFeatures.hasIncrementalSyncEnabled && hasIncrementalSyncFeature;

  const isSyncsDisabled =
    (connector?.is_native && !isAgentlessEnabled) ||
    ingestionStatus === IngestionStatus.INCOMPLETE ||
    !connector?.index_name;

  const panels: EuiContextMenuProps['panels'] = [
    {
      id: 0,
      items: [
        ...(syncLoading
          ? []
          : [
              {
                // @ts-ignore - data-* attributes are applied but doesn't exist on types
                'data-telemetry-id': `entSearchContent-connector-header-sync-startSync`,
                'data-test-subj': `entSearchContent-connector-header-sync-startSync`,
                disabled: isSyncsDisabled,
                icon: 'play',
                name: i18n.translate('xpack.enterpriseSearch.index.header.more.fullSync', {
                  defaultMessage: 'Full Content',
                }),
                onClick: () => {
                  closePopover();
                  startSync(connector);
                },
              },
            ]),
        ...(shouldShowIncrementalSync
          ? [
              {
                // @ts-ignore - data-* attributes are applied but doesn't exist on types
                'data-telemetry-id': `entSearchContent-connector-header-sync-more-incrementalSync`,
                'data-test-subj': `entSearchContent-connector-header-sync-more-incrementalSync`,
                disabled: isSyncsDisabled,
                icon: 'play',
                name: i18n.translate('xpack.enterpriseSearch.index.header.more.incrementalSync', {
                  defaultMessage: 'Incremental Content',
                }),
                onClick: () => {
                  closePopover();
                  startIncrementalSync(connector);
                },
              },
            ]
          : []),
        ...(shouldShowDocumentLevelSecurity
          ? [
              {
                // @ts-ignore - data-* attributes are applied but doesn't exist on types
                'data-telemetry-id': `entSearchContent-connector-header-sync-more-accessControlSync`,
                'data-test-subj': `entSearchContent-connector-header-sync-more-accessControlSync`,
                disabled: Boolean(
                  isSyncsDisabled || !connector?.configuration.use_document_level_security?.value
                ),
                icon: 'play',
                name: i18n.translate('xpack.enterpriseSearch.index.header.more.accessControlSync', {
                  defaultMessage: 'Access Control',
                }),
                onClick: () => {
                  closePopover();
                  startAccessControlSync(connector);
                },
              },
            ]
          : []),
        {
          // @ts-ignore - data-* attributes are applied but doesn't exist on types
          'data-telemetry-id': `entSearchContent-connector-header-sync-cancelSync`,
          disabled:
            (isCanceling && ingestionStatus !== IngestionStatus.ERROR) || status === Status.LOADING,
          icon: <EuiIcon type="cross" size="m" color="danger" aria-hidden />,
          name: (
            <EuiText color="danger" size="s">
              <p>
                {i18n.translate('xpack.enterpriseSearch.index.header.cancelSyncsTitle', {
                  defaultMessage: 'Cancel Syncs',
                })}
              </p>
            </EuiText>
          ),
          onClick: () => {
            closePopover();
            cancelSyncs(connector);
          },
        },
      ],
      title: 'Sync',
    },
  ];

  return (
    <EuiPopover
      aria-label={i18n.translate(
        'xpack.enterpriseSearch.content.index.syncButton.popover.ariaLabel',
        { defaultMessage: 'Sync options' }
      )}
      button={
        <EuiButton
          disabled={disabled || isWaitingForConnector}
          data-test-subj="enterpriseSearchSyncsContextMenuButton"
          data-telemetry-id="entSearchContent-connector-header-sync-openSyncMenu"
          iconType="chevronSingleDown"
          iconSide="right"
          onClick={togglePopover}
          fill
        >
          <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
            {syncLoading && (
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="m" />
              </EuiFlexItem>
            )}
            <EuiFlexItem data-test-subj="entSearchContent-connector-header-sync-menu">
              {getSyncButtonText()}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiButton>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downCenter"
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};
