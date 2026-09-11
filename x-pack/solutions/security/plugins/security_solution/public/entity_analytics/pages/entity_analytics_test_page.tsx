/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import moment from 'moment';
import type { EuiDataGridColumn } from '@elastic/eui';
import {
  EuiBadge,
  EuiDataGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiProgress,
  EuiSpacer,
  EuiTextColor,
  useEuiTheme,
} from '@elastic/eui';
import { DistributionBar } from '@kbn/security-solution-distribution-bar';
import { Global, css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { AppHeader, type AppHeaderMenu } from '@kbn/app-header';
import { useQuery } from '@kbn/react-query';
import { buildEsQuery } from '@kbn/es-query';
import { getSeverityColor } from '../../detections/components/alerts_kpis/severity_level_panel/helpers';
import { SecurityPageName } from '../../app/types';
import { SecuritySolutionPageWrapper } from '../../common/components/page_wrapper';
import { SiemSearchBar } from '../../common/components/search_bar';
import { InputsModelId } from '../../common/store/inputs/constants';
import { SpyRoute } from '../../common/utils/route/spy_routes';
import { useGetSecuritySolutionUrl } from '../../common/components/link_to';
import { useKibana } from '../../common/lib/kibana';
import { useSpaceId } from '../../common/hooks/use_space_id';
import { useDeepEqualSelector } from '../../common/hooks/use_selector';
import {
  globalFiltersQuerySelector,
  globalQuerySelector,
} from '../../common/store/inputs/selectors';
import { useEntityStoreDataView } from '../components/home/use_entity_store_data_view';
import { ENTITY_GRID_INTERNAL_URL } from '../../../common/entity_analytics/entity_analytics/constants';
import { WATCHLISTS_URL } from '../../../common/entity_analytics/watchlists/constants';
import { API_VERSIONS } from '../../../common/entity_analytics/constants';
import { AssetCriticalityBadge } from '../components/asset_criticality';
import type { CriticalityLevelWithUnassigned } from '../../../common/entity_analytics/asset_criticality/types';
import {
  EntitySourceValue,
  toEntitySourceArray,
} from '../../flyout/entity_details/shared/components/entity_source_value';

const PAGE_TITLE = i18n.translate('xpack.securitySolution.entityAnalytics.testPage.pageTitle', {
  defaultMessage: 'Entity analytics (ES|QL)',
});

const MANAGEMENT_LABEL = i18n.translate(
  'xpack.securitySolution.entityAnalytics.testPage.managementLink',
  { defaultMessage: 'Management' }
);

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const GRID_COLUMNS: EuiDataGridColumn[] = [
  { id: 'actions', displayAsText: 'Actions', initialWidth: 100, isSortable: false },
  { id: 'entity.name', displayAsText: 'Entity name', initialWidth: 200 },
  { id: 'group_size', displayAsText: 'Records', initialWidth: 100, isSortable: true },
  { id: 'entity.EngineMetadata.Type', displayAsText: 'Entity type', initialWidth: 120 },
  { id: 'entity.risk.calculated_score_norm', displayAsText: 'Risk score', initialWidth: 120 },
  { id: 'risk_score_change', displayAsText: 'Risk score change', initialWidth: 140 },
  { id: 'asset.criticality', displayAsText: 'Asset criticality', initialWidth: 160 },
  { id: 'entity.source', displayAsText: 'Source', initialWidth: 140, isSortable: false },
  { id: 'alert_count', displayAsText: 'Alerts', initialWidth: 100, isSortable: true },
  { id: 'last_seen_alert', displayAsText: 'Last alert', initialWidth: 180 },
  { id: 'anomaly_count', displayAsText: 'Anomalies', initialWidth: 120, isSortable: true },
  { id: 'case_count', displayAsText: 'Cases', initialWidth: 100, isSortable: false },
  {
    id: 'entity.attributes.watchlists',
    displayAsText: 'Watchlists',
    initialWidth: 200,
    isSortable: false,
  },
  {
    id: 'entity.lifecycle.first_seen',
    displayAsText: 'First seen',
    initialWidth: 180,
    isSortable: false,
  },
  { id: '@timestamp', displayAsText: 'Last seen', initialWidth: 180 },
];

interface EntityGridResponse {
  entities: Array<Record<string, unknown>>;
  next_cursor: string | null;
  total: number;
}

const pageWrapperOverride = css`
  [data-test-subj='pageContainer'].securityPageWrapper {
    padding-inline: 0 !important;
  }
  [data-test-subj='pageContainer'].securityPageWrapper > [class*='euiPageSection__content'] {
    padding-block: 0 !important;
  }
`;

const useEntityGridData = ({
  sortField,
  sortDirection,
  pageIndex,
  pageSize,
  cursors,
  onNextCursor,
  filter,
}: {
  sortField: string;
  sortDirection: 'asc' | 'desc';
  pageIndex: number;
  pageSize: number;
  cursors: Array<string | null>;
  onNextCursor: (pageIndex: number, cursor: string) => void;
  filter?: object;
}) => {
  const { http } = useKibana().services;
  const cursor = cursors[pageIndex] ?? null;
  // Keep the last known total so rowCount never collapses to 0 during page transitions.
  const [cachedTotal, setCachedTotal] = useState(0);

  const { data, isFetching } = useQuery(
    ['entity-test-grid', sortField, sortDirection, pageIndex, pageSize, cursor, filter],
    async () => {
      const result = await http.post<EntityGridResponse>(ENTITY_GRID_INTERNAL_URL, {
        version: '1',
        body: JSON.stringify({
          sort: { field: sortField, direction: sortDirection },
          page_size: pageSize,
          profile: true,
          ...(cursor ? { cursor } : {}),
          ...(filter ? { filter } : {}),
        }),
      });
      return result;
    },
    {
      onSuccess: (result) => {
        setCachedTotal(result.total);
        if (result.next_cursor && !cursors[pageIndex + 1]) {
          onNextCursor(pageIndex + 1, result.next_cursor);
        }
      },
    }
  );

  return {
    rows: data?.entities ?? [],
    total: cachedTotal,
    isFetching,
  };
};

const useWatchlistNames = (): Map<string, string> => {
  const { http } = useKibana().services;
  const { data } = useQuery(['watchlist-names'], () =>
    http.get<Array<{ id?: string; name: string }>>(`${WATCHLISTS_URL}/list`, {
      version: API_VERSIONS.public.v1,
    })
  );
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const w of data ?? []) {
      if (w.id) map.set(w.id, w.name);
    }
    return map;
  }, [data]);
};

export const EntityAnalyticsTestPage: React.FC = () => {
  const spaceId = useSpaceId();
  const { dataView, isLoading: isDataViewLoading } = useEntityStoreDataView(spaceId);
  const getSecuritySolutionUrl = useGetSecuritySolutionUrl();
  const { euiTheme } = useEuiTheme();

  const globalFilters = useDeepEqualSelector(globalFiltersQuerySelector());
  const globalQuery = useDeepEqualSelector(globalQuerySelector());

  const esFilter = useMemo(() => {
    try {
      const built = buildEsQuery(dataView, [globalQuery], globalFilters);
      const hasContent =
        built.bool?.must?.length ||
        built.bool?.filter?.length ||
        built.bool?.should?.length ||
        built.bool?.must_not?.length;
      return hasContent ? built : undefined;
    } catch {
      return undefined;
    }
  }, [dataView, globalQuery, globalFilters]);

  const watchlistNames = useWatchlistNames();
  const [sortField, setSortField] = useState('entity.risk.calculated_score_norm');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  // cursors[i] is the cursor to pass when loading page i; cursors[0] is always null (first page)
  const [cursors, setCursors] = useState<Array<string | null>>([null]);

  const resetPagination = useCallback(() => {
    setPageIndex(0);
    setCursors([null]);
  }, []);

  // Reset pagination when the search filter changes.
  useEffect(() => {
    resetPagination();
  }, [esFilter, resetPagination]);

  const onNextCursor = useCallback((idx: number, cursor: string) => {
    setCursors((prev) => {
      const next = [...prev];
      next[idx] = cursor;
      return next;
    });
  }, []);

  const { rows, total, isFetching } = useEntityGridData({
    sortField,
    sortDirection,
    pageIndex,
    pageSize,
    cursors,
    onNextCursor,
    filter: esFilter,
  });

  const [visibleColumns, setVisibleColumns] = useState(GRID_COLUMNS.map((c) => c.id));

  const renderCellValue = useCallback(
    (props: { rowIndex: number; columnId: string }) => {
      const { rowIndex, columnId } = props;
      const relativeIndex = rowIndex - pageIndex * pageSize;
      const value = rows[relativeIndex]?.[columnId];
      if (value == null) return <>{'—'}</>;
      if (
        columnId === 'last_seen_alert' ||
        columnId === '@timestamp' ||
        columnId === 'entity.lifecycle.first_seen'
      ) {
        const m = moment(value as string);
        return <>{m.isValid() ? m.fromNow() : String(value)}</>;
      }
      if (columnId === 'risk_score_change') {
        const delta = value as number;
        if (delta > 0)
          return <EuiTextColor color="danger">{`↑ ${Math.round(delta)}%`}</EuiTextColor>;
        if (delta < 0)
          return <EuiTextColor color="success">{`↓ ${Math.round(Math.abs(delta))}%`}</EuiTextColor>;
        return <>{'→ 0%'}</>;
      }
      if (columnId === 'alert_count') {
        const row = rows[relativeIndex];
        const alertCount = value as number;
        if (alertCount === 0) return <>{'—'}</>;
        const severities = [
          {
            key: 'Critical',
            count: (row?.alert_critical as number) ?? 0,
            color: getSeverityColor('critical', euiTheme),
          },
          {
            key: 'High',
            count: (row?.alert_high as number) ?? 0,
            color: getSeverityColor('high', euiTheme),
          },
          {
            key: 'Medium',
            count: (row?.alert_medium as number) ?? 0,
            color: getSeverityColor('medium', euiTheme),
          },
          {
            key: 'Low',
            count: (row?.alert_low as number) ?? 0,
            color: getSeverityColor('low', euiTheme),
          },
        ].filter((s) => s.count > 0);
        return (
          <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
            <EuiFlexItem>
              <DistributionBar stats={severities} hideLastTooltip />
            </EuiFlexItem>
            <EuiBadge color="hollow">{alertCount}</EuiBadge>
          </EuiFlexGroup>
        );
      }
      if (columnId === 'case_count') {
        if ((value as number) === 0) return <>{'—'}</>;
        return <>{String(value)}</>;
      }
      if (columnId === 'entity.attributes.watchlists') {
        const ids = value as string[];
        if (!Array.isArray(ids) || ids.length === 0) return <>{'—'}</>;
        const names = ids.map((id) => watchlistNames.get(id) ?? id);
        return (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap={false}>
            <EuiFlexItem grow={false}>{names[0]}</EuiFlexItem>
            {names.length > 1 && (
              <EuiFlexItem grow={false}>
                <EuiBadge>{`+${names.length - 1}`}</EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        );
      }
      if (columnId === 'asset.criticality') {
        return (
          <AssetCriticalityBadge
            criticalityLevel={(value as CriticalityLevelWithUnassigned) ?? 'unassigned'}
          />
        );
      }
      if (columnId === 'entity.source') {
        return <EntitySourceValue values={toEntitySourceArray(value)} textSize="s" />;
      }
      return <>{String(value)}</>;
    },
    [rows, pageIndex, pageSize, watchlistNames, euiTheme]
  );

  const sorting = useMemo(
    () => ({
      columns: [{ id: sortField, direction: sortDirection }],
      onSort: (cols: Array<{ id: string; direction: 'asc' | 'desc' }>) => {
        // EuiDataGrid appends new columns when clicking an unsorted header;
        // pick the newly added column (id ≠ current sortField), falling back
        // to cols[0] when the user is toggling direction on the existing sort.
        const col = cols.find((c) => c.id !== sortField) ?? cols[0];
        if (!col) return;
        setSortField(col.id);
        setSortDirection(col.direction);
        resetPagination();
      },
    }),
    [sortField, sortDirection, resetPagination]
  );

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      onChangePage: (newPage: number) => setPageIndex(newPage),
      onChangeItemsPerPage: (newSize: number) => {
        setPageSize(newSize);
        resetPagination();
      },
    }),
    [pageIndex, pageSize, resetPagination]
  );

  const menu = useMemo<AppHeaderMenu>(
    () => ({
      items: [
        {
          id: 'entityAnalyticsManagement',
          label: MANAGEMENT_LABEL,
          iconType: 'gear' as const,
          href: getSecuritySolutionUrl({ deepLinkId: SecurityPageName.entityAnalyticsManagement }),
        },
      ],
    }),
    [getSecuritySolutionUrl]
  );

  if (isDataViewLoading) return <EuiLoadingSpinner size="l" />;

  return (
    <>
      <Global styles={pageWrapperOverride} />
      <AppHeader title={PAGE_TITLE} menu={menu} />
      <SecuritySolutionPageWrapper data-test-subj="entityAnalyticsTestPage">
        <div
          css={css`
            padding-block-start: ${euiTheme.size.base};
            display: flex;
            flex-direction: column;
            height: 100%;
          `}
        >
          <div
            css={css`
              padding-inline: ${euiTheme.size.base};
            `}
          >
            <SiemSearchBar dataView={dataView} id={InputsModelId.global} hideDatePicker />
          </div>

          <EuiSpacer size="m" />

          {isFetching && <EuiProgress size="xs" color="accent" position="fixed" />}

          <EuiDataGrid
            aria-label="Entity analytics ES|QL grid"
            columns={GRID_COLUMNS}
            columnVisibility={{ visibleColumns, setVisibleColumns }}
            rowCount={total}
            renderCellValue={renderCellValue}
            sorting={sorting}
            pagination={pagination}
          />
        </div>
      </SecuritySolutionPageWrapper>
      <SpyRoute pageName={SecurityPageName.entityAnalyticsHomePage} />
    </>
  );
};
