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
import type { Detection } from '@kbn/streams-schema';
import { RUNNING_POLL_INTERVAL_MS } from '../../../constants';
import { useFetchDetections } from '../../../../../hooks/sig_events/use_fetch_detections';
import { useTimefilter } from '../../../../../hooks/use_timefilter';
import { useSignificantEventsDiscoveryContext } from '../../context/significant_events_discovery_context';
import { DetectionFlyout } from './detection_flyout';
import { FindSignificantEventsButton } from '../streams_view/find_significant_events_button';
import { StreamsAppSearchBar } from '../../../../streams_app_search_bar';
import { formatTimestamp } from '../../../../../util/formatters';
import { CHANGE_TYPE_LABELS, DETECTION_KIND_LABELS } from '../shared/translations';
import { DETECTION_KIND_COLORS } from '../shared/constants';

const DISCOVERY_STATUS_LABELS = {
  processed: i18n.translate('xpack.streams.detectionsTab.statusProcessed', {
    defaultMessage: 'Processed',
  }),
  missed: i18n.translate('xpack.streams.detectionsTab.statusMissed', {
    defaultMessage: 'Missed',
  }),
  pending: i18n.translate('xpack.streams.detectionsTab.statusPending', {
    defaultMessage: 'Pending',
  }),
};

const kindLabel = (kind: Detection['kind']) => DETECTION_KIND_LABELS[kind] ?? kind;
const kindColor = (kind: Detection['kind']) => DETECTION_KIND_COLORS[kind] ?? 'default';

// Unhandled detections older than this window are outside the discovery lookback
// and won't be picked up automatically by the discovery pipeline.
const DISCOVERY_LOOKBACK_MS = 4 * 60 * 60 * 1000;

const columns: Array<EuiBasicTableColumn<Detection>> = [
  {
    field: '@timestamp',
    name: i18n.translate('xpack.streams.detectionsTab.timestampColumn', {
      defaultMessage: 'Timestamp',
    }),
    width: '200px',
    render: (timestamp: string) => formatTimestamp(timestamp),
  },
  {
    field: 'kind',
    name: i18n.translate('xpack.streams.detectionsTab.kindColumn', {
      defaultMessage: 'Kind',
    }),
    width: '100px',
    render: (kind: Detection['kind']) => (
      <EuiBadge color={kindColor(kind)}>{kindLabel(kind)}</EuiBadge>
    ),
  },
  {
    field: 'rule_name',
    name: i18n.translate('xpack.streams.detectionsTab.ruleColumn', {
      defaultMessage: 'Rule',
    }),
  },
  {
    field: 'stream_name',
    name: i18n.translate('xpack.streams.detectionsTab.streamColumn', {
      defaultMessage: 'Stream',
    }),
    width: '140px',
  },
  {
    name: i18n.translate('xpack.streams.detectionsTab.changeTypeColumn', {
      defaultMessage: 'Change',
    }),
    width: '160px',
    render: (detection: Detection) =>
      CHANGE_TYPE_LABELS[detection.detection_evidence?.change_point_type ?? ''] ??
      detection.detection_evidence?.change_point_type ??
      '-',
  },
  {
    name: i18n.translate('xpack.streams.detectionsTab.discoveryColumn', {
      defaultMessage: 'Status',
    }),
    width: '110px',
    render: (detection: Detection) => {
      if (detection.processed) {
        return <EuiBadge color="success">{DISCOVERY_STATUS_LABELS.processed}</EuiBadge>;
      }
      const docAgeMs = Date.now() - new Date(detection['@timestamp']).getTime();
      if (docAgeMs > DISCOVERY_LOOKBACK_MS) {
        return <EuiBadge color="warning">{DISCOVERY_STATUS_LABELS.missed}</EuiBadge>;
      }
      return <EuiBadge color="hollow">{DISCOVERY_STATUS_LABELS.pending}</EuiBadge>;
    },
  },
];

export const DetectionsTab = () => {
  const { timeState } = useTimefilter();

  const { isRunning, isCanceling, handleRun, handleCancel } =
    useSignificantEventsDiscoveryContext();

  const { data, isLoading, isError, refetch, pagination, setPagination } = useFetchDetections({
    from: timeState.start,
    to: timeState.end,
  });
  useInterval(refetch, isRunning ? RUNNING_POLL_INTERVAL_MS : null);

  const [selectedDetection, setSelectedDetection] = useState<Detection | undefined>();

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
            title={i18n.translate('xpack.streams.detectionsTab.fetchError', {
              defaultMessage: 'Failed to load detections',
            })}
            color="danger"
            iconType="error"
            size="s"
          />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <EuiBasicTable
          tableCaption={i18n.translate('xpack.streams.detectionsTab.tableCaption', {
            defaultMessage: 'Detections',
          })}
          items={data?.hits ?? []}
          columns={columns}
          pagination={euiPagination}
          onChange={onTableChange}
          loading={isLoading}
          noItemsMessage={i18n.translate('xpack.streams.detectionsTab.emptyBody', {
            defaultMessage: 'No detections found.',
          })}
          rowProps={(item) => ({
            onClick: () => setSelectedDetection(item),
            css: css`
              cursor: pointer;
            `,
          })}
        />
      </EuiFlexItem>
      {selectedDetection && (
        <DetectionFlyout
          detection={selectedDetection}
          onClose={() => setSelectedDetection(undefined)}
        />
      )}
    </EuiFlexGroup>
  );
};
