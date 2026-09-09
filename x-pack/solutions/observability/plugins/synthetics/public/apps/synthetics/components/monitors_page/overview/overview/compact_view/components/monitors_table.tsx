/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import type { CSSProperties } from 'react';
import React, { useCallback, useMemo } from 'react';
import type { Criteria, EuiBasicTableProps, EuiTableRowProps } from '@elastic/eui';
import { EuiBasicTable, EuiLoadingSpinner, EuiText } from '@elastic/eui';
import { useDispatch, useSelector } from 'react-redux-v7';
import type { OverviewStatusMetaData } from '../../../../../../../../../common/runtime_types';
import { useOverviewStatusState } from '../../../../hooks/use_overview_status';
import { selectOverviewFlyoutConfig, selectOverviewPageState } from '../../../../../../state';
import type { MonitorOverviewPageState } from '../../../../../../state/overview/models';
import { setOverviewPageStateAction } from '../../../../../../state/overview';
import type { FlyoutParamProps } from '../../types';
import { useMonitorsTableColumns } from '../hooks/use_monitors_table_columns';
import { useMonitorsTablePagination } from '../hooks/use_monitors_table_pagination';
import { useOverviewTrendsRequests } from '../../../../hooks/use_overview_trends_requests';

// Maps EUI column `field` values to the redux `sortField` keys understood by
// `useMonitorsSortedByStatus`. Only columns whose data is actually sorted by
// the selector chain are listed here — other columns intentionally omit
// `sortable` so we don't expose non-functional UI. URL was folded into the
// Name cell (no header to click anymore) but the sort dropdown still drives
// the `urls` sort token via `sort_fields.tsx`.
const COLUMN_TO_SORT_FIELD: Record<string, MonitorOverviewPageState['sortField']> = {
  overallStatus: 'status',
  name: 'name.keyword',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

const SORT_FIELD_TO_COLUMN = Object.fromEntries(
  Object.entries(COLUMN_TO_SORT_FIELD).map(([column, sortField]) => [sortField, column])
);

/**
 * Decides whether a `MonitorsTable` instance should adopt the server's
 * paginated result set or fall back to slicing its own `items` locally.
 *
 * `MonitorsTable` is rendered twice: once for the single, whole-result-set
 * table (which should follow the server's page/total), and once per group
 * inside `GroupGridItem` with only that group's `items` (which must paginate
 * itself locally — a group is a subset, never the server's page). Callers
 * that render a subset must pass `enableServerPagination: false`, otherwise
 * the group's footer shows the *global* page count and its pager writes the
 * shared Redux page state, corrupting the ungrouped view's position.
 */
export function resolveTablePaginationState({
  enableServerPagination,
  items,
  status,
  total,
  pageState,
  localPageOfItems,
  localPagination,
}: {
  enableServerPagination: boolean;
  items: OverviewStatusMetaData[];
  status: { configs?: OverviewStatusMetaData[] | null } | null | undefined;
  total: number | undefined;
  pageState: Pick<MonitorOverviewPageState, 'page' | 'perPage'>;
  localPageOfItems: OverviewStatusMetaData[];
  localPagination: EuiBasicTableProps<OverviewStatusMetaData>['pagination'];
}): {
  isPaginated: boolean;
  pageOfItems: OverviewStatusMetaData[];
  pagination: EuiBasicTableProps<OverviewStatusMetaData>['pagination'];
} {
  const isPaginated = enableServerPagination && status?.configs != null;

  if (!isPaginated) {
    return { isPaginated: false, pageOfItems: localPageOfItems, pagination: localPagination };
  }

  return {
    isPaginated: true,
    pageOfItems: items,
    pagination: {
      pageIndex: (pageState.page ?? 1) - 1,
      pageSize: pageState.perPage ?? 20,
      totalItemCount: total ?? items.length,
      pageSizeOptions: [10, 20, 50, 100],
    },
  };
}

/**
 * Map an EUI table `onChange` to overview pageState. EUI always includes the
 * current `page` on sort clicks, which would otherwise bypass the reducer's
 * "reset to page 1 on non-pagination changes" guard.
 */
export function paginatedTableUpdatesFromCriteria(
  criteria: Criteria<OverviewStatusMetaData>,
  current: {
    sortField: MonitorOverviewPageState['sortField'];
    sortOrder: MonitorOverviewPageState['sortOrder'];
  }
): Partial<MonitorOverviewPageState> {
  const updates: Partial<MonitorOverviewPageState> = {};
  if (criteria.page) {
    updates.page = criteria.page.index + 1;
    updates.perPage = criteria.page.size;
  }
  const nextSort = criteria.sort;
  if (nextSort) {
    const mappedSortField = COLUMN_TO_SORT_FIELD[nextSort.field as string];
    if (mappedSortField) {
      updates.sortField = mappedSortField;
      updates.sortOrder = nextSort.direction;
      if (mappedSortField !== current.sortField || nextSort.direction !== current.sortOrder) {
        updates.page = 1;
      }
    }
  }
  return updates;
}

// Module-level stable empty list so passing it to `useOverviewTrendsRequests`
// while the flyout is open doesn't churn the effect's dependency identity.
const EMPTY_ITEMS: OverviewStatusMetaData[] = [];

export const MonitorsTable = ({
  items,
  setFlyoutConfigCallback,
  enableServerPagination = true,
}: {
  items: OverviewStatusMetaData[];
  setFlyoutConfigCallback: (params: FlyoutParamProps) => void;
  // Set to `false` when `items` is a subset of the overall result set (e.g. a
  // single group's monitors) — see `resolveTablePaginationState` above.
  enableServerPagination?: boolean;
}) => {
  const { loaded, status, loading, total } = useOverviewStatusState();

  const {
    pageOfItems: localPageOfItems,
    pagination: localPagination,
    onTableChange: onLocalPaginationChange,
  } = useMonitorsTablePagination({
    totalItems: items,
  });

  const pageState = useSelector(selectOverviewPageState);
  const flyoutConfig = useSelector(selectOverviewFlyoutConfig);
  const isFlyoutOpen = Boolean(flyoutConfig?.configId);
  const { sortField, sortOrder } = pageState;

  const { isPaginated, pageOfItems, pagination } = resolveTablePaginationState({
    enableServerPagination,
    items,
    status,
    total,
    pageState,
    localPageOfItems,
    localPagination,
  });

  useOverviewTrendsRequests(isFlyoutOpen ? EMPTY_ITEMS : pageOfItems);

  const { columns } = useMonitorsTableColumns({
    setFlyoutConfigCallback,
    items: pageOfItems,
    isFlyoutOpen,
  });

  const dispatch = useDispatch();

  const sorting: EuiBasicTableProps<OverviewStatusMetaData>['sorting'] = useMemo(() => {
    const sortColumn = sortField ? SORT_FIELD_TO_COLUMN[sortField] : undefined;
    if (!sortColumn) return undefined;
    return {
      sort: {
        field: sortColumn as keyof OverviewStatusMetaData,
        direction: sortOrder ?? 'asc',
      },
    };
  }, [sortField, sortOrder]);

  const onTableChange = useCallback(
    (criteria: Criteria<OverviewStatusMetaData>) => {
      if (isPaginated) {
        dispatch(
          setOverviewPageStateAction(
            paginatedTableUpdatesFromCriteria(criteria, { sortField, sortOrder })
          )
        );
      } else {
        onLocalPaginationChange(criteria);
        const nextSort = criteria.sort;
        if (!nextSort) return;
        const mappedSortField = COLUMN_TO_SORT_FIELD[nextSort.field as string];
        if (!mappedSortField) return;
        if (mappedSortField === sortField && nextSort.direction === sortOrder) return;
        dispatch(
          setOverviewPageStateAction({
            sortField: mappedSortField,
            sortOrder: nextSort.direction,
          })
        );
      }
    },
    [dispatch, isPaginated, onLocalPaginationChange, sortField, sortOrder]
  );

  const getRowProps = useCallback(
    // EuiTableRowProps doesn't expose `style` directly even though EuiTableRow
    // forwards it via HTMLAttributes<HTMLTableRowElement>; widen the return so
    // we can pass `cursor: pointer` without a cast.
    (monitor: OverviewStatusMetaData): EuiTableRowProps & { style?: CSSProperties } => {
      const { configId, spaces } = monitor;
      const locationId = monitor.locations[0]?.id ?? '';
      const locationLabel = monitor.locations[0]?.label ?? '';
      return {
        style: { cursor: 'pointer' },
        onClick: (e) => {
          const target = e.target as HTMLElement;
          // Skip flyout when clicking interactive elements that have their own behavior
          if (target.closest('a, button, [role="button"]')) {
            return;
          }
          dispatch(
            setFlyoutConfigCallback({
              configId,
              id: monitor.monitorQueryId,
              location: locationLabel,
              locationId,
              spaces,
            })
          );
        },
      };
    },
    [dispatch, setFlyoutConfigCallback]
  );

  const isLoading = !status || !loaded || loading;

  return (
    <EuiBasicTable
      compressed
      items={pageOfItems}
      columns={columns}
      loading={isLoading}
      pagination={pagination}
      sorting={sorting}
      onChange={onTableChange}
      rowProps={getRowProps}
      noItemsMessage={
        isLoading ? (
          <EuiLoadingSpinner size="xl" />
        ) : (
          <EuiText size="s">
            {i18n.translate('xpack.synthetics.monitorsTable.noItemsMessage', {
              defaultMessage: 'No monitors found',
            })}
          </EuiText>
        )
      }
      data-test-subj="syntheticsCompactViewTable"
      tableLayout="fixed"
      tableCaption={i18n.translate('xpack.synthetics.monitorsTable.tableCaption', {
        defaultMessage: 'Compact monitors list',
      })}
    />
  );
};
