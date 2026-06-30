/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useState, useEffect } from 'react';
import type { DashboardSearchResponseBody } from '@kbn/dashboard-plugin/server';
import { i18n } from '@kbn/i18n';
import { FETCH_STATUS } from '../../../hooks/use_fetcher';
import { useKibanaContextForPlugin } from '../../../hooks/use_kibana';
import { useTabSwitcherContext } from './use_tab_switcher';

export interface SearchDashboardsResult {
  data: DashboardSearchResponseBody['data'];
  status: FETCH_STATUS;
}

export function useDashboardFetcher(query = ''): SearchDashboardsResult {
  const {
    services: { dashboard, notifications },
  } = useKibanaContextForPlugin();
  const [result, setResult] = useState<SearchDashboardsResult>({
    data: [],
    status: FETCH_STATUS.NOT_INITIATED,
  });
  const { isActiveTab } = useTabSwitcherContext();

  useEffect(() => {
    const getDashboards = async () => {
      setResult({
        data: [],
        status: FETCH_STATUS.LOADING,
      });
      try {
        const findDashboardsService = await dashboard?.findDashboardsService();
        const { data } = await findDashboardsService.search({
          query,
          per_page: 1000,
        });

        setResult({
          data,
          status: FETCH_STATUS.SUCCESS,
        });
      } catch (error) {
        setResult({
          data: [],
          status: FETCH_STATUS.FAILURE,
        });
        notifications.toasts.addDanger({
          title: i18n.translate('xpack.infra.fetchingDashboards.addFailure.toast.title', {
            defaultMessage: 'Error while fetching dashboards',
          }),
          text: error.message,
        });
      }
    };
    if (isActiveTab('dashboards')) {
      getDashboards();
    }
  }, [dashboard, notifications.toasts, query, isActiveTab]);
  return result;
}
