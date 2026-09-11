/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Ast } from '@kbn/interpreter';
import { Position, ScaleType } from '@elastic/charts';
import { type PaletteRegistry } from '@kbn/coloring';
import type { ExpressionFunctionTheme } from '@kbn/expressions-plugin/common';
import { buildExpression, buildExpressionFunction } from '@kbn/expressions-plugin/common';
import type { EventAnnotationServiceType } from '@kbn/event-annotation-plugin/public';
import {
  isManualPointAnnotationConfig,
  isRangeAnnotationConfig,
} from '@kbn/event-annotation-common';
import { LegendSize } from '@kbn/chart-expressions-common';
import type {
  AvailableReferenceLineIcon,
  DataDecorationConfigFn,
  EventAnnotationResultFn,
  ExtendedAnnotationLayerFn,
  ExtendedDataLayerFn,
  LayeredXyVisFn,
  LegendConfigFn,
  PointsLayerFn,
  ReferenceLineDecorationConfigFn,
  ReferenceLineLayerFn,
  SeriesType,
  XAxisConfigFn,
  XScaleType,
  XYCurveType,
  YAxisConfigFn,
} from '@kbn/expression-xy-plugin/common';

import {
  AreaFillOptions,
  LayerTypes,
  FittingFunctions,
  PointVisibilityOptions,
} from '@kbn/expression-xy-plugin/public';
import type { EventAnnotationConfig } from '@kbn/event-annotation-common';
import type { SystemPaletteExpressionFunctionDefinition } from '@kbn/charts-plugin/common';
import type { OperationMetadata, DatasourcePublicAPI, DatasourceLayers } from '@kbn/lens-common';
import type {
  XYVisualizationState,
  YConfig,
  XYDataLayerConfig,
  XYPointsLayerConfig,
  XYReferenceLineLayerConfig,
  XYAnnotationLayerConfig,
  AxisConfig,
  ValidXYDataLayerConfig,
  XYLayerConfig,
} from './types';
import { getColumnToLabelMap } from './state_helpers';
import { getDefaultPalette } from './default_palette';
import { defaultReferenceLineColor } from './color_assignment';
import { getDefaultVisualValuesForLayer } from '../../shared_components/datasource_default_values';
import {
  getLayerTypeOptions,
  getDataLayers,
  getReferenceLayers,
  getAnnotationsLayers,
  getPointsLayers,
  isTimeChart,
} from './visualization_helpers';
import { getUniqueLabels } from './annotations/helpers';
import {
  axisExtentConfigToExpression,
  hasNumericHistogramDimension,
} from '../../shared_components';
import type { CollapseExpressionFunction } from '../../../common/expressions';
import { hasIcon } from './xy_config_panel/shared/marker_decoration_settings';
import { getColorMappingDefaults } from '../../utils';

type XYLayerConfigWithSimpleView = XYLayerConfig & { simpleView?: boolean };
type XYAnnotationLayerConfigWithSimpleView = XYAnnotationLayerConfig & { simpleView?: boolean };
type State = Omit<XYVisualizationState, 'layers'> & { layers: XYLayerConfigWithSimpleView[] };

export const getSortedAccessors = (
  datasource: DatasourcePublicAPI | undefined,
  layer: XYDataLayerConfig | XYReferenceLineLayerConfig
) => {
  const originalOrder = datasource
    ? datasource
        .getTableSpec()
        .map(({ columnId }: { columnId: string }) => columnId)
        .filter((columnId: string) => layer.accessors.includes(columnId))
    : layer.accessors;
  // When we add a column it could be empty, and therefore have no order
  return Array.from(new Set(originalOrder.concat(layer.accessors)));
};

export const toExpression = (
  state: State,
  datasourceLayers: DatasourceLayers,
  paletteService: PaletteRegistry,
  datasourceExpressionsByLayers: Record<string, Ast>,
  eventAnnotationService: EventAnnotationServiceType
): Ast | null => {
  if (!state || !state.layers.length) {
    return null;
  }

  const metadata: Record<string, Record<string, OperationMetadata | null>> = {};
  state.layers.forEach((layer) => {
    metadata[layer.layerId] = {};
    const datasource = datasourceLayers[layer.layerId];
    if (datasource) {
      datasource.getTableSpec().forEach((column) => {
        const operation =
          datasourceLayers[layer.layerId]?.getOperationForColumnId(column.columnId) ?? null;
        metadata[layer.layerId][column.columnId] = operation;
      });
    }
  });

  return buildXYExpression(
    state,
    metadata,
    datasourceLayers,
    paletteService,
    datasourceExpressionsByLayers,
    eventAnnotationService
  );
};

const simplifiedLayerExpression = {
  [LayerTypes.DATA]: (layer: XYDataLayerConfig) => ({ ...layer, simpleView: true }),
  [LayerTypes.REFERENCELINE]: (layer: XYReferenceLineLayerConfig) => ({
    ...layer,
    simpleView: true,
    yConfig: layer.yConfig?.map(({ ...rest }) => ({
      ...rest,
      lineWidth: 1,
      icon: undefined,
      textVisibility: false,
    })),
  }),
  [LayerTypes.ANNOTATIONS]: (layer: XYAnnotationLayerConfig) => ({
    ...layer,
    simpleView: true,
  }),
};

export function toPreviewExpression(
  state: State,
  datasourceLayers: DatasourceLayers,
  paletteService: PaletteRegistry,
  datasourceExpressionsByLayers: Record<string, Ast>,
  eventAnnotationService: EventAnnotationServiceType
) {
  return toExpression(
    {
      ...state,
      layers: state.layers.map((layer) => getLayerTypeOptions(layer, simplifiedLayerExpression)),
      // hide legend for preview
      legend: {
        ...state.legend,
        isVisible: false,
      },
      valueLabels: 'hide',
    },
    datasourceLayers,
    paletteService,
    datasourceExpressionsByLayers,
    eventAnnotationService
  );
}

export function getScaleType(metadata: OperationMetadata | null, defaultScale: ScaleType) {
  if (!metadata) {
    return defaultScale;
  }

  // use scale information if available
  if (metadata.scale === 'ordinal') {
    return ScaleType.Ordinal;
  }
  if (metadata.scale === 'interval' || metadata.scale === 'ratio') {
    return metadata.dataType === 'date' ? ScaleType.Time : ScaleType.Linear;
  }

  // fall back to data type if necessary
  switch (metadata.dataType) {
    case 'boolean':
    case 'string':
    case 'ip':
      return ScaleType.Ordinal;
    case 'date':
      return ScaleType.Time;
    default:
      return ScaleType.Linear;
  }
}

export const buildXYExpression = (
  state: State,
  metadata: Record<string, Record<string, OperationMetadata | null>>,
  datasourceLayers: DatasourceLayers,
  paletteService: PaletteRegistry,
  datasourceExpressionsByLayers: Record<string, Ast>,
  eventAnnotationService: EventAnnotationServiceType
): Ast | null => {
  const validDataLayers: ValidXYDataLayerConfig[] = getDataLayers(state.layers)
    .filter<ValidXYDataLayerConfig>((layer): layer is ValidXYDataLayerConfig =>
      Boolean(layer.accessors.length)
    )
    .map((layer) => ({
      ...layer,
      accessors: getSortedAccessors(datasourceLayers[layer.layerId], layer),
    }));

  // sorting doesn't change anything so we don't sort reference layers (TODO: should we make it work?)
  const validReferenceLayers = getReferenceLayers(state.layers).filter((layer) =>
    Boolean(layer.accessors.length)
  );

  const validPointsLayers = getPointsLayers(state.layers).filter(
    (layer): layer is XYPointsLayerConfig => Boolean(layer.query && layer.yAccessor)
  );

  const uniqueLabels = getUniqueLabels(state.layers);
  const validAnnotationsLayers = getAnnotationsLayers(state.layers)
    .filter((layer) => Boolean(layer.annotations.length))
    .map((layer) => {
      return {
        ...layer,
        ignoreGlobalFilters: layer.ignoreGlobalFilters,
        annotations: layer.annotations.map((c) => ({
          ...c,
          label: uniqueLabels[c.id],
        })),
      };
    });

  if (!validDataLayers.length) {
    return null;
  }

  const isLeftAxis = validDataLayers.some(({ yConfig }) =>
    yConfig?.some((config) => config.axisMode === Position.Left)
  );
  const isRightAxis = validDataLayers.some(({ yConfig }) =>
    yConfig?.some((config) => config.axisMode === Position.Right)
  );

  const yAxisConfigs: AxisConfig[] = [
    {
      position: Position.Left,
      extent: state?.yLeftExtent,
      showTitle: state?.axisTitlesVisibilitySettings?.yLeft ?? true,
      title: state.yTitle || '',
      showLabels: state?.tickLabelsVisibilitySettings?.yLeft ?? true,
      showGridLines: state?.gridlinesVisibilitySettings?.yLeft ?? true,
      labelsOrientation: state?.labelsOrientation?.yLeft ?? 0,
      scaleType: state.yLeftScale || 'linear',
    },
    {
      position: Position.Right,
      extent: state?.yRightExtent,
      showTitle: state?.axisTitlesVisibilitySettings?.yRight ?? true,
      title: state.yRightTitle || '',
      showLabels: state?.tickLabelsVisibilitySettings?.yRight ?? true,
      showGridLines: state?.gridlinesVisibilitySettings?.yRight ?? true,
      labelsOrientation: state?.labelsOrientation?.yRight ?? 0,
      scaleType: state.yRightScale || 'linear',
    },
  ];

  if (isLeftAxis) {
    yAxisConfigs.push({
      id: Position.Left,
      position: Position.Left,
      // we need also settings from global config here so that default's doesn't override it
      ...yAxisConfigs[0],
    });
  }

  if (isRightAxis) {
    yAxisConfigs.push({
      id: Position.Right,
      position: Position.Right,
      // we need also settings from global config here so that default's doesn't override it
      ...yAxisConfigs[1],
    });
  }

  const isValidAnnotation = (a: EventAnnotationConfig) =>
    isManualPointAnnotationConfig(a) ||
    isRangeAnnotationConfig(a) ||
    (a.filter && a.filter?.query !== '');

  const legendConfigFn = buildExpressionFunction<LegendConfigFn>('legendConfig', {
    isVisible: state.legend.isVisible,
    showSingleSeries: state.legend.showSingleSeries,
    position: !state.legend.isInside ? state.legend.position : [],
    isInside: state.legend.isInside ? state.legend.isInside : undefined,
    legendSize: state.legend.isInside
      ? undefined
      : state.legend.position === Position.Top || state.legend.position === Position.Bottom
      ? LegendSize.AUTO
      : state.legend.legendSize
      ? state.legend.legendSize
      : undefined,
    layout: state.legend.layout,
    horizontalAlignment:
      state.legend.horizontalAlignment && state.legend.isInside
        ? state.legend.horizontalAlignment
        : undefined,
    verticalAlignment:
      state.legend.verticalAlignment && state.legend.isInside
        ? state.legend.verticalAlignment
        : undefined,
    // ensure that even if the user types more than 5 columns
    // we will only show 5
    floatingColumns:
      state.legend.floatingColumns && state.legend.isInside
        ? Math.min(5, state.legend.floatingColumns)
        : [],
    maxLines: state.legend.maxLines,
    legendStats: state.legend.legendStats,
    title: state.legend.title,
    isTitleVisible: state.legend.isTitleVisible,
    shouldTruncate:
      state.legend.shouldTruncate ??
      getDefaultVisualValuesForLayer(state, datasourceLayers).truncateText,
  });

  const xAxisConfigFn = buildExpressionFunction<XAxisConfigFn>('xAxisConfig', {
    id: 'x',
    position: 'bottom',
    title: state.xTitle || '',
    showTitle: state?.axisTitlesVisibilitySettings?.x ?? true,
    showLabels: state?.tickLabelsVisibilitySettings?.x ?? true,
    showGridLines: state?.gridlinesVisibilitySettings?.x ?? true,
    labelsOrientation: state?.labelsOrientation?.x ?? 0,
    extent:
      state.xExtent ||
      validDataLayers.some((layer) =>
        hasNumericHistogramDimension(datasourceLayers[layer.layerId], layer.xAccessor)
      )
        ? [axisExtentConfigToExpression(state.xExtent ?? { mode: 'dataBounds', niceValues: true })]
        : undefined,
  });

  const layeredXyVisFn = buildExpressionFunction<LayeredXyVisFn>('layeredXyVis', {
    legend: buildExpression([legendConfigFn]).toAst(),
    fittingFunction: state.fittingFunction ?? FittingFunctions.LINEAR,
    endValue: state.endValue ?? 'None',
    emphasizeFitting: state.emphasizeFitting ?? true,
    minBarHeight: state.minBarHeight ?? 1,
    fillOpacity: state.fillOpacity ?? 0.3,
    pointVisibility: state.pointVisibility ?? PointVisibilityOptions.AUTO,
    areaFill: state.areaFill ?? AreaFillOptions.SOLID,
    valueLabels: state.valueLabels ?? 'hide',
    hideEndzones: state.hideEndzones ?? false,
    addTimeMarker:
      (isTimeChart(validDataLayers, { datasourceLayers }) && state.showCurrentTimeMarker) ?? false,
    yAxisConfigs: [...yAxisConfigsToExpression(yAxisConfigs)],
    xAxisConfig: buildExpression([xAxisConfigFn]).toAst(),
    showTooltip: [],
    layers: [
      ...validDataLayers.map((layer) =>
        dataLayerToExpression(
          layer,
          yAxisConfigs,
          datasourceLayers[layer.layerId],
          metadata,
          paletteService,
          datasourceExpressionsByLayers[layer.layerId],
          state.curveType || 'LINEAR'
        )
      ),
      ...validReferenceLayers.map((layer) =>
        referenceLineLayerToExpression(
          layer,
          datasourceLayers[(layer as XYReferenceLineLayerConfig).layerId],
          datasourceExpressionsByLayers[layer.layerId]
        )
      ),
      ...validPointsLayers.map((layer) => pointsLayerToExpression(layer)),
    ],
    annotations:
      validAnnotationsLayers.length &&
      validAnnotationsLayers.flatMap((l) => l.annotations.filter(isValidAnnotation)).length
        ? [
            buildExpression([
              buildExpressionFunction<EventAnnotationResultFn>('event_annotations_result', {
                layers: validAnnotationsLayers.map((layer) =>
                  annotationLayerToExpression(layer, eventAnnotationService)
                ),
                datatable: eventAnnotationService.toFetchExpression({
                  interval:
                    (validDataLayers[0]?.xAccessor &&
                      metadata[validDataLayers[0]?.layerId]?.[validDataLayers[0]?.xAccessor]
                        ?.interval) ||
                    'auto',
                  groups: validAnnotationsLayers.map((layer) => ({
                    ignoreGlobalFilters: layer.ignoreGlobalFilters,
                    indexPatternId: layer.indexPatternId,
                    annotations: layer.annotations.filter(isValidAnnotation),
                  })),
                }),
              }),
            ]).toAst(),
          ]
        : [],
  });
  return buildExpression([layeredXyVisFn]).toAst();
};

const yAxisConfigsToExpression = (yAxisConfigs: AxisConfig[]): Ast[] => {
  return yAxisConfigs.map((axis) =>
    buildExpression([
      buildExpressionFunction<YAxisConfigFn>('yAxisConfig', {
        id: axis.id,
        position: axis.position,
        extent: axisExtentConfigToExpression(axis.extent ?? { mode: 'full', niceValues: true }),
        showTitle: axis.showTitle ?? true,
        title: axis.title,
        showLabels: axis.showLabels ?? true,
        showGridLines: axis.showGridLines ?? true,
        labelsOrientation: axis.labelsOrientation,
        scaleType: axis.scaleType,
      }),
    ]).toAst()
  );
};

const pointsLayerToExpression = (layer: XYPointsLayerConfig): Ast => {
  const kibanaFn = buildExpressionFunction('kibana', {});
  const esqlFn = buildExpressionFunction('esql', {
    query: layer.query,
    timeField: '@timestamp',
  });
  const pointsLayerFn = buildExpressionFunction<PointsLayerFn>('pointsLayer', {
    layerId: layer.layerId,
    query: layer.query,
    yAccessor: layer.yAccessor,
  });
  return buildExpression([kibanaFn, esqlFn, pointsLayerFn]).toAst();
};

const referenceLineLayerToExpression = (
  layer: XYReferenceLineLayerConfig,
  datasourceLayer: DatasourcePublicAPI | undefined,
  datasourceExpression: Ast
): Ast => {
  const referenceLineLayerFn = buildExpressionFunction<ReferenceLineLayerFn>('referenceLineLayer', {
    layerId: layer.layerId,
    decorations: layer.yConfig
      ? layer.yConfig.map((yConfig) =>
          extendedYConfigToRLDecorationConfigExpression(yConfig, defaultReferenceLineColor)
        )
      : [],
    accessors: layer.accessors,
    columnToLabel: JSON.stringify(getColumnToLabelMap(layer, datasourceLayer)),
    ...(datasourceExpression && datasourceExpression.chain.length
      ? { table: datasourceExpression }
      : {}),
  });

  return buildExpression([referenceLineLayerFn]).toAst();
};

const annotationLayerToExpression = (
  layer: XYAnnotationLayerConfigWithSimpleView,
  eventAnnotationService: EventAnnotationServiceType
): Ast => {
  const extendedAnnotationLayerFn = buildExpressionFunction<ExtendedAnnotationLayerFn>(
    'extendedAnnotationLayer',
    {
      simpleView: Boolean(layer.simpleView),
      layerId: layer.layerId,
      annotations: eventAnnotationService.toExpression(layer.annotations || []),
    }
  );
  return buildExpression([extendedAnnotationLayerFn]).toAst();
};

const dataLayerToExpression = (
  layer: ValidXYDataLayerConfig,
  yAxisConfigs: AxisConfig[],
  datasourceLayer: DatasourcePublicAPI | undefined,
  metadata: Record<string, Record<string, OperationMetadata | null>>,
  paletteService: PaletteRegistry,
  datasourceExpression: Ast,
  curveType: XYCurveType
): Ast => {
  const columnToLabel = getColumnToLabelMap(layer, datasourceLayer);

  const xAxisOperation = datasourceLayer?.getOperationForColumnId(layer.xAccessor);

  const isHistogramDimension = Boolean(
    xAxisOperation &&
      xAxisOperation.isBucketed &&
      xAxisOperation.scale &&
      xAxisOperation.scale !== 'ordinal'
  );

  const dataFromType = layer.seriesType.split('_');
  const seriesType = dataFromType[0];
  const isPercentage = dataFromType.includes('percentage');
  const isStacked = dataFromType.includes('stacked');
  const isHorizontal = dataFromType.includes('horizontal');

  const collapseFn = buildExpressionFunction<CollapseExpressionFunction>('lens_collapse', {
    by: layer.xAccessor ? [layer.xAccessor] : [],
    metric: layer.accessors,
    fn: [layer.collapseFn!],
  });

  const hasActiveSplits = !layer.collapseFn && Boolean(layer.splitAccessors?.length);
  const extendedDataLayerFn = buildExpressionFunction<ExtendedDataLayerFn>('extendedDataLayer', {
    layerId: layer.layerId,
    simpleView: Boolean(layer.simpleView),
    xAccessor: layer.xAccessor,
    xScaleType: getScaleType(
      metadata[layer.layerId][layer.xAccessor],
      ScaleType.Linear
    ) as XScaleType,
    isHistogram: isHistogramDimension,
    isPercentage,
    isStacked,
    isHorizontal,
    splitAccessors: hasActiveSplits ? layer.splitAccessors : undefined,
    decorations: layer.yConfig
      ? layer.yConfig.map((yConfig) =>
          yConfigToDataDecorationConfigExpression(yConfig, yAxisConfigs)
        )
      : undefined,
    curveType,
    seriesType: seriesType as SeriesType,
    showLines: seriesType === 'line' || seriesType === 'area',
    accessors: layer.accessors,
    columnToLabel: JSON.stringify(columnToLabel),
    palette: buildExpression([
      layer.palette && !layer.collapseFn
        ? buildExpressionFunction<ExpressionFunctionTheme>('theme', {
            variable: 'palette',
            default: [paletteService.get(layer.palette.name).toExpression(layer.palette.params)],
          })
        : buildExpressionFunction<SystemPaletteExpressionFunctionDefinition>('system_palette', {
            name: getDefaultPalette(layer.seriesType),
          }),
    ]).toAst(),
    colorMapping: hasActiveSplits
      ? layer.colorMapping
        ? JSON.stringify(layer.colorMapping)
        : !layer.palette
        ? JSON.stringify(
            getColorMappingDefaults({ defaultPaletteId: getDefaultPalette(layer.seriesType) })
          )
        : undefined
      : undefined,
  });

  return {
    type: 'expression',
    chain: [
      ...(datasourceExpression
        ? [...datasourceExpression.chain, ...(layer.collapseFn ? [collapseFn.toAst()] : [])]
        : []),
      extendedDataLayerFn.toAst(),
    ],
  };
};

const yConfigToDataDecorationConfigExpression = (
  yConfig: YConfig,
  yAxisConfigs: AxisConfig[],
  defaultColor?: string
): Ast => {
  const axisId = yAxisConfigs.find((axis) => axis.id && axis.position === yConfig.axisMode)?.id;
  const dataDecorationConfigFn = buildExpressionFunction<DataDecorationConfigFn>(
    'dataDecorationConfig',
    {
      axisId,
      forAccessor: yConfig.forAccessor,
      color: yConfig.color ?? defaultColor,
    }
  );
  return buildExpression([dataDecorationConfigFn]).toAst();
};

const extendedYConfigToRLDecorationConfigExpression = (
  yConfig: YConfig,
  defaultColor?: string
): Ast => {
  const referenceLineDecorationConfigFn = buildExpressionFunction<ReferenceLineDecorationConfigFn>(
    'referenceLineDecorationConfig',
    {
      forAccessor: yConfig.forAccessor,
      position: yConfig.axisMode as Position,
      color: yConfig.color ?? defaultColor,
      lineStyle: yConfig.lineStyle || 'solid',
      lineWidth: yConfig.lineWidth || 1,
      fill: yConfig.fill || 'none',
      icon: hasIcon(yConfig.icon) ? (yConfig.icon as AvailableReferenceLineIcon) : undefined,
      iconPosition:
        hasIcon(yConfig.icon) || yConfig.textVisibility ? yConfig.iconPosition || 'auto' : 'auto',
      textVisibility: yConfig.textVisibility || false,
    }
  );
  return buildExpression([referenceLineDecorationConfigFn]).toAst();
};
