/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback } from 'react';
import type { DataView } from '@kbn/data-views-plugin/public';
import { getDiscoverLocatorParams } from '../../utils/get_discover_locator_params';
import {
  selectCurrentProfileLocatorState,
  useCurrentTabSelector,
  useInternalStateSelector,
  useRuntimeStateManager,
} from '../../state_management/redux';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { useCopyLocatorLink } from '../../../../components/discover_grid_flyout';

/**
 * Copies a flyout link using the absolute time range that produced the current results.
 */
export const useCopyExpandedDocLink = ({ dataView }: { dataView: DataView }) => {
  const services = useDiscoverServices();
  const runtimeStateManager = useRuntimeStateManager();
  const currentTab = useCurrentTabSelector((tab) => tab);
  const persistedDiscoverSession = useInternalStateSelector(
    (state) => state.persistedDiscoverSession
  );

  const buildParams = useCallback(() => {
    const { filterManager, data, profileStateRegistry } = services;
    const { timefilter } = data.query.timefilter;

    return getDiscoverLocatorParams({
      currentTab,
      dataView,
      persistedDiscoverSession,
      filters: filterManager.getFilters(),
      timeRange: currentTab.dataRequestParams.timeRangeAbsolute ?? timefilter.getAbsoluteTime(),
      refreshInterval: timefilter.getRefreshInterval(),
      profileState: selectCurrentProfileLocatorState({
        runtimeStateManager,
        tabId: currentTab.id,
        profileStateMap: currentTab.profileState,
        profileStateRegistry,
      }),
    });
  }, [currentTab, dataView, persistedDiscoverSession, runtimeStateManager, services]);

  return useCopyLocatorLink(buildParams);
};
