/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React from 'react';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiText,
  EuiTextColor,
  EuiToolTip,
  useEuiFontSize,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { EuiI18nNumber } from '@elastic/eui';
import { useAppContext } from '../../../../../app_context';
import { OverviewCard } from './overview_card';
import type { DocCountState } from './quick_stats';
import {
  docCountErrorTooltip,
  docCountErrorLabel,
  docCountApproximateTooltip,
  docCountClosedIndexTooltip,
  storageCardTitle,
} from './translations';

export const SizeDocCountDetails: FunctionComponent<{
  size: string;
  docCount: DocCountState;
}> = ({ size, docCount }) => {
  const largeFontSize = useEuiFontSize('l').fontSize;
  const { config } = useAppContext();

  if (!config.enableSizeAndDocCount) {
    return null;
  }

  const renderDocCountFooter = () => {
    if (docCount.isLoading) {
      return <EuiLoadingSpinner size="m" />;
    }

    if (docCount.isError) {
      return (
        <EuiToolTip content={docCountErrorTooltip}>
          <EuiFlexGroup gutterSize="xs" tabIndex={0}>
            <EuiIcon type="warning" color="warning" aria-hidden={true} />
            <EuiTextColor color="warning">{docCountErrorLabel}</EuiTextColor>
          </EuiFlexGroup>
        </EuiToolTip>
      );
    }

    const approximateHint =
      docCount.approximateReason === 'closed_index'
        ? docCountClosedIndexTooltip
        : docCount.approximateReason === 'requires_read'
        ? docCountApproximateTooltip
        : undefined;

    const docCountContent = (
      <EuiFlexGroup gutterSize="xs">
        <EuiFlexItem grow={false}>
          <EuiIcon type="documents" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiI18nNumber value={docCount.count || 0} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTextColor color="subdued">
            {i18n.translate(
              'xpack.idxMgmt.indexDetails.overviewTab.status.meteringDocumentsLabel',
              {
                defaultMessage: '{documents, plural, one {Document} other {Documents}}',
                values: {
                  documents: docCount.count,
                },
              }
            )}
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
      data-test-subj="indexDetailsSizeDocCount"
      title={storageCardTitle}
      content={{
        left: (
          <EuiFlexGroup gutterSize="xs" alignItems="baseline">
            <EuiFlexItem grow={false}>
              <EuiText
                css={css`
                  font-size: ${largeFontSize};
                `}
              >
                {size}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiTextColor color="subdued">
                {i18n.translate('xpack.idxMgmt.indexDetails.overviewTab.storage.totalSizeLabel', {
                  defaultMessage: 'Total',
                })}
              </EuiTextColor>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        right: null,
      }}
      footer={{
        left: renderDocCountFooter(),
      }}
    />
  );
};
