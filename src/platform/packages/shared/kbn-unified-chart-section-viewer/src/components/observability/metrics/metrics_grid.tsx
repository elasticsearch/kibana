/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EuiFlexGridProps } from '@elastic/eui';
import { EuiFlexGrid, EuiFlexItem, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import type { EmbeddableComponentProps } from '@kbn/lens-plugin/public';
import { ACTION_INSPECT_PANEL, type QuickActionIds } from '@kbn/embeddable-plugin/public';
import {
  DiscoverFlyouts,
  dismissAllFlyoutsExceptFor,
  type MetricsGridSettings,
} from '@kbn/discover-utils';
import { getIndexPatternFromESQLQuery } from '@kbn/esql-utils';
import { getFieldSearchMatchingHighlight } from '@kbn/field-utils';
import { stableStringify } from '@kbn/std';
import type { Dimension, UnifiedMetricsGridProps, ParsedMetricItem } from '../../../types';
import type { ChartSize } from '../../chart';
import { Chart } from '../../chart';
import { MetricInsightsFlyout } from '../../flyout';
import { EmptyState } from '../../empty_state/empty_state';
import { useGridNavigation } from '../../../hooks/use_grid_navigation';
import { FieldsMetadataProvider } from '../../../context/fields_metadata';
import {
  createESQLQuery,
  firstNonNullable,
  getAggregationLabel,
  getMetricUniqueKey,
} from '../../../common/utils';
import {
  ACTION_COPY_TO_DASHBOARD,
  ACTION_EXPLORE_IN_DISCOVER_TAB,
  ACTION_OPEN_IN_DISCOVER,
  ACTION_VIEW_DETAILS,
} from '../../../common/constants';
import { useChartLayers } from '../../chart/hooks/use_chart_layers';
import { useMetricsExperienceState } from './context/metrics_experience_state_provider';
import { getEsqlQuery } from './utils/get_esql_query';
import type { ExemplarsAvailabilityResult } from './hooks/use_exemplars_availability';
import { useFetchExemplars } from './hooks/use_fetch_exemplars';

const EMPTY_APPLICABLE_DIMENSIONS: Dimension[] = [];

const useStableApplicableDimensions = (
  dimensions: Dimension[],
  dimensionFields: readonly Dimension[]
): Dimension[] => {
  const stabilizedRef = useRef<{ key: string | null; value: Dimension[] }>({
    key: null,
    value: EMPTY_APPLICABLE_DIMENSIONS,
  });

  return useMemo(() => {
    const applicable = dimensions.filter((dimension) =>
      dimensionFields.some((field) => field.name === dimension.name)
    );
    const key = applicable.length === 0 ? null : stableStringify(applicable);

    if (stabilizedRef.current.key === key) {
      return stabilizedRef.current.value;
    }

    const value = applicable.length === 0 ? EMPTY_APPLICABLE_DIMENSIONS : applicable;
    stabilizedRef.current = { key, value };
    return value;
  }, [dimensions, dimensionFields]);
};

const METRICS_QUICK_ACTION_IDS: QuickActionIds = [
  ACTION_EXPLORE_IN_DISCOVER_TAB,
  ACTION_INSPECT_PANEL,
  ACTION_VIEW_DETAILS,
  ACTION_COPY_TO_DASHBOARD,
];

export type MetricsGridProps = Pick<
  UnifiedMetricsGridProps,
  'services' | 'onBrushEnd' | 'onFilter' | 'fetchParams' | 'actions'
> & {
  dimensions: Dimension[];
  searchTerm?: string;
  columns: NonNullable<EuiFlexGridProps['columns']>;
  discoverFetch$: UnifiedMetricsGridProps['fetch$'];
  metricItems: ParsedMetricItem[];
  whereStatements?: string[];
  getUserMessages?: (metricItem: ParsedMetricItem) => EmbeddableComponentProps['userMessages'];
  getDescription?: (metricItem: ParsedMetricItem) => EmbeddableComponentProps['description'];
  exemplarsAvailability: ExemplarsAvailabilityResult;
  /**
   * Whether the owning Discover tab is the currently active one.
   *
   * Discover keeps inactive tabs' chart sections mounted to preserve internal
   * state (e.g. Lens), so without this gate every tab with a persisted flyout
   * would render its own `MetricInsightsFlyout` into `document.body` via
   * `EuiPortal`, causing visual collisions and event-capture conflicts across
   * tabs (e.g. opening a flyout in tab A would close the flyout in tab B,
   * and duplicating a tab would lose the persisted flyout).
   *
   */
  isTabSelected: boolean;
};

const getItemKey = (metricItem: ParsedMetricItem, index: number) => {
  return `${metricItem.metricName}-${index}`;
};
export const MetricsGrid = ({
  metricItems,
  onBrushEnd,
  onFilter,
  actions,
  dimensions,
  whereStatements,
  services,
  columns,
  fetchParams,
  discoverFetch$,
  searchTerm,
  getUserMessages,
  getDescription,
  isTabSelected,
  exemplarsAvailability,
}: MetricsGridProps) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const { euiTheme } = useEuiTheme();
  const { flyoutState, onFlyoutStateChange, profileId, gridSettings, onMetricExplored } =
    useMetricsExperienceState();

  const gridColumns = columns || 1;
  const gridRows = Math.ceil(metricItems.length / gridColumns);

  const userSource = useMemo<string | undefined>(() => {
    const userEsql = getEsqlQuery(fetchParams.query);
    if (!userEsql) return undefined;
    const pattern = getIndexPatternFromESQLQuery(userEsql);
    return pattern || undefined;
  }, [fetchParams.query]);

  const { focusedCell, handleKeyDown, getRowColFromIndex, handleFocusCell, focusCell } =
    useGridNavigation({
      gridColumns,
      gridRows,
      totalRows: metricItems.length,
      gridRef,
    });

  const flyoutData = useMemo(() => {
    if (!flyoutState) {
      return undefined;
    }
    // `metricItems` is already scoped to the current page (see `PAGE_SIZE`), so
    // this lookup is bounded and intentionally not indexed/memoized further.
    const matchedItem = metricItems.find(
      (item) => getMetricUniqueKey(item) === flyoutState.metricUniqueKey
    );
    if (!matchedItem) {
      return undefined;
    }
    return { metricItem: matchedItem, esqlQuery: flyoutState.esqlQuery };
  }, [flyoutState, metricItems]);

  // Discard flyoutState when its metric is filtered out of the grid.
  // `metricItems.length > 0` avoids clearing state on a duplicated tab's first
  // render, where items are momentarily empty before the per-tab fetch resolves.
  useEffect(() => {
    if (flyoutState && metricItems.length > 0 && !flyoutData) {
      onFlyoutStateChange(undefined);
    }
  }, [flyoutState, metricItems.length, flyoutData, onFlyoutStateChange]);

  const handleViewDetails = useCallback(
    (index: number, esqlQuery: string, metricItem: ParsedMetricItem) => {
      dismissAllFlyoutsExceptFor(DiscoverFlyouts.metricInsights);
      onFlyoutStateChange({
        gridPosition: index,
        metricUniqueKey: getMetricUniqueKey(metricItem),
        esqlQuery,
        selectedTabId: 'overview',
      });
    },
    [onFlyoutStateChange]
  );

  const handleCloseFlyout = useCallback(() => {
    if (!flyoutState) {
      return;
    }

    const currentIndex = metricItems.findIndex(
      (item) => getMetricUniqueKey(item) === flyoutState.metricUniqueKey
    );
    onFlyoutStateChange(undefined);

    if (currentIndex === -1) {
      return;
    }

    const { rowIndex, colIndex } = getRowColFromIndex(currentIndex);
    // Use requestAnimationFrame to ensure the flyout is fully closed before focusing
    requestAnimationFrame(() => {
      focusCell(rowIndex, colIndex);
    });
  }, [flyoutState, focusCell, getRowColFromIndex, metricItems, onFlyoutStateChange]);

  if (metricItems.length === 0) {
    return <EmptyState />;
  }

  return (
    <FieldsMetadataProvider fields={metricItems} services={services}>
      <A11yGridWrapper
        ref={gridRef}
        gridRows={gridRows}
        gridColumns={gridColumns}
        onKeyDown={handleKeyDown}
      >
        <EuiFlexGrid
          gutterSize="s"
          css={css`
            grid-template-columns: repeat(${Math.min(columns, 4)}, 1fr);
            @container (max-width: ${euiTheme.breakpoint.xl}px) {
              grid-template-columns: repeat(${Math.min(columns, 3)}, 1fr);
            }
            @container (max-width: ${euiTheme.breakpoint.l}px) {
              grid-template-columns: repeat(${Math.min(columns, 2)}, 1fr);
            }
            @container (max-width: ${euiTheme.breakpoint.s}px) {
              grid-template-columns: repeat(${Math.min(columns, 1)}, 1fr);
            }
          `}
        >
          {metricItems.map((metricItem, index) => {
            const id = getItemKey(metricItem, index);
            const { rowIndex, colIndex } = getRowColFromIndex(index);
            const isFocused =
              focusedCell.rowIndex === rowIndex && focusedCell.colIndex === colIndex;
            const isSelected =
              isTabSelected && flyoutState?.metricUniqueKey === getMetricUniqueKey(metricItem);

            return (
              <EuiFlexItem key={id}>
                <ChartItem
                  id={id}
                  index={index}
                  metricItem={metricItem}
                  size="s"
                  dimensions={dimensions}
                  services={services}
                  onBrushEnd={onBrushEnd}
                  onFilter={onFilter}
                  actions={actions}
                  fetchParams={fetchParams}
                  discoverFetch$={discoverFetch$}
                  rowIndex={rowIndex}
                  colIndex={colIndex}
                  isFocused={isFocused}
                  isSelected={isSelected}
                  onFocusCell={handleFocusCell}
                  onViewDetails={handleViewDetails}
                  searchTerm={searchTerm}
                  whereStatements={whereStatements}
                  userSource={userSource}
                  description={getDescription?.(metricItem)}
                  userMessages={getUserMessages ? getUserMessages(metricItem) : undefined}
                  profileId={profileId}
                  gridSettings={gridSettings}
                  onMetricExplored={onMetricExplored}
                  exemplarsAvailability={exemplarsAvailability}
                />
              </EuiFlexItem>
            );
          })}
        </EuiFlexGrid>
      </A11yGridWrapper>
      {flyoutData && isTabSelected && (
        <MetricInsightsFlyout
          metricItem={flyoutData.metricItem}
          esqlQuery={flyoutData.esqlQuery}
          onClose={handleCloseFlyout}
        />
      )}
    </FieldsMetadataProvider>
  );
};

interface ChartItemProps
  extends Pick<
    UnifiedMetricsGridProps,
    'services' | 'onBrushEnd' | 'onFilter' | 'fetchParams' | 'actions'
  > {
  id: string;
  metricItem: ParsedMetricItem;
  index: number;
  size: ChartSize;
  dimensions: Dimension[];
  discoverFetch$: UnifiedMetricsGridProps['fetch$'];
  rowIndex: number;
  colIndex: number;
  isFocused: boolean;
  isSelected: boolean;
  searchTerm?: string;
  onFocusCell: (rowIndex: number, colIndex: number) => void;
  onViewDetails: (index: number, esqlQuery: string, metricItem: ParsedMetricItem) => void;
  description?: string;
  whereStatements?: string[];
  userSource?: string;
  userMessages?: EmbeddableComponentProps['userMessages'];
  profileId: string;
  gridSettings: MetricsGridSettings;
  onMetricExplored?: (metricUniqueKey: string) => void;
  exemplarsAvailability: ExemplarsAvailabilityResult;
}

const ChartItem = React.memo(
  ({
    id,
    metricItem,
    index,
    size,
    dimensions,
    services,
    onBrushEnd,
    onFilter,
    actions,
    fetchParams,
    discoverFetch$,
    rowIndex,
    colIndex,
    isFocused,
    isSelected,
    searchTerm,
    whereStatements,
    userSource,
    description,
    onFocusCell,
    onViewDetails,
    userMessages,
    profileId,
    gridSettings,
    onMetricExplored,
    exemplarsAvailability,
  }: ChartItemProps) => {
    const { euiTheme } = useEuiTheme();
    const colorPalette = useMemo(
      () => Object.values(euiTheme.colors.vis).slice(0, 10),
      [euiTheme.colors.vis]
    );

    const recordExploredMetric = useCallback<React.MouseEventHandler<HTMLDivElement>>(
      (event) => {
        // Only count clicks on panel action controls (Inspect, View details, Explore in
        // Discover, Copy to dashboard, and the overflow menu that hosts Cases), not clicks
        // on the chart body, legend, or time series selection.
        const isActionClick = (event.target as HTMLElement).closest(
          '[data-test-subj^="embeddablePanelAction-"], [data-test-subj="embeddablePanelToggleMenuIcon"]'
        );
        if (isActionClick) {
          onMetricExplored?.(getMetricUniqueKey(metricItem));
        }
      },
      [onMetricExplored, metricItem]
    );

    const applicableDimensions = useStableApplicableDimensions(
      dimensions,
      metricItem.dimensionFields
    );

    const exemplarRawResponse = useFetchExemplars({
      fetchParams,
      services,
      metricItem,
      availableMetrics: exemplarsAvailability.availableMetrics,
      whereStatements,
      originalSource: userSource,
      profileId,
    });
    // TODO(kibana#289722): pass exemplarRawResponse to useChartLayers as a LensPointsLayer
    // once that PR adds LensPointsLayer support to the config builder.
    void exemplarRawResponse;

    const esqlQuery = useMemo(() => {
      const fieldType = firstNonNullable(metricItem.fieldTypes);
      const isSupported = fieldType !== 'unsigned_long';
      return isSupported
        ? createESQLQuery({
            metricItem,
            splitAccessors: applicableDimensions.map((dim) => dim.name),
            whereStatements,
            originalSource: userSource,
            gridSettings,
          })
        : '';
    }, [metricItem, applicableDimensions, whereStatements, userSource, gridSettings]);

    const yAxisTitle = useMemo(() => {
      const instrument = firstNonNullable(metricItem.metricTypes);
      return instrument ? getAggregationLabel({ instrument, gridSettings }) : undefined;
    }, [metricItem.metricTypes, gridSettings]);

    const color = useMemo(() => colorPalette[index % colorPalette.length], [index, colorPalette]);
    const chartLayers = useChartLayers({
      dimensions: applicableDimensions,
      metricItem,
      color,
      gridSettings,
    });
    const handleViewDetailsCallback = useCallback(
      () => onViewDetails(index, esqlQuery, metricItem),
      [index, esqlQuery, metricItem, onViewDetails]
    );

    const titleHighlight = useMemo(() => {
      if (!searchTerm?.trim()) {
        return undefined;
      }
      return getFieldSearchMatchingHighlight(metricItem.metricName, searchTerm.trim());
    }, [metricItem.metricName, searchTerm]);

    return (
      <A11yGridCell
        id={id}
        rowIndex={rowIndex}
        colIndex={colIndex}
        index={index}
        isFocused={isFocused}
        isSelected={isSelected}
        onFocus={onFocusCell}
        onClickCapture={recordExploredMetric}
      >
        <Chart
          id={metricItem.metricName}
          isSelected={isSelected}
          esqlQuery={esqlQuery}
          size={size}
          discoverFetch$={discoverFetch$}
          fetchParams={fetchParams}
          services={services}
          onBrushEnd={onBrushEnd}
          onFilter={onFilter}
          onExploreInDiscoverTab={actions.openInNewTab}
          onViewDetails={handleViewDetailsCallback}
          title={metricItem.metricName}
          description={description}
          chartLayers={chartLayers}
          yAxisTitle={yAxisTitle}
          syncCursor
          syncTooltips={false}
          titleHighlight={titleHighlight}
          extraDisabledActions={[ACTION_OPEN_IN_DISCOVER]}
          quickActionIds={METRICS_QUICK_ACTION_IDS}
          userMessages={userMessages}
          profileId={profileId}
        />
      </A11yGridCell>
    );
  }
);

ChartItem.displayName = 'ChartItem';

const A11yGridWrapper = React.forwardRef(
  (
    {
      children,
      gridRows,
      gridColumns,
      onKeyDown,
    }: React.PropsWithChildren<{
      gridRows: number;
      gridColumns: number;
      onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    }>,
    ref: React.Ref<HTMLDivElement>
  ) => {
    return (
      <div
        ref={ref}
        role="grid"
        aria-label={i18n.translate('metricsExperience.gridAriaLabel', {
          defaultMessage: 'Metric charts grid. Use arrow keys to navigate.',
        })}
        aria-rowcount={gridRows}
        aria-colcount={gridColumns}
        onKeyDown={onKeyDown}
        data-test-subj="unifiedMetricsExperienceGrid"
        tabIndex={0}
        css={css`
          outline: none;
          container-type: inline-size;
        `}
      >
        {children}
      </div>
    );
  }
);

const A11yGridCell = React.forwardRef(
  (
    {
      id,
      children,
      rowIndex,
      colIndex,
      index,
      isFocused,
      isSelected,
      onFocus,
      onClickCapture,
    }: React.PropsWithChildren<{
      id: string;
      rowIndex: number;
      colIndex: number;
      index: number;
      isFocused: boolean;
      isSelected: boolean;
      onFocus: (rowIndex: number, colIndex: number) => void;
      onClickCapture?: React.MouseEventHandler<HTMLDivElement>;
    }>,
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { euiTheme } = useEuiTheme();

    const handleFocusCell = useCallback(
      () => onFocus(rowIndex, colIndex),
      [onFocus, rowIndex, colIndex]
    );

    return (
      <div
        id={id}
        ref={ref}
        role="gridcell"
        aria-rowindex={rowIndex + 1}
        aria-colindex={colIndex + 1}
        aria-selected={isSelected}
        data-grid-cell={`${rowIndex}-${colIndex}`}
        data-chart-index={index}
        tabIndex={isFocused ? 0 : -1}
        onFocus={handleFocusCell}
        onClickCapture={onClickCapture}
        css={css`
          outline: none;
          cursor: pointer;
          ${isFocused && {
            boxShadow: `0 0 ${euiTheme.focus.width} ${euiTheme.colors.primary}`,
            borderRadius: euiTheme.border.radius.medium,
          }}
        `}
      >
        {children}
      </div>
    );
  }
);
