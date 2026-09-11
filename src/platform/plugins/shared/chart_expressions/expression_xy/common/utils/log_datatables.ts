/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DimensionType } from '@kbn/expressions-plugin/common';
import type { QueryPointEventAnnotationOutput } from '@kbn/event-annotation-plugin/common';
import type {
  Datatable,
  DefaultInspectorAdapters,
  ExecutionContext,
} from '@kbn/expressions-plugin/common';
import type { ExpressionValueVisDimension } from '@kbn/chart-expressions-common';
import type { Dimension, LayerDimension } from '@kbn/visualizations-common';
import { prepareLogTable } from '@kbn/visualizations-common';
import { LayerTypes, REFERENCE_LINE } from '../constants';
import { strings } from '../i18n';
import type {
  AnnotationLayerConfigResult,
  CommonXYDataLayerConfig,
  CommonXYLayerConfig,
  ExpressionAnnotationResult,
  ReferenceLineLayerConfig,
} from '../types';

export const logDatatables = (
  layers: CommonXYLayerConfig[],
  handlers: ExecutionContext<DefaultInspectorAdapters>,
  splitColumnAccessor?: string | ExpressionValueVisDimension,
  splitRowAccessor?: string | ExpressionValueVisDimension,
  annotations?: ExpressionAnnotationResult
) => {
  if (!handlers?.inspectorAdapters?.tables) {
    return;
  }

  handlers.inspectorAdapters.tables.reset();
  handlers.inspectorAdapters.tables.allowCsvExport = true;

  layers.forEach((layer) => {
    if (
      layer.layerType === LayerTypes.ANNOTATIONS ||
      layer.layerType === LayerTypes.POINTS ||
      layer.type === REFERENCE_LINE
    ) {
      return;
    }

    const layerDimensions = getLayerDimensions(layer);

    layerDimensions.push([
      splitColumnAccessor ? [splitColumnAccessor] : undefined,
      strings.getSplitColumnHelp(),
      DimensionType.SPLIT_COLUMN,
    ]);
    layerDimensions.push([
      splitRowAccessor ? [splitRowAccessor] : undefined,
      strings.getSplitRowHelp(),
      DimensionType.SPLIT_ROW,
    ]);

    const logTable = prepareLogTable(layer.table, layerDimensions, true);
    handlers.inspectorAdapters.tables.logDatatable(layer.layerId, logTable);
  });
  if (annotations) {
    annotations.layers.forEach((layer) => {
      const logTable = getLogAnnotationTable(annotations.datatable, layer);
      handlers.inspectorAdapters.tables.logDatatable(layer.layerId, logTable);
    });
  }
};

const getLogAnnotationTable = (data: Datatable, layer: AnnotationLayerConfigResult) => {
  const layerDimensions: Dimension[] = [
    [['label'], strings.getLabelLabel()],
    [['time'], strings.getTimeLabel()],
  ];
  const layerAnnotationsId = new Set(layer.annotations.map((annotation) => annotation.id));
  layer.annotations
    .filter((a): a is QueryPointEventAnnotationOutput => a.type === 'query_point_event_annotation')
    .forEach((annotation) => {
      const dynamicDimensions: Dimension[] = [
        ...(annotation.extraFields ? annotation.extraFields : []),
        ...(annotation.textField ? [annotation.textField] : []),
      ].map((f) => [[`field:${f}`], f]);
      layerDimensions.push(...dynamicDimensions);
    });

  return prepareLogTable(
    { ...data, rows: data.rows.filter((row) => layerAnnotationsId.has(row.id)) },
    layerDimensions,
    true
  );
};

export const logDatatable = (
  data: Datatable,
  layers: CommonXYLayerConfig[],
  handlers: ExecutionContext<DefaultInspectorAdapters>,
  splitColumnAccessor?: string | ExpressionValueVisDimension,
  splitRowAccessor?: string | ExpressionValueVisDimension
) => {
  if (handlers.inspectorAdapters.tables) {
    handlers.inspectorAdapters.tables.reset();
    handlers.inspectorAdapters.tables.allowCsvExport = true;

    const layerDimensions = layers.reduce<LayerDimension[]>((dimensions, layer) => {
      if (
        layer.layerType === LayerTypes.ANNOTATIONS ||
        layer.layerType === LayerTypes.POINTS ||
        layer.type === REFERENCE_LINE
      ) {
        return dimensions;
      }

      return [...dimensions, ...getLayerDimensions(layer)];
    }, []);

    layerDimensions.push([
      splitColumnAccessor ? [splitColumnAccessor] : undefined,
      strings.getSplitColumnHelp(),
      DimensionType.SPLIT_COLUMN,
    ]);
    layerDimensions.push([
      splitRowAccessor ? [splitRowAccessor] : undefined,
      strings.getSplitRowHelp(),
      DimensionType.SPLIT_ROW,
    ]);

    const logTable = prepareLogTable(data, layerDimensions, true);
    handlers.inspectorAdapters.tables.logDatatable('default', logTable);
  }
};

export const getLayerDimensions = (
  layer: CommonXYDataLayerConfig | ReferenceLineLayerConfig
): LayerDimension[] => {
  let xAccessor;
  let splitAccessors;
  let markSizeAccessor;
  if (layer.layerType === LayerTypes.DATA) {
    xAccessor = layer.xAccessor;
    splitAccessors = layer.splitAccessors;
    markSizeAccessor = layer.markSizeAccessor;
  }

  const { accessors, layerType } = layer;
  return [
    [
      accessors ? accessors : undefined,
      layerType === LayerTypes.DATA ? strings.getMetricHelp() : strings.getReferenceLineHelp(),
      layerType === LayerTypes.DATA ? DimensionType.Y_AXIS : DimensionType.REFERENCE_LINE,
    ],
    [xAccessor ? [xAccessor] : undefined, strings.getXAxisHelp(), DimensionType.X_AXIS],
    [
      splitAccessors ? splitAccessors : undefined,
      strings.getBreakdownHelp(),
      DimensionType.BREAKDOWN,
    ],
    [
      markSizeAccessor ? [markSizeAccessor] : undefined,
      strings.getMarkSizeHelp(),
      DimensionType.MARK_SIZE,
    ],
  ];
};
