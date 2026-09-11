/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppHeaderBadge, AppHeaderMetadataItems } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import moment from 'moment';
import { useMemo } from 'react';
import { getSloValueBadgeLabel } from '../../../components/slo/slo_badges/slo_value_badge';
import { displayStatus } from '../../../components/slo/slo_badges/slo_status_badge';
import { useKibana } from '../../../hooks/use_kibana';

const NO_DATA_TOOLTIP = i18n.translate('xpack.slo.sloStatusBadge.noDataTooltip', {
  defaultMessage: 'It may take some time before the data is aggregated and available.',
});

const NOT_AVAILABLE_LABEL = i18n.translate('xpack.slo.sloDetails.headerTitle.notAvailableLabel', {
  defaultMessage: 'n/a',
});

export function useSloDetailsAppHeader(slo: SLOWithSummaryResponse): {
  badges: AppHeaderBadge[];
  metadata: AppHeaderMetadataItems;
} {
  const { uiSettings } = useKibana().services;
  const percentFormat = uiSettings.get('format:percent:defaultPattern');

  return useMemo(() => {
    const status = displayStatus[slo.summary.status];
    const isNoData = slo.summary.status === 'NO_DATA';
    const color = toBadgeColor(status.badgeColor);

    const badges: AppHeaderBadge[] = [
      {
        label: getSloValueBadgeLabel(slo, percentFormat),
        color,
        tooltip: isNoData ? NO_DATA_TOOLTIP : undefined,
      },
      {
        label: status.displayText,
        color,
        tooltip: isNoData ? NO_DATA_TOOLTIP : undefined,
      },
    ];

    if (slo.summary.errorBudget.isEstimated) {
      badges.push({
        label: i18n.translate('xpack.slo.sloStatusBadge.forecasted', {
          defaultMessage: 'Forecasted',
        }),
        color: 'default',
      });
    }

    const metadata: AppHeaderMetadataItems = [
      {
        type: 'text',
        label: i18n.translate('xpack.slo.sloDetails.headerTitle.lastUpdatedByLabel', {
          defaultMessage: 'Last updated by',
        }),
        value: i18n.translate('xpack.slo.sloDetails.headerTitle.lastUpdatedByValue', {
          defaultMessage: '{updatedBy} on {updatedAt}',
          values: {
            updatedBy: slo.updatedBy ?? NOT_AVAILABLE_LABEL,
            updatedAt: moment(slo.updatedAt).format('ll'),
          },
        }),
      },
    ];

    return { badges, metadata };
  }, [percentFormat, slo]);
}

function toBadgeColor(color: string): AppHeaderBadge['color'] {
  switch (color) {
    case 'success':
    case 'warning':
    case 'danger':
    case 'default':
    case 'primary':
    case 'accent':
    case 'hollow':
      return color;
    default:
      return 'default';
  }
}
