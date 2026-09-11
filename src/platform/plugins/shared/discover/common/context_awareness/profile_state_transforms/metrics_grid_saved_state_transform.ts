/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DiscoverTabType } from '@kbn/discover-session-constants';
import { createProfileSavedStateTransform } from '../profile_state';
import { METRICS_STATE_DEF } from '../profile_state_definitions/metrics_grid_profile_state';

export const METRICS_GRID_SAVED_STATE_TRANSFORM = createProfileSavedStateTransform({
  tabType: DiscoverTabType.Metrics,
  stateDefinitions: [METRICS_STATE_DEF],
  toSavedState: ([settings]) => ({
    dimensions: settings.dimensions,
    searchTerm: settings.searchTerm,
    counterAggregation: settings.counterAggregation,
    gaugeAggregation: settings.gaugeAggregation,
    histogramPercentile: settings.histogramPercentile,
  }),
  fromSavedState: (settings) => [settings],
});
