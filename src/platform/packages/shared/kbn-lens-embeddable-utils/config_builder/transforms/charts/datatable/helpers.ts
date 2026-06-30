/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ColumnState,
  GenericIndexPatternColumn,
  TextBasedLayerColumn,
  DataType,
} from '@kbn/lens-common';

import { ACCESSOR } from './constants';
import type { AutoColorType, ColorByValueType, ColorMappingType } from '../../../schema/color';
import { isColorByValueColor, isColorMappingColor } from '../../coloring';
import { getReversibleMappings } from '../utils';

const colorModeCompat = getReversibleMappings([
  ['value', 'text'],
  ['badge', 'badge'],
  ['background', 'cell'],
]);

type ApiColorTarget = 'value' | 'badge' | 'background';

// 'progress' is a numeric-only cell decoration with no as-code API surface yet.
type ApiColorMode = Exclude<NonNullable<ColumnState['colorMode']>, 'none' | 'progress'>;

export const colorModeToApplyColorTo = (mode: ApiColorMode): ApiColorTarget =>
  colorModeCompat.toAPI(mode);

export const applyColorToToColorMode = (
  target: ApiColorTarget
): NonNullable<ColumnState['colorMode']> => colorModeCompat.toState(target);

/**
 * Checks if the column is a metric column in a formBased layer
 * - In metric columns the isMetric property is not set in all cases and neither is for rows
 * - Pass layerColumn to check isBucketed property
 */
export function isMetricColumnNoESQL(
  col: ColumnState,
  layerColumn: GenericIndexPatternColumn
): boolean {
  if (col.isMetric) return true;

  // If the column is bucketed, it is a row column (not a metric)
  return !col.isTransposed && !layerColumn.isBucketed;
}

/**
 * Checks if the column is a metric column in a textBased layer
 */
export function isMetricColumnESQL(
  col: ColumnState,
  layerColumns: TextBasedLayerColumn[]
): boolean {
  if (col.isMetric) return true;
  if (col.isTransposed) return false;
  // Check if the column is in the layer columns and return if it is in the metric dimension
  const layerColumn = layerColumns.find((c) => c.columnId === col.columnId);
  if (!layerColumn) throw new Error(`Column with id ${col.columnId} not found in layer columns`);

  return layerColumn.inMetricDimension ?? false;
}

export function getAccessorName(
  type: 'metric' | 'row' | 'split_metric_by' | 'metric_ref',
  index?: number
) {
  if (index == null) {
    return `${ACCESSOR}_${type}`;
  }
  return `${ACCESSOR}_${type}_${index}`;
}

/**
 * Infers the datatype from the color configuration.
 * - colorMapping → 'string'
 * - colorByValue → 'number'
 * - No color → uses the provided default
 */
export function inferDatatypeFromColor(
  color: ColorByValueType | ColorMappingType | AutoColorType | undefined,
  defaultType: Extract<DataType, 'number' | 'string'>
): Extract<DataType, 'number' | 'string'> {
  if (isColorByValueColor(color)) {
    return 'number';
  }
  if (isColorMappingColor(color)) {
    return 'string';
  }
  return defaultType;
}
