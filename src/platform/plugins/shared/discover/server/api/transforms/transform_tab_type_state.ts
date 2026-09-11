/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DiscoverTabType } from '@kbn/discover-session-constants';
import type { DiscoverSessionTabAttributes } from '@kbn/saved-search-plugin/server';
import type {
  DiscoverSessionApiClassicTab,
  DiscoverSessionApiEsqlTab,
  DiscoverSessionApiTab,
  DiscoverSessionApiTabTypeState,
} from '@kbn/as-code-discover-schema';
import { isDiscoverSessionEsqlTab } from '../../../common/embeddable';

type StoredTabTypeState = DiscoverSessionTabAttributes['tabTypeState'];
type TabWithoutTypeState =
  | Omit<DiscoverSessionApiClassicTab, 'type'>
  | Omit<DiscoverSessionApiEsqlTab, 'type'>;

export const transformTabTypeStateIn = (
  apiTabTypeState: DiscoverSessionApiTabTypeState
): StoredTabTypeState => {
  switch (apiTabTypeState.type) {
    case DiscoverTabType.Default:
      // Default tabs have no tabTypeState in the saved object.
      return undefined;
    case DiscoverTabType.Metrics:
      return {
        type: DiscoverTabType.Metrics,
        dimensions: apiTabTypeState.dimensions,
        searchTerm: apiTabTypeState.search_term,
        counterAggregation: apiTabTypeState.counter_aggregation,
        gaugeAggregation: apiTabTypeState.gauge_aggregation,
        histogramPercentile: apiTabTypeState.histogram_percentile,
      };
  }
};

export const transformTabTypeStateOut = (
  apiTab: TabWithoutTypeState,
  tabTypeState: StoredTabTypeState
): DiscoverSessionApiTab => {
  switch (tabTypeState?.type) {
    case undefined:
      // The API always includes a type, using default when the saved object has no tabTypeState.
      return { ...apiTab, type: DiscoverTabType.Default };
    case DiscoverTabType.Metrics:
      if (!isDiscoverSessionEsqlTab(apiTab)) {
        throw new Error(
          `Metrics tab "${apiTab.label}" with ID "${apiTab.id}" requires an ES|QL data source.`
        );
      }

      return {
        ...apiTab,
        type: DiscoverTabType.Metrics,
        dimensions: tabTypeState.dimensions,
        search_term: tabTypeState.searchTerm,
        counter_aggregation: tabTypeState.counterAggregation,
        gauge_aggregation: tabTypeState.gaugeAggregation,
        histogram_percentile: tabTypeState.histogramPercentile,
      };
  }
};
