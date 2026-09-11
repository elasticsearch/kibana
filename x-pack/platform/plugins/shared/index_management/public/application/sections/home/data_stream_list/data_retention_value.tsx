/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiIconTip, EuiLink, EuiTextColor } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type { DataStream } from '../../../../../common/types';
import { ILM_PAGES_POLICY_EDIT } from '../../../constants';
import { useAppContext } from '../../../app_context';
import { useIlmLocator } from '../../../services/use_ilm_locator';
import {
  getIlmPolicyNameForSummary,
  getLifecycleValue,
  isIlmLifecyclePreferred,
  isLookupLifecycleNotApplicable,
  resolveLifecycleForSummary,
} from '../../../lib/data_streams';

export const LookupLifecycleNotApplicable = () => (
  <span data-test-subj="lookupLifecycleNotApplicable">
    <EuiTextColor color="subdued">
      {i18n.translate('xpack.idxMgmt.dataStreamList.dataRetention.lookupNotApplicableLabel', {
        defaultMessage: 'Not applicable',
      })}
    </EuiTextColor>{' '}
    <EuiIconTip
      position="top"
      type="info"
      size="s"
      color="subdued"
      content={i18n.translate(
        'xpack.idxMgmt.dataStreamList.dataRetention.lookupNotApplicableTooltip',
        {
          defaultMessage:
            'Data retention is not applied to the data of a lookup data stream. Index lifecycle management and data stream lifecycle skip indices with the lookup index mode.',
        }
      )}
    />
  </span>
);

export const DataRetentionValue = ({
  dataStream,
  infiniteAsIcon,
  valueTestSubj,
}: {
  dataStream: DataStream;
  infiniteAsIcon?: boolean;
  valueTestSubj?: string;
}) => {
  const { core } = useAppContext();

  const ilmPolicyName = getIlmPolicyNameForSummary(dataStream);
  const ilmPolicyLink = useIlmLocator(ILM_PAGES_POLICY_EDIT, ilmPolicyName);

  if (isLookupLifecycleNotApplicable(dataStream)) {
    return <LookupLifecycleNotApplicable />;
  }

  if (isIlmLifecyclePreferred(dataStream)) {
    const ilmLabel = i18n.translate('xpack.idxMgmt.dataStreamList.dataRetention.ilmBadgeLabel', {
      defaultMessage: 'ILM',
    });
    const policyName =
      ilmPolicyName ??
      i18n.translate('xpack.idxMgmt.dataStreamList.dataRetention.unknownIlmPolicyLabel', {
        defaultMessage: 'Unknown policy',
      });

    return (
      <>
        {ilmPolicyLink ? (
          <EuiLink
            data-test-subj={valueTestSubj}
            href={ilmPolicyLink}
            onClick={(event: React.MouseEvent) => {
              // Let the browser handle modified clicks (open in new tab, etc.) natively; only
              // intercept plain left clicks for in-app (SPA) navigation.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                return;
              }
              event.preventDefault();
              core.application.navigateToUrl(ilmPolicyLink);
            }}
            css={{
              whiteSpace: 'nowrap' as const,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              maxWidth: '150px',
              display: 'inline-block',
              verticalAlign: 'middle',
            }}
            aria-label={i18n.translate(
              'xpack.idxMgmt.dataStreamList.dataRetention.ilmLinkAriaLabel',
              {
                defaultMessage: 'ILM policy: {name}',
                values: { name: policyName },
              }
            )}
          >
            {policyName}
          </EuiLink>
        ) : (
          <span data-test-subj={valueTestSubj}>{policyName}</span>
        )}{' '}
        <EuiBadge color="hollow">{ilmLabel}</EuiBadge>
      </>
    );
  }

  return (
    <>
      {getLifecycleValue(
        resolveLifecycleForSummary(dataStream.lifecycle, { hasDataStream: true }),
        infiniteAsIcon
      )}
    </>
  );
};
