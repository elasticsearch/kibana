/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
  formatNumber,
} from '@elastic/eui';
import { calculatePercentage } from '@kbn/dataset-quality-plugin/public';
import { i18n } from '@kbn/i18n';
import { isEnabledFailureStore, Streams } from '@kbn/streams-schema';
import React, { useMemo } from 'react';
import { useStreamDetail } from '../../hooks/use_stream_detail';
import { useStreamsAppFetch } from '../../hooks/use_streams_app_fetch';
import { useStreamsAppRouter } from '../../hooks/use_streams_app_router';
import { useTimeRange } from '../../hooks/use_time_range';
import { useKibana } from '../../hooks/use_kibana';
import { executeEsqlQuery } from '../../hooks/use_execute_esql_query';
import {
  buildDataQualityDegradedDocCountEsql,
  buildDataQualityIgnoredFieldsCountEsql,
  buildDataQualityTotalDocCountEsql,
} from '../../util/stream_overview_esql';
import { StatCell, TrendSubtitle } from './stat_cell';
import { TopFailureReasons } from './top_failure_reasons';

export function DataQualityCard() {
  const { definition } = useStreamDetail();

  if (!Streams.ingest.all.GetResponse.is(definition)) {
    return null;
  }

  return <DataQualityCardContent definition={definition} />;
}

function DataQualityCardContent({ definition }: { definition: Streams.ingest.all.GetResponse }) {
  const router = useStreamsAppRouter();
  const { rangeFrom, rangeTo } = useTimeRange();
  const {
    core: { application, uiSettings },
    dependencies: {
      start: {
        data,
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();

  const canReadFailureStore = definition.privileges.read_failure_store;
  const failureStoreEnabled = isEnabledFailureStore(definition.effective_failure_store);
  const canQueryFailureStore = canReadFailureStore && failureStoreEnabled;
  const streamName = definition.stream.name;

  const dataSourceForTimeRange = canQueryFailureStore
    ? `${streamName},${streamName}::failures`
    : streamName;

  // Total docs: simple COUNT(*) over the selected time range.
  // Includes ::failures when the user has read_failure_store privilege
  const totalDocsResult = useStreamsAppFetch(
    async ({ signal, timeState: ts }) => {
      if (!ts) return 0;
      const response = await executeEsqlQuery({
        query: buildDataQualityTotalDocCountEsql(dataSourceForTimeRange),
        search: data.search.search,
        signal,
        start: ts.start,
        end: ts.end,
        uiSettings,
      });
      const colIdx = response.columns.findIndex((c) => c.name === 'doc_count');
      return colIdx !== -1 ? (response.values[0]?.[colIdx] as number) ?? 0 : 0;
    },
    [dataSourceForTimeRange, data.search.search, uiSettings],
    { withTimeRange: true, withRefresh: true }
  );

  // Degraded docs: documents with at least one ignored field (_ignored) in the same time range
  // and data sources as total docs. (The degraded REST API is not time-filtered and only hits
  // the latest backing index — mixing it with a time-filtered total produced >100% percentages.)
  const degradedDocsResult = useStreamsAppFetch(
    async ({ signal, timeState: ts }) => {
      if (!ts) return 0;
      const response = await executeEsqlQuery({
        query: buildDataQualityDegradedDocCountEsql(dataSourceForTimeRange),
        search: data.search.search,
        signal,
        start: ts.start,
        end: ts.end,
        uiSettings,
      });
      const colIdx = response.columns.findIndex((c) => c.name === 'degraded_doc_count');
      return colIdx !== -1 ? (response.values[0]?.[colIdx] as number) ?? 0 : 0;
    },
    [dataSourceForTimeRange, data.search.search, uiSettings],
    { withTimeRange: true, withRefresh: true }
  );

  // Failed docs: documents routed to the failure store (time-filtered).
  // Only fetched when the user has read_failure_store privilege.
  const failedDocsResult = useStreamsAppFetch(
    async ({ signal, timeState: ts }) => {
      if (!canQueryFailureStore) return 0;
      if (!ts) return 0;
      const result = await streamsRepositoryClient.fetch(
        'GET /internal/streams/doc_counts/failed',
        {
          signal,
          params: { query: { stream: streamName, start: ts.start, end: ts.end } },
        }
      );
      return result.find((d) => d.stream === streamName)?.count ?? 0;
    },
    [streamName, streamsRepositoryClient, canQueryFailureStore],
    { withTimeRange: true, withRefresh: true }
  );

  // Unique ignored field names: COUNT_DISTINCT(_ignored) over the current time range.
  const ignoredFieldsResult = useStreamsAppFetch(
    async ({ signal, timeState: ts }) => {
      if (!ts) return 0;
      const response = await executeEsqlQuery({
        query: buildDataQualityIgnoredFieldsCountEsql(dataSourceForTimeRange),
        search: data.search.search,
        signal,
        start: ts.start,
        end: ts.end,
        uiSettings,
      });
      const countCol = response.columns.findIndex((c) => c.name === 'ignored_fields_count');
      return countCol !== -1 ? (response.values[0]?.[countCol] as number) ?? 0 : 0;
    },
    [dataSourceForTimeRange, data.search.search, uiSettings],
    { withTimeRange: true, withRefresh: true }
  );

  const totalDocs = totalDocsResult.value ?? 0;
  const degradedDocs = degradedDocsResult.value ?? 0;
  const failedDocs = failedDocsResult.value ?? 0;

  const degradedPercentage = useMemo(
    () => calculatePercentage({ totalDocs, count: degradedDocs }),
    [totalDocs, degradedDocs]
  );

  const failedPercentage = useMemo(
    () => calculatePercentage({ totalDocs, count: failedDocs }),
    [totalDocs, failedDocs]
  );

  const isQualityLoading =
    totalDocsResult.loading || degradedDocsResult.loading || failedDocsResult.loading;

  const degradedColor =
    degradedPercentage === 0 ? 'success' : degradedPercentage <= 3 ? 'warning' : 'danger';

  const dataQualityTabHref = router.link('/{key}/management/{tab}', {
    path: { key: streamName, tab: 'dataQuality' as const },
    query: { rangeFrom, rangeTo },
  });

  const formatPct = (value: number) => `${formatNumber(value, '0.[00]')}%`;

  return (
    <EuiPanel hasBorder paddingSize="m">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h2>
              {i18n.translate('xpack.streams.streamOverview.dataQualityCard.title', {
                defaultMessage: 'Dataset quality',
              })}
            </h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem />
        <EuiFlexItem grow={false}>
          <EuiLink
            href={dataQualityTabHref}
            data-test-subj="streamsOverviewDataQualityLink"
            onMouseDown={(e: React.MouseEvent) => {
              // Only handle plain left clicks; let modifier combos (Ctrl/Cmd+click etc.) use the href.
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              // Prevent focus-on-mousedown. Without this, focus triggers a connector
              // re-fetch → React re-render → inner scroll container resets → mouseup
              // lands on a different element → the browser never fires the click event.
              e.preventDefault();
              application.navigateToUrl(dataQualityTabHref);
            }}
          >
            {i18n.translate('xpack.streams.streamOverview.dataQualityCard.viewAll', {
              defaultMessage: 'View all',
            })}
          </EuiLink>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup wrap>
        <EuiFlexItem>
          <EuiFlexGroup>
            <StatCell
              data-test-subj="streamsOverviewDegradedDocs"
              title={i18n.translate('xpack.streams.streamOverview.dataQualityCard.degradedDocs', {
                defaultMessage: 'Degraded docs',
              })}
              value={
                isQualityLoading ? <EuiLoadingSpinner size="m" /> : formatPct(degradedPercentage)
              }
              valueColor={isQualityLoading ? undefined : degradedColor}
              subtitle={<TrendSubtitle trend={null} loading={isQualityLoading} />}
            />

            <StatCell
              data-test-subj="streamsOverviewFailedDocs"
              title={i18n.translate('xpack.streams.streamOverview.dataQualityCard.failedDocs', {
                defaultMessage: 'Failed docs',
              })}
              value={canReadFailureStore ? formatPct(failedPercentage) : <FailedDocsNoPrivilege />}
              subtitle={
                <TrendSubtitle
                  trend={null}
                  loading={canReadFailureStore && failedDocsResult.loading}
                />
              }
            />

            <StatCell
              data-test-subj="streamsOverviewIgnoredFields"
              title={i18n.translate('xpack.streams.streamOverview.dataQualityCard.ignoredFields', {
                defaultMessage: 'Ignored fields',
              })}
              value={
                ignoredFieldsResult.loading ? (
                  <EuiLoadingSpinner size="m" />
                ) : (
                  formatNumber(ignoredFieldsResult.value ?? 0, '0,0')
                )
              }
              unit={i18n.translate(
                'xpack.streams.streamOverview.dataQualityCard.ignoredFields.unit',
                {
                  defaultMessage: 'fields',
                }
              )}
              subtitle={<TrendSubtitle trend={null} loading={ignoredFieldsResult.loading} />}
            />
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <TopFailureReasons
            streamName={streamName}
            canReadFailureStore={canQueryFailureStore}
            failedDocs={failedDocs}
            failedDocsLoading={failedDocsResult.loading}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}

function FailedDocsNoPrivilege() {
  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      <span>{'—'}</span>
      <EuiToolTip
        content={i18n.translate(
          'xpack.streams.streamOverview.dataQualityCard.failedDocsNoPrivilege',
          { defaultMessage: 'You do not have the required privilege to view failure store data.' }
        )}
      >
        <EuiButtonIcon
          iconType="warning"
          color="text"
          size="xs"
          href="https://www.elastic.co/docs/manage-data/data-store/data-streams/failure-store"
          target="_blank"
          aria-label={i18n.translate(
            'xpack.streams.streamOverview.dataQualityCard.failedDocsNoPrivilegeAriaLabel',
            { defaultMessage: 'Insufficient privilege — learn more about failure store' }
          )}
        />
      </EuiToolTip>
    </EuiFlexGroup>
  );
}
