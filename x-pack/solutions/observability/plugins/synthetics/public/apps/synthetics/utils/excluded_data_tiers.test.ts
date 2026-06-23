/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTier } from '@kbn/observability-shared-plugin/common';
import { kibanaService } from '../../../utils/kibana_service';
import { applyExcludedDataTiersToParams, getExcludedDataTiers } from './excluded_data_tiers';

describe('excluded data tiers (client)', () => {
  const getMock = jest.fn();

  const setExcludedTiers = (tiers: DataTier[] | undefined) => {
    getMock.mockReturnValue(tiers);
    // @ts-expect-error partial CoreStart stub for the singleton under test
    kibanaService.coreStart = { uiSettings: { get: getMock } };
  };

  afterEach(() => {
    getMock.mockReset();
    // @ts-expect-error reset the singleton between tests
    kibanaService.coreStart = undefined;
  });

  describe('getExcludedDataTiers', () => {
    it('reads the searchExcludedDataTiers advanced setting', () => {
      setExcludedTiers(['data_frozen']);

      expect(getExcludedDataTiers()).toEqual(['data_frozen']);
      expect(getMock).toHaveBeenCalledWith('observability:searchExcludedDataTiers', []);
    });

    it('returns [] when uiSettings is unavailable', () => {
      // coreStart is undefined (see afterEach), so accessing uiSettings throws
      expect(getExcludedDataTiers()).toEqual([]);
    });

    it('returns [] when the setting resolves to undefined', () => {
      setExcludedTiers(undefined);

      expect(getExcludedDataTiers()).toEqual([]);
    });
  });

  describe('applyExcludedDataTiersToParams', () => {
    const matchAll = { match_all: {} };

    it('returns the params untouched when no tiers are excluded', () => {
      setExcludedTiers([]);
      const params = { index: 'synthetics-*', query: matchAll };

      expect(applyExcludedDataTiersToParams(params)).toBe(params);
    });

    it('wraps an existing query with a must_not _tier filter', () => {
      setExcludedTiers(['data_cold', 'data_frozen']);

      expect(applyExcludedDataTiersToParams({ index: 'synthetics-*', query: matchAll })).toEqual({
        index: 'synthetics-*',
        query: {
          bool: {
            filter: [
              matchAll,
              { bool: { must_not: [{ terms: { _tier: ['data_cold', 'data_frozen'] } }] } },
            ],
          },
        },
      });
    });

    it('builds a filter-only query when there is no original query', () => {
      setExcludedTiers(['data_frozen']);

      expect(applyExcludedDataTiersToParams({ index: 'synthetics-*', size: 1 })).toEqual({
        index: 'synthetics-*',
        size: 1,
        query: {
          bool: {
            filter: [{ bool: { must_not: [{ terms: { _tier: ['data_frozen'] } }] } }],
          },
        },
      });
    });

    it('preserves other params (size, aggs) while wrapping the query', () => {
      setExcludedTiers(['data_frozen']);
      const aggs = { total: { cardinality: { field: 'monitor.id' } } };

      expect(
        applyExcludedDataTiersToParams({ index: 'synthetics-*', size: 0, aggs, query: matchAll })
      ).toEqual({
        index: 'synthetics-*',
        size: 0,
        aggs,
        query: {
          bool: {
            filter: [matchAll, { bool: { must_not: [{ terms: { _tier: ['data_frozen'] } }] } }],
          },
        },
      });
    });
  });
});
