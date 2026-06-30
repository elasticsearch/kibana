/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  SeriesType,
  XYDataLayerConfig,
  XYPersistedByReferenceAnnotationLayerConfig,
  XYPersistedByValueAnnotationLayerConfig,
  XYPersistedLayerConfig,
  XYReferenceLineLayerConfig,
  YConfig,
} from '@kbn/lens-common';
import type { SavedObjectReference } from '@kbn/core/server';
import { EVENT_ANNOTATION_GROUP_TYPE } from '@kbn/event-annotation-common';
import { getValueColumn } from '../../columns/esql_column';
import { toLensStateFilterLanguage } from '../../columns/filter';
import type {
  DataLayerType,
  ReferenceLineLayerType,
  AnnotationLayerByValueType,
  XYConfig,
} from '../../../schema/charts/xy';
import { addLayerColumn, generateLayer } from '../../utils';
import {
  isAPIesqlXYLayer,
  isAPIXYLayer,
  isAPIAnnotationLayer,
  isAPIReferenceLineLayer,
  getIdForLayer,
  getAccessorNameForXY,
  isAPIDataLayer,
  xyIconCompat,
} from './helpers';
import { fromMetricAPItoLensState } from '../../columns/metric';
import { fromBucketLensApiToLensState } from '../../columns/buckets';
import { fromColorMappingAPIToLensState, isAutoColor } from '../../coloring';
import { processMetricColumnsWithReferences } from '../utils';

const X_ACCESSOR = 'x';
const BREAKDOWN_ACCESSOR = 'breakdown';
const METRIC_ACCESSOR_PREFIX = 'y';
const REFERENCE_LINE_ACCESSOR_PREFIX = 'threshold';

export function getValueColumns(
  layer: unknown,
  i: number,
  xAxisScale?: 'temporal' | 'ordinal' | 'linear'
) {
  if (!isAPIXYLayer(layer) || !isAPIesqlXYLayer(layer)) {
    return [];
  }
  if (isAPIAnnotationLayer(layer)) {
    return [];
  }
  if (isAPIReferenceLineLayer(layer)) {
    return [
      ...layer.thresholds.map((t, index) => getValueColumn(`referenceLine${index}`, t, 'number')),
    ];
  }
  const xColumnType =
    xAxisScale === 'temporal' ? 'date' : xAxisScale === 'linear' ? 'number' : undefined;
  return [
    ...(layer.x
      ? [getValueColumn(getAccessorNameForXY(layer, X_ACCESSOR), layer.x, xColumnType)]
      : []),
    ...layer.y.map((y, index) =>
      getValueColumn(getAccessorNameForXY(layer, METRIC_ACCESSOR_PREFIX, index), y, 'number')
    ),
    ...(layer.breakdown_by
      ? [getValueColumn(getAccessorNameForXY(layer, BREAKDOWN_ACCESSOR), layer.breakdown_by)]
      : []),
  ];
}

function buildDataLayer(config: XYConfig, layer: DataLayerType, i: number): XYDataLayerConfig {
  const seriesTypeLabel = (
    layer.type.includes('percentage') ? `${layer.type}_stacked` : layer.type
  ) as SeriesType;

  const yConfig = layer.y.map<YConfig>((yMetric, index) => {
    const onAxis = yMetric?.axis ?? 'y';
    const axisMode = onAxis === 'y2' ? 'right' : 'left';
    return {
      ...(yMetric.color && !isAutoColor(yMetric.color) ? { color: yMetric.color?.color } : {}),
      axisMode,
      forAccessor: getAccessorNameForXY(layer, METRIC_ACCESSOR_PREFIX, index),
    };
  });
  const meaningFulYConfig = yConfig.filter((y) => Object.values(y).length > 1);

  return {
    layerId: getIdForLayer(layer, i),
    accessors: yConfig.map(({ forAccessor }) => forAccessor),
    layerType: 'data',
    seriesType: seriesTypeLabel,
    ...(layer.x ? { xAccessor: getAccessorNameForXY(layer, X_ACCESSOR) } : {}),
    ...(meaningFulYConfig.length ? { yConfig: meaningFulYConfig } : {}),
    ...(layer.breakdown_by
      ? { splitAccessors: [getAccessorNameForXY(layer, BREAKDOWN_ACCESSOR)] }
      : {}),
    ...(layer.breakdown_by && 'collapse_by' in layer.breakdown_by
      ? { collapseFn: layer.breakdown_by.collapse_by }
      : {}),
    ...(layer.breakdown_by && 'color' in layer.breakdown_by
      ? { ...fromColorMappingAPIToLensState(layer.breakdown_by.color) }
      : {}),
  };
}

function buildByValueAnnotationLayer(
  layer: AnnotationLayerByValueType,
  i: number
): XYPersistedByValueAnnotationLayerConfig {
  // Emit a persisted by-value annotation layer (no `indexPatternId` by design). The Lens
  // XY runtime injects the data view at load time from the
  // `xy-visualization-layer-<layerId>` reference, falling back to the first
  // index-pattern reference when the layer has no dedicated data view.
  // See x-pack/.../lens/public/visualizations/xy/persistence.ts.
  return {
    layerType: 'annotations',
    persistanceType: 'byValue',
    layerId: getIdForLayer(layer, i),
    ignoreGlobalFilters: layer.ignore_global_filters,
    annotations: layer.events.map((annotation, index) => {
      if (annotation.type === 'range') {
        return {
          type: 'manual',
          id: `${layer.type}_event_${index}`,
          key: {
            type: 'range',
            timestamp: String(annotation.interval.from),
            endTimestamp: String(annotation.interval.to),
          },
          outside: annotation.fill === 'outside',
          ...(annotation.color && !isAutoColor(annotation.color)
            ? { color: annotation.color.color }
            : {}),
          label: annotation.label ?? 'Event',
          ...(annotation.visible != null ? { isHidden: !annotation.visible } : {}),
        };
      }
      if (annotation.type === 'point') {
        return {
          type: 'manual',
          id: `${layer.type}_event_${index}`,
          key: {
            type: 'point_in_time',
            timestamp: String(annotation.timestamp),
          },
          ...(annotation.color && !isAutoColor(annotation.color)
            ? { color: annotation.color.color }
            : {}),
          label: annotation.label ?? 'Event',
          ...(annotation.visible != null ? { isHidden: !annotation.visible } : {}),
          ...(annotation.text?.visible != null ? { textVisibility: annotation.text.visible } : {}),
          ...(annotation.icon ? { icon: xyIconCompat.toState(annotation.icon) } : {}),
          ...(annotation.line?.stroke_width != null
            ? { lineWidth: annotation.line.stroke_width }
            : {}),
          ...(annotation.line?.stroke_dash ? { lineStyle: annotation.line.stroke_dash } : {}),
        };
      }
      return {
        type: 'query',
        id: `${layer.type}_event_${index}`,
        filter: {
          type: 'kibana_query',
          query: annotation.query.expression,
          language: toLensStateFilterLanguage(annotation.query.language),
        },
        label: annotation.label ?? 'Event',
        ...(annotation.color && !isAutoColor(annotation.color)
          ? { color: annotation.color.color }
          : {}),
        ...(annotation.visible != null ? { isHidden: !annotation.visible } : {}),
        timeField: annotation.time_field,
        ...(annotation.extra_fields ? { extraFields: annotation.extra_fields } : {}),
        ...(annotation.text?.visible != null ? { textVisibility: annotation.text.visible } : {}),
        ...(annotation.text?.field ? { textField: annotation.text.field } : {}),
        ...(annotation.icon ? { icon: xyIconCompat.toState(annotation.icon) } : {}),
        ...(annotation.line?.stroke_width != null
          ? { lineWidth: annotation.line.stroke_width }
          : {}),
        ...(annotation.line?.stroke_dash ? { lineStyle: annotation.line.stroke_dash } : {}),
        key: {
          type: 'point_in_time',
        },
      };
    }),
  };
}

function buildReferenceLineLayer(
  layer: ReferenceLineLayerType,
  i: number
): XYReferenceLineLayerConfig {
  const yConfig = layer.thresholds.map<YConfig>((threshold, index) => {
    const axisMode = threshold.axis === 'y2' ? 'right' : threshold.axis === 'x' ? 'bottom' : 'left';
    return {
      icon: xyIconCompat.toState(threshold.icon),
      iconPosition: threshold.position,
      lineWidth: threshold.stroke_width,
      lineStyle: threshold.stroke_dash,
      textVisibility: threshold.text?.visible,
      fill: threshold.fill,
      ...(threshold.color && !isAutoColor(threshold.color) ? { color: threshold.color.color } : {}),
      axisMode,
      forAccessor: getAccessorNameForXY(layer, REFERENCE_LINE_ACCESSOR_PREFIX, index),
    };
  });
  return {
    layerType: 'referenceLine',
    layerId: getIdForLayer(layer, i),
    yConfig,
    accessors: yConfig.map(({ forAccessor }) => forAccessor),
  };
}

export function buildXYLayer(
  config: XYConfig,
  layer: unknown,
  i: number,
  annotationGroupReferences: SavedObjectReference[]
): XYPersistedLayerConfig | undefined {
  if (!isAPIXYLayer(layer)) {
    return;
  }

  if (isAPIAnnotationLayer(layer)) {
    if ('group_id' in layer) {
      // by-reference annotation layer
      // TODO: support linked by-value annotation layers as well
      const layerId = getIdForLayer(layer, i);

      annotationGroupReferences.push({
        name: `ref-${layerId}`,
        type: EVENT_ANNOTATION_GROUP_TYPE,
        id: layer.group_id,
      });

      const persistedLayer: XYPersistedByReferenceAnnotationLayerConfig = {
        layerType: 'annotations',
        persistanceType: 'byReference',
        layerId,
        annotationGroupRef: `ref-${layerId}`,
      };
      return persistedLayer;
    }

    // by-value annotation layer
    return buildByValueAnnotationLayer(layer, i);
  }
  if (isAPIReferenceLineLayer(layer)) {
    return buildReferenceLineLayer(layer, i);
  }
  return buildDataLayer(config, layer, i);
}

export function buildFormBasedXYLayer(layer: unknown, i: number) {
  // annotation layer have no datasource state
  if (!isAPIXYLayer(layer) || isAPIesqlXYLayer(layer) || isAPIAnnotationLayer(layer)) {
    return {};
  }
  const layerId = getIdForLayer(layer, i);
  const datasource = generateLayer(layerId, layer);

  const newLayer = datasource[layerId];

  if (isAPIReferenceLineLayer(layer)) {
    for (const [index, column] of Object.entries(layer.thresholds)) {
      const columns = fromMetricAPItoLensState(column);
      addLayerColumn(
        newLayer,
        getAccessorNameForXY(layer, REFERENCE_LINE_ACCESSOR_PREFIX, Number(index)),
        columns
      );
    }
  }

  if (isAPIDataLayer(layer)) {
    // convert metrics in buckets, do not flat yet
    const yColumnsConverted = layer.y.map((col) => fromMetricAPItoLensState(col));
    const { metricColumns, referencesColumns } = processMetricColumnsWithReferences(
      yColumnsConverted,
      (index) => getAccessorNameForXY(layer, METRIC_ACCESSOR_PREFIX, index),
      (index) => getAccessorNameForXY(layer, `${METRIC_ACCESSOR_PREFIX}_ref`, index)
    );
    // fromBucketLensApiToLensState resolves rank_by.metric_index against visible metrics only.
    const xColumns = layer.x ? fromBucketLensApiToLensState(layer.x, metricColumns) : undefined;
    const breakdownColumns = layer.breakdown_by
      ? fromBucketLensApiToLensState(layer.breakdown_by, metricColumns)
      : undefined;

    // Add bucketed coluns first
    if (xColumns) {
      addLayerColumn(newLayer, getAccessorNameForXY(layer, X_ACCESSOR), xColumns);
    }

    if (breakdownColumns) {
      const breakdownById = getAccessorNameForXY(layer, BREAKDOWN_ACCESSOR);
      addLayerColumn(
        newLayer,
        breakdownById,
        breakdownColumns,
        layer.breakdown_by?.aggregate_first || !layer.x
      );
    }

    // then metric ones
    for (const { id, column } of metricColumns) {
      addLayerColumn(newLayer, id, column);
    }
    for (const { id, column } of referencesColumns) {
      addLayerColumn(newLayer, id, column);
    }
  }
  return datasource;
}
