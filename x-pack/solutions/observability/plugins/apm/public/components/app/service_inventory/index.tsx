/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiEmptyPrompt, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { usePerformanceContext } from '@kbn/ebt-tools';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { type APIReturnType } from '@kbn/apm-api-shared';
import { ApmDocumentType } from '@kbn/apm-types';
import type { ServiceListItem } from '../../../../common/service_inventory';
import type { ServiceInventoryFieldName } from '../../../../common/service_inventory';
import { useAnomalyDetectionJobsContext } from '../../../context/anomaly_detection_jobs/use_anomaly_detection_jobs_context';
import { useApmPluginContext } from '../../../context/apm_plugin/use_apm_plugin_context';
import { useApmParams } from '../../../hooks/use_apm_params';
import { useStateDebounced } from '../../../hooks/use_debounce';
import { FETCH_STATUS, isFailure, isPending } from '../../../hooks/use_fetcher';
import { useLocalStorage } from '../../../hooks/use_local_storage';
import { usePreferredDataSourceAndBucketSize } from '../../../hooks/use_preferred_data_source_and_bucket_size';
import { useProgressiveFetcher } from '../../../hooks/use_progressive_fetcher';
import { useTimeRange } from '../../../hooks/use_time_range';
import type { SortFunction } from '../../shared/managed_table';
import { MLCallout, shouldDisplayMlCallout } from '../../shared/ml_callout';
import { isTimeComparison } from '../../shared/time_comparison/get_comparison_options';
import { ApmServicesTable } from './service_list/apm_services_table';
import { getAvailableFields, orderServiceItems } from './service_list/order_service_items';
import { type ApmPluginStartDeps, type ApmServices } from '../../../plugin';

type MainStatisticsApiResponse = APIReturnType<'GET /internal/apm/services'>;

const INITIAL_PAGE_SIZE = 25;
const INITIAL_DATA: MainStatisticsApiResponse & { requestId: string } = {
  requestId: '',
  items: [],
  serviceOverflowCount: 0,
  maxCountExceeded: false,
};

function useServicesMainStatisticsFetcher(searchQuery: string | undefined) {
  const {
    query: {
      rangeFrom,
      rangeTo,
      environment,
      kuery,
      serviceGroup,
      page = 0,
      pageSize = INITIAL_PAGE_SIZE,
      sortDirection,
      sortField,
    },
  } = useApmParams('/services');

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery,
    type: ApmDocumentType.ServiceTransactionMetric,
    numBuckets: 20,
  });

  const shouldUseDurationSummary = !!preferred?.source?.hasDurationSummaryField;

  const { data = INITIAL_DATA, status } = useProgressiveFetcher(
    (callApmApi) => {
      if (preferred) {
        return callApmApi('GET /internal/apm/services', {
          params: {
            query: {
              environment,
              kuery,
              start,
              end,
              serviceGroup,
              useDurationSummary: shouldUseDurationSummary,
              documentType: preferred.source.documentType,
              rollupInterval: preferred.source.rollupInterval,
              searchQuery,
            },
          },
        }).then((mainStatisticsData) => {
          return {
            requestId: uuidv4(),
            ...mainStatisticsData,
          };
        });
      }
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      environment,
      kuery,
      start,
      end,
      serviceGroup,
      preferred,
      searchQuery,
      // not used, but needed to update the requestId to call the details statistics API when table options are updated
      page,
      pageSize,
      sortField,
      sortDirection,
    ]
  );

  return { mainStatisticsData: data, mainStatisticsStatus: status };
}

function useServicesDetailedStatisticsFetcher({
  renderedItems,
}: {
  renderedItems: ServiceListItem[];
}) {
  const {
    query: { rangeFrom, rangeTo, environment, kuery, offset, comparisonEnabled },
  } = useApmParams('/services');

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const dataSourceOptions = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery,
    type: ApmDocumentType.ServiceTransactionMetric,
    numBuckets: 20,
  });
  const itemsToFetch = useMemo(
    () => renderedItems.map(({ serviceName }) => serviceName),
    [renderedItems]
  );

  const comparisonFetch = useProgressiveFetcher(
    (callApmApi) => {
      if (start && end && itemsToFetch.length > 0 && dataSourceOptions) {
        return callApmApi('POST /internal/apm/services/detailed_statistics', {
          params: {
            query: {
              environment,
              kuery,
              start,
              end,
              offset: comparisonEnabled && isTimeComparison(offset) ? offset : undefined,
              documentType: dataSourceOptions.source.documentType,
              rollupInterval: dataSourceOptions.source.rollupInterval,
              bucketSizeInSeconds: dataSourceOptions.bucketSizeInSeconds,
            },
            body: {
              // Service name is sorted to guarantee the same order every time this API is called so the result can be cached.
              serviceNames: JSON.stringify(itemsToFetch),
            },
          },
        });
      }
    },
    // only fetches detailed statistics when requestId is invalidated by main statistics api call or offset is changed

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsToFetch, offset, comparisonEnabled],
    { preservePreviousData: false }
  );

  return { comparisonFetch };
}

export function ServiceInventory() {
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useStateDebounced('');
  const { onPageReady } = usePerformanceContext();
  const mainStatisticsFetch = useServicesMainStatisticsFetcher(debouncedSearchQuery);
  const [renderedItems, setRenderedItems] = useState<ServiceListItem[]>([]);
  const { mainStatisticsData, mainStatisticsStatus } = mainStatisticsFetch;
  const {
    query: { rangeFrom, rangeTo, sortField },
  } = useApmParams('/services');
  const {
    services: { telemetry },
  } = useKibana<ApmPluginStartDeps & ApmServices>();

  const serviceOverflowCount = mainStatisticsData?.serviceOverflowCount ?? 0;

  // Determine the default sort field based on available data in service items
  // Priority: alertsCount -> sloStatus -> anomalyScore -> throughput
  const {
    sortField: initialSortField,
    hasAlerts,
    hasSlos,
    hasAnomalyScores,
  } = getAvailableFields(mainStatisticsData.items);

  const initialSortDirection = 'desc';

  const { comparisonFetch } = useServicesDetailedStatisticsFetcher({
    renderedItems,
  });

  const { anomalyDetectionSetupState } = useAnomalyDetectionJobsContext();

  const [userHasDismissedCallout, setUserHasDismissedCallout] = useLocalStorage(
    `apm.userHasDismissedServiceInventoryMlCallout.${anomalyDetectionSetupState}`,
    false
  );

  const displayMlCallout =
    !userHasDismissedCallout && shouldDisplayMlCallout(anomalyDetectionSetupState);

  const noItemsMessage = useMemo(() => {
    return (
      <EuiEmptyPrompt
        title={
          <div>
            {i18n.translate('xpack.apm.servicesTable.notFoundLabel', {
              defaultMessage: 'No services found',
            })}
          </div>
        }
        titleSize="s"
      />
    );
  }, []);

  const mlCallout = (
    <EuiFlexItem>
      <MLCallout
        isOnSettingsPage={false}
        anomalyDetectionSetupState={anomalyDetectionSetupState}
        onDismiss={() => setUserHasDismissedCallout(true)}
      />
    </EuiFlexItem>
  );

  // Track if user has explicitly selected a sort column via URL params
  const isDefaultSort = !sortField;

  const sortFn: SortFunction<ServiceListItem> = useCallback(
    (itemsToSort, currentSortField, currentSortDirection) => {
      return orderServiceItems({
        items: itemsToSort,
        sortField: currentSortField as ServiceInventoryFieldName,
        sortDirection: currentSortDirection,
        // Use multi-level sort only when no explicit sort field is in URL
        isDefaultSort,
      });
    },
    [isDefaultSort]
  );

  // TODO verify this with AI team
  const setScreenContext = useApmPluginContext().observabilityAIAssistant?.service.setScreenContext;

  useEffect(() => {
    if (!setScreenContext) {
      return;
    }

    if (isFailure(mainStatisticsStatus)) {
      return setScreenContext({
        screenDescription: 'The services have failed to load',
      });
    }

    if (isPending(mainStatisticsStatus)) {
      return setScreenContext({
        screenDescription: 'The services are still loading',
      });
    }

    return setScreenContext({
      data: [
        {
          name: 'services',
          description: 'The list of services that the user is looking at',
          value: mainStatisticsData.items,
        },
      ],
    });
  }, [mainStatisticsStatus, mainStatisticsData.items, setScreenContext]);

  useEffect(() => {
    if (
      mainStatisticsStatus === FETCH_STATUS.SUCCESS &&
      comparisonFetch.status === FETCH_STATUS.SUCCESS
    ) {
      onPageReady({
        meta: { rangeFrom, rangeTo },
      });
    }
  }, [mainStatisticsStatus, comparisonFetch.status, onPageReady, rangeFrom, rangeTo]);

  useEffect(() => {
    if (hasSlos) {
      telemetry.reportSloInfoShown();
    }
  }, [hasSlos, telemetry]);

  return (
    <>
      <EuiFlexGroup direction="column" gutterSize="m">
        {displayMlCallout && mlCallout}
        <EuiFlexItem style={{ minWidth: 0 }}>
          <ApmServicesTable
            status={mainStatisticsStatus}
            items={mainStatisticsData.items}
            comparisonDataLoading={comparisonFetch.status === FETCH_STATUS.LOADING}
            displayAnomalies={hasAnomalyScores}
            displayAlerts={hasAlerts}
            displaySlos={hasSlos}
            initialSortField={initialSortField}
            initialSortDirection={initialSortDirection}
            sortFn={sortFn}
            comparisonData={comparisonFetch?.data}
            noItemsMessage={noItemsMessage}
            initialPageSize={INITIAL_PAGE_SIZE}
            serviceOverflowCount={serviceOverflowCount}
            onChangeSearchQuery={setDebouncedSearchQuery}
            onChangeRenderedItems={setRenderedItems}
            maxCountExceeded={mainStatisticsData?.maxCountExceeded ?? false}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
}
