/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { ChangeEvent } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EuiTableFieldDataColumnType,
  EuiTableActionsColumnType,
  Criteria,
} from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButtonIcon,
  EuiComboBox,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiSuperDatePicker,
  EuiToolTip,
  type OnTimeChangeProps,
  useEuiTheme,
} from '@elastic/eui';
import { FormattedMessage, FormattedDate } from '@kbn/i18n-react';
import { useLinkProps, useUiTracker } from '@kbn/observability-shared-plugin/public';
import type { Filter, TimeRange } from '@kbn/es-query';
import { css } from '@emotion/react';
import type { SnapshotMetricType } from '@kbn/metrics-data-access-plugin/common';
import { type HostsLocatorParams, HOSTS_LOCATOR_ID } from '@kbn/observability-shared-plugin/common';
import { useWaffleOptionsContext } from '../../../../pages/metrics/inventory_view/hooks/use_waffle_options';
import { HOST_NAME_FIELD } from '../../../../../common/constants';
import { buildCombinedAssetFilter } from '../../../../utils/filters/build';
import { useKibanaContextForPlugin } from '../../../../hooks/use_kibana';
import type { FetcherOptions } from '../../../../hooks/use_fetcher';
import { datemathToEpochMillis } from '../../../../utils/datemath';
import { useSorting } from '../../../../hooks/use_sorting';
import { useMetricsK8sAnomaliesResults } from '../../../../pages/metrics/inventory_view/hooks/use_metrics_k8s_anomalies';
import { useMetricsHostsAnomaliesResults } from '../../../../pages/metrics/inventory_view/hooks/use_metrics_hosts_anomalies';
import type {
  Metric,
  MetricsHostsAnomaly,
  Sort,
} from '../../../../../common/http_api/infra_ml/results';
import { PaginationControls } from './pagination';
import { AnomalySummary } from './annomaly_summary';
import { AnomalySeverityIndicator } from '../../../logging/log_analysis_results/anomaly_severity_indicator';
import { useMetricsDataViewContext, useSourceContext } from '../../../../containers/metrics_source';
import { createResultsUrl } from '../flyout_home';
import { useWaffleFiltersContext } from '../../../../pages/metrics/inventory_view/hooks/use_waffle_filters';
import { useWaffleTimeContext } from '../../../../pages/metrics/inventory_view/hooks/use_waffle_time';

type JobType = 'k8s' | 'hosts';
type SortField = 'anomalyScore' | 'startTime';

interface JobOption {
  id: JobType;
  label: string;
}

const AnomalyActionMenu = ({
  jobId,
  type,
  startTime,
  closeFlyout,
  influencerField,
  influencers,
  disableShowInInventory,
  hostName,
  timeRange,
}: {
  jobId: string;
  type: string;
  startTime: number;
  closeFlyout?: () => void;
  influencerField: string;
  influencers: string[];
  disableShowInInventory?: boolean;
  hostName?: string;
  timeRange: { start: string; end: string };
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), [setIsOpen]);
  const handleToggleMenu = useCallback(() => setIsOpen(!isOpen), [isOpen]);
  const { setWaffleOptionsState } = useWaffleOptionsContext();
  const { setWaffleFiltersState } = useWaffleFiltersContext();
  const { setWaffleTimeState } = useWaffleTimeContext();
  const { metricsView } = useMetricsDataViewContext();
  const {
    services: { share },
  } = useKibanaContextForPlugin();
  const hostsLocator = share.url.locators.get<HostsLocatorParams>(HOSTS_LOCATOR_ID);

  const showInInventory = useCallback(() => {
    const metricTypeMap: { [key in Metric]: SnapshotMetricType } = {
      memory_usage: 'memory',
      network_in: 'rx',
      network_out: 'tx',
    };
    // parse the anomaly job id for metric type
    const jobIdParts = jobId.split('-');
    const jobIdMetric = jobIdParts[jobIdParts.length - 1];
    const metricType = metricTypeMap[jobIdMetric.replace(/hosts_|k8s_/, '') as Metric];

    setWaffleOptionsState({
      metric: { type: metricType },
      sort: { by: 'name', direction: 'desc' },
      groupBy: [],
      nodeType: type === 'metrics_k8s' ? 'pod' : 'host',
      view: 'map',
      customOptions: [],
      customMetrics: [],
      boundsOverride: { max: 1, min: 0 },
      autoBounds: true,
      accountId: '',
      region: '',
    });

    setWaffleTimeState({
      currentTime: startTime,
      isAutoReloading: false,
    });

    setWaffleFiltersState({
      query: {
        query: influencers.reduce((query, i) => {
          if (query) {
            query = `${query} or `;
          }
          return `${query} ${influencerField}: "${i}"`;
        }, ''),
        language: 'kuery',
      },
    });

    if (closeFlyout) closeFlyout();
  }, [
    closeFlyout,
    influencerField,
    influencers,
    jobId,
    setWaffleFiltersState,
    setWaffleOptionsState,
    setWaffleTimeState,
    startTime,
    type,
  ]);

  const anomaliesUrl = useLinkProps({
    app: 'ml',
    pathname: `/explorer?_g=${createResultsUrl([jobId.toString()])}`,
  });

  const items = [
    <EuiContextMenuItem
      key="openInAnomalyExplorer"
      icon="external"
      data-test-subj="infraAnomalyFlyoutOpenInAnomalyExplorer"
      {...anomaliesUrl}
    >
      <FormattedMessage
        id="xpack.infra.ml.anomalyFlyout.actions.openInAnomalyExplorer"
        defaultMessage="Open in Anomaly Explorer"
      />
    </EuiContextMenuItem>,
  ];

  if (!disableShowInInventory) {
    const buildFilter = buildCombinedAssetFilter({
      field: HOST_NAME_FIELD,
      values: influencers,
      dataView: metricsView?.dataViewReference,
    });

    let newFilter: Filter[] = [];
    if (!Array.isArray(buildFilter)) {
      newFilter = [buildFilter];
    }

    const showInHostsItem = !hostName ? (
      <EuiContextMenuItem
        key="showAffectedHosts"
        icon="magnify"
        data-test-subj="infraAnomalyFlyoutShowAffectedHosts"
        href={hostsLocator?.getRedirectUrl({
          dateRange: {
            from: timeRange.start,
            to: timeRange.end,
          },
          filters: newFilter,
        })}
      >
        <FormattedMessage
          id="xpack.infra.ml.anomalyFlyout.actions.showAffectedHosts"
          defaultMessage="Show affected Hosts"
        />
      </EuiContextMenuItem>
    ) : (
      <></>
    );

    items.push(
      influencerField === HOST_NAME_FIELD ? (
        showInHostsItem
      ) : (
        <EuiContextMenuItem
          icon="magnify"
          data-test-subj="infraAnomalyFlyoutShowInInventory"
          onClick={showInInventory}
        >
          <FormattedMessage
            id="xpack.infra.ml.anomalyFlyout.actions.showInInventory"
            defaultMessage="Show in Inventory"
          />
        </EuiContextMenuItem>
      )
    );
  }

  return (
    <EuiPopover
      anchorPosition="downRight"
      panelPaddingSize="none"
      aria-label={i18n.translate('xpack.infra.ml.anomalyFlyout.actions.menuAriaLabel', {
        defaultMessage: 'Anomaly actions',
      })}
      button={
        <EuiToolTip
          content={i18n.translate('xpack.infra.ml.anomalyFlyout.actions.openActionMenu', {
            defaultMessage: 'Open',
          })}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            data-test-subj="infraAnomalyActionMenuButton"
            iconType="boxesVertical"
            onClick={handleToggleMenu}
            aria-label={i18n.translate('xpack.infra.ml.anomalyFlyout.actions.openActionMenu', {
              defaultMessage: 'Open',
            })}
          />
        </EuiToolTip>
      }
      isOpen={isOpen}
      closePopover={close}
    >
      <EuiContextMenuPanel items={items} />
    </EuiPopover>
  );
};
export const NoAnomaliesFound = () => {
  const euiTheme = useEuiTheme();
  return (
    <div
      css={css`
        align-self: center;
      `}
    >
      <EuiEmptyPrompt
        iconType="eyeSlash"
        iconColor={euiTheme.euiTheme.colors.mediumShade}
        title={
          <h3 data-test-subj="noAnomaliesFoundMsg">
            <FormattedMessage
              id="xpack.infra.ml.anomalyFlyout.anomalyTable.noAnomaliesFound"
              defaultMessage="No anomalies found"
            />
          </h3>
        }
        body={
          <FormattedMessage
            id="xpack.infra.ml.anomalyFlyout.anomalyTable.noAnomaliesSuggestion"
            defaultMessage="Try modifying your search or selected time range."
          />
        }
      />
    </div>
  );
};
export interface Props {
  closeFlyout?(): void;
  hostName?: string;
  dateRange?: TimeRange;
  // In case the date picker is managed outside this component
  hideDatePicker?: boolean;
  // subject to watch the completion of the request
  fetcherOpts?: Pick<FetcherOptions, 'autoFetch' | 'requestObservable$'>;
  hideSelectGroup?: boolean;
}

const DEFAULT_DATE_RANGE: TimeRange = {
  from: 'now-30d',
  to: 'now',
};

const JOB_OPTIONS = [
  {
    id: `hosts` as JobType,
    label: i18n.translate('xpack.infra.ml.anomalyFlyout.hostBtn', {
      defaultMessage: 'Hosts',
    }),
    'data-test-subj': 'anomaliesHostComboBoxItem',
  },
  {
    id: `k8s` as JobType,
    label: i18n.translate('xpack.infra.ml.anomalyFlyout.podsBtn', {
      defaultMessage: 'Kubernetes Pods',
    }),
    'data-test-subj': 'anomaliesK8sComboBoxItem',
  },
];

export const AnomaliesTable = ({
  closeFlyout,
  hostName,
  dateRange = DEFAULT_DATE_RANGE,
  hideDatePicker = false,
  fetcherOpts,
  hideSelectGroup,
}: Props) => {
  const [search, setSearch] = useState('');
  const trackMetric = useUiTracker({ app: 'infra_metrics' });
  const [timeRange, setTimeRange] = useState<{ start: string; end: string }>({
    start: dateRange.from,
    end: dateRange.to,
  });
  const { sorting, setSorting } = useSorting<MetricsHostsAnomaly>({
    field: 'startTime',
    direction: 'desc',
  });

  const [jobType, setJobType] = useState<JobType>(JOB_OPTIONS[0].id);
  const [selectedJobType, setSelectedJobType] = useState<JobOption[]>([JOB_OPTIONS[0]]);
  const { source } = useSourceContext();
  const anomalyThreshold = source?.configuration.anomalyThreshold;

  const onTimeChange = useCallback(
    ({ isInvalid, start: startChange, end: endChange }: OnTimeChangeProps) => {
      if (!isInvalid) {
        setTimeRange({
          start: startChange,
          end: endChange,
        });
      }
    },
    []
  );

  const getTimeRange = useCallback(() => {
    const { start, end } = hideDatePicker
      ? {
          start: dateRange.from,
          end: dateRange.to,
        }
      : timeRange;

    return {
      start: datemathToEpochMillis(start) || 0,
      end: datemathToEpochMillis(end, 'up') || 0,
    };
  }, [dateRange.from, dateRange.to, hideDatePicker, timeRange]);

  const anomalyParams = useMemo(() => {
    const { start, end } = getTimeRange();
    return {
      sourceId: 'default',
      anomalyThreshold: anomalyThreshold || 0,
      startTime: start,
      endTime: end,
      defaultSortOptions: {
        direction: sorting?.direction || 'desc',
        field: (sorting?.field || 'startTime') as SortField,
      },
      defaultPaginationOptions: { pageSize: 10 },
      search,
      hostName,
    };
  }, [anomalyThreshold, getTimeRange, hostName, search, sorting?.direction, sorting?.field]);

  const {
    metricsHostsAnomalies,
    getMetricsHostsAnomalies,
    page: hostPage,
    changeSortOptions: hostChangeSort,
    fetchNextPage: hostFetchNextPage,
    fetchPreviousPage: hostFetchPrevPage,
    isPendingMetricsHostsAnomalies: hostLoading,
  } = useMetricsHostsAnomaliesResults(anomalyParams, {
    request$: fetcherOpts?.requestObservable$,
    active: jobType === 'hosts' && fetcherOpts?.autoFetch,
  });
  const {
    metricsK8sAnomalies,
    getMetricsK8sAnomalies,
    page: k8sPage,
    changeSortOptions: k8sChangeSort,
    fetchNextPage: k8sFetchNextPage,
    fetchPreviousPage: k8sFetchPrevPage,
    isPendingMetricsK8sAnomalies: k8sLoading,
  } = useMetricsK8sAnomaliesResults(anomalyParams, {
    request$: fetcherOpts?.requestObservable$,
    active: jobType === 'k8s' && fetcherOpts?.autoFetch,
  });

  const { page, isLoading, fetchNextPage, fetchPreviousPage, results, fetchAnomalies, handleSort } =
    useMemo(() => {
      const isHost = jobType === 'hosts';
      return {
        page: isHost ? hostPage : k8sPage,
        isLoading: isHost ? hostLoading : k8sLoading,
        fetchNextPage: isHost ? hostFetchNextPage : k8sFetchNextPage,
        fetchPreviousPage: isHost ? hostFetchPrevPage : k8sFetchPrevPage,
        results: isHost ? metricsHostsAnomalies : metricsK8sAnomalies,
        fetchAnomalies: isHost ? getMetricsHostsAnomalies : getMetricsK8sAnomalies,
        handleSort: isHost ? hostChangeSort : k8sChangeSort,
      };
    }, [
      jobType,
      hostPage,
      k8sPage,
      hostLoading,
      k8sLoading,
      hostFetchNextPage,
      k8sFetchNextPage,
      hostFetchPrevPage,
      k8sFetchPrevPage,
      metricsHostsAnomalies,
      metricsK8sAnomalies,
      getMetricsHostsAnomalies,
      getMetricsK8sAnomalies,
      hostChangeSort,
      k8sChangeSort,
    ]);

  useEffect(() => {
    fetchAnomalies();
  }, [jobType, fetchAnomalies]);

  const onSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const changeJobType = useCallback((selectedOptions: any) => {
    setSelectedJobType(selectedOptions);
    setJobType(selectedOptions[0].id);
  }, []);

  const changeSortOptions = useCallback(
    (nextSortOptions: Sort) => {
      handleSort(nextSortOptions);
    },
    [handleSort]
  );

  useEffect(() => {
    if (results) {
      results.forEach((r) => {
        if (r.influencers.length > 100) {
          trackMetric({ metric: 'metrics_ml_anomaly_detection_more_than_100_influencers' });
        }
      });
    }
  }, [results, trackMetric]);

  const onTableChange = (criteria: Criteria<MetricsHostsAnomaly>) => {
    setSorting(criteria.sort);
    changeSortOptions({
      field: (criteria?.sort?.field || 'startTime') as SortField,
      direction: criteria?.sort?.direction || 'desc',
    });
  };

  const columns: Array<
    | EuiTableFieldDataColumnType<MetricsHostsAnomaly>
    | EuiTableActionsColumnType<MetricsHostsAnomaly>
  > = [
    {
      field: 'startTime',
      name: i18n.translate('xpack.infra.ml.anomalyFlyout.columnTime', {
        defaultMessage: 'Time',
      }),
      width: '15%',
      sortable: true,
      textOnly: true,
      truncateText: true,
      render: (startTime: number) => (
        <FormattedDate value={startTime} year="numeric" month="short" day="2-digit" />
      ),
    },
    {
      field: 'jobId',
      name: i18n.translate('xpack.infra.ml.anomalyFlyout.columnJob', {
        defaultMessage: 'Job',
      }),
      width: '25%',
      render: (jobId: string) => jobId,
      'data-test-subj': 'anomalyRow',
    },
    {
      field: 'anomalyScore',
      name: i18n.translate('xpack.infra.ml.anomalyFlyout.columnSeverit', {
        defaultMessage: 'Severity',
      }),
      width: '15%',
      sortable: true,
      render: (anomalyScore: number) => <AnomalySeverityIndicator anomalyScore={anomalyScore} />,
    },
    {
      field: 'typical',
      name: i18n.translate('xpack.infra.ml.anomalyFlyout.columnSummary', {
        defaultMessage: 'Summary',
      }),
      width: '15%',
      textOnly: true,
      render: (typical: number, item: MetricsHostsAnomaly) => <AnomalySummary anomaly={item} />,
    },
    {
      field: 'influencers',
      name: i18n.translate('xpack.infra.ml.anomalyFlyout.columnInfluencerName', {
        defaultMessage: 'Node name',
      }),
      width: '20%',
      textOnly: true,
      truncateText: true,
      render: (influencers: string[]) => influencers.join(','),
      'data-test-subj': 'nodeNameRow',
    },
    {
      name: i18n.translate('xpack.infra.ml.anomalyFlyout.columnActionsName', {
        defaultMessage: 'Actions',
      }),
      width: '10%',
      actions: [
        {
          render: (anomaly: MetricsHostsAnomaly) => {
            return (
              <AnomalyActionMenu
                jobId={anomaly.jobId}
                type={anomaly.type}
                influencerField={
                  anomaly.type === 'metrics_hosts' ? 'host.name' : 'kubernetes.pod.uid'
                }
                disableShowInInventory={anomaly.influencers.length > 100}
                influencers={anomaly.influencers}
                startTime={anomaly.startTime}
                closeFlyout={closeFlyout}
                hostName={hostName}
                timeRange={timeRange}
              />
            );
          },
        },
      ],
    },
  ];

  const filteredColumns = hostName
    ? columns.filter((c) => !('field' in c && c.field === 'influencers'))
    : columns;

  return (
    <EuiFlexGroup direction="column">
      {!hideDatePicker && (
        <EuiFlexItem grow={false}>
          <EuiSuperDatePicker
            start={timeRange.start}
            end={timeRange.end}
            showUpdateButton={false}
            onTimeChange={onTimeChange}
            width="full"
          />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        {!hostName && (
          <EuiFlexGroup alignItems="center">
            <EuiFlexItem grow={3}>
              <EuiFieldSearch
                data-test-subj="infraAnomaliesTableFieldSearch"
                fullWidth
                placeholder={i18n.translate('xpack.infra.ml.anomalyFlyout.searchPlaceholder', {
                  defaultMessage: 'Search',
                })}
                value={search}
                onChange={onSearchChange}
                isClearable={true}
              />
            </EuiFlexItem>
            {!hideSelectGroup && (
              <EuiFlexItem grow={1}>
                <EuiComboBox
                  aria-label={i18n.translate(
                    'xpack.infra.anomaliesTable.selectgroupComboBox.ariaLabel',
                    { defaultMessage: 'Select group' }
                  )}
                  placeholder={i18n.translate('xpack.infra.ml.anomalyFlyout.jobTypeSelect', {
                    defaultMessage: 'Select group',
                  })}
                  singleSelection={{ asPlainText: true }}
                  options={JOB_OPTIONS}
                  selectedOptions={selectedJobType}
                  onChange={changeJobType}
                  fullWidth
                  isClearable={false}
                  data-test-subj="anomaliesComboBoxType"
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        )}
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBasicTable<MetricsHostsAnomaly>
          columns={filteredColumns}
          items={results}
          sorting={{ sort: sorting }}
          onChange={onTableChange}
          loading={isLoading}
          tableCaption={i18n.translate('xpack.infra.ml.anomalyFlyout.anomaliesCaption', {
            defaultMessage: 'Anomaly detection results',
          })}
          noItemsMessage={
            isLoading ? (
              <FormattedMessage
                id="xpack.infra.ml.anomalyFlyout.anomalyTable.loading"
                defaultMessage="Loading anomalies"
              />
            ) : (
              <NoAnomaliesFound />
            )
          }
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <PaginationControls
          fetchNextPage={fetchNextPage}
          fetchPreviousPage={fetchPreviousPage}
          page={page}
          isLoading={isLoading}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
