/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DiscoverTabType } from '@kbn/discover-session-constants';
import { ProfileStateRegistry } from '../profile_state';
import { METRICS_STATE_DEF } from '../profile_state_definitions/metrics_grid_profile_state';
import { METRICS_GRID_SAVED_STATE_TRANSFORM } from './metrics_grid_saved_state_transform';

const createRegistry = () => {
  const registry = new ProfileStateRegistry();
  registry.registerDefinition(METRICS_STATE_DEF);
  registry.registerTransform(METRICS_GRID_SAVED_STATE_TRANSFORM);
  return registry;
};

describe('METRICS_GRID_SAVED_STATE_TRANSFORM', () => {
  it('saves and restores grid settings', () => {
    const registry = createRegistry();
    const savedState = registry.toSavedState(DiscoverTabType.Metrics, {
      metricsState: {
        counterAggregation: 'max',
        gaugeAggregation: 'min',
        histogramPercentile: 'p50',
        dimensions: ['host.name'],
        searchTerm: 'bytes',
        sortField: 'recency',
        sortDirection: 'desc',
      },
    });

    expect(savedState).toEqual({
      type: DiscoverTabType.Metrics,
      counterAggregation: 'max',
      gaugeAggregation: 'min',
      histogramPercentile: 'p50',
      dimensions: ['host.name'],
      searchTerm: 'bytes',
    });
    expect(registry.fromSavedState(savedState)).toEqual({
      metricsState: {
        counterAggregation: 'max',
        gaugeAggregation: 'min',
        histogramPercentile: 'p50',
        dimensions: ['host.name'],
        searchTerm: 'bytes',
      },
    });
  });

  it('expands grid setting defaults when saving', () => {
    expect(createRegistry().toSavedState(DiscoverTabType.Metrics, {})).toEqual({
      type: DiscoverTabType.Metrics,
      counterAggregation: 'sum',
      gaugeAggregation: 'avg',
      histogramPercentile: 'p95',
      dimensions: [],
      searchTerm: '',
    });
  });
});
