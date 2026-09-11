/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { replaceUrlHashQuery } from '@kbn/kibana-utils-plugin/common';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { History } from 'history';
import { skip } from 'rxjs';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { DashboardApi } from '../../dashboard_api/types';
import { DASHBOARD_STATE_STORAGE_KEY, createDashboardEditUrl } from '../../utils/urls';
import { extractDashboardState } from './bwc/extract_dashboard_state';

/**
 * Loads any dashboard state from the URL, and removes the state from the URL.
 */
export const loadAndRemoveDashboardState = (
  kbnUrlStateStorage: IKbnUrlStateStorage
): Partial<DashboardState> => {
  const rawAppStateInUrl = kbnUrlStateStorage.get<unknown>(DASHBOARD_STATE_STORAGE_KEY);

  if (!rawAppStateInUrl) return {};

  // clear application state from URL
  const nextUrl = replaceUrlHashQuery(window.location.href, (hashQuery) => {
    delete hashQuery[DASHBOARD_STATE_STORAGE_KEY];
    return hashQuery;
  });
  kbnUrlStateStorage.kbnUrlControls.update(nextUrl, true);

  return extractDashboardState(rawAppStateInUrl);
};

export const startSyncingExpandedPanelState = ({
  dashboardApi,
  history,
}: {
  dashboardApi: DashboardApi;
  history: History;
}) => {
  const expandedPanelSubscription = dashboardApi?.expandedPanelId$
    // skip the first value because we don't want to trigger a history.replace on initial load
    .pipe(skip(1))
    .subscribe((expandedPanelId) => {
      history.replace({
        ...history.location,
        pathname: `${createDashboardEditUrl(dashboardApi.savedObjectId$.value)}${
          Boolean(expandedPanelId) ? `/${expandedPanelId}` : ''
        }`,
      });
    });
  const stopWatchingExpandedPanel = () => expandedPanelSubscription.unsubscribe();
  return { stopWatchingExpandedPanel };
};
