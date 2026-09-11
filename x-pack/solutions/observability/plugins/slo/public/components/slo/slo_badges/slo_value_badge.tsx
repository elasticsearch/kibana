/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiFlexItem, EuiSkeletonText, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import numeral from '@elastic/numeral';
import { useKibana } from '../../../hooks/use_kibana';
import { displayStatus } from './slo_status_badge';

export interface SloStatusProps {
  slo: SLOWithSummaryResponse;
  isLoading?: boolean;
}

export function getSloValueBadgeLabel(slo: SLOWithSummaryResponse, percentFormat: string): string {
  const hasNoData = slo.summary.status === 'NO_DATA';
  return i18n.translate('xpack.slo.sloStatusBadge.sloObjectiveValue', {
    defaultMessage: '{value} ({objective} objective)',
    values: {
      value: hasNoData ? '-' : numeral(slo.summary.sliValue).format(percentFormat),
      objective: numeral(slo.objective.target).format(percentFormat),
    },
  });
}

export function SloValueBadge({ slo, isLoading }: SloStatusProps) {
  const { uiSettings } = useKibana().services;
  const percentFormat = uiSettings.get('format:percent:defaultPattern');

  if (isLoading || !slo) {
    return <EuiSkeletonText lines={2} data-test-subj="loadingTitle" />;
  }

  const badgeDisplayText = getSloValueBadgeLabel(slo, percentFormat);
  return (
    <>
      <EuiFlexItem grow={false}>
        {slo.summary.status === 'NO_DATA' ? (
          <EuiToolTip
            position="top"
            content={i18n.translate('xpack.slo.sloStatusBadge.noDataTooltip', {
              defaultMessage: 'It may take some time before the data is aggregated and available.',
            })}
          >
            <EuiBadge color={displayStatus[slo.summary.status].badgeColor} tabIndex={0}>
              {badgeDisplayText}
            </EuiBadge>
          </EuiToolTip>
        ) : (
          <EuiBadge color={displayStatus[slo.summary.status].badgeColor}>
            {badgeDisplayText}
          </EuiBadge>
        )}
      </EuiFlexItem>
    </>
  );
}
