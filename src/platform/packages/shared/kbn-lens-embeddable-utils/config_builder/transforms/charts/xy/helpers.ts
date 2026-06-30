/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { XYDataLayerConfig, XYLayerConfig, XYPersistedLayerConfig } from '@kbn/lens-common';
import type { AvailableAnnotationIcon } from '@kbn/event-annotation-common';
import type {
  AnnotationLayerType,
  DataLayerType,
  LayerTypeESQL,
  ReferenceLineLayerType,
  XYLayer,
} from '../../../schema/charts/xy';
import { isEsqlTableTypeDataSource } from '../../../utils';
import {
  AVAILABLE_XY_LAYER_TYPES,
  XY_ANNOTATION_LAYER_TYPES,
  XY_DATA_LAYER_TYPES,
  XY_REFERENCE_LAYER_TYPES,
} from './constants';
import { getReversibleMappings } from '../utils';

export function getAccessorNameForXY(
  layer: XYLayer,
  accessorType: 'x' | 'y' | 'y_ref' | 'breakdown' | 'threshold' | 'event',
  index?: number
): string {
  if (index == null) {
    return `${layer.type}_${accessorType}`;
  }
  return `${layer.type}_${accessorType}_${index}`;
}

export function getIdForLayer(layer: XYLayer, i: number) {
  return `${layer.type}_${i}`;
}

export function isAPIAnnotationLayer(layer: XYLayer): layer is AnnotationLayerType {
  return XY_ANNOTATION_LAYER_TYPES.some((annotationType) => annotationType === layer.type);
}

export function isAPIReferenceLineLayer(layer: XYLayer): layer is ReferenceLineLayerType {
  return XY_REFERENCE_LAYER_TYPES.some((type) => type === layer.type);
}

export function isAPIDataLayer(layer: XYLayer): layer is DataLayerType {
  return XY_DATA_LAYER_TYPES.some((type) => type === layer.type);
}

export function isAPIXYLayer(layer: unknown): layer is XYLayer {
  return (
    typeof layer === 'object' &&
    layer !== null &&
    'type' in layer &&
    typeof layer.type === 'string' &&
    AVAILABLE_XY_LAYER_TYPES.some((type) => type === layer.type)
  );
}

export function isAPIesqlXYLayer(layer: XYLayer): layer is LayerTypeESQL {
  return (
    'data_source' in layer &&
    layer.data_source != null &&
    isEsqlTableTypeDataSource(layer.data_source)
  );
}

export function isLensStateDataLayer(
  layer: XYLayerConfig | XYPersistedLayerConfig
): layer is XYDataLayerConfig {
  return layer.layerType === 'data' || !('layerType' in layer);
}

type XYApiIconName = NonNullable<ReferenceLineLayerType['thresholds'][number]['icon']>;

export const xyIconCompat = getReversibleMappings<XYApiIconName, AvailableAnnotationIcon>([
  ['alert', 'alert'],
  ['asterisk', 'asterisk'],
  ['bell', 'bell'],
  ['bolt', 'bolt'],
  ['bug', 'bug'],
  ['circle', 'circle'],
  ['editor_comment', 'editorComment'],
  ['flag', 'flag'],
  ['heart', 'heart'],
  ['map_marker', 'mapMarker'],
  ['pin_filled', 'pinFilled'],
  ['star_empty', 'starEmpty'],
  ['star_filled', 'starFilled'],
  ['tag', 'tag'],
  ['triangle', 'triangle'],
]);
