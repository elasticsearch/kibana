/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Datatable } from '@kbn/expressions-plugin/common';
import { convertDurationValue, type SerializedFieldFormat } from '@kbn/field-formats-plugin/common';
import { getAccessorByDimension } from '@kbn/chart-expressions-common';
import { groupAxesByType } from './axes_configuration';
import { getFormat } from './format';
import type { LayersFieldFormats } from './layers';
import type { CommonXYDataLayerConfig, YAxisConfig } from '../../common';

const DURATION_FORMAT_ID = 'duration';

interface ColumnConversion {
  fromInputFormat: string;
  toInputFormat: string;
  targetFormat: SerializedFieldFormat;
}

/**
 * Builds the minimal per-layer y-accessor formats needed to group series by axis. Mirrors
 * `getYAccessorWithFieldFormat` in `layers.ts` but reads the serialized format straight from the
 * column meta (no format factory), so this can run before the format factory is exercised.
 */
function getYAccessorFormats(dataLayers: CommonXYDataLayerConfig[]): LayersFieldFormats {
  return dataLayers.reduce<LayersFieldFormats>((layersFormats, layer) => {
    const yAccessors = layer.accessors.reduce<Record<string, SerializedFieldFormat | undefined>>(
      (formats, accessor) => {
        const columnId = getAccessorByDimension(accessor, layer.table.columns);
        let format = getFormat(layer.table.columns, accessor) ?? { id: 'number' };
        // Percentage layers are always rendered with the percent format, never the duration one.
        if (format?.id !== 'percent' && layer.isPercentage) {
          format = { id: 'percent', params: { pattern: '0.[00]%' } };
        }
        formats[columnId] = format;
        return formats;
      },
      {}
    );

    layersFormats[layer.layerId] = {
      xAccessors: {},
      yAccessors,
      splitSeriesAccessors: {},
      splitColumnAccessors: {},
      splitRowAccessors: {},
    };
    return layersFormats;
  }, {});
}

/**
 * A single axis can only carry one tick formatter, so when several duration metrics share an
 * axis the axis uses the first (topmost) series' format. If the other series use different
 * input units (e.g. seconds vs milliseconds), their raw values would be rendered with the wrong
 * unit (1000ms shown as "17 minutes"). To keep a shared axis consistent, this converts every
 * other duration series on the axis into the first series' input unit and rewrites its format
 * accordingly, so the axis, value labels, tooltip and domain all use the same unit.
 *
 * Returns the layers unchanged (same reference) when no normalization is needed.
 */
export function normalizeSharedDurationAxes(
  dataLayers: CommonXYDataLayerConfig[],
  yAxisConfigs?: YAxisConfig[]
): CommonXYDataLayerConfig[] {
  const series = groupAxesByType(dataLayers, getYAccessorFormats(dataLayers), yAxisConfigs);

  // layerId -> (columnId -> conversion to apply)
  const conversionsByLayer: Record<string, Record<string, ColumnConversion>> = {};

  Object.entries(series).forEach(([groupId, groupSeries]) => {
    // `auto` series are redistributed into the other groups, so it is not a real axis.
    if (groupId === 'auto' || groupSeries.length < 2) {
      return;
    }

    // The first/topmost series defines the axis unit (matches getAxesConfiguration).
    const common = groupSeries[0].fieldFormat;
    const commonInputFormat = common?.params?.inputFormat as string | undefined;
    if (common?.id !== DURATION_FORMAT_ID || commonInputFormat === undefined) {
      return;
    }

    groupSeries.slice(1).forEach(({ layer, accessor, fieldFormat }) => {
      const inputFormat = fieldFormat?.params?.inputFormat as string | undefined;
      if (
        fieldFormat?.id !== DURATION_FORMAT_ID ||
        inputFormat === undefined ||
        inputFormat === commonInputFormat
      ) {
        return;
      }

      if (!conversionsByLayer[layer]) {
        conversionsByLayer[layer] = {};
      }
      conversionsByLayer[layer][accessor] = {
        fromInputFormat: inputFormat,
        toInputFormat: commonInputFormat,
        targetFormat: common,
      };
    });
  });

  if (Object.keys(conversionsByLayer).length === 0) {
    return dataLayers;
  }

  return dataLayers.map((layer) => {
    const conversions = conversionsByLayer[layer.layerId];
    if (!conversions) {
      return layer;
    }

    const columns: Datatable['columns'] = layer.table.columns.map((column) => {
      const conversion = conversions[column.id];
      return conversion
        ? {
            ...column,
            meta: {
              ...column.meta,
              params: conversion.targetFormat as Datatable['columns'][number]['meta']['params'],
            },
          }
        : column;
    });

    // `conversions` is constant per layer, so compute the entries once rather than per row.
    const conversionEntries = Object.entries(conversions);
    const rows = layer.table.rows.map((row) => {
      let nextRow = row;
      conversionEntries.forEach(([columnId, { fromInputFormat, toInputFormat }]) => {
        const value = row[columnId];
        if (typeof value === 'number') {
          if (nextRow === row) {
            nextRow = { ...row };
          }
          nextRow[columnId] = convertDurationValue(value, fromInputFormat, toInputFormat);
        }
      });
      return nextRow;
    });

    return {
      ...layer,
      table: { ...layer.table, columns, rows },
    };
  });
}
