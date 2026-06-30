/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChartType } from '@kbn/visualization-utils';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';

export interface VisualizationDimensions {
  height: number;
  /**
   * Recommended container width for the visualization wrapper.
   */
  width?: number;
}

export const DEFAULT_VISUALIZATION_HEIGHT = 240;

const METRIC_DIMENSIONS: VisualizationDimensions = {
  height: 170,
  width: 470,
};

const DATATABLE_DIMENSIONS: VisualizationDimensions = {
  height: 350,
  width: 768,
};

const HORIZONTAL_BULLET_GAUGE_DIMENSIONS: VisualizationDimensions = {
  height: 110,
  width: 768,
};

const VERTICAL_BULLET_GAUGE_DIMENSIONS: VisualizationDimensions = {
  height: 470,
  width: 260,
};

const ARC_GAUGE_DIMENSIONS: VisualizationDimensions = {
  height: 360,
  width: 480,
};

type GaugeShape =
  | { type: 'bullet'; orientation?: 'horizontal' | 'vertical' }
  | { type: 'arc' | 'circle' | 'semi_circle' };

const getGaugeDimensions = (shape: GaugeShape | undefined): VisualizationDimensions => {
  // Missing shape falls back to horizontal bullet dimensions.
  if (!shape) {
    return HORIZONTAL_BULLET_GAUGE_DIMENSIONS;
  }

  // Arc-like gauges use shared arc dimensions.
  if (shape.type !== 'bullet') {
    return ARC_GAUGE_DIMENSIONS;
  }

  return shape.orientation === 'vertical'
    ? VERTICAL_BULLET_GAUGE_DIMENSIONS
    : HORIZONTAL_BULLET_GAUGE_DIMENSIONS;
};

/**
 * Derives visualization dimensions from a raw lens config object.
 * Used by VisualizeLens where the full config (including gauge shape) is available.
 */
export const getVisualizationDimensionsFromLensConfig = (
  lensConfig: Record<string, unknown>
): VisualizationDimensions => {
  const chartType = lensConfig.type as string | undefined;

  switch (chartType) {
    case SupportedChartType.Metric:
      return METRIC_DIMENSIONS;

    case SupportedChartType.Datatable:
    case 'data_table':
      return DATATABLE_DIMENSIONS;

    case SupportedChartType.Gauge: {
      const styling = lensConfig.styling as { shape?: GaugeShape } | undefined;
      return getGaugeDimensions(styling?.shape);
    }

    default:
      return { height: DEFAULT_VISUALIZATION_HEIGHT };
  }
};

/**
 * Derives visualization dimensions from a ChartType enum value.
 * Used by VisualizeESQL where only the preferred chart type is known
 * (gauge subtype is unavailable, so arc dimensions are used as the default).
 */
export const getVisualizationDimensionsFromChartType = (
  chartType?: ChartType
): VisualizationDimensions => {
  switch (chartType) {
    case ChartType.Metric:
      return METRIC_DIMENSIONS;

    case ChartType.Table:
      return DATATABLE_DIMENSIONS;

    case ChartType.Gauge:
      return ARC_GAUGE_DIMENSIONS; // gauge subtype unknown at this point

    default:
      return { height: DEFAULT_VISUALIZATION_HEIGHT };
  }
};
