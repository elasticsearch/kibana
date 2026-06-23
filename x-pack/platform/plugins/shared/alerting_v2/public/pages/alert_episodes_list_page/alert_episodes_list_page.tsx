/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { EuiDataGridColumn, EuiThemeComputed } from '@elastic/eui';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPageHeader,
  EuiScreenReaderOnly,
  EuiSpacer,
  logicalCSS,
  useEuiTheme,
} from '@elastic/eui';
import { CellActionsProvider } from '@kbn/cell-actions';
import type { RenderDocumentViewCallback, SortOrder } from '@kbn/unified-data-table';
import {
  DataLoadingState,
  ROWS_HEIGHT_OPTIONS,
  UnifiedDataTable,
  type CustomCellRenderer,
  type CustomGridColumnsConfiguration,
  type UnifiedDataTableSettings,
} from '@kbn/unified-data-table';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { RowControlColumn, RowControlRowProps } from '@kbn/discover-utils';
import { AlertEpisodeDetailsFlyout } from '@kbn/alerting-v2-episodes-ui/components/details/details_flyout';
import { css } from '@emotion/react';
import { useQueryClient } from '@kbn/react-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useFetchAlertingEpisodesQuery } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_alerting_episodes_query';
import { useInvalidateEpisodeQueries } from '@kbn/alerting-v2-episodes-ui/hooks/use_invalidate_episode_queries';
import type { EpisodesSortState } from '@kbn/alerting-v2-episodes-ui/queries/episodes_query';
import { useAlertingRulesCache } from '@kbn/alerting-v2-episodes-ui/hooks/use_alerting_rules_cache';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import { createEpisodeActions, type EpisodeAction } from '@kbn/alerting-v2-episodes-ui/actions';
import {
  EpisodeStatusCell,
  EpisodeTagsCell,
  EpisodeRuleCell,
} from '@kbn/alerting-v2-episodes-ui/components/episodes_table_cell_renderers';
import { AlertEpisodeAssigneeCell } from '@kbn/alerting-v2-episodes-ui/components/assignee_cell';
import { ExperimentalBadge } from '../../components/experimental_badge';
import { paths } from '../../constants';
import type { AlertEpisodesKibanaServices } from '../../episodes_kibana_services';
import { useBreadcrumbs } from '../../hooks/use_breadcrumbs';
import * as i18n from './translations';
import { EpisodesFilterBar } from './components/episodes_filter_bar';
import { EpisodesKpis } from './components/episodes_kpis';
import { EpisodesHistogram } from './components/episodes_histogram';
import { alertEpisodeToDataTableRecord } from './utils';
import { dataTableRecordToEpisode } from './utils/data_table_record_to_episode';
import { getDiscoverHrefForRuleAndEpisodeTimestamp } from '../../utils/discover_href_for_episode';
import { useEpisodesListUrlState } from './hooks/use_episodes_list_url_state';
import { useEpisodesBulkActions } from './hooks/use_episodes_bulk_actions';

const PAGE_SIZE = 1000;

const DEFAULT_SORT: EpisodesSortState = { sortField: '@timestamp', sortDirection: 'desc' };

const ALERT_EPISODES_TABLE_SETTINGS: UnifiedDataTableSettings = {
  columns: {
    duration: { width: 100 },
    assignees: { width: 120 },
    'episode.status': { width: 110 },
  },
};

const CUSTOM_GRID_COLUMNS_CONFIGURATION: CustomGridColumnsConfiguration = {
  tags: ({ column }: { column: EuiDataGridColumn }): EuiDataGridColumn => ({
    ...column,
    displayAsText: i18n.EPISODES_LIST_COLUMN_TAGS,
  }),
  assignees: ({ column }) => ({
    ...column,
    displayAsText: i18n.EPISODES_LIST_COLUMN_ASSIGNEES,
  }),
};

const getTableCss = (euiTheme: EuiThemeComputed) => css`
  height: 100%;
  border-radius: ${euiTheme.border.radius.medium};
  border: ${euiTheme.border.thin};
  overflow: hidden;

  & .unifiedDataTable__cellValue {
    font-family: unset;
  }

  & .euiDataGridRowCell__content {
    display: flex;
  }

  & .euiDataGridRowCell__content:not(.euiDataGridRowCell__content--autoHeight) {
    block-size: 100%;
  }

  & .euiDataGridRowCell[data-gridcell-column-id='select'] .euiDataGridRowCell__content {
    justify-content: flex-start;
  }

  &
    .euiDataGridRowCell--controlColumn[data-gridcell-column-id='actions']
    .euiDataGridRowCell__content
    > .euiFlexGroup {
    justify-content: center;
  }
`;

export const AlertEpisodesListPage = () => {
  const services = useKibana<AlertEpisodesKibanaServices>().services;
  const queryClient = useQueryClient();
  const invalidateEpisodeQueries = useInvalidateEpisodeQueries();
  const { euiTheme } = useEuiTheme();
  const timefilter = services.data.query.timefilter.timefilter;

  useBreadcrumbs('episodes_list');

  const {
    filterState,
    setFilterState,
    timeRange,
    handleTimeChange,
    histogramBreakdownField,
    setHistogramBreakdownField,
  } = useEpisodesListUrlState(timefilter);
  const [sortState, setSortState] = useState<EpisodesSortState>(DEFAULT_SORT);
  const [columns, setColumns] = useState<string[]>([
    'episode.status',
    '@timestamp',
    'rule.id',
    'duration',
    'tags',
    'assignees',
  ]);
  const [rowHeight, setRowHeight] = useState<number>(ROWS_HEIGHT_OPTIONS.default);
  const [expandedDoc, setExpandedDoc] = useState<DataTableRecord | undefined>();
  const closeFlyout = useCallback(() => setExpandedDoc(undefined), []);

  const {
    data: episodesData,
    dataView,
    isLoading,
  } = useFetchAlertingEpisodesQuery({
    pageSize: PAGE_SIZE,
    services,
    filterState,
    sortState,
    timeRange,
  });

  const sort: SortOrder[] = useMemo(
    () => [[sortState.sortField, sortState.sortDirection]],
    [sortState.sortField, sortState.sortDirection]
  );

  const onSort = useCallback(
    (nextSort: string[][]) => {
      if (!nextSort.length) {
        setSortState(DEFAULT_SORT);
        return;
      }
      const [field, dir] = nextSort[nextSort.length - 1];
      if (field != null && dir != null) {
        setSortState({
          sortField: String(field),
          sortDirection: dir === 'asc' ? 'asc' : 'desc',
        });
      }
    },
    [setSortState]
  );

  const ruleIds = useMemo(
    () => [...new Set(episodesData?.map((row) => row['rule.id']) ?? [])],
    [episodesData]
  );

  const { rulesCache, loading: isLoadingRules } = useAlertingRulesCache({
    ruleIds,
    services,
  });

  const ruleOptions = useMemo(
    () =>
      Object.entries(rulesCache).map(([id, rule]) => ({
        label: rule.metadata?.name ?? id,
        value: id,
      })),
    [rulesCache]
  );

  const rows = useMemo(() => episodesData?.map(alertEpisodeToDataTableRecord), [episodesData]);

  const episodeActions: EpisodeAction[] = useMemo(
    () =>
      createEpisodeActions({
        http: services.http,
        overlays: services.overlays,
        notifications: services.notifications,
        rendering: services.rendering,
        application: services.application,
        userProfile: services.userProfile,
        docLinks: services.docLinks,
        expressions: services.expressions,
        spaces: services.spaces,
        queryClient,
        getDiscoverHref: ({ episodeIsoTimestamp, ruleId }) =>
          getDiscoverHrefForRuleAndEpisodeTimestamp({
            share: services.share,
            capabilities: services.application.capabilities,
            uiSettings: services.uiSettings,
            ruleEsql: rulesCache[ruleId]?.query
              ? getBreachEsqlQuery(rulesCache[ruleId]!.query)
              : undefined,
            episodeIsoTimestamp,
          }),
      }),
    [services, queryClient, rulesCache]
  );

  const renderDocumentView = useCallback<RenderDocumentViewCallback>(
    (hit) => (
      <AlertEpisodeDetailsFlyout
        episodeId={hit.flattened['episode.id'] as string}
        groupHash={hit.flattened.group_hash as string | undefined}
        onClose={closeFlyout}
        actions={episodeActions}
        services={{
          data: services.data,
          http: services.http,
          expressions: services.expressions,
          userProfile: services.userProfile,
          spaces: services.spaces,
          uiSettings: services.uiSettings,
          unifiedDocViewer: services.unifiedDocViewer,
          dataViews: services.dataViews,
        }}
      />
    ),
    [closeFlyout, episodeActions, services]
  );

  const rowAdditionalLeadingControls: RowControlColumn[] = useMemo(
    () =>
      episodeActions.map((action) => ({
        id: action.id,
        isAvailable: ({ record }: RowControlRowProps) =>
          action.isCompatible({ episodes: [dataTableRecordToEpisode(record)] }),
        render: (Control, { record }) => {
          const episodes = [dataTableRecordToEpisode(record)];
          return (
            <Control
              iconType={action.iconType}
              label={action.displayName}
              onClick={() => action.execute({ episodes, onSuccess: invalidateEpisodeQueries })}
              tooltipContent={action.displayName}
            />
          );
        },
      })),
    [episodeActions, invalidateEpisodeQueries]
  );

  const customBulkActions = useEpisodesBulkActions({
    actions: episodeActions,
    episodesData,
    onSuccess: invalidateEpisodeQueries,
  });

  const assigneeUids = useMemo(
    () => [
      ...new Set(
        (episodesData ?? [])
          .map((row) => row.last_assignee_uid)
          .filter((uid): uid is string => uid != null)
      ),
    ],
    [episodesData]
  );

  const onSetColumns = useCallback((cols: string[], _hideTimeCol: boolean) => {
    setColumns(cols);
  }, []);

  const externalCustomRenderers = useMemo<CustomCellRenderer>(
    () => ({
      'episode.status': (props) => <EpisodeStatusCell {...props} />,
      tags: (props) => <EpisodeTagsCell {...props} />,
      'rule.id': (props) => (
        <EpisodeRuleCell
          {...props}
          rulesCache={rulesCache}
          isLoadingRules={isLoadingRules}
          rowHeight={rowHeight}
        />
      ),
      assignees: (props) => {
        const assigneeUid = props.row.flattened.last_assignee_uid as string | undefined;
        return (
          <AlertEpisodeAssigneeCell assigneeUid={assigneeUid} userProfile={services.userProfile} />
        );
      },
    }),
    [rulesCache, isLoadingRules, rowHeight, services.userProfile]
  );

  return (
    <div
      data-test-subj="alertingV2EpisodesListPage"
      css={css`
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        ${logicalCSS('min-height')}: 0;
        min-width: 0;
      `}
    >
      <EuiPageHeader
        bottomBorder
        pageTitle={
          <EuiFlexGroup component="span" alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false} component="span">
              {i18n.EPISODES_LIST_PAGE_TITLE}
            </EuiFlexItem>
            <EuiFlexItem grow={false} component="span">
              <ExperimentalBadge />
            </EuiFlexItem>
          </EuiFlexGroup>
        }
        rightSideItems={[
          <EuiButton
            key="manage-rules"
            color="text"
            size="s"
            iconType="gear"
            href={services.http.basePath.prepend(paths.ruleList)}
            data-test-subj="alertingV2EpisodesListManageRules"
          >
            {i18n.EPISODES_LIST_MANAGE_RULES}
          </EuiButton>,
        ]}
      />
      <EuiSpacer size="m" />

      <EuiFlexGroup
        direction="column"
        css={css`
          flex: 1;
          min-width: 0;
        `}
      >
        <EuiFlexItem grow={false}>
          <EpisodesFilterBar
            filterState={filterState}
            onFilterChange={setFilterState}
            timeRange={timeRange}
            onTimeChange={handleTimeChange}
            ruleOptions={ruleOptions}
            assigneeUids={assigneeUids}
            onRefresh={invalidateEpisodeQueries}
            isLoading={isLoading}
            services={services}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EpisodesKpis services={services} filterState={filterState} timeRange={timeRange} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EpisodesHistogram
            services={services}
            dataView={dataView}
            filterState={filterState}
            timeRange={timeRange}
            onTimeRangeChange={handleTimeChange}
            breakdownField={histogramBreakdownField}
            onBreakdownFieldChange={setHistogramBreakdownField}
          />
        </EuiFlexItem>
        <EuiFlexItem
          grow
          css={css`
            min-width: 0;
          `}
        >
          <CellActionsProvider
            getTriggerCompatibleActions={services.uiActions.getTriggerCompatibleActions}
          >
            <EuiScreenReaderOnly>
              <span id="alertingEpisodesTableAriaLabel">{i18n.EPISODES_LIST_TABLE_ARIA_LABEL}</span>
            </EuiScreenReaderOnly>
            {!dataView ? (
              <EuiLoadingSpinner />
            ) : (
              <UnifiedDataTable
                ariaLabelledBy="alertingEpisodesTableAriaLabel"
                settings={ALERT_EPISODES_TABLE_SETTINGS}
                css={getTableCss(euiTheme)}
                gridStyleOverride={{
                  stripes: false,
                  cellPadding: 'l',
                }}
                dataView={dataView}
                columns={columns}
                onSetColumns={onSetColumns}
                canDragAndDropColumns
                showTimeCol={!!dataView.timeFieldName}
                customGridColumnsConfiguration={CUSTOM_GRID_COLUMNS_CONFIGURATION}
                externalCustomRenderers={externalCustomRenderers}
                rows={rows}
                totalHits={!episodesData?.length ? 0 : PAGE_SIZE + 1}
                loadingState={isLoading ? DataLoadingState.loading : DataLoadingState.loaded}
                isPaginationEnabled
                paginationMode="singlePage"
                sampleSizeState={PAGE_SIZE}
                isSortEnabled
                sort={sort}
                onSort={onSort}
                rowHeightState={rowHeight}
                onUpdateRowHeight={setRowHeight}
                configRowHeight={rowHeight}
                customBulkActions={customBulkActions}
                rowAdditionalLeadingControls={rowAdditionalLeadingControls}
                visibleRowLeadingControls={3}
                enableComparisonMode={false}
                services={services}
                expandedDoc={expandedDoc}
                setExpandedDoc={setExpandedDoc}
                renderDocumentView={renderDocumentView}
              />
            )}
          </CellActionsProvider>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
