/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import useAsync from 'react-use/lib/useAsync';
import {
  getESQLAdHocDataview,
  getESQLQueryColumns,
  getIndexForESQLQuery,
  getInitialESQLQuery,
} from '@kbn/esql-utils';
import { withSuspense } from '@kbn/shared-ux-utility';
import type { LensSerializedState } from '@kbn/lens-plugin/public';
import { getLensAttributesFromSuggestion } from '@kbn/visualization-utils';
import { AbortReason } from '@kbn/kibana-utils-plugin/common';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import {
  coreServices,
  dataService,
  dataViewEditorService,
  embeddableService,
  noDataPageService,
  shareService,
  lensService,
} from '../../services/kibana_services';
import { getDashboardBackupService } from '../../services/dashboard_api_services';
import { dashboardClient } from '../../dashboard_client';

export const DashboardAppNoDataPage = ({
  onDataViewCreated,
}: {
  onDataViewCreated: () => void;
}) => {
  const analyticsServices = {
    coreStart: coreServices,
    dataViews: dataService.dataViews,
    dataViewEditor: dataViewEditorService,
    noDataPage: noDataPageService,
    share: shareService,
  };
  const [abortController, setAbortController] = useState(new AbortController());
  const importPromise = import('@kbn/shared-ux-page-analytics-no-data');
  const AnalyticsNoDataPageKibanaProvider = withSuspense(
    React.lazy(() =>
      importPromise.then(({ AnalyticsNoDataPageKibanaProvider: NoDataProvider }) => {
        return { default: NoDataProvider };
      })
    )
  );

  const lensHelpersAsync = useAsync(() => {
    return lensService?.stateHelperApi() ?? Promise.resolve(null);
  }, [lensService]);

  useEffect(() => {
    return () => {
      abortController?.abort(AbortReason.CLEANUP);
    };
  }, [abortController]);

  const onTryESQL = useCallback(async () => {
    abortController?.abort(AbortReason.REPLACED);
    if (lensHelpersAsync.value) {
      const abc = new AbortController();
      const indexName = (await getIndexForESQLQuery({ http: coreServices.http })) ?? '*';
      const dataView = await getESQLAdHocDataview({
        dataViewsService: dataService.dataViews,
        query: `FROM ${indexName}`,
        http: coreServices.http,
      });
      const esqlQuery = getInitialESQLQuery(dataView);

      try {
        const columns = await getESQLQueryColumns({
          esqlQuery,
          search: dataService.search.search,
          signal: abc.signal,
          timeRange: dataService.query.timefilter.timefilter.getAbsoluteTime(),
        });

        // lens suggestions api context
        const context = {
          dataViewSpec: dataView?.toSpec(false),
          fieldName: '',
          textBasedColumns: columns,
          query: { esql: esqlQuery },
        };

        setAbortController(abc);

        const chartSuggestions = lensHelpersAsync.value.suggestions(context, dataView);
        if (chartSuggestions?.length) {
          const [suggestion] = chartSuggestions;

          await embeddableService
            .getStateTransfer()
            .navigateToWithEmbeddablePackages<LensSerializedState>('dashboards', {
              state: [
                {
                  type: LENS_EMBEDDABLE_TYPE,
                  serializedState: {
                    attributes: getLensAttributesFromSuggestion({
                      filters: [],
                      query: {
                        esql: esqlQuery,
                      },
                      suggestion,
                      dataView,
                    }),
                  },
                },
              ],
              path: '#/create',
            });
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          coreServices.notifications.toasts.addWarning(
            i18n.translate('dashboard.noDataviews.esqlRequestWarningMessage', {
              defaultMessage: 'Unable to load columns. {errorMessage}',
              values: { errorMessage: error.message },
            })
          );
        }
      }
    }
  }, [abortController, lensHelpersAsync.value]);

  const AnalyticsNoDataPage = withSuspense(
    React.lazy(() =>
      importPromise.then(({ AnalyticsNoDataPage: NoDataPage }) => {
        return { default: NoDataPage };
      })
    )
  );

  return (
    <AnalyticsNoDataPageKibanaProvider {...analyticsServices}>
      <AnalyticsNoDataPage onDataViewCreated={onDataViewCreated} onTryESQL={onTryESQL} />
    </AnalyticsNoDataPageKibanaProvider>
  );
};

export const isDashboardAppInNoDataState = async () => {
  const hasUserDataView = await dataService.dataViews.hasData.hasUserDataView().catch(() => false);
  if (hasUserDataView) return false;

  // consider has data if there is unsaved dashboard with edits
  if (getDashboardBackupService().dashboardHasUnsavedEdits()) return false;

  // consider has data if there is at least one dashboard
  const { total } = await dashboardClient
    .search({ query: '', per_page: 1 })
    .then(({ meta }) => meta)
    .catch(() => ({ total: 0 }));
  if (total > 0) return false;

  return true;
};
