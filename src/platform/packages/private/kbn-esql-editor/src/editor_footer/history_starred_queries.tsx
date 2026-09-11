/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import moment from 'moment';
import { i18n } from '@kbn/i18n';
import type { EuiBasicTableColumn, CustomItemAction } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  useEuiTheme,
  EuiInMemoryTable,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCopy,
  EuiToolTip,
  euiScrollBarStyles,
  EuiTab,
  EuiTabs,
  EuiNotificationBadge,
  EuiFieldSearch,
  EuiText,
  EuiIconTip,
} from '@elastic/eui';
import { FAVORITES_LIMIT as ESQL_STARRED_QUERIES_LIMIT } from '@kbn/content-management-favorites-common';
import type { Interpolation, Theme } from '@emotion/react';
import { css } from '@emotion/react';
import { QuerySource } from '@kbn/esql-types/src/esql_telemetry_types';
import {
  type QueryHistoryItem,
  getHistoryItems,
  dateFormat,
  getStorageStats,
  getTrimmedQuery,
} from '../history_local_storage';
import { HistoryTabId } from '../types';
import { getReducedSpaceStyling, swapArrayElements } from './history_starred_queries_helpers';
import type { EsqlStarredQueriesService, StarredQueryItem } from './esql_starred_queries_service';
import { DiscardStarredQueryModal } from './discard_starred_query';
import { useRestorableState } from '../restorable_state';

export function QueryHistoryAction({
  toggleHistory,
  isHistoryOpen,
  isSpaceReduced,
}: {
  toggleHistory: () => void;
  isHistoryOpen: boolean;
  isSpaceReduced?: boolean;
}) {
  const toggleHistoryLabel = isHistoryOpen
    ? i18n.translate('esqlEditor.query.hideQueriesLabel', {
        defaultMessage: 'Hide recent queries',
      })
    : i18n.translate('esqlEditor.query.showQueriesLabel', {
        defaultMessage: 'Show recent queries',
      });

  return (
    <>
      {isSpaceReduced && (
        <EuiFlexItem grow={false} data-test-subj="ESQLEditor-toggle-query-history-icon">
          <EuiToolTip position="top" content={toggleHistoryLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              onClick={toggleHistory}
              iconType="clockCounter"
              data-test-subj="ESQLEditor-hide-queries-link"
              aria-label={toggleHistoryLabel}
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
      {!isSpaceReduced && (
        <EuiFlexItem grow={false} data-test-subj="ESQLEditor-toggle-query-history-button-container">
          <EuiButtonEmpty
            size="xs"
            color="primary"
            flush="both"
            onClick={toggleHistory}
            css={css`
              padding-inline: 0;
            `}
            iconType="clockCounter"
            data-test-subj="ESQLEditor-toggle-query-history-button"
          >
            {toggleHistoryLabel}
          </EuiButtonEmpty>
        </EuiFlexItem>
      )}
    </>
  );
}

export const getTableColumns = (
  width: number,
  isOnReducedSpaceLayout: boolean,
  actions: Array<CustomItemAction<QueryHistoryItem>>,
  isStarredTab = false
): Array<EuiBasicTableColumn<QueryHistoryItem>> => {
  const columnsArray = [
    {
      field: 'status',
      name: i18n.translate('esqlEditor.query.querieshistory.statusColumnHeader', {
        defaultMessage: 'Status',
      }),
      sortable: false,
      'data-test-subj': 'status',
      render: (status: QueryHistoryItem['status']) => {
        switch (status) {
          case 'success':
          default:
            return (
              <EuiIconTip
                position="top"
                content={i18n.translate('esqlEditor.query.querieshistory.success', {
                  defaultMessage: 'Query ran successfully',
                })}
                type="checkCircleFill"
                color="text"
                size="m"
                iconProps={{
                  'data-test-subj': 'ESQLEditor-queryHistory-success',
                }}
              />
            );
          case 'error':
            return (
              <EuiIconTip
                position="top"
                content={i18n.translate('esqlEditor.query.querieshistory.error', {
                  defaultMessage: 'Query failed',
                })}
                type="error"
                color="text"
                size="m"
                iconProps={{
                  'data-test-subj': 'ESQLEditor-queryHistory-error',
                }}
              />
            );
          case 'warning':
            return (
              <EuiIconTip
                position="top"
                content={i18n.translate('esqlEditor.query.querieshistory.error', {
                  defaultMessage: 'Query failed',
                })}
                type="warning"
                color="text"
                size="m"
                iconProps={{
                  'data-test-subj': 'ESQLEditor-queryHistory-warning',
                }}
              />
            );
        }
      },
      width: isOnReducedSpaceLayout ? 'auto' : '80px',
      align: 'center' as const,
      css: { height: '100%' }, // Vertically align icon
    },
    {
      field: 'queryString',
      'data-test-subj': 'queryString',
      name: i18n.translate('esqlEditor.query.recentQueriesColumnLabel', {
        defaultMessage: 'Query',
      }),
      css: css`
        .euiTableCellContent {
          align-items: flex-start;
        }
      `,
      render: (queryString: QueryHistoryItem['queryString']) => (
        <QueryColumn
          queryString={queryString}
          containerWidth={width}
          isOnReducedSpaceLayout={isOnReducedSpaceLayout}
        />
      ),
    },
    {
      field: 'timeRan',
      'data-test-subj': 'timeRan',
      name: isStarredTab
        ? i18n.translate('esqlEditor.query.dateAddedColumnLabel', {
            defaultMessage: 'Date Added',
          })
        : i18n.translate('esqlEditor.query.timeRanColumnLabel', {
            defaultMessage: 'Time ran',
          }),
      sortable: true,
      render: (timeRan: QueryHistoryItem['timeRan']) => moment(timeRan).format(dateFormat),
      width: isOnReducedSpaceLayout ? 'auto' : '240px',
    },
    {
      name: i18n.translate('esqlEditor.query.querieshistory.actionsColumnHeader', {
        defaultMessage: 'Actions',
      }),
      actions,
      'data-test-subj': 'actions',
      width: isOnReducedSpaceLayout ? 'auto' : '60px',
    },
  ];

  // I need to swap the elements here to get the desired design
  return isOnReducedSpaceLayout ? swapArrayElements(columnsArray, 2, 3) : columnsArray;
};

export function QueryList({
  containerCSS,
  containerWidth,
  onUpdateAndSubmit,
  height,
  listItems,
  starredQueriesService,
  tableCaption,
  dataTestSubj,
  isStarredTab = false,
}: {
  listItems: QueryHistoryItem[];
  containerCSS: Interpolation<Theme>;
  containerWidth: number;
  onUpdateAndSubmit: (qs: string, querySource: QuerySource) => void;
  height: number;
  starredQueriesService?: EsqlStarredQueriesService;
  tableCaption?: string;
  dataTestSubj?: string;
  isStarredTab?: boolean;
}) {
  const theme = useEuiTheme();
  const scrollBarStyles = euiScrollBarStyles(theme);
  const [isDiscardQueryModalVisible, setIsDiscardQueryModalVisible] = useState(false);
  const [starredQueries, setStarredQueries] = useState<StarredQueryItem[]>([]);
  const starredQueriesCount = starredQueries.length;

  // Subscribe to starred queries changes to force re-render
  useEffect(() => {
    if (!starredQueriesService) return;

    const subscription = starredQueriesService.queries$.subscribe((nextQueries) => {
      setStarredQueries(nextQueries);
    });

    return () => subscription.unsubscribe();
  }, [starredQueriesService]);

  // Add simple sorting state that won't interfere with pagination
  const sorting = useMemo(
    () => ({
      sort: {
        field: 'timeRan' as keyof QueryHistoryItem,
        direction: 'desc' as const,
      },
    }),
    []
  );

  // Only show pagination if more than 20 items
  const pagination = useMemo(() => {
    if (listItems.length > 20) {
      return {
        initialPageSize: 20,
        showPerPageOptions: false,
      };
    }
    return undefined;
  }, [listItems.length]);

  const actions: Array<CustomItemAction<QueryHistoryItem>> = useMemo(() => {
    return [
      {
        render: (item: QueryHistoryItem) => {
          const StarredQueryButton = starredQueriesService?.renderStarredButton(item);
          const isStarred =
            starredQueriesService?.checkIfQueryIsStarred(getTrimmedQuery(item.queryString)) ??
            false;
          return (
            <EuiFlexGroup
              gutterSize="xs"
              responsive={false}
              data-has-starred={starredQueriesCount > 0}
            >
              {StarredQueryButton && <EuiFlexItem grow={false}>{StarredQueryButton}</EuiFlexItem>}
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  position="top"
                  content={i18n.translate('esqlEditor.query.esqlQueriesListRun', {
                    defaultMessage: 'Run query',
                  })}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType="play"
                    aria-label={i18n.translate('esqlEditor.query.esqlQueriesListRun', {
                      defaultMessage: 'Run query',
                    })}
                    data-test-subj="ESQLEditor-history-starred-queries-run-button"
                    role="button"
                    iconSize="m"
                    onClick={() =>
                      onUpdateAndSubmit(
                        item.queryString,
                        isStarred ? QuerySource.STARRED : QuerySource.HISTORY
                      )
                    }
                    css={css`
                      cursor: pointer;
                    `}
                  />
                </EuiToolTip>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiCopy
                  textToCopy={item.queryString}
                  beforeMessage={i18n.translate('esqlEditor.query.esqlQueriesCopy', {
                    defaultMessage: 'Copy query to clipboard',
                  })}
                  tooltipProps={{ disableScreenReaderOutput: true }}
                >
                  {(copy) => (
                    <EuiButtonIcon
                      iconType="copy"
                      iconSize="m"
                      onClick={copy}
                      css={css`
                        cursor: pointer;
                      `}
                      aria-label={i18n.translate('esqlEditor.query.esqlQueriesCopy', {
                        defaultMessage: 'Copy query to clipboard',
                      })}
                    />
                  )}
                </EuiCopy>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
    ];
  }, [onUpdateAndSubmit, starredQueriesCount, starredQueriesService]);

  const isOnReducedSpaceLayout = containerWidth < 560;
  const columns = useMemo(() => {
    return getTableColumns(containerWidth, isOnReducedSpaceLayout, actions, isStarredTab);
  }, [containerWidth, isOnReducedSpaceLayout, actions, isStarredTab]);

  const { euiTheme } = theme;
  const extraStyling = isOnReducedSpaceLayout ? getReducedSpaceStyling() : '';

  const tableStyling = css`
    .euiTableRowCell {
      vertical-align: top;
      border: none;
    }
    border-bottom-left-radius: ${euiTheme.border.radius.medium};
    border-top-left-radius: ${euiTheme.border.radius.medium};
    max-height: ${height}px;
    overflow-y: auto;
    ${scrollBarStyles}
    ${extraStyling}
  `;

  starredQueriesService?.discardModalVisibility$.subscribe((nextVisibility) => {
    if (isDiscardQueryModalVisible !== nextVisibility) {
      setIsDiscardQueryModalVisible(nextVisibility);
    }
  });

  return (
    <div data-test-subj={dataTestSubj ?? 'ESQLEditor-queryList'} css={containerCSS}>
      <EuiInMemoryTable
        tableCaption={
          tableCaption ||
          i18n.translate('esqlEditor.query.queriesListTable', {
            defaultMessage: 'ES|QL Queries table',
          })
        }
        responsiveBreakpoint={false}
        items={listItems}
        columns={columns}
        sorting={sorting}
        pagination={pagination}
        css={tableStyling}
        tableLayout={containerWidth < 560 ? 'auto' : 'fixed'}
      />
      {isDiscardQueryModalVisible && (
        <DiscardStarredQueryModal
          onClose={async (dismissFlag, removeQuery) =>
            (await starredQueriesService?.onDiscardModalClose(dismissFlag, removeQuery)) ??
            Promise.resolve()
          }
        />
      )}
    </div>
  );
}

export function QueryColumn({
  queryString,
  containerWidth,
  isOnReducedSpaceLayout,
}: {
  containerWidth: number;
  queryString: string;
  isOnReducedSpaceLayout: boolean;
}) {
  const { euiTheme } = useEuiTheme();
  const containerRef = useRef<HTMLElement>(null);

  const [isExpandable, setIsExpandable] = useState(false);
  const [isRowExpanded, setIsRowExpanded] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      const textIsOverlapping = containerRef.current.offsetWidth < containerRef.current.scrollWidth;
      setIsExpandable(textIsOverlapping || isRowExpanded);
    }
  }, [containerWidth, isRowExpanded, queryString]);

  return (
    <>
      {isExpandable && (
        <EuiToolTip
          content={
            isRowExpanded
              ? i18n.translate('esqlEditor.query.collapseLabel', {
                  defaultMessage: 'Collapse',
                })
              : i18n.translate('esqlEditor.query.expandLabel', {
                  defaultMessage: 'Expand',
                })
          }
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            onClick={() => {
              setIsRowExpanded(!isRowExpanded);
            }}
            data-test-subj="ESQLEditor-queryList-queryString-expanded"
            aria-label={
              isRowExpanded
                ? i18n.translate('esqlEditor.query.collapseLabel', {
                    defaultMessage: 'Collapse',
                  })
                : i18n.translate('esqlEditor.query.expandLabel', {
                    defaultMessage: 'Expand',
                  })
            }
            iconType={isRowExpanded ? 'chevronSingleDown' : 'chevronSingleRight'}
            size="xs"
            color="text"
            css={css`
              flex-shrink: 0;
            `}
          />
        </EuiToolTip>
      )}
      <span
        css={css`
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: ${isRowExpanded ? 'pre-wrap' : 'nowrap'};
          padding-left: ${isExpandable ? euiTheme.size.s : euiTheme.size.m ? 0 : euiTheme.size.xl};
          color: ${isOnReducedSpaceLayout ? euiTheme.colors.subduedText : euiTheme.colors.text};
          font-size: ${isOnReducedSpaceLayout ? euiTheme.size.m : 'inherit'};
          font-family: ${euiTheme.font.familyCode};
          line-height: 1.5;
        `}
        ref={containerRef}
      >
        {queryString}
      </span>
    </>
  );
}

export function HistoryAndStarredQueriesTabs({
  containerCSS,
  containerWidth,
  isSpaceReduced,
  onUpdateAndSubmit,
  onClose,
  height,
  starredQueriesService = null,
}: {
  containerCSS: Interpolation<Theme>;
  containerWidth: number;
  onUpdateAndSubmit: (qs: string, querySource: QuerySource) => void;
  onClose: () => void;
  isSpaceReduced?: boolean;
  height: number;
  starredQueriesService: EsqlStarredQueriesService | null;
}) {
  const [starredQueries, setStarredQueries] = useState<StarredQueryItem[]>([]);
  const [historyItems, setHistoryItems] = useState<QueryHistoryItem[]>(() =>
    getHistoryItems('desc')
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [starredSearchQuery, setStarredSearchQuery] = useState('');

  useEffect(() => {
    const updateHistoryItems = () => {
      setHistoryItems(getHistoryItems('desc'));
    };

    updateHistoryItems();

    // Update on mount and when onUpdateAndSubmit changes (indicating potential new queries)
  }, [onUpdateAndSubmit]);

  useEffect(() => {
    if (!starredQueriesService) {
      return;
    }
    const subscription = starredQueriesService.queries$.subscribe((nextQueries) => {
      setStarredQueries(nextQueries);
    });
    return () => subscription.unsubscribe();
  }, [starredQueriesService]);

  // Filter history items based on search query
  const filteredHistoryItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return historyItems;
    }
    return historyItems.filter((item) =>
      item.queryString.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, historyItems]);

  // Filter starred queries based on search query
  const filteredStarredQueries = useMemo(() => {
    if (!starredSearchQuery.trim()) {
      return starredQueries;
    }
    return starredQueries.filter((item) =>
      item.queryString.toLowerCase().includes(starredSearchQuery.toLowerCase())
    );
  }, [starredSearchQuery, starredQueries]);

  // Create stable QueryList components outside of tabs array
  const historyQueryList = useMemo(
    () => (
      <QueryList
        containerCSS={containerCSS}
        onUpdateAndSubmit={onUpdateAndSubmit}
        containerWidth={containerWidth}
        height={height}
        listItems={filteredHistoryItems}
        dataTestSubj="ESQLEditor-queryHistory"
        tableCaption={i18n.translate('esqlEditor.query.querieshistoryTable', {
          defaultMessage: 'Queries history table',
        })}
        starredQueriesService={starredQueriesService ?? undefined}
      />
    ),
    [
      containerCSS,
      onUpdateAndSubmit,
      containerWidth,
      height,
      filteredHistoryItems,
      starredQueriesService,
    ]
  );

  const starredQueryList = useMemo(
    () => (
      <QueryList
        containerCSS={containerCSS}
        onUpdateAndSubmit={onUpdateAndSubmit}
        containerWidth={containerWidth}
        height={height}
        listItems={filteredStarredQueries}
        dataTestSubj="ESQLEditor-starredQueries"
        tableCaption={i18n.translate('esqlEditor.query.starredQueriesTable', {
          defaultMessage: 'Starred queries table',
        })}
        starredQueriesService={starredQueriesService ?? undefined}
        isStarredTab={true}
      />
    ),
    [
      containerCSS,
      onUpdateAndSubmit,
      containerWidth,
      height,
      filteredStarredQueries,
      starredQueriesService,
    ]
  );

  const { euiTheme } = useEuiTheme();
  const tabs = useMemo(() => {
    // use typed helper instead of .filter directly to remove falsy values from result type
    function filterMissing<T>(array: Array<T | false>): T[] {
      return array.filter((item): item is T => item !== undefined);
    }
    return filterMissing([
      {
        id: HistoryTabId.recentQueries,
        name: i18n.translate('esqlEditor.query.historyQueriesTabLabel', {
          defaultMessage: 'Recent',
        }),
        dataTestSubj: 'history-queries-tab',
        append: (
          <EuiNotificationBadge className="eui-alignCenter" size="m" color="subdued">
            {historyItems?.length}
          </EuiNotificationBadge>
        ),
        content: historyQueryList,
      },
      starredQueriesService !== null && {
        id: HistoryTabId.standardQueries,
        dataTestSubj: 'starred-queries-tab',
        name: i18n.translate('esqlEditor.query.starredQueriesTabLabel', {
          defaultMessage: 'Starred',
        }),
        append: (
          <EuiNotificationBadge className="eui-alignCenter" size="m" color="subdued">
            {starredQueries?.length}
          </EuiNotificationBadge>
        ),
        content: starredQueryList,
      },
    ]);
  }, [
    historyItems?.length,
    historyQueryList,
    starredQueries?.length,
    starredQueriesService,
    starredQueryList,
  ]);

  const [selectedTabId, setSelectedTabId] = useRestorableState(
    'historySelectedTabId',
    HistoryTabId.recentQueries
  );

  const selectedTabContent = useMemo(() => {
    return tabs.find((obj) => obj.id === selectedTabId)?.content;
  }, [selectedTabId, tabs]);

  const renderTabs = useCallback(() => {
    return tabs.map((tab, index) => (
      <EuiTab
        key={index}
        onClick={() => setSelectedTabId(tab.id)}
        isSelected={tab.id === selectedTabId}
        append={tab.append}
        data-test-subj={tab.dataTestSubj}
      >
        {tab.name}
      </EuiTab>
    ));
  }, [selectedTabId, tabs, setSelectedTabId]);

  return (
    <>
      <EuiFlexGroup
        data-test-subj="ESQLEditor-history-container"
        responsive={false}
        alignItems="center"
        justifyContent="spaceBetween"
        css={css`
          padding: ${euiTheme.size.s};
          border-block-start: ${euiTheme.border.thin};
        `}
      >
        <EuiTabs bottomBorder={false} size="s">
          {renderTabs()}
        </EuiTabs>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup responsive={false} alignItems="center" gutterSize="s">
            {!isSpaceReduced && (
              <EuiText
                size="xs"
                color="subdued"
                data-test-subj="ESQLEditor-history-starred-queries-helpText"
              >
                <p>
                  {selectedTabId === 'history-queries-tab'
                    ? (() => {
                        const stats = getStorageStats();
                        const displayCount = searchQuery.trim()
                          ? filteredHistoryItems.length
                          : stats.queryCount;
                        return i18n.translate('esqlEditor.history.historyItemsStorage', {
                          defaultMessage: 'Showing {queryCount} queries',
                          values: {
                            queryCount: displayCount,
                          },
                        });
                      })()
                    : (() => {
                        const displayCount = starredSearchQuery.trim()
                          ? filteredStarredQueries.length
                          : starredQueries.length;
                        return i18n.translate('esqlEditor.history.starredItemslimit', {
                          defaultMessage:
                            'Showing {starredItemsCount} queries (max {starredItemsLimit})',
                          values: {
                            starredItemsLimit: ESQL_STARRED_QUERIES_LIMIT,
                            starredItemsCount: displayCount ?? 0,
                          },
                        });
                      })()}
                </p>
              </EuiText>
            )}
            {selectedTabId === 'history-queries-tab' && (
              <EuiFlexItem grow={false}>
                <EuiFieldSearch
                  placeholder={i18n.translate('esqlEditor.history.searchPlaceholder', {
                    defaultMessage: 'Search query history',
                  })}
                  compressed
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-test-subj="ESQLEditor-history-search"
                  css={css`
                    max-width: 400px;
                    width: ${isSpaceReduced ? '100%' : '400px'};
                  `}
                />
              </EuiFlexItem>
            )}
            {selectedTabId === 'starred-queries-tab' && (
              <EuiFlexItem grow={false}>
                <EuiFieldSearch
                  placeholder={i18n.translate('esqlEditor.starred.searchPlaceholder', {
                    defaultMessage: 'Search starred queries',
                  })}
                  compressed
                  value={starredSearchQuery}
                  onChange={(e) => setStarredSearchQuery(e.target.value)}
                  data-test-subj="ESQLEditor-starred-search"
                  css={css`
                    width: 400px;
                  `}
                />
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false}>
              <EuiToolTip
                position="top"
                content={i18n.translate('esqlEditor.history.closeLabel', {
                  defaultMessage: 'Close',
                })}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  iconType="cross"
                  size="xs"
                  color="text"
                  onClick={onClose}
                  aria-label={i18n.translate('esqlEditor.history.closeLabel', {
                    defaultMessage: 'Close',
                  })}
                  data-test-subj="ESQLEditor-history-close-button"
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      {selectedTabContent}
    </>
  );
}
