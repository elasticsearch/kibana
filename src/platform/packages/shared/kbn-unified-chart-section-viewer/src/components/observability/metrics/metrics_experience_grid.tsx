/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect } from 'react';
import { keys } from '@elastic/eui';
import { usePerformanceContext } from '@kbn/ebt-tools';
import { i18n } from '@kbn/i18n';
import useToggle from 'react-use/lib/useToggle';
import { useFetchMetricsData } from './hooks/use_fetch_metrics_data';
import {
  useExemplarsAvailability,
  type ExemplarsAvailabilityResult,
} from './hooks/use_exemplars_availability';
import { METRICS_BREAKDOWN_SELECTOR_DATA_TEST_SUBJ } from '../../../common/constants';
import { useMetricsExperienceState } from './context/metrics_experience_state_provider';
import { ChartsGrid } from '../../charts_grid';
import { EmptyState } from '../../empty_state/empty_state';
import { useToolbarActions } from '../../toolbar/hooks/use_toolbar_actions';
import { MetricsExperienceGridContent } from './metrics_experience_grid_content';
import { ChartSectionSearchError } from '../../chart_section_search_error/chart_section_search_error';
import { GridSettingsFlyout } from '../../flyout';
import type { UnifiedMetricsGridProps } from '../../../types';
import {
  useDimensionsWipe,
  useDiscoverFieldForBreakdown,
  useExitFullscreenOnEmptyResults,
  useMetricFieldsFilter,
  useMetricsSort,
  useResetPageOnDimensionsChange,
} from './hooks';
import { isSuppressedFetchError } from '../../chart/utils/is_suppressed_fetch_error';

export const MetricsExperienceGrid = ({
  renderToggleActions,
  chartToolbarCss,
  histogramCss,
  onBrushEnd,
  onFilter,
  actions,
  services,
  fetch$: discoverFetch$,
  fetchParams,
  isComponentVisible,
  isTabSelected,
  breakdownField,
}: UnifiedMetricsGridProps) => {
  const {
    searchTerm,
    isFullscreen,
    onToggleFullscreen,
    onExitFullscreen,
    selectedDimensions,
    onDimensionsChange,
    onPageChange,
    metricsSort,
    profileId,
    gridSettings,
    onGridSettingsChange,
    recentlyExploredMetrics,
  } = useMetricsExperienceState();
  const [isGridSettingsFlyoutOpen, toggleGridSettingsFlyout] = useToggle(false);
  const {
    metricItems,
    allDimensions,
    activeDimensions,
    loading: isDiscoverLoading,
    error: metricsInfoError,
  } = useFetchMetricsData({
    fetchParams,
    services,
    isComponentVisible,
    selectedDimensionNames: selectedDimensions,
    profileId,
  });

  const exemplarsAvailability: ExemplarsAvailabilityResult = useExemplarsAvailability({
    fetchParams,
    services,
    profileId,
  });

  const { filteredMetricItems } = useMetricFieldsFilter({
    metricItems,
    searchTerm,
  });

  const { sortField: sortBy, sortDirection: direction } = metricsSort;
  const { sortedMetricItems } = useMetricsSort({
    metricItems: filteredMetricItems,
    sortBy,
    direction,
    recentlyExploredMetrics,
  });

  useDiscoverFieldForBreakdown(
    breakdownField,
    allDimensions,
    selectedDimensions,
    onDimensionsChange
  );

  useResetPageOnDimensionsChange(selectedDimensions, onPageChange);

  useDimensionsWipe({
    selectedDimensions,
    allDimensions,
    isLoading: isDiscoverLoading,
    hasError: metricsInfoError != null,
    onSelectedDimensionsChange: onDimensionsChange,
  });

  useExitFullscreenOnEmptyResults({
    isFullscreen,
    isLoading: isDiscoverLoading,
    isComponentVisible,
    hasMetrics: metricItems.length > 0,
    onExitFullscreen,
  });

  const { onPageReady } = usePerformanceContext();
  useEffect(() => {
    if (!isDiscoverLoading && metricItems.length > 0) {
      onPageReady({
        meta: {
          rangeFrom: fetchParams.timeRange?.from,
          rangeTo: fetchParams.timeRange?.to,
        },
        customMetrics: {
          key1: 'metric_experience_fields_count',
          value1: metricItems.length,
        },
      });
    }
  }, [
    metricItems.length,
    onPageReady,
    fetchParams.timeRange?.from,
    fetchParams.timeRange?.to,
    isDiscoverLoading,
  ]);

  const { toggleActions, leftSideActions, rightSideActions, searchInput } = useToolbarActions({
    allDimensions,
    metricItems,
    renderToggleActions,
    onDimensionsChange,
    isLoading: isDiscoverLoading,
    onOpenGridSettings: toggleGridSettingsFlyout,
  });

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === keys.ESCAPE && isFullscreen && !areSelectorPortalsOpen()) {
        e.preventDefault();
        onToggleFullscreen?.();
      }
    },
    [isFullscreen, onToggleFullscreen]
  );

  if (metricItems.length === 0 && isDiscoverLoading) {
    return <EmptyState isLoading={isDiscoverLoading} />;
  }

  const showChartSectionSearchError =
    metricsInfoError != null && !isDiscoverLoading && !isSuppressedFetchError(metricsInfoError);

  if (showChartSectionSearchError) {
    return (
      <ChartSectionSearchError
        error={metricsInfoError}
        title={i18n.translate('metricsExperience.chartSectionError.title', {
          defaultMessage: 'Unable to retrieve search results',
        })}
      />
    );
  }

  return (
    <>
      <ChartsGrid
        id="metricsExperienceGrid"
        toolbarCss={chartToolbarCss}
        toolbar={{
          toggleActions,
          leftSide: leftSideActions,
          rightSide: rightSideActions,
          additionalControls: { prependRight: searchInput },
        }}
        toolbarWrapAt={isFullscreen ? 'l' : 'xl'}
        isComponentVisible={isComponentVisible}
        isFullscreen={isFullscreen}
        onKeyDown={onKeyDown}
      >
        <MetricsExperienceGridContent
          metricItems={sortedMetricItems}
          activeDimensions={activeDimensions}
          services={services}
          discoverFetch$={discoverFetch$}
          fetchParams={fetchParams}
          onBrushEnd={onBrushEnd}
          onFilter={onFilter}
          actions={actions}
          histogramCss={histogramCss}
          isDiscoverLoading={isDiscoverLoading}
          isTabSelected={isTabSelected}
          exemplarsAvailability={exemplarsAvailability}
        />
      </ChartsGrid>
      {isGridSettingsFlyoutOpen && (
        <GridSettingsFlyout
          gridSettings={gridSettings}
          onGridSettingsChange={onGridSettingsChange}
          onClose={toggleGridSettingsFlyout}
        />
      )}
    </>
  );
};

const areSelectorPortalsOpen = () => {
  const portals = document.querySelectorAll('[data-euiportal]');

  for (const portal of portals) {
    const hasBreakdownSelector = portal.querySelector(
      `[data-test-subj*=${METRICS_BREAKDOWN_SELECTOR_DATA_TEST_SUBJ}]`
    );
    const hasSelectableList = portal.querySelector('[data-test-subj*="Selectable"]');

    if (hasBreakdownSelector || hasSelectableList) {
      // Check if the portal is visible and has focusable content
      const style = window.getComputedStyle(portal);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        return true;
      }
    }
  }
};
