/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AreaFillOptions, type AreaFillOption } from '@kbn/expression-xy-plugin/common';
import { KbnPalette } from '@kbn/palettes';
import type { SeriesType, XYDataLayerConfig, XYLayerConfig, XYVisualizationState } from './types';
import { hasAreaSeries, isLineSeries } from './state_helpers';
import { isDataLayer } from './visualization_helpers';

export const DEFAULT_AREA_FILL: AreaFillOption = AreaFillOptions.GRADIENT;

/**
 * Applies explicit default values that a chart might need persisted.
 */
export const applyChartDefaultsIfNeeded = (state: XYVisualizationState): XYVisualizationState => {
  return {
    ...state,
    // Area charts used to only have a solid fill, to keep appearance of existing charts we added runtime state converter that
    // resolves undefined areaFill values to solid. To ensure that new charts preserve the new gradient default, we need to write it explicitly.
    ...(hasAreaSeries(state.layers) && state.areaFill === undefined
      ? { areaFill: DEFAULT_AREA_FILL }
      : {}),
  };
};

/**
 * Applies series-type-specific defaults to a layer after a type switch.
 */
export const applySeriesDefaultsIfNeeded = (
  layer: XYLayerConfig,
  fromSeriesType: SeriesType,
  toSeriesType: SeriesType
): XYLayerConfig => {
  const updated = { ...layer, seriesType: toSeriesType };
  if (isDataLayer(layer) && isDataLayer(updated) && updated.colorMapping) {
    return {
      ...updated,
      colorMapping: resolveDefaultPaletteForSeriesType(
        updated.colorMapping,
        fromSeriesType,
        toSeriesType
      ),
    };
  }
  return updated;
};

/**
 * Resolves the default palette when switching between series types.
 * Uses direction-specific matching so that user-chosen palettes are preserved:
 *  - Switching TO line: only replaces 'default' with 'elastic_line_optimized'
 *  - Switching FROM line: only replaces 'elastic_line_optimized' with 'default'
 */
const resolveDefaultPaletteForSeriesType = (
  colorMapping: NonNullable<XYDataLayerConfig['colorMapping']>,
  fromSeriesType: SeriesType,
  toSeriesType: SeriesType
): NonNullable<XYDataLayerConfig['colorMapping']> => {
  if (isLineSeries(fromSeriesType) === isLineSeries(toSeriesType)) {
    return colorMapping;
  }

  if (isLineSeries(toSeriesType) && colorMapping.paletteId === KbnPalette.Default) {
    return { ...colorMapping, paletteId: KbnPalette.ElasticLineOptimized };
  }
  if (isLineSeries(fromSeriesType) && colorMapping.paletteId === KbnPalette.ElasticLineOptimized) {
    return { ...colorMapping, paletteId: KbnPalette.Default };
  }

  return colorMapping;
};
