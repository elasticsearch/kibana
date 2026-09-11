/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useMemo, useState } from 'react';
import { toStoredFilters } from '@kbn/as-code-filters-transforms';
import { toStoredQuery } from '@kbn/as-code-shared-transforms';
import { getStateFromKbnUrl, setStateToKbnUrl, unhashUrl } from '@kbn/kibana-utils-plugin/public';
import { omit } from 'lodash';
import type { QueryState } from '@kbn/data-plugin/common';
import { DASHBOARD_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import { i18n } from '@kbn/i18n';
import moment from 'moment';
import { useBatchedPublishingSubjects } from '@kbn/presentation-publishing';
import type { LocatorPublic } from '@kbn/share-plugin/common';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { useDashboardApi } from '../../../dashboard_api/use_dashboard_api';
import { getDashboardCapabilities } from '../../../utils/get_dashboard_capabilities';
import { DASHBOARD_STATE_STORAGE_KEY } from '../../../utils/urls';
import { shareService } from '../../../services/kibana_services';
import type { DashboardLocatorParams } from '../../../../common';
import { useDashboardInternalApi } from '../../../dashboard_api/use_dashboard_internal_api';
import { logger } from '../../../services/logger';

export const useShareOptions = () => {
  const dashboardApi = useDashboardApi();
  const dashboardInternalApi = useDashboardInternalApi();

  const [dashboardTitle, lastSavedId, timeRange, viewMode] = useBatchedPublishingSubjects(
    dashboardApi.title$,
    dashboardApi.savedObjectId$,
    // subscribe to timeRange changes independently of unsaved changes
    // because timeRange changes are not included in unsaved changes when timeRestore is false
    dashboardApi.timeRange$,
    dashboardApi.viewMode$
  );

  const [unsavedChanges, setUnsavedChanges] = useState<Partial<DashboardState>>({});
  useEffect(() => {
    const subscription = dashboardInternalApi.unsavedChanges$.subscribe(setUnsavedChanges);
    return () => {
      subscription.unsubscribe();
    };
  }, [dashboardInternalApi]);

  return useMemo(() => {
    const sharableUnsavedChanges = {
      ...unsavedChanges,
      filters: toStoredFilters(unsavedChanges.filters, logger),
      query: toStoredQuery(unsavedChanges.query),
    };

    const params: DashboardLocatorParams = {
      dashboardId: lastSavedId,
      preserveSavedFilters: true,
      refresh_interval: undefined, // We don't share refresh interval externally
      viewMode: 'view', // For share locators we always load the dashboard in view mode
      useHash: false,
      time_range: timeRange,
      ...sharableUnsavedChanges,
    };

    let _g = getStateFromKbnUrl<QueryState>('_g', window.location.href);
    if (_g?.filters && _g.filters.length === 0) {
      _g = omit(_g, 'filters');
    }
    const baseUrl = setStateToKbnUrl('_g', _g, undefined, window.location.href);

    const shareableUrl = setStateToKbnUrl(
      DASHBOARD_STATE_STORAGE_KEY,
      sharableUnsavedChanges,
      { useHash: false, storeInHashQuery: true },
      unhashUrl(baseUrl)
    );

    const { createShortUrl } = getDashboardCapabilities();

    return {
      allowShortUrl: createShortUrl,
      objectId: lastSavedId,
      objectType: 'dashboard' as const,
      isDirty: viewMode === 'edit' && Object.keys(unsavedChanges ?? {}).length > 0,
      sharingData: {
        title:
          dashboardTitle ||
          i18n.translate('dashboard.share.defaultDashboardTitle', {
            defaultMessage: 'Dashboard [{date}]',
            values: { date: moment().toISOString(true) },
          }),
        locatorParams: {
          id: DASHBOARD_APP_LOCATOR,
          params,
        },
      },
      shareableUrl,
      shareableUrlLocatorParams: {
        locator: shareService?.url.locators.get(
          DASHBOARD_APP_LOCATOR
        ) as LocatorPublic<DashboardLocatorParams>,
        params,
      },
    };
  }, [dashboardTitle, lastSavedId, timeRange, viewMode, unsavedChanges]);
};
