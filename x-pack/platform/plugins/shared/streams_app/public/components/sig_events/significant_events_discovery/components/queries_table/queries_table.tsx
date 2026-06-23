/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiBasicTable,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
  type CriteriaWithPagination,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { QUERY_TYPE_MATCH, QUERY_TYPE_STATS } from '@kbn/streams-schema';
import { useMutation, useQueryClient } from '@kbn/react-query';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { DISCOVER_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import type { DiscoverAppLocatorParams } from '@kbn/discover-plugin/common';
import {
  DISCOVERY_QUERIES_QUERY_KEY,
  useFetchDiscoveryQueries,
  type SignificantEventQueryRow,
} from '../../../../../hooks/sig_events/use_fetch_discovery_queries';
import {
  DISCOVERY_QUERIES_OCCURRENCES_QUERY_KEY,
  useFetchDiscoveryQueriesOccurrences,
} from '../../../../../hooks/sig_events/use_fetch_discovery_queries_occurrences';
import { useKibana } from '../../../../../hooks/use_kibana';
import { useQueriesApi } from '../../../../../hooks/sig_events/use_queries_api';
import { getFormattedError } from '../../../../../util/errors';
import { AssetImage } from '../../../../asset_image';
import { useStreamsAppRouter } from '../../../../../hooks/use_streams_app_router';
import { useStreamsAppParams } from '../../../../../hooks/use_streams_app_params';
import { LoadingPanel } from '../../../../loading_panel';
import { SparkPlot } from '../../../../spark_plot';
import { StreamsAppSearchBar } from '../../../../streams_app_search_bar';
import { SeverityBadge } from '../severity_badge/severity_badge';
import { useTimefilter } from '../../../../../hooks/use_timefilter';
import { buildDiscoverParams } from '../../utils/discover_helpers';
import {
  ACTIONS_COLUMN_TITLE,
  CHART_SERIES_NAME,
  CHART_TITLE,
  DELETE_QUERY_ERROR_TOAST_TITLE,
  DETAILS_BUTTON_ARIA_LABEL,
  IMPACT_COLUMN,
  LAST_OCCURRED_COLUMN,
  NO_ITEMS_MESSAGE,
  OCCURRENCES_COLUMN,
  OCCURRENCES_TOOLTIP_NAME,
  THRESHOLD_BREACHES_TOOLTIP_NAME,
  OPEN_IN_DISCOVER_ACTION_DESCRIPTION,
  OPEN_IN_DISCOVER_ACTION_TITLE,
  SEARCH_PLACEHOLDER,
  STREAM_COLUMN,
  TABLE_CAPTION,
  TITLE_COLUMN,
  STATS_LAST_OCCURRED_PLACEHOLDER,
  UNABLE_TO_LOAD_QUERIES_BODY,
  UNABLE_TO_LOAD_QUERIES_TITLE,
  getEventsCount,
  CLEAR_SELECTION_LABEL,
  DELETE_SELECTED_LABEL,
  DELETE_QUERIES_MODAL_TITLE,
  getSelectedCountLabel,
  BULK_DEMOTE_SUCCESS_MESSAGE,
  BULK_DEMOTE_ERROR_TITLE,
} from './translations';
import { DeleteQueriesModal } from './delete_queries_modal';
import { QueryDetailsFlyout } from './query_details_flyout';
import { QueryTypeBadge } from '../query_type_badge/query_type_badge';
import { formatLastOccurredAt } from './utils';

const DEFAULT_PAGINATION = { index: 0, size: 10 };
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export function QueriesTable() {
  const router = useStreamsAppRouter();
  const { query: routeQuery } = useStreamsAppParams('/_discovery/{tab}');
  const { euiTheme } = useEuiTheme();
  const {
    dependencies: {
      start: { share },
    },
    core: {
      notifications: { toasts },
    },
  } = useKibana();
  const { timeState } = useTimefilter();
  const [searchQuery, setSearchQuery] = useState('');

  const [pagination, setPagination] = useState<{
    index: number;
    size: number;
  }>({ ...DEFAULT_PAGINATION });

  const {
    data: queriesData,
    isLoading: queriesLoading,
    isError: hasQueriesError,
  } = useFetchDiscoveryQueries({
    query: searchQuery,
    page: pagination.index + 1,
    perPage: pagination.size,
    status: ['active'],
  });

  const selectedQuery = useMemo(
    () =>
      routeQuery?.selectedItem
        ? queriesData?.queries.find((q) => q.query.id === routeQuery.selectedItem) ?? null
        : null,
    [queriesData?.queries, routeQuery?.selectedItem]
  );

  const buildQueryRouteParams = useCallback(
    (selectedItem?: string) => ({
      ...(routeQuery?.rangeFrom ? { rangeFrom: routeQuery.rangeFrom } : {}),
      ...(routeQuery?.rangeTo ? { rangeTo: routeQuery.rangeTo } : {}),
      ...(selectedItem ? { selectedItem } : {}),
    }),
    [routeQuery?.rangeFrom, routeQuery?.rangeTo]
  );

  const handleSelectQuery = useCallback(
    (item: SignificantEventQueryRow) => {
      const isAlreadyOpen = item.query.id === routeQuery?.selectedItem;
      router.push('/_discovery/{tab}', {
        path: { tab: 'queries' },
        query: buildQueryRouteParams(isAlreadyOpen ? undefined : item.query.id),
      });
    },
    [router, routeQuery?.selectedItem, buildQueryRouteParams]
  );

  const closeQueryFlyout = useCallback(() => {
    router.push('/_discovery/{tab}', {
      path: { tab: 'queries' },
      query: buildQueryRouteParams(),
    });
  }, [router, buildQueryRouteParams]);

  useEffect(() => {
    setSelectedItems([]);
  }, [timeState.start, timeState.end]);

  const { data: occurrencesData } = useFetchDiscoveryQueriesOccurrences({ query: searchQuery });

  const queryClient = useQueryClient();
  const { demote, removeQuery } = useQueriesApi();

  const [selectedItems, setSelectedItems] = useState<SignificantEventQueryRow[]>([]);
  const [itemsToDelete, setItemsToDelete] = useState<SignificantEventQueryRow[]>([]);

  const isSelectionEmpty = selectedItems.length === 0;

  const invalidateQueriesData = useCallback(
    async () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERIES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERIES_OCCURRENCES_QUERY_KEY }),
      ]),
    [queryClient]
  );

  const bulkDemoteMutation = useMutation<{ demoted: number }, Error, SignificantEventQueryRow[]>({
    mutationFn: (items) => {
      const queryIds = items.map((item) => item.query.id);
      return demote({ queryIds });
    },
    onSuccess: async () => {
      setSelectedItems([]);
      setItemsToDelete([]);
      await invalidateQueriesData();
      toasts.addSuccess(BULK_DEMOTE_SUCCESS_MESSAGE);
    },
    onError: (error) => {
      toasts.addError(getFormattedError(error), { title: BULK_DEMOTE_ERROR_TITLE });
    },
  });

  const deleteQueryMutation = useMutation<void, Error, { queryId: string; streamName: string }>({
    mutationFn: async ({ queryId, streamName }) => {
      await removeQuery({ queryId, streamName });
    },
    onSuccess: async (_, { queryId }) => {
      await invalidateQueriesData();
      closeQueryFlyout();
      setSelectedItems((prev) => prev.filter((item) => item.query.id !== queryId));
    },
    onError: (error) => {
      toasts.addError(error, {
        title: DELETE_QUERY_ERROR_TOAST_TITLE,
      });
    },
  });

  const onTableChange = useCallback(
    ({ page }: CriteriaWithPagination<SignificantEventQueryRow>) => {
      if (!page) {
        return;
      }

      setPagination(page);
      setSelectedItems([]);
    },
    []
  );

  const tableItems = queriesData?.queries ?? [];

  const columns: Array<EuiBasicTableColumn<SignificantEventQueryRow>> = useMemo(() => {
    const discoverLocator = share.url.locators.get<DiscoverAppLocatorParams>(DISCOVER_APP_LOCATOR);

    return [
      {
        field: 'details',
        name: '',
        width: '40px',
        render: (_: unknown, item: SignificantEventQueryRow) => {
          const isSelected = selectedQuery?.query.id === item.query.id;
          return (
            <EuiToolTip content={DETAILS_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                data-test-subj="queriesDiscoveryDetailsButton"
                iconType={isSelected ? 'minimize' : 'maximize'}
                aria-label={DETAILS_BUTTON_ARIA_LABEL}
                onClick={() => handleSelectQuery(item)}
              />
            </EuiToolTip>
          );
        },
      },
      {
        field: 'query.title',
        name: TITLE_COLUMN,
        render: (_: unknown, item: SignificantEventQueryRow) => (
          <EuiLink onClick={() => handleSelectQuery(item)}>{item.query.title}</EuiLink>
        ),
      },
      {
        field: 'query.severity_score',
        name: IMPACT_COLUMN,
        width: '100px',
        render: (_: unknown, item: SignificantEventQueryRow) => {
          return <SeverityBadge score={item.query.severity_score} />;
        },
      },
      {
        field: 'occurrences',
        name: LAST_OCCURRED_COLUMN,
        width: '180px',
        render: (_: unknown, item: SignificantEventQueryRow) => {
          if (item.query.type === QUERY_TYPE_STATS && !item.rule_backed) {
            return (
              <EuiText size="s" color="subdued">
                {STATS_LAST_OCCURRED_PLACEHOLDER}
              </EuiText>
            );
          }
          return <EuiText size="s">{formatLastOccurredAt(item.occurrences)}</EuiText>;
        },
      },
      {
        field: 'occurrences',
        name: OCCURRENCES_COLUMN,
        width: '120px',
        render: (_: unknown, item: SignificantEventQueryRow) => {
          return (
            <SparkPlot
              id={`sparkplot-${item.query.id}`}
              name={
                item.query.type === QUERY_TYPE_STATS
                  ? THRESHOLD_BREACHES_TOOLTIP_NAME
                  : OCCURRENCES_TOOLTIP_NAME
              }
              type="bar"
              timeseries={item.occurrences}
              annotations={[]}
              compressed
              hideAxis
              height={32}
            />
          );
        },
      },
      {
        field: 'query.type',
        name: i18n.translate('xpack.streams.queriesTable.typeColumn', {
          defaultMessage: 'Type',
        }),
        width: '80px',
        render: (_: unknown, item: SignificantEventQueryRow) => (
          <QueryTypeBadge type={item.query.type ?? QUERY_TYPE_MATCH} />
        ),
      },
      {
        field: 'stream_name',
        name: STREAM_COLUMN,
        width: '130px',
        render: (_: unknown, item: SignificantEventQueryRow) => (
          <EuiBadge color="hollow">{item.stream_name}</EuiBadge>
        ),
      },
      {
        name: ACTIONS_COLUMN_TITLE,
        width: '100px',
        actions: [
          {
            name: OPEN_IN_DISCOVER_ACTION_TITLE,
            type: 'icon',
            icon: 'discoverApp',
            description: OPEN_IN_DISCOVER_ACTION_DESCRIPTION,
            enabled: () => discoverLocator !== undefined,
            onClick: (item: SignificantEventQueryRow) => {
              discoverLocator?.navigate(buildDiscoverParams(item.query, timeState));
            },
            isPrimary: true,
            'data-test-subj': 'significant_events_table_open_in_discover_action',
          },
        ],
      },
    ];
  }, [share.url.locators, timeState, selectedQuery, handleSelectQuery]);

  const isLoading = queriesLoading;
  if (isLoading) {
    return <LoadingPanel size="l" />;
  }

  const hasError = hasQueriesError;
  if (hasError) {
    return (
      <EuiEmptyPrompt
        iconType="error"
        color="danger"
        title={<h2>{UNABLE_TO_LOAD_QUERIES_TITLE}</h2>}
        body={<p>{UNABLE_TO_LOAD_QUERIES_BODY}</p>}
      />
    );
  }

  const isEmpty = !queriesLoading && (queriesData?.total ?? 0) === 0 && !searchQuery;
  if (isEmpty) {
    return (
      <EuiEmptyPrompt
        aria-live="polite"
        titleSize="xs"
        icon={<AssetImage type="significantEventsEmptyState" />}
        title={
          <h2>
            {i18n.translate(
              'xpack.streams.significantEventsDiscovery.queriesTable.emptyState.title',
              { defaultMessage: 'Rules' }
            )}
          </h2>
        }
        body={
          <p>
            {i18n.translate(
              'xpack.streams.significantEventsDiscovery.queriesTable.emptyState.description',
              {
                defaultMessage:
                  'No rules created yet. Promote queries from the Knowledge Indicators tab to create rules.',
              }
            )}
          </p>
        }
        actions={
          <EuiButtonEmpty
            href={router.link('/_discovery/{tab}', {
              path: { tab: 'knowledge_indicators' },
            })}
          >
            {i18n.translate(
              'xpack.streams.significantEventsDiscovery.queriesTable.emptyState.goToKnowledgeIndicatorsButton',
              { defaultMessage: 'Go to Knowledge Indicators' }
            )}
          </EuiButtonEmpty>
        }
      />
    );
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      <EuiFlexItem grow={false}>
        <StreamsAppSearchBar
          isLoading={queriesLoading}
          onQuerySubmit={(queryPayload) => {
            setSearchQuery(String(queryPayload.query?.query ?? ''));
            setPagination((currentPagination) => ({ index: 0, size: currentPagination.size }));
            setSelectedItems([]);
          }}
          placeholder={SEARCH_PLACEHOLDER}
          query={{
            query: searchQuery,
            language: 'text',
          }}
          showDatePicker
          showQueryInput
          enableDateRangePicker
          submitButtonStyle="iconOnly"
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiPanel hasBorder hasShadow={false}>
          <EuiFlexGroup direction="column" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h3>{CHART_TITLE}</h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem>
              <SparkPlot
                id="aggregated-occurrences"
                name={CHART_SERIES_NAME}
                type="bar"
                timeseries={occurrencesData?.occurrences_histogram ?? []}
                annotations={[]}
                height={180}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiText size="s">{getEventsCount(queriesData?.total ?? 0)}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="cross"
              size="xs"
              aria-label={CLEAR_SELECTION_LABEL}
              isDisabled={isSelectionEmpty}
              onClick={() => setSelectedItems([])}
            >
              {CLEAR_SELECTION_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="trash"
              color="danger"
              size="xs"
              isDisabled={isSelectionEmpty || bulkDemoteMutation.isLoading}
              isLoading={bulkDemoteMutation.isLoading}
              onClick={() => setItemsToDelete(selectedItems)}
            >
              {DELETE_SELECTED_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
          {!isSelectionEmpty && (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {getSelectedCountLabel(selectedItems.length)}
              </EuiText>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBasicTable
          css={css`
            & thead tr {
              background-color: ${euiTheme.colors.backgroundBaseSubdued};
            }
          `}
          tableCaption={TABLE_CAPTION}
          columns={columns}
          itemId={(item) => item.query.id}
          items={tableItems}
          rowProps={(item: SignificantEventQueryRow) => ({
            isSelected: selectedQuery?.query.id === item.query.id,
          })}
          loading={queriesLoading}
          noItemsMessage={!queriesLoading ? NO_ITEMS_MESSAGE : ''}
          pagination={{
            pageIndex: pagination.index,
            pageSize: pagination.size,
            totalItemCount: queriesData?.total ?? 0,
            pageSizeOptions: [...PAGE_SIZE_OPTIONS],
          }}
          onChange={onTableChange}
          selection={{
            selected: selectedItems,
            onSelectionChange: setSelectedItems,
          }}
        />
      </EuiFlexItem>
      {itemsToDelete.length > 0 && (
        <DeleteQueriesModal
          title={DELETE_QUERIES_MODAL_TITLE(itemsToDelete.length)}
          items={itemsToDelete}
          onCancel={() => setItemsToDelete([])}
          onConfirm={() => bulkDemoteMutation.mutate(itemsToDelete)}
          isLoading={bulkDemoteMutation.isLoading}
        />
      )}
      {selectedQuery && (
        <QueryDetailsFlyout
          item={selectedQuery}
          onClose={closeQueryFlyout}
          onDelete={(queryId, streamName) =>
            deleteQueryMutation.mutateAsync({ queryId, streamName })
          }
          isDeleting={deleteQueryMutation.isLoading}
        />
      )}
    </EuiFlexGroup>
  );
}
