/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import useInterval from 'react-use/lib/useInterval';
import { EuiBasicTable, EuiBadge, EuiCallOut, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { Discovery } from '@kbn/significant-events-schema';
import { RUNNING_POLL_INTERVAL_MS } from '../../../constants';
import {
  useFetchDiscoveriesEntities,
  useFetchDiscoveryHistory,
} from '../../../../../hooks/significant_events/use_fetch_discoveries_entities';
import { useTimefilter } from '../../../../../hooks/use_timefilter';
import { useSignificantEventsDiscoveryContext } from '../../context/significant_events_discovery_context';
import { DiscoveryFlyout } from './discovery_flyout';
import { FindSignificantEventsButton } from '../streams_view/find_significant_events_button';
import { StreamsAppSearchBar } from '../../../../streams_app_search_bar';
import { formatTimestamp } from '../../../../../util/formatters';
import { DISCOVERY_KIND_LABELS } from '../shared/translations';
import { DISCOVERY_KIND_COLORS } from '../shared/constants';

const MAX_VISIBLE_STREAMS = 3;

const EVENT_PROCESSED_LABEL = i18n.translate('xpack.streams.discoveriesTab.eventStatus.processed', {
  defaultMessage: 'Processed',
});

const EVENT_PENDING_LABEL = i18n.translate('xpack.streams.discoveriesTab.eventStatus.pending', {
  defaultMessage: 'Pending',
});

const columns: Array<EuiBasicTableColumn<Discovery>> = [
  {
    field: 'discovered_at',
    name: i18n.translate('xpack.streams.discoveriesTab.timestampColumn', {
      defaultMessage: 'Timestamp',
    }),
    width: '200px',
    render: (discoveredAt: string | undefined, discovery: Discovery) =>
      formatTimestamp(discoveredAt ?? discovery['@timestamp']),
  },
  {
    field: 'kind',
    name: i18n.translate('xpack.streams.discoveriesTab.kindColumn', {
      defaultMessage: 'Kind',
    }),
    width: '100px',
    render: (kind: Discovery['kind']) => (
      <EuiBadge color={DISCOVERY_KIND_COLORS[kind]}>{DISCOVERY_KIND_LABELS[kind]}</EuiBadge>
    ),
  },
  {
    field: 'title',
    name: i18n.translate('xpack.streams.discoveriesTab.titleColumn', {
      defaultMessage: 'Title',
    }),
    truncateText: true,
  },
  {
    name: i18n.translate('xpack.streams.discoveriesTab.streamsColumn', {
      defaultMessage: 'Streams',
    }),
    width: '160px',
    render: (discovery: Discovery) => {
      const streamNames = [
        ...new Set(
          (discovery.detections ?? []).map((d) => d.stream_name).filter((s): s is string => !!s)
        ),
      ];
      return (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {streamNames.slice(0, MAX_VISIBLE_STREAMS).map((name) => (
            <EuiFlexItem key={name} grow={false} style={{ maxWidth: '200px' }}>
              <EuiBadge color="hollow">{name}</EuiBadge>
            </EuiFlexItem>
          ))}
          {streamNames.length > MAX_VISIBLE_STREAMS && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">+{streamNames.length - MAX_VISIBLE_STREAMS}</EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      );
    },
  },
  {
    field: 'criticality',
    name: i18n.translate('xpack.streams.discoveriesTab.criticalityColumn', {
      defaultMessage: 'Criticality',
    }),
    width: '100px',
    render: (value: number | undefined) => (value != null ? String(value) : '-'),
  },
  {
    field: 'confidence',
    name: i18n.translate('xpack.streams.discoveriesTab.confidenceColumn', {
      defaultMessage: 'Confidence',
    }),
    width: '100px',
    render: (value: number | undefined) => (value != null ? `${value}%` : '-'),
  },
  {
    name: i18n.translate('xpack.streams.discoveriesTab.eventColumn', {
      defaultMessage: 'Status',
    }),
    width: '130px',
    render: (discovery: Discovery) =>
      discovery.processed ? (
        <EuiBadge color="success">{EVENT_PROCESSED_LABEL}</EuiBadge>
      ) : (
        <EuiBadge color="hollow">{EVENT_PENDING_LABEL}</EuiBadge>
      ),
  },
];

export const DiscoveriesTab = () => {
  const { timeState } = useTimefilter();

  const { isRunning, isCanceling, handleRun, handleCancel } =
    useSignificantEventsDiscoveryContext();

  const { data, isLoading, isError, refetch, pagination, setPagination } =
    useFetchDiscoveriesEntities({
      from: timeState.start,
      to: timeState.end,
    });
  useInterval(refetch, isRunning ? RUNNING_POLL_INTERVAL_MS : null);

  const [selectedDiscovery, setSelectedDiscovery] = useState<Discovery | undefined>();

  const { data: historyData, isLoading: isHistoryLoading } = useFetchDiscoveryHistory(
    selectedDiscovery?.discovery_slug
  );

  const onTableChange = ({ page }: { page?: { index: number; size: number } }) => {
    if (page) {
      setPagination({ page: page.index + 1, perPage: page.size });
    }
  };

  const euiPagination = {
    pageIndex: pagination.page - 1,
    pageSize: pagination.perPage,
    totalItemCount: data?.total ?? 0,
    pageSizeOptions: [10, 25, 50],
  };

  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="flexEnd" alignItems="center" wrap={false}>
          <EuiFlexItem grow={false}>
            <StreamsAppSearchBar showDatePicker enableDateRangePicker />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <FindSignificantEventsButton
              onRun={handleRun}
              onCancel={handleCancel}
              isRunning={isRunning}
              isCanceling={isCanceling}
              isDisabled={isRunning}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {isError && (
        <EuiFlexItem grow={false}>
          <EuiCallOut
            announceOnMount
            title={i18n.translate('xpack.streams.discoveriesTab.fetchError', {
              defaultMessage: 'Failed to load discoveries',
            })}
            color="danger"
            iconType="error"
            size="s"
          />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <EuiBasicTable
          tableCaption={i18n.translate('xpack.streams.discoveriesTab.tableCaption', {
            defaultMessage: 'Discoveries',
          })}
          items={data?.hits ?? []}
          columns={columns}
          pagination={euiPagination}
          onChange={onTableChange}
          loading={isLoading}
          noItemsMessage={i18n.translate('xpack.streams.discoveriesTab.emptyBody', {
            defaultMessage: 'No discoveries found.',
          })}
          rowProps={(item) => ({
            onClick: () => setSelectedDiscovery(item),
            css: css`
              cursor: pointer;
            `,
          })}
        />
      </EuiFlexItem>
      {selectedDiscovery && (
        <DiscoveryFlyout
          discovery={selectedDiscovery}
          history={historyData?.hits ?? []}
          isHistoryLoading={isHistoryLoading}
          onClose={() => setSelectedDiscovery(undefined)}
        />
      )}
    </EuiFlexGroup>
  );
};
