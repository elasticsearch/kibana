/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_DATASOURCE_ID } from '@kbn/lens-common';

import { i18n } from '@kbn/i18n';
import { partition } from 'lodash';
import { Position } from '@elastic/charts';
import { FittingFunctions, LayerTypes } from '@kbn/expression-xy-plugin/public';
import { Parser } from '@elastic/esql';

import type {
  SuggestionRequest,
  VisualizationSuggestion,
  TableSuggestionColumn,
  TableSuggestion,
  TableChangeType,
} from '@kbn/lens-common';
import { getColorMappingDefaults } from '../../utils';
import type { XYVisualizationState, XYLayerConfig, XYDataLayerConfig, SeriesType } from './types';
import { visualizationSubtypes, defaultSeriesType } from './types';
import { flipSeriesType, getIconForSeries } from './state_helpers';
import { applyChartDefaultsIfNeeded } from './apply_defaults';
import { getDefaultPalette } from './default_palette';
import { getDataLayers, isDataLayer, isDateHistogramOperation } from './visualization_helpers';

const COLUMN_SORT_ORDER = {
  document: 0,
  date: 1,
  string: 2,
  ip: 3,
  boolean: 4,
  number: 5,
  gauge: 6,
  counter: 7,
  histogram: 8,
  geo_point: 9,
  geo_shape: 10,
  murmur3: 11,
};

/**
 * For TS/PromQL ES|QL queries, prefers 'line' when the x-axis uses a date column (time series),
 * Otherwise returns undefined so the default series type is used.
 */
function getPreferredSeriesTypeForTimeSeriesQuery(
  query: SuggestionRequest['query'],
  xValue?: TableSuggestionColumn
): SeriesType | undefined {
  if (!query?.esql) return undefined;
  try {
    const { root } = Parser.parse(query.esql);
    const isPromqlOrTs = root.commands.find(({ name }) => name === 'promql' || name === 'ts');
    if (!isPromqlOrTs) return undefined;
    // Prefer line when x-axis is a date (time series) or when x-axis is missing (same context, consistent type)
    if (xValue?.operation.dataType === 'date') {
      return 'line';
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Generate suggestions for the xy chart.
 *
 * @param opts
 */
export function getSuggestions({
  table,
  state,
  keptLayerIds,
  subVisualizationId,
  mainPalette,
  isFromContext,
  allowMixed,
  datasourceId,
  query,
}: SuggestionRequest<XYVisualizationState>): Array<VisualizationSuggestion<XYVisualizationState>> {
  // Text-based datasource always sets isMultiRow: false regardless of actual data shape,
  // so skip that check for textBased to avoid incorrectly rejecting valid suggestions
  const isTextBased = datasourceId === LENS_DATASOURCE_ID.TEXT_BASED;
  const incompleteTable =
    (!isTextBased && !table.isMultiRow) ||
    table.columns.length <= 1 ||
    table.columns.every((col) => col.operation.dataType !== 'number') ||
    table.columns.some((col) => !Object.hasOwn(COLUMN_SORT_ORDER, col.operation.dataType));

  if (
    (incompleteTable && state && !subVisualizationId) ||
    table.columns.some((col) => col.operation.isStaticValue && !isFromContext) ||
    // do not use suggestions with non-numeric metrics
    table.columns.some((col) => !col.operation.isBucketed && col.operation.dataType !== 'number')
  ) {
    // reject incomplete configurations if the sub visualization isn't specifically requested
    // this allows to switch chart types via switcher with incomplete configurations, but won't
    // cause incomplete suggestions getting auto applied on dropped fields
    return [];
  }

  const suggestions = getSuggestionForColumns(
    table,
    keptLayerIds,
    state,
    subVisualizationId as SeriesType | undefined,
    mainPalette,
    allowMixed,
    datasourceId,
    query
  );

  if (Array.isArray(suggestions)) {
    return suggestions;
  }

  return suggestions ? [suggestions] : [];
}

function getSuggestionForColumns(
  table: TableSuggestion,
  keptLayerIds: string[],
  currentState?: XYVisualizationState,
  seriesType?: SeriesType,
  mainPalette?: SuggestionRequest['mainPalette'],
  allowMixed?: boolean,
  datasourceId?: string,
  query?: SuggestionRequest['query']
):
  | VisualizationSuggestion<XYVisualizationState>
  | Array<VisualizationSuggestion<XYVisualizationState>>
  | undefined {
  const [buckets, values] = partition(table.columns, (col) => col.operation.isBucketed);
  const sharedArgs = {
    layerId: table.layerId,
    changeType: table.changeType,
    currentState,
    tableLabel: table.label,
    keptLayerIds,
    requestedSeriesType: seriesType,
    mainPalette,
    allowMixed,
    datasourceId,
    query,
  };

  const isEsql = datasourceId === LENS_DATASOURCE_ID.TEXT_BASED;
  // we have 2 different suggestion: with DSL we can split by only when we have a max of 2 buckets (one for the X and the other for the breakdown)
  // in ESQL we instead suggest split by with more then 1 buckets always.
  const whenToSuggestSplitBy = isEsql
    ? buckets.length >= 1
    : buckets.length === 1 || buckets.length === 2;
  if (whenToSuggestSplitBy) {
    const [xValue, ...splitBy] = getBucketMappings(table, isEsql, currentState);
    return getSuggestionsForLayer({
      ...sharedArgs,
      xValue,
      yValues: values,
      splitByColumns: splitBy,
    });
  } else if (buckets.length === 0) {
    const [yValues, [xValue, splitBy]] = partition(
      prioritizeColumns(values, isEsql),
      (col) => col.operation.dataType === 'number' && !col.operation.isBucketed
    );
    return getSuggestionsForLayer({
      ...sharedArgs,
      xValue,
      yValues,
      splitByColumns: splitBy ? [splitBy] : undefined,
    });
  }
}

function getBucketMappings(
  table: TableSuggestion,
  isEsql: boolean,
  currentState?: XYVisualizationState
) {
  const currentLayer =
    currentState &&
    getDataLayers(currentState.layers).find(({ layerId }) => layerId === table.layerId);

  const buckets = table.columns.filter((col) => col.operation.isBucketed);
  const prioritizedBuckets = prioritizeColumns(buckets, isEsql);

  if (!currentLayer || table.changeType === 'initial') {
    return prioritizedBuckets;
  }
  if (table.changeType === 'reorder') {
    return buckets;
  }

  // if existing table is just modified, try to map buckets to the current dimensions
  const currentXColumnIndex = prioritizedBuckets.findIndex(
    ({ columnId }) => columnId === currentLayer.xAccessor
  );
  const currentXScaleType =
    currentXColumnIndex > -1 && prioritizedBuckets[currentXColumnIndex].operation.scale;

  if (
    currentXScaleType &&
    // make sure histograms get mapped to x dimension even when changing current bucket/dimension mapping
    (currentXScaleType === 'interval' || prioritizedBuckets[0].operation.scale !== 'interval')
  ) {
    const [x] = prioritizedBuckets.splice(currentXColumnIndex, 1);
    prioritizedBuckets.unshift(x);
  }

  (currentLayer.splitAccessors ?? []).forEach((splitAccessor) => {
    const currentSplitColumnIndex = prioritizedBuckets.findIndex(
      ({ columnId }) => columnId === splitAccessor
    );
    if (currentSplitColumnIndex > -1) {
      const [splitBy] = prioritizedBuckets.splice(currentSplitColumnIndex, 1);
      prioritizedBuckets.push(splitBy);
    }
  });

  return prioritizedBuckets;
}

// This shuffles columns around so that the left-most column defualts to:
// date, string, boolean, then number, in that priority. We then use this
// order to pluck out the x column, and the split / stack columns.
// don't sort buckets in ESQL mode
function prioritizeColumns(columns: TableSuggestionColumn[], isEsql: boolean) {
  if (isEsql) {
    return columns;
  }
  return columns.toSorted(
    (a, b) => COLUMN_SORT_ORDER[a.operation.dataType] - COLUMN_SORT_ORDER[b.operation.dataType]
  );
}

function getSuggestionsForLayer({
  layerId,
  changeType,
  xValue,
  yValues,
  splitByColumns,
  currentState,
  tableLabel,
  keptLayerIds,
  requestedSeriesType,
  mainPalette,
  allowMixed,
  datasourceId,
  query,
}: {
  layerId: string;
  changeType: TableChangeType;
  xValue?: TableSuggestionColumn;
  yValues: TableSuggestionColumn[];
  splitByColumns?: TableSuggestionColumn[];
  currentState?: XYVisualizationState;
  tableLabel?: string;
  keptLayerIds: string[];
  requestedSeriesType?: SeriesType;
  mainPalette?: SuggestionRequest['mainPalette'];
  allowMixed?: boolean;
  datasourceId?: string;
  query?: SuggestionRequest['query'];
}):
  | VisualizationSuggestion<XYVisualizationState>
  | Array<VisualizationSuggestion<XYVisualizationState>> {
  const title = getSuggestionTitle(yValues, xValue, tableLabel);
  const seriesType: SeriesType =
    requestedSeriesType ||
    getPreferredSeriesTypeForTimeSeriesQuery(query, xValue) ||
    getSeriesType(currentState, layerId, xValue);

  const splitBy = splitByColumns && splitByColumns.length > 0 ? splitByColumns : undefined;

  const options = {
    currentState,
    seriesType,
    layerId,
    title,
    yValues,
    splitByColumns,
    changeType,
    xValue,
    keptLayerIds,
    // only use palette if there is a breakdown by dimension
    mainPalette: splitBy ? mainPalette : undefined,
    allowMixed,
  };

  if (
    changeType === 'initial' &&
    xValue?.operation.dataType === 'date' &&
    datasourceId === LENS_DATASOURCE_ID.FORM_BASED
  ) {
    return buildSuggestion({ ...options, seriesType: 'line' });
  }
  // handles the simplest cases, acting as a chart switcher
  if (!currentState && changeType === 'unchanged') {
    // For TS/PromQL time series, prefer line as the visible default; otherwise bar_stacked
    const preferredForSwitcher =
      getPreferredSeriesTypeForTimeSeriesQuery(query, xValue) ?? 'bar_stacked';
    return visualizationSubtypes
      .map((visType) => {
        return {
          ...buildSuggestion({
            ...options,
            seriesType: visType.id as SeriesType,
            // explicitly hide everything besides the preferred type (line for TS/PromQL, bar_stacked otherwise)
            hide: visType.id === preferredForSwitcher ? undefined : true,
          }),
          title: visType.label,
        };
      })
      .sort((a, b) => (a.state.preferredSeriesType === preferredForSwitcher ? -1 : 1));
  }

  const isSameState = currentState && changeType === 'unchanged';
  if (!isSameState) {
    return buildSuggestion(options);
  }

  // Suggestions are either changing the data, or changing the way the data is used
  const sameStateSuggestions: Array<VisualizationSuggestion<XYVisualizationState>> = [];

  // if current state is using the same data, suggest same chart with different presentational configuration
  if (seriesType.includes('bar') && (!xValue || xValue.operation.scale === 'ordinal')) {
    // flip between horizontal/vertical for ordinal scales
    sameStateSuggestions.push(
      buildSuggestion({
        ...options,
        title: i18n.translate('xpack.lens.xySuggestions.flipTitle', { defaultMessage: 'Flip' }),
        seriesType: flipSeriesType(seriesType),
      })
    );
  } else {
    // change chart type for interval or ratio scales on x axis
    const newSeriesType = altSeriesType(seriesType);
    sameStateSuggestions.push(
      buildSuggestion({
        ...options,
        seriesType: newSeriesType,
        title: seriesTypeLabels(newSeriesType),
      })
    );
  }

  if (seriesType !== 'line' && splitBy && !seriesType.includes('percentage')) {
    // flip between stacked/unstacked
    const suggestedSeriesType = toggleStackSeriesType(seriesType);
    sameStateSuggestions.push(
      buildSuggestion({
        ...options,
        seriesType: suggestedSeriesType,
        title: seriesTypeLabels(suggestedSeriesType),
      })
    );
  }

  if (
    seriesType !== 'line' &&
    seriesType.includes('stacked') &&
    !seriesType.includes('percentage')
  ) {
    const percentageOptions = { ...options };
    if (
      percentageOptions.xValue?.operation.scale === 'ordinal' &&
      !percentageOptions.splitByColumns
    ) {
      percentageOptions.splitByColumns = [percentageOptions.xValue];
      delete percentageOptions.xValue;
    }
    const suggestedSeriesType = asPercentageSeriesType(seriesType);
    // percentage suggestion
    sameStateSuggestions.push(
      buildSuggestion({
        ...options,
        // hide the suggestion if split by is missing
        hide: !percentageOptions.splitByColumns,
        seriesType: suggestedSeriesType,
        title: seriesTypeLabels(suggestedSeriesType),
      })
    );
  }

  // Combine all pre-built suggestions with hidden suggestions for remaining chart types
  return sameStateSuggestions.concat(
    visualizationSubtypes
      .filter((visType) => {
        return !sameStateSuggestions.find(
          (suggestion) => suggestion.state.preferredSeriesType === visType.id
        );
      })
      .map((visType) => {
        return {
          ...buildSuggestion({ ...options, seriesType: visType.id as SeriesType }),
          hide: true,
        };
      })
  );
}

function seriesTypeLabels(seriesType: SeriesType) {
  switch (seriesType) {
    case 'line':
      return i18n.translate('xpack.lens.xySuggestions.lineChartTitle', {
        defaultMessage: 'Line chart',
      });
    case 'area':
      return i18n.translate('xpack.lens.xySuggestions.areaChartTitle', {
        defaultMessage: 'Area chart',
      });
    case 'area_stacked':
      return i18n.translate('xpack.lens.xySuggestions.areaStackedChartTitle', {
        defaultMessage: 'Area stacked',
      });
    case 'area_percentage_stacked':
      return i18n.translate('xpack.lens.xySuggestions.areaPercentageStackedChartTitle', {
        defaultMessage: 'Area percentage',
      });
    case 'bar':
      return i18n.translate('xpack.lens.xySuggestions.verticalBarChartTitle', {
        defaultMessage: 'Bar vertical',
      });
    case 'bar_horizontal':
      return i18n.translate('xpack.lens.xySuggestions.horizontalBarChartTitle', {
        defaultMessage: 'Bar horizontal',
      });
    case 'bar_stacked':
      return i18n.translate('xpack.lens.xySuggestions.verticalBarStackedChartTitle', {
        defaultMessage: 'Bar vertical stacked',
      });
    case 'bar_horizontal_stacked':
      return i18n.translate('xpack.lens.xySuggestions.horizontalBarStackedChartTitle', {
        defaultMessage: 'Bar horizontal stacked',
      });
    case 'bar_percentage_stacked':
      return i18n.translate('xpack.lens.xySuggestions.verticalBarPercentageChartTitle', {
        defaultMessage: 'Bar percentage',
      });
    case 'bar_horizontal_percentage_stacked':
      return i18n.translate('xpack.lens.xySuggestions.horizontalBarPercentageChartTitle', {
        defaultMessage: 'Bar horizontal percentage',
      });
    default:
      return seriesType;
  }
}

function toggleStackSeriesType(oldSeriesType: SeriesType) {
  switch (oldSeriesType) {
    case 'area':
      return 'area_stacked';
    case 'area_stacked':
      return 'area';
    case 'bar':
      return 'bar_stacked';
    case 'bar_stacked':
      return 'bar';
    default:
      return oldSeriesType;
  }
}

function asPercentageSeriesType(oldSeriesType: SeriesType) {
  switch (oldSeriesType) {
    case 'area_stacked':
      return 'area_percentage_stacked';
    case 'bar_stacked':
      return 'bar_percentage_stacked';
    case 'bar_horizontal_stacked':
      return 'bar_horizontal_percentage_stacked';
    default:
      return oldSeriesType;
  }
}

function altSeriesType(oldSeriesType: SeriesType) {
  switch (oldSeriesType) {
    case 'area':
      return 'line';
    case 'area_stacked':
      return 'bar_stacked';
    case 'bar':
      return 'line';
    case 'bar_stacked':
      return 'area_stacked';
    case 'line':
      return 'area';
    default:
      return 'bar_stacked';
  }
}

function getSeriesType(
  currentState: XYVisualizationState | undefined,
  layerId: string,
  xValue?: TableSuggestionColumn
): SeriesType {
  const oldLayer = getExistingLayer(currentState, layerId);
  const oldLayerSeriesType = oldLayer && isDataLayer(oldLayer) ? oldLayer.seriesType : false;

  const firstSeriesTypeInDataLayer = currentState
    ? getDataLayers(currentState.layers)[0]?.seriesType
    : undefined;
  const closestSeriesType =
    oldLayerSeriesType ||
    firstSeriesTypeInDataLayer ||
    (currentState && currentState.preferredSeriesType) ||
    defaultSeriesType;

  // Attempt to keep the seriesType consistent on initial add of a layer
  // Ordinal scales should always use a bar because there is no interpolation between buckets
  if (xValue && xValue.operation.scale && xValue.operation.scale === 'ordinal') {
    return closestSeriesType.startsWith('bar') ? closestSeriesType : defaultSeriesType;
  }

  return closestSeriesType;
}

function getSuggestionTitle(
  yValues: TableSuggestionColumn[],
  xValue: TableSuggestionColumn | undefined,
  tableLabel: string | undefined
) {
  const yTitle = yValues
    .map((col) => col.operation.label)
    .join(
      i18n.translate('xpack.lens.xySuggestions.yAxixConjunctionSign', {
        defaultMessage: ' & ',
        description:
          'A character that can be used for conjunction of multiple enumarated items. Make sure to include spaces around it if needed.',
      })
    );
  const xTitle =
    xValue?.operation.label ||
    i18n.translate('xpack.lens.xySuggestions.emptyAxisTitle', {
      defaultMessage: '(empty)',
    });
  const title =
    tableLabel ||
    (xValue?.operation.dataType === 'date'
      ? i18n.translate('xpack.lens.xySuggestions.dateSuggestion', {
          defaultMessage: '{yTitle} over {xTitle}',
          description:
            'Chart description for charts over time, like "Transfered bytes over log.timestamp"',
          values: { xTitle, yTitle },
        })
      : i18n.translate('xpack.lens.xySuggestions.nonDateSuggestion', {
          defaultMessage: '{yTitle} of {xTitle}',
          description:
            'Chart description for a value of some groups, like "Top URLs of top 5 countries"',
          values: { xTitle, yTitle },
        }));
  return title;
}

function buildSuggestion({
  currentState,
  seriesType,
  layerId,
  title,
  yValues,
  splitByColumns,
  changeType,
  xValue,
  keptLayerIds,
  hide,
  mainPalette,
  allowMixed,
}: {
  currentState: XYVisualizationState | undefined;
  seriesType: SeriesType;
  title: string;
  yValues: TableSuggestionColumn[];
  xValue?: TableSuggestionColumn;
  splitByColumns?: TableSuggestionColumn[];
  layerId: string;
  changeType: TableChangeType;
  keptLayerIds: string[];
  hide?: boolean;
  mainPalette?: SuggestionRequest['mainPalette'];
  allowMixed?: boolean;
}) {
  let splitBy = splitByColumns && splitByColumns.length > 0 ? splitByColumns : undefined;

  if (seriesType.includes('percentage') && xValue?.operation.scale === 'ordinal' && !splitBy) {
    splitBy = [xValue];
    xValue = undefined;
  }
  const existingLayer = getExistingLayer(currentState, layerId) || null;
  const accessors = yValues.map((col) => col.columnId);
  const newLayer: XYDataLayerConfig = {
    ...(existingLayer || {}),
    palette:
      mainPalette?.type === 'legacyPalette'
        ? mainPalette.value
        : existingLayer && 'palette' in existingLayer
        ? (existingLayer as XYDataLayerConfig).palette
        : undefined,
    layerId,
    seriesType,
    xAccessor: xValue?.columnId,
    splitAccessors: splitBy?.map((s) => s.columnId),
    accessors,
    yConfig:
      existingLayer && 'yConfig' in existingLayer && existingLayer.yConfig
        ? existingLayer.yConfig.filter(({ forAccessor }) => accessors.indexOf(forAccessor) !== -1)
        : undefined,
    layerType: LayerTypes.DATA,
    colorMapping: !mainPalette
      ? getColorMappingDefaults({ defaultPaletteId: getDefaultPalette(seriesType) })
      : mainPalette?.type === 'colorMapping'
      ? mainPalette.value
      : undefined,
  };

  const hasDateHistogramDomain = isDateHistogramOperation(xValue?.operation);

  // Maintain consistent order for any layers that were saved
  const keptLayers: XYLayerConfig[] = currentState
    ? currentState.layers
        // Remove layers that aren't being suggested
        .filter(
          (layer) =>
            keptLayerIds.includes(layer.layerId) ||
            (hasDateHistogramDomain && layer.layerType === LayerTypes.ANNOTATIONS)
        )
        // Update in place
        .map((layer) => (layer.layerId === layerId ? newLayer : layer))
        // Replace the seriesType on all previous layers
        .map((layer) =>
          allowMixed
            ? layer
            : {
                ...layer,
                seriesType,
              }
        )
    : [];

  const state: XYVisualizationState = {
    legend: currentState ? currentState.legend : { isVisible: true, position: Position.Right },
    valueLabels: currentState?.valueLabels || 'hide',
    fittingFunction: currentState?.fittingFunction ?? FittingFunctions.LINEAR,
    curveType: currentState?.curveType,
    fillOpacity: currentState?.fillOpacity,
    areaFill: currentState?.areaFill,
    pointVisibility: currentState?.pointVisibility,
    xTitle: currentState?.xTitle,
    yTitle: currentState?.yTitle,
    yRightTitle: currentState?.yRightTitle,
    hideEndzones: currentState?.hideEndzones,
    showCurrentTimeMarker: currentState?.showCurrentTimeMarker,
    yLeftExtent: currentState?.yLeftExtent,
    yRightExtent: currentState?.yRightExtent,
    yLeftScale: currentState?.yLeftScale,
    yRightScale: currentState?.yRightScale,
    axisTitlesVisibilitySettings: currentState?.axisTitlesVisibilitySettings || {
      // Default X axis title to "None" for date histogram to reduce redundant information
      x: !hasDateHistogramDomain,
      yLeft: true,
      yRight: true,
    },
    tickLabelsVisibilitySettings: currentState?.tickLabelsVisibilitySettings || {
      x: true,
      yLeft: true,
      yRight: true,
    },
    labelsOrientation: currentState?.labelsOrientation || {
      x: 0,
      yLeft: 0,
      yRight: 0,
    },
    gridlinesVisibilitySettings: currentState?.gridlinesVisibilitySettings || {
      x: true,
      yLeft: true,
      yRight: true,
    },
    preferredSeriesType: seriesType,
    layers:
      existingLayer && Object.keys(existingLayer).length ? keptLayers : [...keptLayers, newLayer],
  };

  const isIncomplete = yValues.length === 0;

  return {
    title,
    score: getScore(yValues, splitBy, changeType),
    hide:
      hide ??
      // Only advertise very clear changes when XY chart is not active
      ((!currentState && changeType !== 'unchanged' && changeType !== 'extended') ||
        // Don't advertise removing dimensions
        (currentState && changeType === 'reduced') ||
        // Don't advertise charts without y axis
        isIncomplete ||
        // Don't advertise charts without at least one split
        (!xValue && !splitBy)),
    state: applyChartDefaultsIfNeeded(state),
    incomplete: isIncomplete,
    previewIcon: getIconForSeries(seriesType),
  };
}

function getScore(
  yValues: TableSuggestionColumn[],
  splitBy: TableSuggestionColumn[] | undefined,
  changeType: TableChangeType
) {
  // Unchanged table suggestions half the score because the underlying data doesn't change
  const changeFactor =
    changeType === 'reduced' || changeType === 'layers'
      ? 0.3
      : changeType === 'unchanged'
      ? 0.5
      : 1;
  // chart with multiple y values and split series will have a score of 1, single y value and no split series reduce score
  return (((yValues.length > 1 ? 3 : 2) + (splitBy ? 1 : 0)) / 4) * changeFactor;
}

function getExistingLayer(currentState: XYVisualizationState | undefined, layerId: string) {
  return currentState && currentState.layers.find((layer) => layer.layerId === layerId);
}
