/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Datatable } from '@kbn/expressions-plugin/common';
import type { PointsLayerArgs, PointsLayerConfigResult } from '../types';
import { pointsLayerFunction } from './points_layer';

const ARGS: PointsLayerArgs = {
  layerId: 'layer-1',
  query: 'FROM metrics.exemplars-* | SORT @timestamp DESC | LIMIT 100',
  yAccessor: 'system.cpu.total.norm.pct',
};

describe('pointsLayer', () => {
  it('produces the correct result when input is null', () => {
    const result = pointsLayerFunction.fn(null, ARGS, {} as any);

    const expected: PointsLayerConfigResult = {
      type: 'pointsLayer',
      layerType: 'points',
      ...ARGS,
      table: undefined,
    };

    expect(result).toEqual(expected);
  });

  it('passes the pipeline input Datatable through as table on the result', () => {
    const resolvedTable: Datatable = {
      type: 'datatable',
      columns: [
        { id: '@timestamp', name: '@timestamp', meta: { type: 'date' } },
        { id: ARGS.yAccessor, name: ARGS.yAccessor, meta: { type: 'number' } },
      ],
      rows: [{ '@timestamp': '2024-01-01T00:00:00.000Z', [ARGS.yAccessor]: 0.42 }],
    };

    const result = pointsLayerFunction.fn(resolvedTable, ARGS, {} as any);

    expect(result.table).toBe(resolvedTable);
  });
});
