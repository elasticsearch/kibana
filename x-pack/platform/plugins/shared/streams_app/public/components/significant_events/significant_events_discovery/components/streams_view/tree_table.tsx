/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { CriteriaWithPagination, Direction, EuiTableSelectionType, Query } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHighlight,
  EuiIcon,
  EuiIconTip,
  EuiInMemoryTable,
  EuiLink,
  EuiLoadingSpinner,
  EuiToolTip,
  EuiTourStep,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/css';
import { i18n } from '@kbn/i18n';
import type { ListStreamDetail } from '@kbn/streams-plugin/server/routes/internal/streams/crud/route';
import { Streams } from '@kbn/streams-schema';
import {
  SignificantEventsWorkflowStatus,
  KIS_ONBOARDING_IN_PROGRESS_STATUSES,
  type SignificantEventsWorkflowStatusResult,
} from '@kbn/significant-events-schema';
import React, { useState } from 'react';
import { useStreamsAppRouter } from '../../../../../hooks/use_streams_app_router';
import { useStreamsTour } from '../../../../streams_tour';
import { QueryStreamBadge, TechnicalPreviewBadge } from '../../../../stream_badges';
import { KnowledgeIndicatorsColumn } from './knowledge_indicators_column';
import { QueriesColumn } from './queries_column';
import { SignificantEventsColumn } from './significant_events_column';
import {
  ACTIONS_COLUMN_HEADER,
  KNOWLEDGE_INDICATORS_COLUMN_HEADER,
  NAME_COLUMN_HEADER,
  NO_STREAMS_MESSAGE,
  ONBOARDING_STATUS_COLUMN_HEADER,
  QUERIES_COLUMN_HEADER,
  RUN_STREAM_ONBOARDING_BUTTON_LABEL,
  SIGNIFICANT_EVENTS_COLUMN_HEADER,
  SIGNIFICANT_EVENTS_COLUMN_TOOLTIP,
  STOP_STREAM_ONBOARDING_BUTTON_LABEL,
  STREAMS_TABLE_CAPTION_ARIA_LABEL,
} from './translations';
import type { SortableField, TableRow } from './utils';
import {
  asTrees,
  buildStreamRows,
  enrichStream,
  filterCollapsedStreamRows,
  filterStreamsByQuery,
  shouldComposeTree,
} from './utils';

export function StreamsTreeTable({
  loading,
  streams = [],
  streamOnboardingResultMap,
  searchQuery,
  selection,
  onOnboardStreamActionClick,
  onStopOnboardingActionClick,
}: {
  streams?: ListStreamDetail[];
  streamOnboardingResultMap: Record<string, SignificantEventsWorkflowStatusResult>;
  loading?: boolean;
  searchQuery: Query;
  selection: EuiTableSelectionType<TableRow>;
  onOnboardStreamActionClick: (streamName: string) => void;
  onStopOnboardingActionClick: (streamName: string) => void;
}) {
  const router = useStreamsAppRouter();
  const { euiTheme } = useEuiTheme();
  const { getStepPropsByStepId } = useStreamsTour();

  const [sortField, setSortField] = useState<SortableField>('nameSortKey');
  const [sortDirection, setSortDirection] = useState<Direction>('asc');
  // Collapsed state: Set of collapsed node names
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState<{ pageIndex: number; pageSize: number }>({
    pageIndex: 0,
    pageSize: 25,
  });

  // Filter streams by query, including ancestors of matches
  const filteredStreams = React.useMemo(() => {
    return filterStreamsByQuery(
      streams.filter(
        (stream) =>
          Streams.ingest.all.Definition.is(stream.stream) ||
          Streams.QueryStream.Definition.is(stream.stream)
      ),
      searchQuery.text
    );
  }, [streams, searchQuery]);

  const enrichedStreams = React.useMemo(() => {
    const streamList = shouldComposeTree(sortField) ? asTrees(filteredStreams) : filteredStreams;
    return streamList.map(enrichStream);
  }, [sortField, filteredStreams]);

  const flattenTreeWithCollapse = React.useCallback(
    (rows: TableRow[]) => filterCollapsedStreamRows(rows, collapsed, sortField),
    [collapsed, sortField]
  );

  const allRows = React.useMemo(() => {
    const rows = buildStreamRows(enrichedStreams, sortField, sortDirection, {});
    const qualityFiters = searchQuery.ast.clauses.filter(
      (clause) => clause.type === 'field' && clause.field === 'dataQuality'
    );
    return qualityFiters.length > 0
      ? rows.filter((row) =>
          qualityFiters.some(
            (filter) =>
              'value' in filter &&
              typeof filter.value === 'string' &&
              filter.value.includes(row.dataQuality)
          )
        )
      : rows;
  }, [enrichedStreams, sortField, sortDirection, searchQuery.ast.clauses]);

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
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, [streams, searchQuery, sortField, sortDirection]);

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
    <EuiFlexGroup direction="column" gutterSize="m">
      <EuiFlexItem>
        <EuiInMemoryTable<TableRow>
          selection={selection}
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
                const isQueryStream = Streams.QueryStream.Definition.is(item.stream);

                return (
                  <EuiFlexGroup
                    alignItems="center"
                    gutterSize="s"
                    responsive={false}
                    className={css`
                      margin-left: ${item.level * parseInt(euiTheme.size.xl, 10)}px;
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
                          aria-label={i18n.translate(
                            isCollapsed
                              ? 'xpack.streams.streamsTreeTable.collapsedNodeAriaLabel'
                              : 'xpack.streams.streamsTreeTable.expandedNodeAriaLabel',
                            {
                              defaultMessage: isCollapsed
                                ? 'Collapsed node with {childCount} children'
                                : 'Expanded node with {childCount} children',
                              values: { childCount: item.children.length },
                            }
                          )}
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
                    {isQueryStream && (
                      <EuiFlexItem grow={false}>
                        <QueryStreamBadge />
                      </EuiFlexItem>
                    )}
                    <EuiFlexItem grow={false}>
                      <EuiLink
                        data-test-subj={`streamsNameLink-${item.stream.name}`}
                        href={router.link('/{key}/management/{tab}', {
                          path: { key: item.stream.name, tab: 'significantEvents' },
                        })}
                      >
                        <EuiHighlight search={searchQuery.text}>{item.stream.name}</EuiHighlight>
                      </EuiLink>
                    </EuiFlexItem>
                    {isQueryStream && (
                      <EuiFlexItem grow={false}>
                        <TechnicalPreviewBadge />
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>
                );
              },
            },
            {
              name: ONBOARDING_STATUS_COLUMN_HEADER,
              width: '120px',
              align: 'left',
              render: (item: TableRow) => {
                const onboardingResult = streamOnboardingResultMap[item.stream.name];

                if (onboardingResult === undefined) {
                  return '-';
                }

                switch (onboardingResult.status) {
                  case SignificantEventsWorkflowStatus.InProgress:
                  case SignificantEventsWorkflowStatus.BeingCanceled:
                    return <EuiLoadingSpinner size="m" />;
                  case SignificantEventsWorkflowStatus.NotStarted:
                  case SignificantEventsWorkflowStatus.Canceled:
                    return '-';
                  case SignificantEventsWorkflowStatus.Completed:
                    return (
                      <EuiIcon type="checkCircleFill" color="success" size="m" aria-hidden={true} />
                    );
                  case SignificantEventsWorkflowStatus.Failed:
                    return (
                      <EuiIconTip
                        size="m"
                        type="crossCircle"
                        color="danger"
                        content={onboardingResult.error}
                      />
                    );
                }
              },
            },
            {
              name: KNOWLEDGE_INDICATORS_COLUMN_HEADER,
              width: '120px',
              align: 'left',
              render: (item: TableRow) => (
                <KnowledgeIndicatorsColumn
                  stream={item.stream}
                  streamOnboardingResult={streamOnboardingResultMap[item.stream.name]}
                />
              ),
            },
            {
              name: QUERIES_COLUMN_HEADER,
              width: '120px',
              align: 'left',
              render: (item: TableRow) => (
                <QueriesColumn
                  streamName={item.stream.name}
                  streamOnboardingResult={streamOnboardingResultMap[item.stream.name]}
                />
              ),
            },
            {
              name: (
                <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                  <EuiFlexItem grow={false}>{SIGNIFICANT_EVENTS_COLUMN_HEADER}</EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIconTip
                      type="info"
                      color="subdued"
                      content={SIGNIFICANT_EVENTS_COLUMN_TOOLTIP}
                      size="s"
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              ),
              width: '210px',
              align: 'left',
              render: (item: TableRow) => <SignificantEventsColumn streamName={item.stream.name} />,
            },
            {
              field: 'definition',
              name: ACTIONS_COLUMN_HEADER,
              width: '60px',
              align: 'left',
              sortable: false,
              dataType: 'string',
              render: (_: unknown, item: TableRow) => {
                const onboardingResult = streamOnboardingResultMap[item.stream.name];

                if (KIS_ONBOARDING_IN_PROGRESS_STATUSES.has(onboardingResult?.status)) {
                  return (
                    <EuiToolTip
                      position="top"
                      content={STOP_STREAM_ONBOARDING_BUTTON_LABEL}
                      display="block"
                      disableScreenReaderOutput
                    >
                      <EuiButtonIcon
                        iconType="stop"
                        aria-label={STOP_STREAM_ONBOARDING_BUTTON_LABEL}
                        disabled={
                          onboardingResult.status === SignificantEventsWorkflowStatus.BeingCanceled
                        }
                        onClick={() => onStopOnboardingActionClick(item.stream.name)}
                      />
                    </EuiToolTip>
                  );
                }

                return (
                  <EuiToolTip
                    position="top"
                    content={RUN_STREAM_ONBOARDING_BUTTON_LABEL}
                    display="block"
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      iconType="radar"
                      aria-label={RUN_STREAM_ONBOARDING_BUTTON_LABEL}
                      onClick={() => onOnboardStreamActionClick(item.stream.name)}
                    />
                  </EuiToolTip>
                );
              },
            },
          ]}
          itemId="nameSortKey"
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
