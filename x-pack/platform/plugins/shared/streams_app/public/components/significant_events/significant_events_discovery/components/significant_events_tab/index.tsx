/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useDebouncedValue } from '@kbn/react-hooks';
import {
  EuiBasicTable,
  EuiBadge,
  EuiButtonIcon,
  EuiCallOut,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
} from '@elastic/eui';
import type { EuiBasicTableColumn, EuiSelectableOption } from '@elastic/eui';
import { css } from '@emotion/react';
import { capitalize } from 'lodash';
import useInterval from 'react-use/lib/useInterval';
import { i18n } from '@kbn/i18n';
import { SIGNIFICANT_EVENT_STATUS_OPTIONS } from '@kbn/significant-events-schema';
import type { SignificantEvent, SignificantEventStatus } from '@kbn/significant-events-schema';
import { RUNNING_POLL_INTERVAL_MS } from '../../../constants';
import { useFetchSignificantEvents } from '../../../../../hooks/significant_events/use_fetch_significant_events';
import { useTimefilter } from '../../../../../hooks/use_timefilter';
import { useKiGeneration } from '../knowledge_indicators_table/ki_generation_context';
import { useSignificantEventsDiscoveryContext } from '../../context/significant_events_discovery_context';
import { SignificantEventFlyout } from './significant_event_flyout';
import { FindSignificantEventsButton } from '../streams_view/find_significant_events_button';
import type { StreamsAppSearchBarProps } from '../../../../streams_app_search_bar';
import { StreamsAppSearchBar } from '../../../../streams_app_search_bar';
import { formatTimestamp } from '../../../../../util/formatters';
import { FilterPopover } from './filter_popover';
import { getSignificantEventStatusColor } from '../shared/status_display';
import { SIGNIFICANT_EVENT_STATUS_LABELS } from '../shared/translations';
import { useTriggerInvestigation } from '../../../../../hooks/significant_events/use_trigger_investigation';

const RUN_ARIA_LABEL = i18n.translate(
  'xpack.streams.sigEventsTab.runInvestigationButton.ariaLabel',
  {
    defaultMessage: 'Run investigation for this event',
  }
);

const RunInvestigationCell = ({ event }: { event: SignificantEvent }) => {
  const { triggerInvestigation, isTriggering } = useTriggerInvestigation();
  return (
    <EuiButtonIcon
      iconType="inspect"
      aria-label={RUN_ARIA_LABEL}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isTriggering) triggerInvestigation(event.event_id);
      }}
      isDisabled={isTriggering}
      isLoading={isTriggering}
      size="s"
      color="primary"
      data-test-subj="sigEventRunInvestigationIconButton"
    />
  );
};

const MAX_VISIBLE_STREAMS = 3;

const clickableRowCss = css`
  cursor: pointer;
`;

const SEARCH_PLACEHOLDER = i18n.translate('xpack.streams.sigEventsTab.searchPlaceholder', {
  defaultMessage: 'Search events...',
});
const FETCH_ERROR_TITLE = i18n.translate('xpack.streams.sigEventsTab.fetchError', {
  defaultMessage: 'Failed to load significant events',
});
const TABLE_CAPTION = i18n.translate('xpack.streams.sigEventsTab.tableCaption', {
  defaultMessage: 'Significant Events',
});
const LOADING_MESSAGE = i18n.translate('xpack.streams.sigEventsTab.loadingMessage', {
  defaultMessage: 'Loading events...',
});
const EMPTY_MESSAGE = i18n.translate('xpack.streams.sigEventsTab.emptyBody', {
  defaultMessage: 'No significant events found.',
});
const MORE_LABEL = i18n.translate('xpack.streams.sigEventsTab.moreLabel', {
  defaultMessage: 'more',
});

const columns: Array<EuiBasicTableColumn<SignificantEvent>> = [
  {
    field: '@timestamp',
    name: i18n.translate('xpack.streams.sigEventsTab.timestampColumn', {
      defaultMessage: 'Timestamp',
    }),
    width: '200px',
    render: (timestamp: string) => formatTimestamp(timestamp),
  },
  {
    field: 'title',
    name: i18n.translate('xpack.streams.sigEventsTab.titleColumn', {
      defaultMessage: 'Title',
    }),
    truncateText: true,
  },
  {
    field: 'status',
    name: i18n.translate('xpack.streams.sigEventsTab.statusColumn', {
      defaultMessage: 'Status',
    }),
    width: '100px',
    render: (status: SignificantEventStatus) => (
      <EuiBadge color={getSignificantEventStatusColor(status)}>
        {SIGNIFICANT_EVENT_STATUS_LABELS[status]}
      </EuiBadge>
    ),
  },
  {
    field: 'stream_names',
    name: i18n.translate('xpack.streams.sigEventsTab.streamsColumn', {
      defaultMessage: 'Streams',
    }),
    width: '160px',
    render: (streamNames: string[]) => {
      const names = streamNames ?? [];
      const visible = names.slice(0, MAX_VISIBLE_STREAMS);
      const remaining = names.length - visible.length;
      return (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {visible.map((name, idx) => (
            <EuiFlexItem grow={false} key={`${name}-${idx}`}>
              <EuiBadge color="hollow">{name}</EuiBadge>
            </EuiFlexItem>
          ))}
          {remaining > 0 && (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                +{remaining} {MORE_LABEL}
              </EuiText>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      );
    },
  },
  {
    field: 'criticality',
    name: i18n.translate('xpack.streams.sigEventsTab.criticalityColumn', {
      defaultMessage: 'Criticality',
    }),
    width: '100px',
    render: (criticality: number | undefined) => <EuiText size="xs">{criticality ?? '-'}</EuiText>,
  },
  {
    name: '',
    width: '48px',
    align: 'right' as const,
    render: (item: SignificantEvent) => <RunInvestigationCell event={item} />,
  },
];

const extractCheckedKeys = (options: EuiSelectableOption[]): string[] =>
  options.filter((opt) => opt.checked === 'on').map((opt) => opt.key ?? opt.label);

const buildSelectableOptions = <T extends string>({
  values,
  selected,
  getLabel = capitalize,
}: {
  values: readonly T[];
  selected: T[];
  getLabel?: (value: T) => string;
}): EuiSelectableOption[] =>
  values.map((v) => ({
    label: getLabel(v),
    key: v,
    checked: selected.includes(v) ? ('on' as const) : undefined,
  }));

export const SigEventsTab = () => {
  const { timeState } = useTimefilter();

  const { filteredStreams } = useKiGeneration();
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [streamFilter, setStreamFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const streamOptions = useMemo(
    () => (filteredStreams ?? []).map((s) => s.stream.name).sort(),
    [filteredStreams]
  );

  const { isRunning, isCanceling, handleRun, handleCancel } =
    useSignificantEventsDiscoveryContext();

  const { data, isLoading, isError, refetch, pagination, setPagination } =
    useFetchSignificantEvents({
      from: timeState.start,
      to: timeState.end,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      stream: streamFilter.length > 0 ? streamFilter : undefined,
      search: debouncedSearch || undefined,
    });
  useInterval(refetch, isRunning ? RUNNING_POLL_INTERVAL_MS : null);

  const [selectedEvent, setSelectedEvent] = useState<SignificantEvent | undefined>();

  const onStatusChange = useCallback(
    (opts: EuiSelectableOption[]) => setStatusFilter(extractCheckedKeys(opts)),
    []
  );

  const onStreamChange = useCallback(
    (opts: EuiSelectableOption[]) => setStreamFilter(extractCheckedKeys(opts)),
    []
  );

  const filters = useMemo(
    () => [
      {
        label: i18n.translate('xpack.streams.sigEventsTab.filter.status', {
          defaultMessage: 'Status',
        }),
        ariaLabel: i18n.translate('xpack.streams.sigEventsTab.filter.statusAriaLabel', {
          defaultMessage: 'Filter by status',
        }),
        options: buildSelectableOptions({
          values: SIGNIFICANT_EVENT_STATUS_OPTIONS,
          selected: statusFilter,
        }),
        numFilters: SIGNIFICANT_EVENT_STATUS_OPTIONS.length,
        numActiveFilters: statusFilter.length,
        onChange: onStatusChange,
      },
      {
        label: i18n.translate('xpack.streams.sigEventsTab.filter.stream', {
          defaultMessage: 'Stream',
        }),
        ariaLabel: i18n.translate('xpack.streams.sigEventsTab.filter.streamAriaLabel', {
          defaultMessage: 'Filter by stream',
        }),
        options: buildSelectableOptions({
          values: streamOptions,
          selected: streamFilter,
          getLabel: (s) => s,
        }),
        numFilters: streamOptions.length,
        numActiveFilters: streamFilter.length,
        onChange: onStreamChange,
      },
    ],
    [statusFilter, streamFilter, streamOptions, onStatusChange, onStreamChange]
  );

  const onTableChange = ({ page }: { page?: { index: number; size: number } }) => {
    if (page) {
      setPagination({ page: page.index + 1, perPage: page.size });
    }
  };

  const handleQueryChange: StreamsAppSearchBarProps['onQueryChange'] = (queryPayload) => {
    setSearchQuery(String(queryPayload.query?.query ?? ''));
  };

  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
          <EuiFlexItem grow style={{ minWidth: 160 }}>
            <StreamsAppSearchBar
              onQuerySubmit={handleQueryChange}
              onQueryChange={handleQueryChange}
              placeholder={SEARCH_PLACEHOLDER}
              query={{
                query: searchQuery,
                language: 'text',
              }}
              showDatePicker
              showQueryInput
              enableDateRangePicker
              submitButtonStyle="iconOnly"
              isClearable
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFilterGroup compressed>
              {filters.map((f) => (
                <FilterPopover
                  key={f.label}
                  label={f.label}
                  ariaLabel={f.ariaLabel}
                  options={f.options}
                  numFilters={f.numFilters}
                  numActiveFilters={f.numActiveFilters}
                  onChange={f.onChange}
                />
              ))}
            </EuiFilterGroup>
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
            title={FETCH_ERROR_TITLE}
            color="danger"
            iconType="error"
            size="s"
          />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <EuiBasicTable<SignificantEvent>
          tableCaption={TABLE_CAPTION}
          items={data?.hits ?? []}
          columns={columns}
          pagination={{
            pageIndex: pagination.page - 1,
            pageSize: pagination.perPage,
            totalItemCount: data?.total ?? 0,
            pageSizeOptions: [10, 25, 50],
          }}
          onChange={onTableChange}
          loading={isLoading}
          rowProps={(item) => ({
            onClick: () => setSelectedEvent(item),
            css: clickableRowCss,
          })}
          noItemsMessage={isLoading ? LOADING_MESSAGE : EMPTY_MESSAGE}
        />
      </EuiFlexItem>
      {selectedEvent && (
        <SignificantEventFlyout event={selectedEvent} onClose={() => setSelectedEvent(undefined)} />
      )}
    </EuiFlexGroup>
  );
};
