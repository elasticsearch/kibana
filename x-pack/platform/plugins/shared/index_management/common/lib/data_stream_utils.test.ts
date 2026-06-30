/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  splitSizeAndUnits,
  serializeAsESLifecycle,
  deserializeESLifecycle,
  resolveLogisticsLifecycle,
  HOT_ONLY_INFINITE_DATA_RETENTION,
} from './data_stream_utils';

describe('Data stream utils', () => {
  test('can split size and units from lifecycle string', () => {
    expect(splitSizeAndUnits('1h')).toEqual({ size: '1', unit: 'h' });
    expect(splitSizeAndUnits('20micron')).toEqual({ size: '20', unit: 'micron' });
  });

  describe('serializeAsESLifecycle', () => {
    test('returns undefined when neither delete nor frozen is enabled', () => {
      expect(serializeAsESLifecycle(undefined)).toBeUndefined();
      expect(serializeAsESLifecycle({ enabled: false })).toBeUndefined();
      expect(
        serializeAsESLifecycle({ enabled: false, frozen: { enabled: false } })
      ).toBeUndefined();
    });

    test('serializes hot-only infinite retention', () => {
      expect(serializeAsESLifecycle({ enabled: true, infiniteDataRetention: true })).toEqual({
        enabled: true,
      });
    });

    test('serializes data retention only', () => {
      expect(serializeAsESLifecycle({ enabled: true, value: 90, unit: 'd' })).toEqual({
        enabled: true,
        data_retention: '90d',
      });
    });

    test('serializes infinite data retention without data_retention', () => {
      expect(serializeAsESLifecycle({ enabled: true, infiniteDataRetention: true })).toEqual({
        enabled: true,
      });
    });

    test('serializes frozen_after alongside data retention', () => {
      expect(
        serializeAsESLifecycle({
          enabled: true,
          value: 90,
          unit: 'd',
          frozen: { enabled: true, value: 30, unit: 'd' },
        })
      ).toEqual({ enabled: true, data_retention: '90d', frozen_after: '30d' });
    });

    test('serializes frozen_after when delete phase is disabled', () => {
      expect(
        serializeAsESLifecycle({ enabled: false, frozen: { enabled: true, value: 30, unit: 'd' } })
      ).toEqual({ enabled: true, frozen_after: '30d' });
    });
  });

  describe('resolveLogisticsLifecycle', () => {
    test('returns hot-only infinite retention for data stream templates without delete or frozen', () => {
      expect(resolveLogisticsLifecycle(undefined, { isDataStreamTemplate: true })).toEqual(
        HOT_ONLY_INFINITE_DATA_RETENTION
      );
      expect(resolveLogisticsLifecycle({ enabled: false }, { isDataStreamTemplate: true })).toEqual(
        HOT_ONLY_INFINITE_DATA_RETENTION
      );
    });

    test('preserves finite retention and frozen configuration', () => {
      const finiteRetention = { enabled: true, value: 90, unit: 'd' };
      const frozenOnly = {
        enabled: false,
        frozen: { enabled: true, value: 30, unit: 'd' },
      };

      expect(resolveLogisticsLifecycle(finiteRetention, { isDataStreamTemplate: true })).toEqual(
        finiteRetention
      );
      expect(resolveLogisticsLifecycle(frozenOnly, { isDataStreamTemplate: true })).toEqual(
        frozenOnly
      );
    });

    test('returns lifecycle unchanged for non-data-stream templates', () => {
      expect(resolveLogisticsLifecycle(undefined, { isDataStreamTemplate: false })).toBeUndefined();
      expect(
        resolveLogisticsLifecycle({ enabled: false }, { isDataStreamTemplate: false })
      ).toEqual({ enabled: false });
    });
  });

  describe('deserializeESLifecycle', () => {
    test('returns disabled when lifecycle is missing or disabled', () => {
      expect(deserializeESLifecycle(undefined)).toEqual({ enabled: false });
      expect(deserializeESLifecycle({ enabled: false })).toEqual({ enabled: false });
    });

    test('deserializes data retention', () => {
      expect(deserializeESLifecycle({ enabled: true, data_retention: '90d' })).toEqual({
        enabled: true,
        value: 90,
        unit: 'd',
      });
    });

    test('deserializes frozen_after alongside data retention', () => {
      expect(
        deserializeESLifecycle({ enabled: true, data_retention: '90d', frozen_after: '30d' })
      ).toEqual({
        enabled: true,
        value: 90,
        unit: 'd',
        frozen: { enabled: true, value: 30, unit: 'd' },
      });
    });

    test('deserializes frozen_after with infinite data retention', () => {
      expect(deserializeESLifecycle({ enabled: true, frozen_after: '30d' })).toEqual({
        enabled: true,
        infiniteDataRetention: true,
        frozen: { enabled: true, value: 30, unit: 'd' },
      });
    });
  });
});
