/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  CountIndexPatternColumn,
  CumulativeSumIndexPatternColumn,
  DateHistogramIndexPatternColumn,
  SumIndexPatternColumn,
} from '@kbn/lens-common';
import type { LensAttributes } from '../../types';

const LAYER_ID = '5072f3dd-f0c9-4bfd-a3a4-b9022695c1f4';
const X_COL = '315033e2-8172-4213-87e0-d4e7f09ccca7';
const CUMSUM_COL = '881198db-8a3d-497b-b662-d7f5835775af';

const xColumn: DateHistogramIndexPatternColumn = {
  isBucketed: true,
  dataType: 'date',
  label: '@timestamp',
  operationType: 'date_histogram',
  sourceField: '@timestamp',
  params: {
    interval: 'auto',
  },
};

const baseVisualization = {
  legend: {
    isVisible: true,
    position: 'right' as const,
  },
  preferredSeriesType: 'bar_stacked' as const,
};

const baseQuery = {
  filters: [],
  query: {
    query: '',
    language: 'kuery' as const,
  },
};

const baseReferences = [
  {
    id: 'logs-*',
    name: `indexpattern-datasource-layer-${LAYER_ID}`,
    type: 'index-pattern' as const,
  },
];

function buildCumulativeSumAttributes(
  refColumn: SumIndexPatternColumn | CountIndexPatternColumn,
  refColId: string
): LensAttributes {
  const cumsumColumn: CumulativeSumIndexPatternColumn = {
    dataType: 'number',
    isBucketed: false,
    label: `Cumulative sum of ${refColumn.label}`,
    operationType: 'cumulative_sum',
    references: [refColId],
    customLabel: false,
  };

  return {
    visualizationType: 'lnsXY',
    title: `Cumulative sum of ${refColumn.operationType}`,
    state: {
      datasourceStates: {
        formBased: {
          layers: {
            [LAYER_ID]: {
              columnOrder: [X_COL, CUMSUM_COL, refColId],
              columns: {
                [X_COL]: xColumn,
                [refColId]: refColumn,
                [CUMSUM_COL]: cumsumColumn,
              },
            },
          },
        },
      },
      visualization: {
        ...baseVisualization,
        layers: [
          {
            accessors: [CUMSUM_COL],
            isHistogram: true,
            layerId: LAYER_ID,
            layerType: 'data',
            seriesType: 'line',
            xAccessor: X_COL,
          },
        ],
      },
      ...baseQuery,
    },
    references: baseReferences,
  };
}

const sumRefColumn: SumIndexPatternColumn = {
  dataType: 'number',
  isBucketed: false,
  label: 'Sum of bytes',
  operationType: 'sum',
  sourceField: 'bytes',
  customLabel: false,
  params: {
    emptyAsNull: true,
  },
  scale: 'ratio',
};

const countRefColumn: CountIndexPatternColumn = {
  dataType: 'number',
  isBucketed: false,
  label: 'Count of records',
  operationType: 'count',
  sourceField: '___records___',
  customLabel: false,
  params: {
    emptyAsNull: true,
  },
  scale: 'ratio',
};

export const xyWithCumulativeSumOfSumReference = buildCumulativeSumAttributes(
  sumRefColumn,
  'dc5b22e3-48ef-447d-a0e5-60fdad78cf50'
);

export const xyWithCumulativeSumOfCountReference = buildCumulativeSumAttributes(
  countRefColumn,
  'fc484025-c6c3-47e5-8a2d-428d6d6e3dbb'
);
