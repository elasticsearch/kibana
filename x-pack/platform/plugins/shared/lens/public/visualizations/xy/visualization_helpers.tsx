/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { uniq } from 'lodash';
import { IconChartBarHorizontal, IconChartBarStacked, IconChartMixedXy } from '@kbn/chart-icons';
import type { LayerType as XYLayerType } from '@kbn/expression-xy-plugin/common';
import type {
  AxesSettingsConfig,
  DatasourceLayers,
  FramePublicAPI,
  OperationMetadata,
  UserMessage,
  VisualizationType,
} from '@kbn/lens-common';
import { LENS_LAYER_TYPES as layerTypes } from '@kbn/lens-common';
import type {
  XYVisualizationState,
  XYAnnotationLayerConfig,
  XYLayerConfig,
  XYDataLayerConfig,
  XYPointsLayerConfig,
  XYReferenceLineLayerConfig,
  SeriesType,
  XYByReferenceAnnotationLayerConfig,
  XYByValueAnnotationLayerConfig,
} from './types';
import { visualizationTypes, visualizationSubtypes } from './types';
import { isHorizontalChart } from './state_helpers';
import type { ExtraAppendLayerArg } from './visualization';
import { XY_BREAKDOWN_MISSING_AXIS, XY_Y_MISSING_AXIS } from '../../user_messages_ids';

export function getAxisName(
  axis: 'x' | 'y' | 'yLeft' | 'yRight',
  { isHorizontal }: { isHorizontal: boolean }
) {
  const vertical = i18n.translate('xpack.lens.xyChart.verticalAxisLabel', {
    defaultMessage: 'Vertical axis',
  });
  const horizontal = i18n.translate('xpack.lens.xyChart.horizontalAxisLabel', {
    defaultMessage: 'Horizontal axis',
  });
  if (axis === 'x') {
    return isHorizontal ? vertical : horizontal;
  }
  if (axis === 'y') {
    return isHorizontal ? horizontal : vertical;
  }
  const verticalLeft = i18n.translate('xpack.lens.xyChart.verticalLeftAxisLabel', {
    defaultMessage: 'Vertical left axis',
  });
  const verticalRight = i18n.translate('xpack.lens.xyChart.verticalRightAxisLabel', {
    defaultMessage: 'Vertical right axis',
  });
  const horizontalTop = i18n.translate('xpack.lens.xyChart.horizontalLeftAxisLabel', {
    defaultMessage: 'Horizontal top axis',
  });
  const horizontalBottom = i18n.translate('xpack.lens.xyChart.horizontalRightAxisLabel', {
    defaultMessage: 'Horizontal bottom axis',
  });
  if (axis === 'yLeft') {
    return isHorizontal ? horizontalBottom : verticalLeft;
  }
  return isHorizontal ? horizontalTop : verticalRight;
}

// min requirement for the bug:
// * 2 or more layers
// * at least one with date histogram
// * at least one with interval function
export function checkXAccessorCompatibility(
  state: XYVisualizationState,
  datasourceLayers: DatasourceLayers
) {
  const dataLayers = getDataLayers(state.layers);
  const errors = [];
  const hasDateHistogramSetIndex = dataLayers.findIndex(
    checkScaleOperation('interval', 'date', datasourceLayers)
  );
  const hasNumberHistogramIndex = dataLayers.findIndex(
    checkScaleOperation('interval', 'number', datasourceLayers)
  );
  const hasOrdinalAxisIndex = dataLayers.findIndex(
    checkScaleOperation('ordinal', undefined, datasourceLayers)
  );
  if (state.layers.length > 1) {
    const erroredLayers = [hasDateHistogramSetIndex, hasNumberHistogramIndex, hasOrdinalAxisIndex]
      .filter((v) => v >= 0)
      .sort((a, b) => a - b);
    if (erroredLayers.length > 1) {
      const [firstLayer, ...otherLayers] = erroredLayers;
      const axis = getAxisName('x', { isHorizontal: isHorizontalChart(state.layers) });
      for (const otherLayer of otherLayers) {
        errors.push({
          shortMessage: i18n.translate('xpack.lens.xyVisualization.dataTypeFailureXShort', {
            defaultMessage: `Wrong data type for {axis}.`,
            values: {
              axis,
            },
          }),
          longMessage: i18n.translate('xpack.lens.xyVisualization.dataTypeFailureXLong', {
            defaultMessage: `The {axis} data in layer {firstLayer} is incompatible with the data in layer {secondLayer}. Select a new function for the {axis}.`,
            values: {
              axis,
              firstLayer: firstLayer + 1,
              secondLayer: otherLayer + 1,
            },
          }),
        });
      }
    }
  }
  return errors;
}

export function checkScaleOperation(
  scaleType: 'ordinal' | 'interval' | 'ratio',
  dataType: 'date' | 'number' | 'string' | undefined,
  datasourceLayers: DatasourceLayers
) {
  return (layer: XYDataLayerConfig) => {
    const datasourceAPI = datasourceLayers[layer.layerId];
    if (!layer.xAccessor) {
      return false;
    }
    const operation = datasourceAPI?.getOperationForColumnId(layer.xAccessor);
    return Boolean(
      operation && (!dataType || operation.dataType === dataType) && operation.scale === scaleType
    );
  };
}

/**
 * Checks if an operation is a date histogram (date type with interval scale).
 */
export function isDateHistogramOperation(operation: OperationMetadata | null | undefined): boolean {
  return Boolean(operation?.dataType === 'date' && operation?.scale === 'interval');
}

/**
 * Returns recommended X-axis title visibility settings based on the operation type.
 *
 * - Date histogram: recommends "None" (redundant info - timestamp per bucket shown in chart)
 * - Non-date histogram: recommends "Auto" (axis label is useful)
 * - Respects user's manual choice (e.g., if user set Auto on date histogram, keeps it)
 * - Preserves custom title settings (if xTitle is set, don't change visibility)
 *
 * @returns Updated settings if a change is recommended, undefined otherwise
 */
export function getRecommendedXAxisTitleVisibility(
  currentSettings: AxesSettingsConfig | undefined,
  operation: OperationMetadata | null | undefined,
  xTitle: string | undefined
): AxesSettingsConfig | undefined {
  // Align with toolbar title modes:
  // - none: hidden title
  // - auto: visible title with generated text
  // - custom: visible title with user-defined text
  const currentTitleMode = xTitle ? 'custom' : currentSettings?.x === false ? 'none' : 'auto';

  // Keep user custom title unchanged.
  if (currentTitleMode === 'custom') {
    return undefined;
  }

  const recommendedTitleMode = isDateHistogramOperation(operation) ? 'none' : 'auto';

  if (currentTitleMode === recommendedTitleMode) {
    return undefined;
  }

  return {
    ...currentSettings,
    x: recommendedTitleMode !== 'none',
    yLeft: currentSettings?.yLeft ?? true,
    yRight: currentSettings?.yRight ?? true,
  };
}

export const isDataLayer = (layer: XYLayerConfig): layer is XYDataLayerConfig =>
  layer.layerType === layerTypes.DATA || !layer.layerType;

export const getDataLayers = (layers: XYLayerConfig[]) =>
  (layers || []).filter((layer): layer is XYDataLayerConfig => isDataLayer(layer));

export const getFirstDataLayer = (layers: XYLayerConfig[]) =>
  (layers || []).find((layer): layer is XYDataLayerConfig => isDataLayer(layer));

export const isReferenceLayer = (
  layer: Pick<XYLayerConfig, 'layerType'>
): layer is XYReferenceLineLayerConfig => layer.layerType === layerTypes.REFERENCELINE;

export const getReferenceLayers = (layers: Array<Pick<XYLayerConfig, 'layerType'>>) =>
  (layers || []).filter((layer): layer is XYReferenceLineLayerConfig => isReferenceLayer(layer));

export const isAnnotationsLayer = (
  layer: Pick<XYLayerConfig, 'layerType'>
): layer is XYAnnotationLayerConfig =>
  layer.layerType === layerTypes.ANNOTATIONS && 'indexPatternId' in layer;

export const isByReferenceAnnotationsLayer = (
  layer: XYLayerConfig
): layer is XYByReferenceAnnotationLayerConfig =>
  'annotationGroupId' in layer && '__lastSaved' in layer;

export const getAnnotationsLayers = (layers: Array<Pick<XYLayerConfig, 'layerType'>>) =>
  (layers || []).filter((layer): layer is XYAnnotationLayerConfig => isAnnotationsLayer(layer));

export const isPointsLayer = (
  layer: Pick<XYLayerConfig, 'layerType'>
): layer is XYPointsLayerConfig => layer.layerType === layerTypes.POINTS;

export const getPointsLayers = (layers: Array<Pick<XYLayerConfig, 'layerType'>>) =>
  (layers || []).filter((layer): layer is XYPointsLayerConfig => isPointsLayer(layer));

export const getGroupMetadataFromAnnotationLayer = (
  layer: XYAnnotationLayerConfig
): { title: string; description: string; tags: string[] } => {
  if (layer.cachedMetadata) {
    return layer.cachedMetadata;
  }
  if (isByReferenceAnnotationsLayer(layer)) {
    const { title, description, tags } = layer.__lastSaved;
    return { title, description, tags };
  }
  return { title: '', description: '', tags: [] };
};

export const getAnnotationLayerTitle = (layer: XYAnnotationLayerConfig): string => {
  return getGroupMetadataFromAnnotationLayer(layer).title;
};

export interface LayerTypeToLayer {
  [layerTypes.DATA]: (layer: XYDataLayerConfig) => XYDataLayerConfig;
  [layerTypes.REFERENCELINE]: (layer: XYReferenceLineLayerConfig) => XYReferenceLineLayerConfig;
  [layerTypes.ANNOTATIONS]: (layer: XYAnnotationLayerConfig) => XYAnnotationLayerConfig;
  [layerTypes.POINTS]?: (layer: XYPointsLayerConfig) => XYPointsLayerConfig;
}

export const getLayerTypeOptions = (layer: XYLayerConfig, options: LayerTypeToLayer) => {
  if (isDataLayer(layer)) {
    return options[layerTypes.DATA](layer);
  } else if (isReferenceLayer(layer)) {
    return options[layerTypes.REFERENCELINE](layer);
  } else if (isPointsLayer(layer)) {
    return options[layerTypes.POINTS]?.(layer) ?? layer;
  }
  return options[layerTypes.ANNOTATIONS](layer);
};

export function getVisualizationSubtypeId(state: XYVisualizationState) {
  if (!state.layers.length) {
    return (
      visualizationSubtypes.find((t) => t.id === state.preferredSeriesType) ??
      visualizationSubtypes[0]
    ).id;
  }
  const dataLayers = getDataLayers(state?.layers);
  const subtype = (
    visualizationSubtypes.find((t) => t.id === dataLayers[0].seriesType) ?? visualizationSubtypes[0]
  ).id;
  const seriesTypes = uniq(dataLayers.map((l) => l.seriesType));

  return subtype && seriesTypes.length === 1 ? subtype : 'mixed';
}

export function getVisualizationType(
  state: XYVisualizationState,
  layerId?: string
): VisualizationType | 'mixed' {
  if (!state.layers.length) {
    return (
      visualizationTypes.find((t) => t.subtypes?.includes(state.preferredSeriesType)) ??
      visualizationTypes[0]
    );
  }
  const dataLayers = getDataLayers(state?.layers);
  if (layerId) {
    const dataLayerSeries = layerId
      ? dataLayers.find((d) => d.layerId === layerId)?.seriesType
      : dataLayers[0].seriesType;
    return (
      visualizationTypes.find((t) => dataLayerSeries && t.subtypes?.includes(dataLayerSeries)) ||
      visualizationTypes[0]
    );
  }
  const visualizationType =
    visualizationTypes.find((t) => t.subtypes?.includes(dataLayers[0].seriesType)) ??
    visualizationTypes[0];
  const seriesTypes = uniq(dataLayers.map((l) => l.seriesType));

  return visualizationType && seriesTypes.length === 1 ? visualizationType : 'mixed';
}

export function getDescription(state?: XYVisualizationState, layerId?: string) {
  if (!state) {
    return {
      icon: defaultIcon,
      label: i18n.translate('xpack.lens.xyVisualization.xyLabel', {
        defaultMessage: 'XY',
      }),
    };
  }

  const visualizationType = getVisualizationType(state, layerId);

  if (visualizationType === 'mixed' && isHorizontalChart(state.layers)) {
    return {
      icon: IconChartBarHorizontal,
      label: i18n.translate('xpack.lens.xyVisualization.mixedBarHorizontalLabel', {
        defaultMessage: 'Mixed bar horizontal',
      }),
    };
  }

  if (visualizationType === 'mixed') {
    return {
      icon: IconChartMixedXy,
      label: i18n.translate('xpack.lens.xyVisualization.mixedLabel', {
        defaultMessage: 'Mixed XY',
      }),
    };
  }

  return {
    icon: visualizationType.icon || defaultIcon,
    label: visualizationType.fullLabel || visualizationType.label,
  };
}

export const defaultIcon = IconChartBarStacked;

export const supportedDataLayer = {
  type: layerTypes.DATA,
  label: i18n.translate('xpack.lens.xyChart.addDataLayerLabel', {
    defaultMessage: 'Visualization',
  }),
  icon: IconChartMixedXy,
};

// i18n ids cannot be dynamically generated, hence the function below
function getMessageIdsForDimension(
  dimension: 'y' | 'break_down',
  layers: number[],
  isHorizontal: boolean
): UserMessage {
  const layersList = layers.map((i: number) => i + 1).join(', ');
  switch (dimension) {
    case 'break_down':
      return {
        severity: 'error',
        fixableInEditor: true,
        displayLocations: [{ id: 'visualization' }],
        uniqueId: XY_BREAKDOWN_MISSING_AXIS,
        shortMessage: i18n.translate('xpack.lens.xyVisualization.dataFailureSplitShort', {
          defaultMessage: `Missing {axis}.`,
          values: { axis: 'Break down by axis' },
        }),
        longMessage: i18n.translate('xpack.lens.xyVisualization.dataFailureSplitLong', {
          defaultMessage: `{layers, plural, one {Layer} other {Layers}} {layersList} {layers, plural, one {requires} other {require}} a field for the {axis}.`,
          values: { layers: layers.length, layersList, axis: 'Break down by axis' },
        }),
      };
    case 'y':
      return {
        severity: 'error',
        fixableInEditor: true,
        displayLocations: [{ id: 'visualization' }],
        uniqueId: XY_Y_MISSING_AXIS,
        shortMessage: i18n.translate('xpack.lens.xyVisualization.dataFailureYShort', {
          defaultMessage: `Missing {axis}.`,
          values: { axis: getAxisName('y', { isHorizontal }) },
        }),
        longMessage: i18n.translate('xpack.lens.xyVisualization.dataFailureYLong', {
          defaultMessage: `{layers, plural, one {Layer} other {Layers}} {layersList} {layers, plural, one {requires} other {require}} a field for the {axis}.`,
          values: { layers: layers.length, layersList, axis: getAxisName('y', { isHorizontal }) },
        }),
      };
  }
}

const newLayerFn = {
  [layerTypes.DATA]: ({
    layerId,
    seriesType,
  }: {
    layerId: string;
    seriesType: SeriesType;
  }): XYDataLayerConfig => ({
    layerId,
    layerType: layerTypes.DATA,
    accessors: [],
    seriesType,
  }),
  [layerTypes.REFERENCELINE]: ({ layerId }: { layerId: string }): XYReferenceLineLayerConfig => ({
    layerId,
    layerType: layerTypes.REFERENCELINE,
    accessors: [],
  }),
  [layerTypes.ANNOTATIONS]: ({
    layerId,
    indexPatternId,
    extraArg,
  }: {
    layerId: string;
    indexPatternId: string;
    extraArg: ExtraAppendLayerArg | undefined;
  }): XYAnnotationLayerConfig => {
    if (extraArg) {
      const { annotationGroupId, ...libraryGroupConfig } = extraArg;

      const newLayer: XYByReferenceAnnotationLayerConfig = {
        layerId,
        layerType: layerTypes.ANNOTATIONS,
        annotationGroupId,

        annotations: structuredClone(libraryGroupConfig.annotations),
        indexPatternId: libraryGroupConfig.indexPatternId,
        ignoreGlobalFilters: libraryGroupConfig.ignoreGlobalFilters,
        __lastSaved: libraryGroupConfig,
      };

      return newLayer;
    }

    const newLayer: XYByValueAnnotationLayerConfig = {
      layerId,
      layerType: layerTypes.ANNOTATIONS,
      annotations: [],
      indexPatternId,
      ignoreGlobalFilters: true,
    };

    return newLayer;
  },
};

export function newLayerState({
  layerId,
  layerType = layerTypes.DATA,
  seriesType,
  indexPatternId,
  extraArg,
}: {
  layerId: string;
  layerType?: XYLayerType;
  seriesType: SeriesType;
  indexPatternId: string;
  extraArg?: ExtraAppendLayerArg;
}) {
  return newLayerFn[layerType]({ layerId, seriesType, indexPatternId, extraArg });
}

export function getLayersByType(state: XYVisualizationState, byType?: string) {
  return state.layers.filter(({ layerType = layerTypes.DATA }) =>
    byType ? layerType === byType : true
  );
}

export function validateLayersForDimension(
  dimension: 'y' | 'break_down',
  allLayers: XYLayerConfig[],
  missingCriteria: (layer: XYDataLayerConfig) => boolean
):
  | { valid: true }
  | {
      valid: false;
      error: UserMessage;
    } {
  const dataLayers = allLayers
    .map((layer, i) => ({ layer, originalIndex: i }))
    .filter(({ layer }) => isDataLayer(layer)) as Array<{
    layer: XYDataLayerConfig;
    originalIndex: number;
  }>;

  // filter out those layers with no accessors at all
  const filteredLayers = dataLayers.filter(
    ({ layer: { accessors, xAccessor, splitAccessors = [] } }) =>
      accessors.length > 0 || xAccessor != null || splitAccessors.length > 0
  );
  // Multiple layers must be consistent:
  // * either a dimension is missing in ALL of them
  // * or should not miss on any
  if (
    filteredLayers.every(({ layer }) => missingCriteria(layer)) ||
    !filteredLayers.some(({ layer }) => missingCriteria(layer))
  ) {
    return { valid: true };
  }
  // otherwise it's an error and it has to be reported
  const layerMissingAccessors = filteredLayers.reduce(
    (missing: number[], { layer, originalIndex }) => {
      if (missingCriteria(layer)) {
        missing.push(originalIndex);
      }
      return missing;
    },
    []
  );

  return {
    valid: false,
    error: getMessageIdsForDimension(
      dimension,
      layerMissingAccessors,
      isHorizontalChart(dataLayers.map(({ layer }) => layer))
    ),
  };
}

export const isNumericMetric = (op: OperationMetadata) =>
  !op.isBucketed && op.dataType === 'number';

export const isNumericDynamicMetric = (op: OperationMetadata) =>
  isNumericMetric(op) && !op.isStaticValue;
export const isBucketed = (op: OperationMetadata) => op.isBucketed;

export const isTimeChart = (
  dataLayers: XYDataLayerConfig[],
  frame?: Pick<FramePublicAPI, 'datasourceLayers'> | undefined
) =>
  Boolean(
    dataLayers.length &&
      dataLayers.every(
        (dataLayer) =>
          dataLayer.xAccessor &&
          checkScaleOperation('interval', 'date', frame?.datasourceLayers || {})(dataLayer)
      )
  );
