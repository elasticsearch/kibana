/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Datatable, DatatableRow } from '@kbn/expressions-plugin/common';
import { getBucketIdentifier } from '@kbn/expressions-plugin/common';
import type { CollapseExpressionFunction } from '../../defs/collapse/types';

function getValueAsNumberArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((innerVal) => Number(innerVal));
  } else {
    return [Number(value)];
  }
}

export const collapseFn: CollapseExpressionFunction['fn'] = (input, { by, metric, fn }) => {
  const collapseFunctionsByMetricIndex =
    fn.length > 1 ? fn : metric ? new Array(metric.length).fill(fn[0]) : [];

  if (metric && metric.length !== collapseFunctionsByMetricIndex.length) {
    throw Error(`lens_collapse - Called with ${metric.length} metrics and ${fn.length} collapse functions. 
Must be called with either a single collapse function for all metrics,
or a number of collapse functions matching the number of metrics.`);
  }

  const accumulators: Record<string, Partial<Record<string, number>>> = {};
  const valueCounter: Record<string, Partial<Record<string, number>>> = {};
  metric?.forEach((m) => {
    accumulators[m] = {};
    valueCounter[m] = {};
  });

  const setMarker: Partial<Record<string, boolean>> = {};
  input.rows.forEach((row) => {
    const bucketIdentifier = getBucketIdentifier(row, by);

    metric?.forEach((m, i) => {
      const accumulatorValue = accumulators[m][bucketIdentifier];
      const currentValue = row[m];
      if (currentValue != null) {
        const currentNumberValues = getValueAsNumberArray(currentValue);

        switch (collapseFunctionsByMetricIndex[i]) {
          case 'avg':
            valueCounter[m][bucketIdentifier] =
              (valueCounter[m][bucketIdentifier] ?? 0) + currentNumberValues.length;
          case 'sum':
            accumulators[m][bucketIdentifier] = currentNumberValues.reduce(
              (a, b) => a + b,
              accumulatorValue || 0
            );
            break;
          case 'min':
            if (typeof accumulatorValue !== 'undefined') {
              accumulators[m][bucketIdentifier] = Math.min(
                accumulatorValue,
                ...currentNumberValues
              );
            } else {
              accumulators[m][bucketIdentifier] = Math.min(...currentNumberValues);
            }
            break;
          case 'max':
            if (typeof accumulatorValue !== 'undefined') {
              accumulators[m][bucketIdentifier] = Math.max(
                accumulatorValue,
                ...currentNumberValues
              );
            } else {
              accumulators[m][bucketIdentifier] = Math.max(...currentNumberValues);
            }
            break;
        }
      }
    });
  });

  metric?.forEach((m, i) => {
    if (collapseFunctionsByMetricIndex[i] === 'avg') {
      Object.keys(accumulators[m]).forEach((bucketIdentifier) => {
        const accumulatorValue = accumulators[m][bucketIdentifier];
        const valueCount = valueCounter[m][bucketIdentifier];
        if (typeof accumulatorValue !== 'undefined' && typeof valueCount !== 'undefined') {
          accumulators[m][bucketIdentifier] = accumulatorValue / valueCount;
        }
      });
    }
  });

  return {
    ...input,
    columns: input.columns.filter(
      (c) => (by ?? []).includes(c.id) || (metric ?? []).includes(c.id)
    ),
    rows: input.rows
      .map((row) => {
        const bucketIdentifier = getBucketIdentifier(row, by);
        if (setMarker[bucketIdentifier]) return undefined;
        setMarker[bucketIdentifier] = true;
        const newRow: Datatable['rows'][number] = {};
        metric?.forEach((m) => {
          newRow[m] = accumulators[m][bucketIdentifier];
        });
        by?.forEach((b) => {
          newRow[b] = row[b];
        });

        return newRow;
      })
      .filter(Boolean) as DatatableRow[],
  };
};
