/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';

import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';

import type { EventAnnotationGroupConfig } from '@kbn/event-annotation-common';

import { isQueryAnnotationConfig } from '@kbn/event-annotation-components';
import { i18n } from '@kbn/i18n';
import fastIsEqual from 'fast-deep-equal';
import { validateQuery } from '@kbn/visualization-ui-components';
import type {
  DataViewsState,
  FramePublicAPI,
  DatasourcePublicAPI,
  UserMessage,
} from '@kbn/lens-common';
import type {
  XYLayerConfig,
  XYDataLayerConfig,
  XYReferenceLineLayerConfig,
  SeriesType,
  YConfig,
  XYAnnotationLayerConfig,
} from './types';
import { visualizationSubtypes } from './types';
import {
  getDataLayers,
  isAnnotationsLayer,
  isDataLayer,
  isByReferenceAnnotationsLayer,
} from './visualization_helpers';
import {
  ANNOTATION_DATAVIEW_NOT_FOUND,
  ANNOTATION_INVALID_FILTER_QUERY,
  ANNOTATION_MISSING_TIME_FIELD,
  ANNOTATION_MISSING_TOOLTIP_FIELD,
  ANNOTATION_TEXT_FIELD_NOT_FOUND,
  ANNOTATION_TIME_FIELD_NOT_FOUND,
} from '../../user_messages_ids';

export function isHorizontalSeries(seriesType: SeriesType) {
  return (
    seriesType === 'bar_horizontal' ||
    seriesType === 'bar_horizontal_stacked' ||
    seriesType === 'bar_horizontal_percentage_stacked'
  );
}

export function flipSeriesType(seriesType: SeriesType) {
  switch (seriesType) {
    case 'bar':
      return 'bar_horizontal';
    case 'bar_stacked':
      return 'bar_horizontal_stacked';
    case 'bar_percentage_stacked':
      return 'bar_horizontal_percentage_stacked';
    case 'bar_horizontal':
      return 'bar';
    case 'bar_horizontal_stacked':
      return 'bar_stacked';
    case 'bar_horizontal_percentage_stacked':
      return 'bar_percentage_stacked';

    default:
      return 'bar_horizontal';
  }
}

export function isPercentageSeries(seriesType: SeriesType) {
  return (
    seriesType === 'bar_percentage_stacked' ||
    seriesType === 'bar_horizontal_percentage_stacked' ||
    seriesType === 'area_percentage_stacked'
  );
}

export const AREA_SERIES = ['area_stacked', 'area', 'area_percentage_stacked'];
export const NON_BAR_SERIES = [...AREA_SERIES, 'line'];
export const BAR_SERIES = [
  'bar',
  'bar_stacked',
  'bar_percentage_stacked',
  'bar_horizontal',
  'bar_horizontal_stacked',
  'bar_horizontal_percentage_stacked',
];

export const hasNonBarSeries = (layers: XYLayerConfig[]) =>
  layers.some((layer) => isDataLayer(layer) && NON_BAR_SERIES.includes(layer.seriesType));

export const hasBarSeries = (layers: XYLayerConfig[]) => {
  return layers.some((layer) => isDataLayer(layer) && BAR_SERIES.includes(layer.seriesType));
};

export const hasAreaSeries = (layers: XYLayerConfig[]) =>
  layers.some((layer) => isDataLayer(layer) && AREA_SERIES.includes(layer.seriesType));

export const getBarSeriesLayers = (layers: XYLayerConfig[]): XYDataLayerConfig[] =>
  getDataLayers(layers).filter((layer) => BAR_SERIES.includes(layer.seriesType));

export function isLineSeries(seriesType: SeriesType) {
  return seriesType === 'line';
}

export function isStackedChart(seriesType: SeriesType) {
  return seriesType.includes('stacked');
}

export const isAreaLayer = (layer: XYLayerConfig) => {
  return isDataLayer(layer) && AREA_SERIES.includes(layer.seriesType);
};

export function isBarLayer(layer: XYLayerConfig) {
  return isDataLayer(layer) && BAR_SERIES.includes(layer.seriesType);
}

export const getUniqueSeriesTypes = (layers: XYLayerConfig[]) => {
  return [...new Set(getDataLayers(layers).map(({ seriesType }) => seriesType))];
};

export function isHorizontalChart(layers: XYLayerConfig[]) {
  return getDataLayers(layers).every((l) => isHorizontalSeries(l.seriesType));
}

export function getIconForSeries(type: SeriesType): EuiIconType {
  const definition = visualizationSubtypes.find((t) => t.id === type);

  if (!definition) {
    throw new Error(`Unknown series type ${type}`);
  }

  return (definition.icon as EuiIconType) || 'empty';
}

export const getSeriesColor = (layer: XYLayerConfig, accessor: string) => {
  if (isAnnotationsLayer(layer)) {
    return layer?.annotations?.find((ann) => ann.id === accessor)?.color || null;
  }
  if (isDataLayer(layer) && (layer.splitAccessors ?? []).length > 0 && !layer.collapseFn) {
    return null;
  }
  return (
    layer?.yConfig?.find((yConfig: YConfig) => yConfig.forAccessor === accessor)?.color || null
  );
};

export const getColumnToLabelMap = (
  layer: XYDataLayerConfig | XYReferenceLineLayerConfig,
  datasource?: DatasourcePublicAPI
) => {
  const columnToLabel: Record<string, string> = {};
  layer.accessors
    .concat(isDataLayer(layer) && layer.splitAccessors ? layer.splitAccessors : [])
    .forEach((accessor) => {
      const operation = datasource?.getOperationForColumnId(accessor);
      if (operation?.label) {
        columnToLabel[accessor] = operation.label;
      }
    });
  return columnToLabel;
};

export function hasHistogramSeries(
  layers: XYDataLayerConfig[] = [],
  datasourceLayers?: FramePublicAPI['datasourceLayers']
) {
  if (!datasourceLayers) {
    return false;
  }
  const validLayers = layers.filter(({ accessors }) => accessors.length);

  return validLayers.some(({ layerId, xAccessor }: XYDataLayerConfig) => {
    if (!xAccessor) {
      return false;
    }

    const xAxisOperation = datasourceLayers[layerId]?.getOperationForColumnId(xAccessor);
    return (
      xAxisOperation &&
      xAxisOperation.isBucketed &&
      xAxisOperation.scale &&
      xAxisOperation.scale !== 'ordinal'
    );
  });
}

export const annotationLayerHasUnsavedChanges = (layer: XYAnnotationLayerConfig) => {
  if (!isByReferenceAnnotationsLayer(layer)) {
    return false;
  }

  type PropsToCompare = Pick<
    EventAnnotationGroupConfig,
    'annotations' | 'ignoreGlobalFilters' | 'indexPatternId'
  >;

  const currentConfig: PropsToCompare = {
    annotations: layer.annotations,
    ignoreGlobalFilters: layer.ignoreGlobalFilters,
    indexPatternId: layer.indexPatternId,
  };

  const savedConfig: PropsToCompare = {
    annotations: layer.__lastSaved.annotations,
    ignoreGlobalFilters: layer.__lastSaved.ignoreGlobalFilters,
    indexPatternId: layer.__lastSaved.indexPatternId,
  };

  return !fastIsEqual(currentConfig, savedConfig);
};

function createAnnotationErrorMessage(
  uniqueId: string,
  errorMessage: string,
  annotationId: string,
  annotationName: string
): UserMessage {
  return {
    uniqueId,
    severity: 'error',
    fixableInEditor: true,
    displayLocations: [
      { id: 'visualization' },
      { id: 'dimensionButton', dimensionId: annotationId },
    ],
    shortMessage: errorMessage,
    longMessage: (
      <FormattedMessage
        id="xpack.lens.xyChart.annotationError"
        defaultMessage="Annotation {annotationName} has an error: {errorMessage}"
        values={{
          annotationName,
          errorMessage,
        }}
      />
    ),
  };
}
export function getAnnotationLayerErrors(
  layer: XYAnnotationLayerConfig,
  columnId: string,
  dataViews: DataViewsState
): UserMessage[] {
  if (!layer) {
    return [];
  }
  const annotation = layer.annotations.find(({ id }) => id === columnId);
  if (!annotation || !isQueryAnnotationConfig(annotation)) {
    return [];
  }
  const layerDataView = dataViews.indexPatterns[layer.indexPatternId];

  const invalidMessages: UserMessage[] = [];

  // The annotation layer's data view can be missing (e.g. the referenced
  // index-pattern saved object does not exist in the current space). Surface a
  // clean error instead of dereferencing an undefined data view below.
  if (!layerDataView) {
    return [
      createAnnotationErrorMessage(
        ANNOTATION_DATAVIEW_NOT_FOUND,
        i18n.translate('xpack.lens.xyChart.annotationError.dataViewNotFound', {
          defaultMessage: 'Data view {dataView} not found',
          values: { dataView: layer.indexPatternId },
        }),
        annotation.id,
        annotation.label
      ),
    ];
  }

  if (annotation.timeField == null || annotation.timeField === '') {
    invalidMessages.push(
      createAnnotationErrorMessage(
        ANNOTATION_MISSING_TIME_FIELD,
        i18n.translate('xpack.lens.xyChart.annotationError.timeFieldEmpty', {
          defaultMessage: 'Time field is missing',
        }),
        annotation.id,
        annotation.label
      )
    );
  }

  if (annotation.timeField && !Boolean(layerDataView.getFieldByName(annotation.timeField))) {
    invalidMessages.push(
      createAnnotationErrorMessage(
        ANNOTATION_TIME_FIELD_NOT_FOUND,
        i18n.translate('xpack.lens.xyChart.annotationError.timeFieldNotFound', {
          defaultMessage: 'Time field {timeField} not found in data view {dataView}',
          values: { timeField: annotation.timeField, dataView: layerDataView.title },
        }),
        annotation.id,
        annotation.label
      )
    );
  }

  const { isValid, error } = validateQuery(annotation?.filter, layerDataView);
  if (!isValid && error) {
    invalidMessages.push(
      createAnnotationErrorMessage(
        ANNOTATION_INVALID_FILTER_QUERY,
        error,
        annotation.id,
        annotation.label
      )
    );
  }
  if (annotation.textField && !Boolean(layerDataView.getFieldByName(annotation.textField))) {
    invalidMessages.push(
      createAnnotationErrorMessage(
        ANNOTATION_TEXT_FIELD_NOT_FOUND,
        i18n.translate('xpack.lens.xyChart.annotationError.textFieldNotFound', {
          defaultMessage: 'Text field {textField} not found in data view {dataView}',
          values: { textField: annotation.textField, dataView: layerDataView.title },
        }),
        annotation.id,
        annotation.label
      )
    );
  }
  if (annotation.extraFields?.length) {
    const missingTooltipFields = [];
    for (const field of annotation.extraFields) {
      if (!Boolean(layerDataView.getFieldByName(field))) {
        missingTooltipFields.push(field);
      }
    }
    if (missingTooltipFields.length) {
      invalidMessages.push(
        createAnnotationErrorMessage(
          ANNOTATION_MISSING_TOOLTIP_FIELD,
          i18n.translate('xpack.lens.xyChart.annotationError.tooltipFieldNotFound', {
            defaultMessage:
              'Tooltip {missingFields, plural, one {field} other {fields}} {missingTooltipFields} not found in data view {dataView}',
            values: {
              missingTooltipFields: missingTooltipFields.join(', '),
              missingFields: missingTooltipFields.length,
              dataView: layerDataView.title,
            },
          }),
          annotation.id,
          annotation.label
        )
      );
    }
  }

  return invalidMessages;
}
