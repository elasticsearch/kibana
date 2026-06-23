/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { partition } from 'lodash';
import { Position } from '@elastic/charts';
import { i18n } from '@kbn/i18n';
import { IconChartHeatmap } from '@kbn/chart-icons';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type { Visualization } from '@kbn/lens-common';
import type { HeatmapVisualizationState } from './types';
import { CHART_SHAPES, HEATMAP_GRID_FUNCTION, LEGEND_FUNCTION } from './constants';

export const getSuggestions: Visualization<HeatmapVisualizationState>['getSuggestions'] = ({
  table,
  state,
  keptLayerIds,
}) => {
  if (
    (state?.shape === CHART_SHAPES.HEATMAP &&
      (state.xAccessor || state.yAccessor || state.valueAccessor) &&
      table.changeType !== 'extended') ||
    table.columns.some((col) => col.operation.isStaticValue) ||
    // do not use suggestions with non-numeric metrics
    table.columns.some((col) => !col.operation.isBucketed && col.operation.dataType !== 'number')
  ) {
    return [];
  }

  const isUnchanged = state && table.changeType === 'unchanged';

  if (
    isUnchanged ||
    keptLayerIds.length > 1 ||
    (keptLayerIds.length && table.layerId !== keptLayerIds[0])
  ) {
    return [];
  }

  /**
   * The score gets increased based on the config completion.
   */
  let score = 0;

  const [groups, metrics] = partition(table.columns, (col) => col.operation.isBucketed);

  if (groups.length === 0 && metrics.length === 0) {
    return [];
  }

  if (groups.length >= 3) {
    return [];
  }

  if (metrics.length > 1) {
    return [];
  }

  const isSingleBucketDimension = groups.length === 1 && metrics.length === 0;
  const isOnlyMetricDimension = groups.length === 0 && metrics.length === 1;
  const isOnlyBucketDimension = groups.length > 0 && metrics.length === 0;

  /**
   * Hide for:
   * - reduced and reorder tables
   * - tables with just a single bucket dimension
   * - tables with only date histogram
   */
  const hasOnlyDatehistogramBuckets =
    metrics.length === 1 &&
    groups.length > 0 &&
    groups.every((group) => group.operation.dataType === 'date');
  const hide =
    table.changeType === 'reduced' ||
    table.changeType === 'reorder' ||
    isSingleBucketDimension ||
    hasOnlyDatehistogramBuckets ||
    isOnlyBucketDimension ||
    isOnlyMetricDimension;

  const newState: HeatmapVisualizationState = {
    shape: CHART_SHAPES.HEATMAP,
    layerId: table.layerId,
    layerType: LayerTypes.DATA,
    legend: {
      isVisible: state?.legend?.isVisible ?? true,
      position: state?.legend?.position ?? Position.Right,
      type: LEGEND_FUNCTION,
    },
    gridConfig: {
      type: HEATMAP_GRID_FUNCTION,
      isCellLabelVisible: false,
      isYAxisLabelVisible: state?.gridConfig?.isYAxisLabelVisible ?? true,
      isXAxisLabelVisible: state?.gridConfig?.isXAxisLabelVisible ?? true,
      isYAxisTitleVisible: state?.gridConfig?.isYAxisTitleVisible ?? false,
      isXAxisTitleVisible: state?.gridConfig?.isXAxisTitleVisible ?? false,
    },
  };

  const numberMetric = metrics.find((m) => m.operation.dataType === 'number');

  if (numberMetric) {
    score += 0.3;
    newState.valueAccessor = numberMetric.columnId;
  }

  const [histogram, ordinal] = partition(groups, (g) => g.operation.scale === 'interval');

  newState.xAccessor = histogram[0]?.columnId || ordinal[0]?.columnId;
  newState.yAccessor = groups.find((g) => g.columnId !== newState.xAccessor)?.columnId;

  const yColumn = groups.find((g) => g.columnId === newState.yAccessor);
  if (yColumn && yColumn.operation.dataType === 'number') {
    newState.gridConfig = {
      ...newState.gridConfig,
      ySortPredicate: 'desc',
    };
  }

  const hasDatehistogram = groups.some((group) => group.operation.dataType === 'date');

  if (!hasDatehistogram) {
    if (newState.xAccessor) {
      score += 0.3;
    }
    if (newState.yAccessor) {
      score += 0.3;
    }
  }

  return [
    {
      state: newState,
      title: i18n.translate('xpack.lens.heatmap.heatmapLabel', {
        defaultMessage: 'Heat map',
      }),
      hide,
      previewIcon: IconChartHeatmap,
      score: Number(score.toFixed(1)),
      incomplete: isSingleBucketDimension || isOnlyMetricDimension || isOnlyBucketDimension,
    },
  ];
};
