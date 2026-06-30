/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useState, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import type { Direction, CriteriaWithPagination } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiIcon,
  EuiInMemoryTable,
  useEuiTheme,
  EuiHighlight,
  EuiIconTip,
  EuiButtonIcon,
  EuiTourStep,
  EuiBadge,
  EuiToolTip,
  EuiFilterGroup,
  EuiFieldSearch,
} from '@elastic/eui';
import { css } from '@emotion/css';
import type { ListStreamDetail } from '@kbn/streams-plugin/server/routes/internal/streams/crud/route';
import type { QualityIndicators } from '@kbn/dataset-quality-plugin/common';
import {
  Streams,
  type RootStreamName,
  LOGS_ROOT_STREAM_NAME,
  ROOT_STREAM_NAMES,
  isRoot,
  isDraftStream,
} from '@kbn/streams-schema';
import useAsync from 'react-use/lib/useAsync';
import type { WiredStreamsStatus } from '@kbn/streams-plugin/public';
import { useStreamsTour } from '../streams_tour';
import type { TableRow, SortableField } from './utils';
import {
  buildStreamRows,
  asTrees,
  enrichStream,
  shouldComposeTree,
  filterStreamsByQuery,
  filterCollapsedStreamRows,
  getLegacyLogsStatus,
} from './utils';
import { StreamsAppSearchBar } from '../streams_app_search_bar';
import { DocumentsColumn } from './documents_column';
import { DataQualityColumn } from './data_quality_column';
import { useKibana } from '../../hooks/use_kibana';
import { useStreamsAppRouter } from '../../hooks/use_streams_app_router';
import {
  STREAMS_HISTOGRAM_NUM_DATA_POINTS,
  useStreamDocCountsFetch,
} from '../../hooks/use_streams_doc_counts_fetch';
import { useTimefilter } from '../../hooks/use_timefilter';
import { useStreamsIngestionRates } from '../../hooks/use_streams_ingestion_rates';
import { useStreamsStorageStats } from '../../hooks/use_streams_storage_stats';
import { useTimeRange } from '../../hooks/use_time_range';
import { IngestionColumn } from './ingestion_column';
import { StorageColumn } from './storage_column';
import { RetentionColumn } from './retention_column';
import { FilterGroup } from './filter_group';
import { calculateDataQuality } from '../../util/calculate_data_quality';
import {
  NAME_COLUMN_HEADER,
  RETENTION_COLUMN_HEADER,
  STREAMS_TABLE_SEARCH_ARIA_LABEL,
  STREAMS_TABLE_CAPTION_ARIA_LABEL,
  RETENTION_COLUMN_HEADER_ARIA_LABEL,
  NO_STREAMS_MESSAGE,
  DATA_QUALITY_COLUMN_HEADER,
  CPS_DOCUMENTS_WARNING,
  DOCUMENTS_COLUMN_HEADER,
  FAILURE_STORE_PERMISSIONS_ERROR,
  INGESTION_COLUMN_HEADER,
  STORAGE_COLUMN_HEADER,
  STREAM_TYPE_FILTER_LABEL,
  STREAM_TYPE_CLASSIC_LABEL,
  STREAM_TYPE_WIRED_LABEL,
  STREAM_TYPE_QUERY_LABEL,
  DATA_QUALITY_FILTER_LABEL,
  DATA_QUALITY_GOOD_LABEL,
  DATA_QUALITY_DEGRADED_LABEL,
  DATA_QUALITY_POOR_LABEL,
} from './translations';
import {
  DeprecatedLogsBadge,
  DiscoverBadgeButton,
  DraftStreamBadge,
  QueryStreamBadge,
  TechnicalPreviewBadge,
} from '../stream_badges';

export function StreamsTreeTable({
  loading,
  streams = [],
  wiredStreamsStatus,
  openFlyout,
}: {
  streams?: ListStreamDetail[];
  loading?: boolean;
  wiredStreamsStatus?: WiredStreamsStatus;
  openFlyout?: () => void;
}) {
  const router = useStreamsAppRouter();
  const { dependencies } = useKibana();
  const cpsHasLinkedProjects =
    (dependencies.start.cps?.cpsManager?.getTotalProjectCount() ?? 0) > 1;
  const { rangeFrom, rangeTo } = useTimeRange();
  const { euiTheme } = useEuiTheme();
  const { timeState } = useTimefilter();
  const { getStepPropsByStepId } = useStreamsTour();

  const [searchText, setSearchText] = useState('');
  const [sortField, setSortField] = useState<SortableField>('nameSortKey');
  const [sortDirection, setSortDirection] = useState<Direction>('asc');
  // Collapsed state: Set of collapsed node names
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState<{ pageIndex: number; pageSize: number }>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedQualities, setSelectedQualities] = useState<string[]>([]);

  const handleTypeFilterChange = useCallback((keys: string[]) => setSelectedTypes(keys), []);
  const handleQualityFilterChange = useCallback((keys: string[]) => setSelectedQualities(keys), []);

  const { privilegeMap, hasFailureStoreAccess } = React.useMemo(() => {
    return streams.reduce(
      (acc, streamDetail) => {
        acc.privilegeMap.set(streamDetail.stream.name, streamDetail.privileges.read_failure_store);
        acc.hasFailureStoreAccess ||= streamDetail.privileges.read_failure_store;
        return acc;
      },
      { privilegeMap: new Map<string, boolean>(), hasFailureStoreAccess: false }
    );
  }, [streams]);

  const { getStreamDocCounts, getStreamHistogram } = useStreamDocCountsFetch({
    groupTotalCountByTimestamp: true,
    getCanReadFailureStore: (streamName: string | undefined) =>
      streamName ? privilegeMap.get(streamName) ?? false : hasFailureStoreAccess,
    numDataPoints: STREAMS_HISTOGRAM_NUM_DATA_POINTS,
    fetchIngestionDocCounts: true,
  });

  const docCountsFetch = getStreamDocCounts();

  const totalDocsResult = useAsync(() => docCountsFetch.docCount, [docCountsFetch]);
  const failedDocsResult = useAsync(() => docCountsFetch.failedDocCount, [docCountsFetch]);
  const degradedDocsResult = useAsync(() => docCountsFetch.degradedDocCount, [docCountsFetch]);

  const docsByStream = React.useMemo(() => {
    if (!totalDocsResult.value) {
      return {} as Record<string, number>;
    }
    return totalDocsResult.value.reduce((acc, { stream, count }) => {
      acc[stream] = count;
      return acc;
    }, {} as Record<string, number>);
  }, [totalDocsResult.value]);

  const failedByStream = React.useMemo(() => {
    if (!failedDocsResult.value) {
      return {} as Record<string, number>;
    }
    return failedDocsResult.value.reduce((acc, { stream, count }) => {
      acc[stream] = count;
      return acc;
    }, {} as Record<string, number>);
  }, [failedDocsResult.value]);

  const degradedByStream = React.useMemo(() => {
    if (!degradedDocsResult.value) {
      return {} as Record<string, number>;
    }
    return degradedDocsResult.value.reduce((acc, { stream, count }) => {
      acc[stream] = count;
      return acc;
    }, {} as Record<string, number>);
  }, [degradedDocsResult.value]);

  const qualityByStream = React.useMemo(() => {
    const qualities: Record<string, QualityIndicators> = {};
    const datasets = new Set([
      ...Object.keys(docsByStream),
      ...Object.keys(degradedByStream),
      ...Object.keys(failedByStream),
    ]);

    datasets.forEach((dataset) => {
      const totalDocs = docsByStream[dataset] ?? 0;
      const degradedDocs = degradedByStream[dataset] ?? 0;
      const failedDocs = failedByStream[dataset] ?? 0;

      qualities[dataset] = calculateDataQuality({
        totalDocs,
        degradedDocs,
        failedDocs,
      });
    });

    return qualities;
  }, [docsByStream, degradedByStream, failedByStream]);

  const docCountsLoaded = !!totalDocsResult.value;
  const qualityLoaded =
    !!totalDocsResult.value && !!degradedDocsResult.value && !!failedDocsResult.value;

  const { ingestionByStream, ingestionLoaded, ingestionError } = useStreamsIngestionRates({
    ingestionDocCount: docCountsFetch.ingestionDocCount,
    timeStart: timeState.start,
    timeEnd: timeState.end,
  });

  const { storageByStream, storageLoaded } = useStreamsStorageStats();

  // Sort order for data quality
  const qualityRank: Record<QualityIndicators, number> = {
    poor: 0,
    degraded: 1,
    good: 2,
  };

  const filteredStreams = React.useMemo(
    () => filterStreamsByQuery(streams, searchText.trim()),
    [streams, searchText]
  );

  const enrichedStreams = React.useMemo(() => {
    const streamList = shouldComposeTree(sortField) ? asTrees(filteredStreams) : filteredStreams;
    return streamList.map(enrichStream);
  }, [sortField, filteredStreams]);

  const flattenTreeWithCollapse = React.useCallback(
    (rows: TableRow[]) => filterCollapsedStreamRows(rows, collapsed, sortField),
    [collapsed, sortField]
  );

  const allRows = React.useMemo(() => {
    let rows = buildStreamRows(enrichedStreams, sortField, sortDirection, qualityByStream);

    if (selectedTypes.length > 0) {
      rows = rows.filter((row) => selectedTypes.includes(row.type));
    }

    if (selectedQualities.length > 0) {
      rows = rows.filter((row) => selectedQualities.includes(row.dataQuality));
    }

    return rows;
  }, [
    enrichedStreams,
    sortField,
    sortDirection,
    qualityByStream,
    selectedTypes,
    selectedQualities,
  ]);

  // Only pass filtered rows if tree mode is active
  const items = React.useMemo(
    () => (shouldComposeTree(sortField) ? flattenTreeWithCollapse(allRows) : allRows),
    [allRows, flattenTreeWithCollapse, sortField]
  );

  const handleTableChange = ({ sort, page }: CriteriaWithPagination<TableRow>) => {
    if (sort) {
      setSortField(sort.field as SortableField);
      setSortDirection(sort.direction);
    }
    if (page) {
      setPagination({
        pageIndex: page.index,
        pageSize: page.size,
      });
    }
  };

  const handleToggleCollapse = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Compute all expandable node names for expand/collapse all
  const allExpandableNodeNames = React.useMemo(() => {
    const names: string[] = [];
    const collect = (rows: TableRow[]) => {
      for (const row of rows) {
        if (row.children && row.children.length > 0) {
          names.push(row.stream.name);
        }
      }
    };
    collect(allRows);
    return names;
  }, [allRows]);

  // Determine if all are expanded or not
  const allExpanded = allExpandableNodeNames.every((name) => !collapsed.has(name));
  const hasExpandable = allExpandableNodeNames.length > 0;

  const handleExpandCollapseAll = () => {
    setCollapsed((prev) => {
      if (allExpanded) {
        // Collapse all
        return new Set(allExpandableNodeNames);
      } else {
        // Expand all
        return new Set();
      }
    });
  };

  const sorting = {
    sort: {
      field: sortField,
      direction: sortDirection,
    },
  };

  // Reset pagination if streams change (e.g., after search/filter)
  React.useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [streams, searchText, sortField, sortDirection]);

  // Expand/Collapse all button for the name column header
  const expandCollapseAllButton = (
    <EuiToolTip
      content={
        allExpanded
          ? i18n.translate('xpack.streams.streamsTreeTable.collapseAll', {
              defaultMessage: 'Collapse all',
            })
          : i18n.translate('xpack.streams.streamsTreeTable.expandAll', {
              defaultMessage: 'Expand all',
            })
      }
      disableScreenReaderOutput
    >
      <EuiButtonIcon
        size="xs"
        iconType={allExpanded ? 'fold' : 'unfold'}
        color="text"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          handleExpandCollapseAll();
        }}
        data-test-subj={`streams${allExpanded ? 'Collapse' : 'Expand'}AllButton`}
        aria-label={
          allExpanded
            ? i18n.translate('xpack.streams.streamsTreeTable.collapseAll', {
                defaultMessage: 'Collapse all',
              })
            : i18n.translate('xpack.streams.streamsTreeTable.expandAll', {
                defaultMessage: 'Expand all',
              })
        }
      />
    </EuiToolTip>
  );

  const streamsListStepProps = getStepPropsByStepId('streams_list');

  const nameColumnHeader = (
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      {shouldComposeTree(sortField) && hasExpandable && (
        <EuiFlexItem grow={false}>{expandCollapseAllButton}</EuiFlexItem>
      )}
      <EuiFlexItem>
        {streamsListStepProps ? (
          <EuiTourStep
            step={streamsListStepProps.step}
            stepsTotal={streamsListStepProps.stepsTotal}
            title={streamsListStepProps.title}
            subtitle={streamsListStepProps.subtitle}
            content={streamsListStepProps.content}
            anchorPosition={streamsListStepProps.anchorPosition}
            offset={streamsListStepProps.offset}
            maxWidth={streamsListStepProps.maxWidth}
            isStepOpen={streamsListStepProps.isStepOpen}
            footerAction={streamsListStepProps.footerAction}
            onFinish={streamsListStepProps.onFinish}
          >
            <span>{NAME_COLUMN_HEADER}</span>
          </EuiTourStep>
        ) : (
          <span>{NAME_COLUMN_HEADER}</span>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="s"
      className={css`
        flex: 1;
        min-height: 0;
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
          <EuiFlexItem>
            <EuiFieldSearch
              fullWidth
              compressed
              incremental
              aria-label={STREAMS_TABLE_SEARCH_ARIA_LABEL}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFilterGroup compressed>
              {qualityLoaded && hasFailureStoreAccess && (
                <FilterGroup
                  label={DATA_QUALITY_FILTER_LABEL}
                  options={[
                    { key: 'good', label: DATA_QUALITY_GOOD_LABEL },
                    { key: 'degraded', label: DATA_QUALITY_DEGRADED_LABEL },
                    { key: 'poor', label: DATA_QUALITY_POOR_LABEL },
                  ]}
                  onChange={handleQualityFilterChange}
                />
              )}
              <FilterGroup
                label={STREAM_TYPE_FILTER_LABEL}
                options={[
                  { key: 'classic', label: STREAM_TYPE_CLASSIC_LABEL },
                  { key: 'wired', label: STREAM_TYPE_WIRED_LABEL },
                  { key: 'query', label: STREAM_TYPE_QUERY_LABEL },
                ]}
                onChange={handleTypeFilterChange}
              />
            </EuiFilterGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <StreamsAppSearchBar showDatePicker />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem
        grow
        className={css`
          min-height: 0;
          overflow-y: auto;
        `}
      >
        <EuiInMemoryTable<TableRow>
          loading={loading}
          data-test-subj="streamsTable"
          columns={[
            {
              field: 'nameSortKey',
              name: nameColumnHeader,
              sortable: (row: TableRow) => row.rootNameSortKey,
              dataType: 'string',
              render: (_: unknown, item: TableRow) => {
                // Only show expand/collapse if tree mode is active and has children
                const treeMode = shouldComposeTree(sortField);
                const hasChildren = !!item.children && item.children.length > 0;
                const isCollapsed = collapsed.has(item.stream.name);
                return (
                  <EuiFlexGroup
                    alignItems="center"
                    gutterSize="s"
                    responsive={false}
                    className={css`
                      margin-left: ${item.level * parseInt(euiTheme.size.xl, 10)}px;
                      min-width: 0;
                    `}
                  >
                    {treeMode && item.children && hasChildren && (
                      <EuiFlexItem grow={false}>
                        <EuiIcon
                          type={isCollapsed ? 'chevronSingleRight' : 'chevronSingleDown'}
                          color="text"
                          size="m"
                          data-test-subj={`${isCollapsed ? 'expand' : 'collapse'}Button-${
                            item.stream.name
                          }`}
                          aria-label={
                            isCollapsed
                              ? i18n.translate(
                                  'xpack.streams.streamsTreeTable.collapsedNodeAriaLabel',
                                  {
                                    defaultMessage: 'Collapsed node with {childCount} children',
                                    values: { childCount: item.children.length },
                                  }
                                )
                              : i18n.translate(
                                  'xpack.streams.streamsTreeTable.expandedNodeAriaLabel',
                                  {
                                    defaultMessage: 'Expanded node with {childCount} children',
                                    values: { childCount: item.children.length },
                                  }
                                )
                          }
                          onClick={(e: React.MouseEvent) => {
                            handleToggleCollapse(item.stream.name);
                          }}
                          tabIndex={0}
                          role="button"
                          onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleToggleCollapse(item.stream.name);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </EuiFlexItem>
                    )}
                    {treeMode && !hasChildren && (
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="empty" color="text" size="m" aria-hidden="true" />
                      </EuiFlexItem>
                    )}
                    <EuiFlexGroup
                      alignItems="center"
                      gutterSize="s"
                      className={css`
                        min-width: 0;
                      `}
                    >
                      {Streams.QueryStream.Definition.is(item.stream) && <QueryStreamBadge />}
                      {isDraftStream(item.stream) && <DraftStreamBadge />}
                      <EuiLink
                        data-test-subj={`streamsNameLink-${item.stream.name}`}
                        href={router.link('/{key}', {
                          path: { key: item.stream.name },
                          query: { rangeFrom, rangeTo },
                        })}
                        className={css`
                          overflow: hidden;
                          text-overflow: ellipsis;
                          white-space: nowrap;
                          min-width: 0;
                        `}
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          router.push('/{key}', {
                            path: { key: item.stream.name },
                            query: { rangeFrom, rangeTo },
                          });
                        }}
                      >
                        <EuiHighlight search={searchText}>{item.stream.name}</EuiHighlight>
                      </EuiLink>
                      {(ROOT_STREAM_NAMES.includes(item.stream.name as RootStreamName) ||
                        Streams.QueryStream.Definition.is(item.stream) ||
                        (Streams.WiredStream.Definition.is(item.stream) &&
                          isDraftStream(item.stream))) && <TechnicalPreviewBadge />}
                      {item.stream.name === LOGS_ROOT_STREAM_NAME &&
                        !Streams.QueryStream.Definition.is(item.stream) && (
                          <DeprecatedLogsBadge
                            openFlyout={openFlyout}
                            hasNewStreams={getLegacyLogsStatus(wiredStreamsStatus).hasNewStreams}
                          />
                        )}
                      {isRoot(item.stream.name) &&
                        item.stream.name !== LOGS_ROOT_STREAM_NAME &&
                        !item.data_stream &&
                        !Streams.QueryStream.Definition.is(item.stream) && (
                          <EuiToolTip
                            position="right"
                            content={i18n.translate(
                              'xpack.streams.streamsTable.pendingDataStream.tooltip',
                              {
                                defaultMessage:
                                  'This stream is configured but has no backing data stream yet. Start sending data and the data stream will be created automatically on first ingest.',
                              }
                            )}
                          >
                            <EuiBadge color="default">
                              {i18n.translate(
                                'xpack.streams.streamsTable.pendingDataStream.label',
                                {
                                  defaultMessage: 'Pending',
                                }
                              )}
                            </EuiBadge>
                          </EuiToolTip>
                        )}
                    </EuiFlexGroup>
                  </EuiFlexGroup>
                );
              },
            },
            {
              field: 'documentsCount',
              name: (
                <EuiFlexGroup alignItems="center" gutterSize="m">
                  {cpsHasLinkedProjects && (
                    <EuiIconTip
                      content={CPS_DOCUMENTS_WARNING}
                      type="info"
                      size="s"
                      data-test-subj="cpsDocumentsWarningTip"
                    />
                  )}
                  {DOCUMENTS_COLUMN_HEADER}
                  {!hasFailureStoreAccess && (
                    <EuiIconTip
                      content={FAILURE_STORE_PERMISSIONS_ERROR}
                      type="warning"
                      color="warning"
                      size="s"
                    />
                  )}
                </EuiFlexGroup>
              ),
              width: '180px',
              sortable: docCountsLoaded
                ? (row: TableRow) => docsByStream[row.stream.name] ?? 0
                : false,
              align: 'right',
              dataType: 'number',
              render: (_: unknown, item: TableRow) =>
                item.data_stream ? (
                  <DocumentsColumn
                    indexPattern={item.stream.name}
                    histogramQueryFetch={getStreamHistogram(item.stream.name)}
                    timeState={timeState}
                    numDataPoints={STREAMS_HISTOGRAM_NUM_DATA_POINTS}
                  />
                ) : null,
            },
            {
              field: 'ingestionRate',
              name: INGESTION_COLUMN_HEADER,
              width: '112px',
              sortable:
                ingestionLoaded && !ingestionError
                  ? (row: TableRow) => ingestionByStream[row.stream.name] ?? 0
                  : false,
              align: 'right',
              dataType: 'number',
              render: (_: unknown, item: TableRow) =>
                item.data_stream ? (
                  <IngestionColumn
                    rate={ingestionByStream[item.stream.name] ?? 0}
                    isLoading={!ingestionLoaded}
                    hasError={ingestionError}
                  />
                ) : (
                  '-'
                ),
            },
            {
              field: 'storageBytes',
              name: STORAGE_COLUMN_HEADER,
              width: '120px',
              sortable: storageLoaded
                ? (row: TableRow) => storageByStream[row.stream.name] ?? 0
                : false,
              align: 'right',
              dataType: 'number',
              render: (_: unknown, item: TableRow) =>
                item.data_stream ? (
                  <StorageColumn
                    sizeBytes={storageByStream[item.stream.name] ?? 0}
                    isLoading={!storageLoaded}
                  />
                ) : (
                  '-'
                ),
            },
            {
              field: 'dataQuality',
              name: (
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  {DATA_QUALITY_COLUMN_HEADER}
                  {!hasFailureStoreAccess && (
                    <EuiIconTip
                      content={FAILURE_STORE_PERMISSIONS_ERROR}
                      type="warning"
                      color="warning"
                      size="s"
                    />
                  )}
                </EuiFlexGroup>
              ),
              width: '112px',
              sortable: qualityLoaded
                ? (item: TableRow) => qualityRank[item.dataQuality as QualityIndicators]
                : false,
              dataType: 'string',
              render: (_: unknown, item: TableRow) =>
                item.data_stream ? (
                  <DataQualityColumn
                    streamName={item.stream.name}
                    quality={item.dataQuality as QualityIndicators}
                    isLoading={
                      totalDocsResult.loading ||
                      failedDocsResult.loading ||
                      degradedDocsResult.loading
                    }
                  />
                ) : (
                  '-'
                ),
            },
            {
              field: 'retentionMs',
              name: (
                <span aria-label={RETENTION_COLUMN_HEADER_ARIA_LABEL}>
                  {RETENTION_COLUMN_HEADER}
                </span>
              ),
              align: 'left',
              sortable: (row: TableRow) => row.rootRetentionMs,
              dataType: 'number',
              width: '220px',
              render: (_: unknown, item: TableRow) => {
                if (isDraftStream(item.stream) || Streams.QueryStream.Definition.is(item.stream)) {
                  return '-';
                }
                return (
                  <RetentionColumn
                    lifecycle={item.effective_lifecycle!}
                    streamName={item.stream.name}
                    aria-label={i18n.translate(
                      'xpack.streams.streamsTreeTable.retentionCellAriaLabel',
                      {
                        defaultMessage: 'Retention policy for {name}',
                        values: { name: item.stream.name },
                      }
                    )}
                    dataTestSubj={`retentionColumn-${item.stream.name}`}
                  />
                );
              },
            },
            {
              field: 'definition',
              name: 'Actions',
              width: '60px',
              align: 'left',
              sortable: false,
              dataType: 'string',
              render: (_: unknown, item: TableRow) => {
                const hasDataStream =
                  !!item.data_stream || Streams.QueryStream.Definition.is(item.stream);
                if (Streams.QueryStream.Definition.is(item.stream)) {
                  return <DiscoverBadgeButton hasDataStream={hasDataStream} stream={item.stream} />;
                }
                return (
                  <DiscoverBadgeButton
                    hasDataStream={hasDataStream}
                    indexMode={item.data_stream?.index_mode ?? 'standard'}
                    stream={item.stream}
                  />
                );
              },
            },
          ]}
          itemId="name"
          items={items}
          sorting={sorting}
          noItemsMessage={NO_STREAMS_MESSAGE}
          onTableChange={handleTableChange}
          pagination={{
            initialPageSize: 25,
            pageSizeOptions: [25, 50, 100],
            pageIndex: pagination.pageIndex,
            pageSize: pagination.pageSize,
          }}
          tableCaption={STREAMS_TABLE_CAPTION_ARIA_LABEL}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
