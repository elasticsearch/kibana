/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { Filter, Query, AggregateQuery, TimeRange } from '@kbn/es-query';
import type { RefreshInterval } from '@kbn/data-plugin/public';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import type { DiscoverAppLocatorParams } from '../../../../common/app_locator';
import type { ProfileStateMap } from '../../../../common/context_awareness';
import type { TabState } from '../state_management/redux';
import { getExpandedDocRef } from './expanded_doc';

type DiscoverLocatorParams = DiscoverAppLocatorParams & { timeRange: TimeRange | undefined };

/**
 * Builds shared locator params, including URL-only values spread from the tab's app state.
 */
export const getDiscoverLocatorParams = ({
  currentTab,
  dataView,
  persistedDiscoverSession,
  filters,
  timeRange,
  refreshInterval,
  profileState,
}: {
  currentTab: TabState;
  dataView: DataView | undefined;
  persistedDiscoverSession: DiscoverSession | undefined;
  filters: Filter[];
  timeRange: TimeRange | undefined;
  refreshInterval: RefreshInterval | undefined;
  profileState: ProfileStateMap | undefined;
}): DiscoverLocatorParams => ({
  ...omit(currentTab.appState, 'dataSource'),
  ...(persistedDiscoverSession?.id ? { savedSearchId: persistedDiscoverSession.id } : {}),
  ...(dataView?.isPersisted()
    ? { dataViewId: dataView?.id }
    : { dataViewSpec: dataView?.toMinimalSpec() }),
  filters,
  timeRange,
  refreshInterval,
  profileState,
  tab: {
    id: currentTab.id,
    label: currentTab.label,
  },
});

/** Turns session locator params into a nested group-by document share. */
export const toCascadeDocShareLocatorParams = ({
  locatorParams,
  query,
  expandedDoc,
}: {
  locatorParams: DiscoverLocatorParams;
  query: Query | AggregateQuery;
  expandedDoc: DataTableRecord | undefined;
}): DiscoverLocatorParams => ({
  // We need to drop the fields that carry information about the grouped layout.
  ...omit(locatorParams, ['savedSearchId', 'grid', 'sort', 'breakdownField']),
  query,
  expandedDoc: getExpandedDocRef(expandedDoc),
  // Empty columns prevent Discover from auto-selecting INLINE STATS result fields.
  columns: [],
});
