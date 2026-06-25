/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiBadgeProps } from '@elastic/eui';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiText,
  EuiTextColor,
  EuiToolTip,
  useEuiFontSize,
} from '@elastic/eui';
import { css } from '@emotion/react';

import { useAppContext } from '../../../../../app_context';
import { isClosedIndexStatus } from '../../../../../lib/is_closed_index_status';
import type { Index } from '../../../../../../../common';
import { OverviewCard } from './overview_card';
import type { DocCountState } from './quick_stats';
import {
  docCountErrorTooltip,
  docCountErrorLabel,
  docCountApproximateTooltip,
  docCountClosedIndexTooltip,
} from './translations';

type NormalizedHealth = 'green' | 'red' | 'yellow';
const healthToBadgeMapping: Record<
  NormalizedHealth,
  { color: EuiBadgeProps['color']; label: string }
> = {
  green: {
    color: 'success',
    label: i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.health.greenLabel', {
      defaultMessage: 'Healthy',
    }),
  },
  yellow: {
    color: 'warning',
    label: i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.health.yellowLabel', {
      defaultMessage: 'Warning',
    }),
  },
  red: {
    color: 'danger',
    label: i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.health.redLabel', {
      defaultMessage: 'Critical',
    }),
  },
};

export const StatusDetails: FunctionComponent<{
  docCount: DocCountState;
  documentsDeleted: Index['documents_deleted'];
  status: Index['status'];
  health: Index['health'];
}> = ({ docCount, documentsDeleted, status, health }) => {
  const largeFontSize = useEuiFontSize('l').fontSize;
  const { config } = useAppContext();
  const isClosed = isClosedIndexStatus(status);

  if (!config.enableIndexStats || !health) {
    return null;
  }

  const badgeConfig = healthToBadgeMapping[health.toLowerCase() as NormalizedHealth];
  const healthBadge = (
    <EuiBadge color={badgeConfig.color} data-test-subj="indexDetailsHealthBadge">
      {badgeConfig.label}
    </EuiBadge>
  );

  const renderDocCountFooter = () => {
    if (docCount.isLoading) {
      return <EuiLoadingSpinner size="m" />;
    }

    if (docCount.isError) {
      return (
        <EuiFlexGroup gutterSize="xs">
          <EuiToolTip content={docCountErrorTooltip}>
            <EuiFlexGroup gutterSize="xs" tabIndex={0}>
              <EuiIcon type="warning" color="warning" aria-hidden={true} />
              <EuiTextColor color="warning">{docCountErrorLabel}</EuiTextColor>
            </EuiFlexGroup>
          </EuiToolTip>
          <EuiTextColor color="subdued">
            {'/ '}
            {i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.status.documentsDeletedLabel', {
              defaultMessage: '{documentsDeleted} Deleted',
              values: { documentsDeleted },
            })}
          </EuiTextColor>
        </EuiFlexGroup>
      );
    }

    const approximateHint =
      docCount.approximateReason === 'closed_index'
        ? docCountClosedIndexTooltip
        : docCount.approximateReason === 'requires_read'
        ? docCountApproximateTooltip
        : undefined;

    const docCountContent = (
      <EuiFlexGroup gutterSize="xs" data-test-subj="indexDetailsStatusDocCount">
        <EuiFlexItem grow={false}>
          <EuiIcon type="documents" color="subdued" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTextColor color="subdued">
            {i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.status.documentsLabel', {
              defaultMessage:
                '{documents, plural, one {# Document} other {# Documents}} / {documentsDeleted} Deleted',
              values: {
                documents: docCount.count,
                documentsDeleted,
              },
            })}
          </EuiTextColor>
        </EuiFlexItem>
        {approximateHint && (
          <EuiFlexItem grow={false}>
            <EuiIcon type="info" size="s" color="subdued" aria-label={approximateHint} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    );

    if (approximateHint) {
      return <EuiToolTip content={approximateHint}>{docCountContent}</EuiToolTip>;
    }

    return docCountContent;
  };

  return (
    <OverviewCard
      data-test-subj="indexDetailsStatus"
      title={i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.status.cardTitle', {
        defaultMessage: 'Status',
      })}
      content={{
        left: (
          <EuiText
            color={isClosed ? 'danger' : 'success'}
            css={css`
              font-size: ${largeFontSize};
            `}
          >
            {isClosed
              ? i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.status.closedLabel', {
                  defaultMessage: 'Closed',
                })
              : i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.status.openLabel', {
                  defaultMessage: 'Open',
                })}
          </EuiText>
        ),
        right: (
          <div
            css={css`
              max-width: 100px;
            `}
          >
            {healthBadge}
          </div>
        ),
      }}
      footer={{
        left: renderDocCountFooter(),
      }}
    />
  );
};
