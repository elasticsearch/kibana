/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import useInterval from 'react-use/lib/useInterval';
import {
  EuiBasicTable,
  EuiBadge,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { Detection } from '@kbn/significant-events-schema';
import { RUNNING_POLL_INTERVAL_MS } from '../../../constants';
import { useFetchDetections } from '../../../../../hooks/significant_events/use_fetch_detections';
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
  pending: i18n.translate('xpack.streams.detectionsTab.statusPending', {
    defaultMessage: 'Pending',
  }),
};

const VIEW_DETAILS_ARIA_LABEL = i18n.translate('xpack.streams.detectionsTab.viewDetailsAriaLabel', {
  defaultMessage: 'View details',
});

const MINIMIZE_DETAILS_ARIA_LABEL = i18n.translate(
  'xpack.streams.detectionsTab.minimizeDetailsAriaLabel',
  { defaultMessage: 'Collapse details' }
);

const kindLabel = (kind: Detection['kind']) => DETECTION_KIND_LABELS[kind] ?? kind;
const kindColor = (kind: Detection['kind']) => DETECTION_KIND_COLORS[kind] ?? 'default';

export const DetectionsTab = () => {
  const { euiTheme } = useEuiTheme();
  const { timeState } = useTimefilter();

  const { isRunning, isCanceling, handleRun, handleCancel } =
    useSignificantEventsDiscoveryContext();

  const { data, isLoading, isError, refetch, pagination, setPagination } = useFetchDetections({
    from: timeState.start,
    to: timeState.end,
  });
  useInterval(refetch, isRunning ? RUNNING_POLL_INTERVAL_MS : null);

  const [selectedDetection, setSelectedDetection] = useState<Detection | undefined>();
  const selectedDetectionId = selectedDetection?.detection_id;

  const toggleSelectedDetection = useCallback((detection: Detection) => {
    setSelectedDetection((current) =>
      current?.detection_id === detection.detection_id ? undefined : detection
    );
  }, []);

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

  const columns: Array<EuiBasicTableColumn<Detection>> = useMemo(
    () => [
      {
        name: '',
        width: '40px',
        render: (detection: Detection) => {
          const isExpanded = selectedDetectionId === detection.detection_id;
          return (
            <EuiToolTip
              content={isExpanded ? MINIMIZE_DETAILS_ARIA_LABEL : VIEW_DETAILS_ARIA_LABEL}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                data-test-subj="detectionsDetailsButton"
                iconType={isExpanded ? 'minimize' : 'expand'}
                aria-label={isExpanded ? MINIMIZE_DETAILS_ARIA_LABEL : VIEW_DETAILS_ARIA_LABEL}
                onClick={() => toggleSelectedDetection(detection)}
              />
            </EuiToolTip>
          );
        },
      },
      {
        field: 'rule_name',
        name: i18n.translate('xpack.streams.detectionsTab.ruleColumn', {
          defaultMessage: 'Rule',
        }),
        render: (_: unknown, detection: Detection) => (
          <EuiButtonEmpty size="s" flush="both" onClick={() => toggleSelectedDetection(detection)}>
            {detection.rule_name}
          </EuiButtonEmpty>
        ),
      },
      {
        name: i18n.translate('xpack.streams.detectionsTab.changeTypeColumn', {
          defaultMessage: 'Change',
        }),
        width: '140px',
        render: (detection: Detection) => {
          const changeType = detection.detection_evidence?.change_point_type;
          if (!changeType) {
            return '-';
          }
          return <EuiBadge color="hollow">{CHANGE_TYPE_LABELS[changeType] ?? changeType}</EuiBadge>;
        },
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
        field: '@timestamp',
        name: i18n.translate('xpack.streams.detectionsTab.timestampColumn', {
          defaultMessage: 'Timestamp',
        }),
        width: '200px',
        render: (timestamp: string) => formatTimestamp(timestamp),
      },
      {
        field: 'stream_name',
        name: i18n.translate('xpack.streams.detectionsTab.streamColumn', {
          defaultMessage: 'Stream',
        }),
        width: '140px',
        render: (streamName?: string) =>
          streamName ? <EuiBadge color="hollow">{streamName}</EuiBadge> : null,
      },
      {
        name: i18n.translate('xpack.streams.detectionsTab.discoveryColumn', {
          defaultMessage: 'Discovery',
        }),
        width: '100px',
        render: (detection: Detection) => {
          if (detection.processed) {
            return <EuiBadge color="success">{DISCOVERY_STATUS_LABELS.processed}</EuiBadge>;
          }
          return <EuiBadge color="hollow">{DISCOVERY_STATUS_LABELS.pending}</EuiBadge>;
        },
      },
    ],
    [selectedDetectionId, toggleSelectedDetection]
  );

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
          css={css`
            & thead tr {
              background-color: ${euiTheme.colors.backgroundBaseSubdued};
            }
          `}
          tableCaption={i18n.translate('xpack.streams.detectionsTab.tableCaption', {
            defaultMessage: 'Detections',
          })}
          items={data?.hits ?? []}
          itemId="detection_id"
          columns={columns}
          pagination={euiPagination}
          onChange={onTableChange}
          loading={isLoading}
          noItemsMessage={i18n.translate('xpack.streams.detectionsTab.emptyBody', {
            defaultMessage: 'No detections found.',
          })}
          rowProps={(detection: Detection) => ({
            isSelected: selectedDetectionId === detection.detection_id,
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
