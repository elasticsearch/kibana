/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  euiScrollBarStyles,
  useEuiTheme,
  type EuiFlexGridProps,
} from '@elastic/eui';
import type { Dimension, ParsedMetricItem, UnifiedMetricsGridProps } from '../../../types';
import type { ExemplarsAvailabilityResult } from './hooks/use_exemplars_availability';
import { getEsqlQuery } from './utils/get_esql_query';
import { PAGE_SIZE } from '../../../common/constants';
import { isLegacyHistogram } from '../../../common/utils/legacy_histogram';
import {
  EXEMPLARS_PROBE_FAILED_USER_MESSAGES,
  LEGACY_HISTOGRAM_USER_MESSAGES,
} from '../../../common/utils/user_messages';
import { MetricsGrid } from './metrics_grid';
import { Pagination } from '../../pagination';
import { usePagination } from './hooks';
import { MetricsGridLoadingProgress } from '../../empty_state/empty_state';
import { useMetricsExperienceState } from './context/metrics_experience_state_provider';
import { firstNonNullable } from '../../../common/utils';
import { extractWhereCommand } from '../../../utils/extract_where_command';
import { getDuplicateMetricNames } from './utils/get_duplicate_metric_names';

export interface MetricsExperienceGridContentProps
  extends Pick<
    UnifiedMetricsGridProps,
    'services' | 'fetchParams' | 'onBrushEnd' | 'onFilter' | 'actions' | 'histogramCss'
  > {
  discoverFetch$: UnifiedMetricsGridProps['fetch$'];
  metricItems: ParsedMetricItem[];
  activeDimensions: Dimension[];
  isDiscoverLoading?: boolean;
  isTabSelected: boolean;
  exemplarsAvailability: ExemplarsAvailabilityResult;
}

export const MetricsExperienceGridContent = ({
  metricItems,
  activeDimensions,
  services,
  discoverFetch$,
  fetchParams,
  onBrushEnd,
  onFilter,
  actions,
  histogramCss,
  isDiscoverLoading = false,
  isTabSelected,
  exemplarsAvailability,
}: MetricsExperienceGridContentProps) => {
  const { query } = fetchParams;
  const euiThemeContext = useEuiTheme();
  const { euiTheme } = euiThemeContext;

  const esqlQuery = useMemo(() => getEsqlQuery(query), [query]);

  const whereStatements = useMemo(() => extractWhereCommand(esqlQuery), [esqlQuery]);

  const { searchTerm, currentPage, onPageChange } = useMetricsExperienceState();

  const {
    currentPageItems: currentPageFields = [],
    totalPages = 0,
    totalCount: filteredFieldsCount = 0,
  } = usePagination({
    items: metricItems,
    pageSize: PAGE_SIZE,
    currentPage,
  }) ?? {};

  const columns = useMemo<NonNullable<EuiFlexGridProps['columns']>>(
    () => Math.min(filteredFieldsCount, 4) as NonNullable<EuiFlexGridProps['columns']>,
    [filteredFieldsCount]
  );

  const getUserMessages = useCallback(
    (metricItem: ParsedMetricItem) => {
      const messages = [
        ...(isLegacyHistogram(
          firstNonNullable(metricItem.fieldTypes),
          firstNonNullable(metricItem.metricTypes)
        )
          ? LEGACY_HISTOGRAM_USER_MESSAGES
          : []),
        ...(exemplarsAvailability.hasProbeFailed ? EXEMPLARS_PROBE_FAILED_USER_MESSAGES : []),
      ];
      return messages.length > 0 ? messages : undefined;
    },
    [exemplarsAvailability.hasProbeFailed]
  );

  const duplicateMetricNames = useMemo(() => getDuplicateMetricNames(metricItems), [metricItems]);

  const getDescription = useCallback(
    (metricItem: ParsedMetricItem) =>
      duplicateMetricNames.has(metricItem.metricName)
        ? i18n.translate('metricsExperience.grid.duplicateMetricIndexDescription', {
            defaultMessage:
              'This metric exists in multiple data streams. This chart shows data from {indexName} only.',
            values: { indexName: metricItem.indexName },
          })
        : undefined,
    [duplicateMetricNames]
  );

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="s"
      tabIndex={-1}
      data-test-subj="metricsExperienceRendered"
      css={css`
        ${histogramCss || ''}
        height: 100%;
        overflow: auto;
        padding: ${euiTheme.size.s} ${euiTheme.size.s} 0;
        margin-block: ${euiTheme.size.xs};
        ${euiScrollBarStyles(euiThemeContext)}
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiText size="s">
          <strong>
            {i18n.translate('metricsExperience.grid.metricsCount.label', {
              defaultMessage: '{count} {count, plural, one {metric} other {metrics}}',
              values: { count: filteredFieldsCount },
            })}
          </strong>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow>
        {isDiscoverLoading && <MetricsGridLoadingProgress />}
        <MetricsGrid
          columns={columns}
          dimensions={activeDimensions}
          services={services}
          metricItems={currentPageFields}
          onBrushEnd={onBrushEnd}
          actions={actions}
          onFilter={onFilter}
          discoverFetch$={discoverFetch$}
          fetchParams={fetchParams}
          searchTerm={searchTerm}
          whereStatements={whereStatements}
          getUserMessages={getUserMessages}
          getDescription={getDescription}
          isTabSelected={isTabSelected}
          exemplarsAvailability={exemplarsAvailability}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <Pagination totalPages={totalPages} currentPage={currentPage} onPageChange={onPageChange} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
