/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getAdjustedInterval } from '@kbn/charts-plugin/public';
import type { DatatableUtilitiesService } from '@kbn/data-plugin/common';
import type { CommonXYDataLayerConfig } from '../../common';
import { getXDomain } from './x_domain';

const ADJUSTED_INTERVAL = 1618; // arbitrary value, just need to test that it's used

jest.mock('@kbn/charts-plugin/public', () => ({
  Endzones: () => null,
  getAdjustedInterval: jest.fn(() => ADJUSTED_INTERVAL),
}));

const getAdjustedIntervalMock = getAdjustedInterval as jest.MockedFunction<
  typeof getAdjustedInterval
>;

beforeEach(() => {
  getAdjustedIntervalMock.mockClear();
});

interface DateHistogramMeta {
  timeRange?: { from: string; to: string };
  dropPartials?: boolean;
}

const createDatatableUtilities = (meta?: DateHistogramMeta): DatatableUtilitiesService =>
  ({
    getDateHistogramMeta: jest.fn().mockReturnValue(meta),
  } as unknown as DatatableUtilitiesService);

const createLayer = (values: number[]): CommonXYDataLayerConfig =>
  ({
    xAccessor: 'x',
    table: {
      columns: [{ id: 'x', name: 'x', meta: { type: 'date', field: '@timestamp' } }],
      rows: values.map((value) => ({ x: value })),
    },
  } as unknown as CommonXYDataLayerConfig);

// [1970-01-01T00:00:00.000Z, 1970-01-01T00:00:10.000Z], so timestamps map to 0..10000ms.
const TIME_RANGE = {
  from: '1970-01-01T00:00:00.000Z',
  to: '1970-01-01T00:00:10.000Z',
};
const ONE_SECOND = 1000;

describe('getXDomain', () => {
  it('builds the domain from the applied time range and the bucket grid', () => {
    const datatableUtilities = createDatatableUtilities({
      timeRange: TIME_RANGE,
      dropPartials: false,
    });

    const { baseDomain, extendedDomain } = getXDomain(
      datatableUtilities,
      [createLayer([2000, 5000])],
      ONE_SECOND,
      true,
      false,
      true,
      'UTC'
    );

    expect(baseDomain).toEqual({ min: 0, max: 10000, minInterval: ONE_SECOND });
    expect(extendedDomain).toHaveProperty('min', 0);
    expect(extendedDomain).toHaveProperty('max', 9000);
    expect(extendedDomain).toHaveProperty('minInterval', ADJUSTED_INTERVAL);
  });

  it('clamps strictly to fully-contained buckets when dropPartials is true', () => {
    const datatableUtilities = createDatatableUtilities({
      timeRange: TIME_RANGE,
      dropPartials: true,
    });

    const { extendedDomain } = getXDomain(
      datatableUtilities,
      [createLayer([2000, 5000])],
      ONE_SECOND,
      true,
      false,
      true,
      'UTC'
    );

    expect(extendedDomain).toHaveProperty('min', 1000);
    expect(extendedDomain).toHaveProperty('max', 9000);
  });

  it('returns the base domain when no interval is available', () => {
    const datatableUtilities = createDatatableUtilities({
      timeRange: TIME_RANGE,
      dropPartials: false,
    });

    const { baseDomain, extendedDomain } = getXDomain(
      datatableUtilities,
      [createLayer([2000, 5000])],
      undefined,
      true,
      false,
      true,
      'UTC'
    );

    expect(baseDomain).toHaveProperty('minInterval', undefined);
    expect(extendedDomain).toBe(baseDomain);
  });

  it('feeds the full reconstructed grid (not the sparse values) to getAdjustedInterval', () => {
    const datatableUtilities = createDatatableUtilities({
      timeRange: TIME_RANGE,
      dropPartials: false,
    });

    getXDomain(
      datatableUtilities,
      [createLayer([2000, 7000])],
      ONE_SECOND,
      true,
      false,
      true,
      'UTC'
    );

    const [gridArg] = getAdjustedIntervalMock.mock.calls[0];
    expect(gridArg).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]);
  });
});
