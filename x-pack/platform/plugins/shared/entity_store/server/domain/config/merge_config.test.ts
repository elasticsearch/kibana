/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityType } from '../../../common/domain/definitions/entity_schema';
import type { LogExtractionConfig } from '../saved_objects';
import {
  LATEST_LOG_EXTRACTION_DEFAULTS,
  LOG_EXTRACTION_FREQUENCY_DEFAULT,
  LOG_EXTRACTION_LOOKBACK_PERIOD_DEFAULT,
  LOG_EXTRACTION_MAX_LOGS_PER_WINDOW_DEFAULT,
} from '../saved_objects';
import { DEFAULT_CONFIG_BY_TYPE, getMergedConfig } from './merge_config';

const ALL_TYPES: readonly EntityType[] = ['user', 'host', 'service', 'generic'];

describe('getMergedConfig', () => {
  describe('with nothing overridden anywhere', () => {
    it('is a no-op for existing deployments: every entity type resolves to the built-in defaults', () => {
      for (const type of ALL_TYPES) {
        expect(getMergedConfig(type, {}, undefined)).toEqual(LATEST_LOG_EXTRACTION_DEFAULTS);
      }
    });

    it('resolves the same config for all four entity types', () => {
      const [first, ...rest] = ALL_TYPES.map((type) => getMergedConfig(type, {}, undefined));
      for (const config of rest) {
        expect(config).toEqual(first);
      }
    });
  });

  describe('layer precedence', () => {
    it('lets a store-wide override win over the code default', () => {
      const merged = getMergedConfig('user', { frequency: '5m' }, undefined);

      expect(merged).toEqual({ ...LATEST_LOG_EXTRACTION_DEFAULTS, frequency: '5m' });
    });

    it('lets a per entity-type override win over a store-wide override', () => {
      const merged = getMergedConfig('user', { frequency: '5m' }, { frequency: '10m' });

      expect(merged).toEqual({ ...LATEST_LOG_EXTRACTION_DEFAULTS, frequency: '10m' });
    });

    it('composes a store-wide override on one field with a per entity-type override on another', () => {
      const merged = getMergedConfig('user', { frequency: '5m' }, { lookbackPeriod: '6h' });

      expect(merged).toEqual({
        ...LATEST_LOG_EXTRACTION_DEFAULTS,
        frequency: '5m',
        lookbackPeriod: '6h',
      });
    });

    it('ignores a per entity-type override that targets a different entity type', () => {
      const hostOverride = { frequency: '10m' };

      expect(getMergedConfig('user', {}, undefined)).toEqual(LATEST_LOG_EXTRACTION_DEFAULTS);
      expect(getMergedConfig('host', {}, hostOverride)).toEqual({
        ...LATEST_LOG_EXTRACTION_DEFAULTS,
        frequency: '10m',
      });
    });
  });

  describe('cleared and absent fields', () => {
    it('falls through a null per entity-type field to the store-wide value', () => {
      const merged = getMergedConfig('user', { frequency: '5m' }, { frequency: null });

      expect(merged.frequency).toBe('5m');
      expect(merged).toEqual({ ...LATEST_LOG_EXTRACTION_DEFAULTS, frequency: '5m' });
    });

    it('falls through a null per entity-type field to the code default when nothing is set store-wide', () => {
      const merged = getMergedConfig('user', {}, { frequency: null });

      expect(merged.frequency).toBe(LOG_EXTRACTION_FREQUENCY_DEFAULT);
      expect(merged).toEqual(LATEST_LOG_EXTRACTION_DEFAULTS);
    });

    it('ignores undefined values in a layer instead of clobbering the layer below', () => {
      const merged = getMergedConfig(
        'user',
        { frequency: '5m', lookbackPeriod: '6h' },
        { frequency: undefined }
      );

      expect(merged).toEqual({
        ...LATEST_LOG_EXTRACTION_DEFAULTS,
        frequency: '5m',
        lookbackPeriod: '6h',
      });
    });
  });

  describe('per entity-type code defaults', () => {
    const seededTypes: readonly EntityType[] = ['user'];
    const saved = new Map<EntityType, Partial<LogExtractionConfig> | undefined>();

    beforeEach(() => {
      for (const type of seededTypes) {
        saved.set(type, DEFAULT_CONFIG_BY_TYPE[type]);
      }
    });

    afterEach(() => {
      for (const type of seededTypes) {
        const previous = saved.get(type);
        if (previous === undefined) {
          delete DEFAULT_CONFIG_BY_TYPE[type];
        } else {
          DEFAULT_CONFIG_BY_TYPE[type] = previous;
        }
      }
      saved.clear();
    });

    it('ships empty, so no entity type currently deviates from the store-wide code defaults', () => {
      expect(Object.keys(DEFAULT_CONFIG_BY_TYPE)).toEqual([]);
    });

    it('lets a seeded per entity-type default win over the store-wide code default', () => {
      DEFAULT_CONFIG_BY_TYPE.user = { frequency: '2m' };

      expect(getMergedConfig('user', {}, undefined)).toEqual({
        ...LATEST_LOG_EXTRACTION_DEFAULTS,
        frequency: '2m',
      });
      expect(getMergedConfig('host', {}, undefined)).toEqual(LATEST_LOG_EXTRACTION_DEFAULTS);
    });

    it('lets a store-wide override win over a seeded per entity-type default', () => {
      DEFAULT_CONFIG_BY_TYPE.user = { frequency: '2m' };

      expect(getMergedConfig('user', { frequency: '5m' }, undefined)).toEqual({
        ...LATEST_LOG_EXTRACTION_DEFAULTS,
        frequency: '5m',
      });
    });
  });

  describe('non-string fields', () => {
    it('round-trips numbers, arrays and enums through the merge', () => {
      const merged = getMergedConfig(
        'user',
        { maxLogsPerWindow: 250_000, additionalIndexPatterns: ['logs-*'] },
        { maxLogsPerWindowCapBehavior: 'defer', docsLimit: 42 }
      );

      expect(merged).toEqual({
        ...LATEST_LOG_EXTRACTION_DEFAULTS,
        maxLogsPerWindow: 250_000,
        additionalIndexPatterns: ['logs-*'],
        maxLogsPerWindowCapBehavior: 'defer',
        docsLimit: 42,
      });
    });

    it('keeps the default numeric and enum values when no layer speaks to them', () => {
      const merged = getMergedConfig('user', {}, {});

      expect(merged.maxLogsPerWindow).toBe(LOG_EXTRACTION_MAX_LOGS_PER_WINDOW_DEFAULT);
      expect(merged.lookbackPeriod).toBe(LOG_EXTRACTION_LOOKBACK_PERIOD_DEFAULT);
      expect(merged.maxLogsPerWindowCapBehavior).toBe('drop');
    });
  });

  describe('validation of the merged result', () => {
    it('throws when a layer supplies a value that is not a valid duration string', () => {
      expect(() => getMergedConfig('user', { frequency: 'nonsense' }, undefined)).toThrow();
    });

    it('throws when a layer supplies a number outside the schema bounds', () => {
      expect(() => getMergedConfig('user', {}, { docsLimit: 0 })).toThrow();
    });
  });
});
