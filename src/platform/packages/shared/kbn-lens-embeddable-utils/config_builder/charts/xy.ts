/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/public';
import type { QueryPointEventAnnotationConfig } from '@kbn/event-annotation-common';
import type {
  FormBasedPersistedState,
  PersistedIndexPatternLayer,
  TextBasedLayerColumn,
  XYByValueAnnotationLayerConfig,
  XYDataLayerConfig,
  XYReferenceLineLayerConfig,
  XYVisualizationState,
} from '@kbn/lens-common';
import { getBreakdownColumn, getFormulaColumn, getValueColumn } from '../columns';
import { DEFAULT_AREAS_FILL } from '../transforms/charts/xy/defaults';
import { addLayerColumn, buildDatasourceStates, extractReferences, mapToFormula } from '../utils';
import type {
  BuildDependencies,
  LensAttributes,
  LensBreakdownConfig,
  LensReferenceLineLayer,
  LensSeriesLayer,
  LensXYConfig,
} from '../types';

const ACCESSOR = 'metric_formula_accessor';

function normalizeBreakdown(
  breakdown: LensBreakdownConfig | LensBreakdownConfig[] | undefined
): LensBreakdownConfig[] {
  return breakdown ? (Array.isArray(breakdown) ? breakdown : [breakdown]) : [];
}

function buildVisualizationState(config: LensXYConfig): XYVisualizationState {
  const hasAreaSeries = config.layers.some(
    (layer) => layer.type === 'series' && layer.seriesType === 'area'
  );
  return {
    axisTitlesVisibilitySettings: {
      x: config.axisTitleVisibility?.showXAxisTitle ?? true,
      yLeft: config.axisTitleVisibility?.showYAxisTitle ?? true,
      yRight: config.axisTitleVisibility?.showYRightAxisTitle ?? true,
    },
    ...(config.xTitle !== undefined ? { xTitle: config.xTitle } : {}),
    ...(config.yTitle !== undefined ? { yTitle: config.yTitle } : {}),
    legend: {
      isVisible: config.legend?.show ?? true,
      position: config.legend?.position ?? 'left',
      ...(config.legend?.legendStats ? { legendStats: config.legend.legendStats } : {}),
    },
    hideEndzones: true,
    preferredSeriesType: 'line',
    valueLabels: config.valueLabels ?? 'hide',
    emphasizeFitting: config?.emphasizeFitting ?? true,
    fittingFunction: config?.fittingFunction ?? 'Linear',
    ...(config.areaFill || hasAreaSeries
      ? { areaFill: config.areaFill ?? DEFAULT_AREAS_FILL }
      : {}),
    yLeftExtent: {
      mode: config.yBounds?.mode ?? 'full',
      lowerBound: config.yBounds?.lowerBound,
      upperBound: config.yBounds?.upperBound,
    },
    tickLabelsVisibilitySettings: {
      x: true,
      yLeft: true,
      yRight: true,
    },
    labelsOrientation: {
      x: 0,
      yLeft: 0,
      yRight: 0,
    },
    gridlinesVisibilitySettings: {
      x: true,
      yLeft: true,
      yRight: true,
    },
    layers: config.layers.map((layer, i) => {
      switch (layer.type) {
        case 'annotation':
          return {
            layerId: `layer_${i}`,
            layerType: 'annotations',
            annotations: layer.events.map((e, eventNr) => {
              if ('datetime' in e) {
                return {
                  type: 'manual',
                  id: `annotation_${eventNr}`,
                  icon: e.icon || 'triangle',
                  color: e.color || 'blue',
                  label: e.name,
                  key: {
                    type: 'point_in_time',
                    timestamp: e.datetime,
                  },
                };
              } else {
                return {
                  id: `event${eventNr}`,
                  type: 'query',
                  icon: e.icon || 'triangle',
                  color: e.color || 'blue',
                  label: e.name,
                  key: {
                    type: 'point_in_time',
                  },
                  filter: {
                    type: 'kibana_query',
                    query: e.filter,
                    language: 'kuery',
                  },
                  ...(e.field ? { timeField: e.field } : {}),
                } as QueryPointEventAnnotationConfig;
              }
            }),
            ignoreGlobalFilters: true,
          } as XYByValueAnnotationLayerConfig;
        case 'reference':
          return {
            layerId: `layer_${i}`,
            layerType: 'referenceLine',
            accessors: layer.yAxis.map((_, index) => `${ACCESSOR}${i}_${index}`),
            yConfig: layer.yAxis.map((yAxis, index) => ({
              forAccessor: `${ACCESSOR}${i}_${index}`,
              axisMode: 'left',
              color: yAxis.seriesColor,
              ...(yAxis.fill ? { fill: yAxis.fill } : {}),
              ...(yAxis.lineThickness ? { lineWidth: yAxis.lineThickness } : {}),
            })),
          } satisfies XYReferenceLineLayerConfig;
        case 'series': {
          const layerBreakdown = normalizeBreakdown(layer.breakdown);
          return {
            layerId: `layer_${i}`,
            layerType: 'data',
            xAccessor: `x_${ACCESSOR}${i}`,
            ...(layerBreakdown.length > 0
              ? {
                  splitAccessors: layerBreakdown.map(
                    (_, breakdownIndex) => `${ACCESSOR}${i}_breakdown_${breakdownIndex}`
                  ),
                }
              : {}),
            accessors: layer.yAxis.map((_, index) => `${ACCESSOR}${i}_${index}`),
            seriesType: layer.seriesType || 'line',
            yConfig: layer.yAxis.map((yAxis, index) => ({
              forAccessor: `${ACCESSOR}${i}_${index}`,
              color: yAxis.seriesColor,
            })),
          } as XYDataLayerConfig;
        }
      }
    }),
  };
}

function hasFormatParams(yAxis: LensSeriesLayer['yAxis'][number]) {
  return (
    yAxis.format &&
    (yAxis.suffix || yAxis.compactValues || yAxis.decimals || yAxis.fromUnit || yAxis.toUnit)
  );
}

function getValueColumns(layer: LensSeriesLayer, i: number) {
  const layerBreakdown = normalizeBreakdown(layer.breakdown);

  // For ES|QL queries, breakdown must be field names (strings)
  if (layerBreakdown.some((bd) => typeof bd !== 'string')) {
    throw new Error('`breakdown` must be a field name when not using index source');
  }

  return [
    ...layerBreakdown.map((bd, breakdownIndex) =>
      getValueColumn(`${ACCESSOR}${i}_breakdown_${breakdownIndex}`, bd as string)
    ),
    ...getXValueColumn(layer.xAxis, i),
    ...layer.yAxis.map((yAxis, index) => {
      const params = hasFormatParams(yAxis)
        ? {
            id: yAxis.format as string,
            params: {
              compact: yAxis.compactValues,
              decimals: yAxis.decimals ?? 0,
              suffix: yAxis.suffix,
              fromUnit: yAxis.fromUnit,
              toUnit: yAxis.toUnit,
            },
          }
        : undefined;

      return getValueColumn(`${ACCESSOR}${i}_${index}`, yAxis.value, 'number', params);
    }),
  ];
}

function getXValueColumn(
  xConfig: LensBreakdownConfig | undefined,
  index: number
): TextBasedLayerColumn[] {
  if (!xConfig) {
    return [];
  }
  const accessor = `x_${ACCESSOR}${index}`;
  if (typeof xConfig === 'string') {
    return [getValueColumn(accessor, xConfig)];
  }

  switch (xConfig.type) {
    case 'dateHistogram':
      return [getValueColumn(accessor, xConfig.field, 'date')];
    case 'intervals':
      return [getValueColumn(accessor, xConfig.field, 'number')];
    case 'topValues':
      return [getValueColumn(accessor, xConfig.field)];
    case 'filters':
      throw new Error('Not implemented yet');
  }
}

function buildAllFormulasInLayer(
  layer: LensSeriesLayer | LensReferenceLineLayer,
  i: number,
  dataView: DataView
): PersistedIndexPatternLayer {
  return layer.yAxis.reduce((acc, curr, valueIndex) => {
    const formulaColumn = getFormulaColumn(
      `${ACCESSOR}${i}_${valueIndex}`,
      mapToFormula(curr),
      dataView,
      valueIndex > 0 ? acc : undefined
    );
    return { ...acc, ...formulaColumn };
  }, {} as PersistedIndexPatternLayer);
}

function buildFormulaLayer(
  layer: LensSeriesLayer | LensReferenceLineLayer,
  i: number,
  dataView: DataView
): FormBasedPersistedState['layers'][0] {
  if (layer.type === 'reference') {
    return buildAllFormulasInLayer(layer, i, dataView);
  }

  // layer.type === 'series'
  const resultLayer = buildAllFormulasInLayer(layer, i, dataView);

  if (layer.xAxis) {
    const columnName = `x_${ACCESSOR}${i}`;
    const breakdownColumn = getBreakdownColumn({
      options: layer.xAxis,
      dataView,
    });
    addLayerColumn(resultLayer, columnName, breakdownColumn, true);
  }

  const layerBreakdown = normalizeBreakdown(layer.breakdown);
  layerBreakdown.forEach((breakdown, breakdownIndex) => {
    const columnName = `${ACCESSOR}${i}_breakdown_${breakdownIndex}`;
    const breakdownColumn = getBreakdownColumn({
      options: breakdown,
      dataView,
    });
    addLayerColumn(resultLayer, columnName, breakdownColumn, true);
  });

  return resultLayer;
}

export async function buildXY(
  config: LensXYConfig,
  { dataViewsAPI }: BuildDependencies
): Promise<LensAttributes> {
  const dataviews: Record<string, DataView> = {};
  const _buildFormulaLayer = (cfg: any, i: number, dataView: DataView) =>
    buildFormulaLayer(cfg, i, dataView);
  const datasourceStates = await buildDatasourceStates(
    config,
    dataviews,
    _buildFormulaLayer,
    getValueColumns,
    dataViewsAPI
  );
  const { references, internalReferences, adHocDataViews } = extractReferences(dataviews);

  const visualization = buildVisualizationState(config);

  return {
    title: config.title,
    description: config.description,
    visualizationType: 'lnsXY',
    references,
    state: {
      datasourceStates,
      internalReferences,
      filters: [],
      query: { language: 'kuery', query: '' },
      visualization,
      adHocDataViews,
    },
  };
}
