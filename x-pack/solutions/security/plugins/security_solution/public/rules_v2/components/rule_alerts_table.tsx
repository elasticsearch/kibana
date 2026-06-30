/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import useDebounce from 'react-use/lib/useDebounce';
import type { EuiDataGridColumn, EuiThemeComputed } from '@elastic/eui';
import {
  EuiBadge,
  EuiFieldSearch,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiSuperDatePicker,
  useEuiTheme,
} from '@elastic/eui';
import type { TimeRange } from '@kbn/es-query';
import { CellActionsProvider } from '@kbn/cell-actions';
import type {
  SortOrder,
  CustomBulkActions,
  CustomCellRenderer,
  CustomGridColumnsConfiguration,
  UnifiedDataTableSettings,
} from '@kbn/unified-data-table';
import { DataLoadingState, UnifiedDataTable } from '@kbn/unified-data-table';
import type { RowControlColumn, DataTableRecord } from '@kbn/discover-utils';
import { css } from '@emotion/react';
import { useQueryClient } from '@kbn/react-query';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { AlertEpisodesTagFilter } from '@kbn/alerting-v2-episodes-ui/components/filters/tag_filter';
import { AlertEpisodesAssigneeFilter } from '@kbn/alerting-v2-episodes-ui/components/filters/assignee_filter';
import { useAlertingRulesCache } from '@kbn/alerting-v2-episodes-ui/hooks/use_alerting_rules_cache';
import { createEpisodeActions, type EpisodeAction } from '@kbn/alerting-v2-episodes-ui/actions';
import { EpisodeRuleCell } from '@kbn/alerting-v2-episodes-ui/components/episodes_table_cell_renderers';
import { AlertEpisodeTags } from '@kbn/alerting-v2-episodes-ui/components/actions/tags';
import { WorkflowStatusFilter } from '../../alerts_v2/components/workflow_status_filter';
import {
  useFetchSecurityEpisodes,
  type SecurityAlertEpisode,
  type SecurityEpisodesFilterState,
  type SecurityEpisodesSortState,
  type WorkflowStatus,
} from '../../alerts_v2/hooks/use_fetch_security_episodes';
import { useKibana } from '../../common/lib/kibana';
import { useSpaceId } from '../../common/hooks/use_space_id';
import { EpisodeAssigneeCell } from '../../alerts_v2/components/episode_assignee_cell';
import { TakeActionDropdown } from '../../alerts_v2/components/take_action_dropdown';
import { createWorkflowActions } from '../../alerts_v2/actions/workflow_actions';
import { AlertsV2DetailsPanelKey } from '../../alerts_v2/constants';
import * as alertsI18n from '../../alerts_v2/translations';

const PAGE_SIZE = 1000;

const DEFAULT_SORT: SecurityEpisodesSortState = { sortField: '@timestamp', sortDirection: 'desc' };

const TABLE_SETTINGS: UnifiedDataTableSettings = {
  columns: {
    assignees: { width: 120 },
  },
};

const CUSTOM_GRID_COLUMNS: CustomGridColumnsConfiguration = {
  tags: ({ column }: { column: EuiDataGridColumn }): EuiDataGridColumn => ({
    ...column,
    displayAsText: alertsI18n.COLUMN_TAGS,
  }),
  assignees: ({ column }) => ({
    ...column,
    displayAsText: alertsI18n.COLUMN_ASSIGNEES,
  }),
  workflow_status: ({ column }) => ({
    ...column,
    displayAsText: alertsI18n.COLUMN_STATUS,
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
    align-items: center;
    block-size: 100%;
  }

  & .euiDataGridRowCell[data-gridcell-column-id='select'] .euiDataGridRowCell__content {
    align-items: center;
    justify-content: flex-start;
    height: 100%;
  }

  &
    .euiDataGridRowCell--controlColumn[data-gridcell-column-id='actions']
    .euiDataGridRowCell__content
    > .euiFlexGroup {
    justify-content: center;
  }
`;

const alertEpisodeToDataTableRecord = (row: SecurityAlertEpisode): DataTableRecord => ({
  id: row['episode.id'],
  raw: {},
  flattened: Object.fromEntries(Object.entries(row)),
});

const dataTableRecordToEpisode = (record: DataTableRecord): SecurityAlertEpisode =>
  normalizeEpisodeTags(record.flattened as unknown as SecurityAlertEpisode);

const normalizeEpisodeTags = (ep: SecurityAlertEpisode): SecurityAlertEpisode => {
  const raw = ep.last_tags;
  return Array.isArray(raw) ? ep : { ...ep, last_tags: typeof raw === 'string' ? [raw] : [] };
};

const getEpisodesFromDocIds = (
  selectedDocIds: string[],
  episodes: SecurityAlertEpisode[]
): SecurityAlertEpisode[] => {
  const selected = new Set(selectedDocIds);
  return episodes.filter((ep) => selected.has(ep['episode.id'])).map(normalizeEpisodeTags);
};

interface RuleAlertsTableProps {
  ruleId: string;
}

export const RuleAlertsTable: React.FC<RuleAlertsTableProps> = ({ ruleId }) => {
  const services = useKibana().services;
  const spaceId = useSpaceId();
  const queryClient = useQueryClient();
  const { euiTheme } = useEuiTheme();
  const { openFlyout } = useExpandableFlyoutApi();

  const [timeRange, setTimeRange] = useState<TimeRange>({ from: 'now-6h', to: 'now' });
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkflowStatus, setSelectedWorkflowStatus] = useState<
    WorkflowStatus | undefined
  >();
  const [selectedTags, setSelectedTags] = useState<string[] | undefined>();
  const [selectedAssigneeUid, setSelectedAssigneeUid] = useState<string | undefined>();

  useDebounce(
    () => {
      const trimmed = searchInput.trim();
      setSearchQuery((prev) => (trimmed !== prev ? trimmed : prev));
    },
    300,
    [searchInput]
  );

  const filterState = useMemo<SecurityEpisodesFilterState>(
    () => ({
      queryString: searchQuery || null,
      ruleId,
      workflowStatus: selectedWorkflowStatus,
      tags: selectedTags,
      assigneeUid: selectedAssigneeUid,
    }),
    [searchQuery, ruleId, selectedWorkflowStatus, selectedTags, selectedAssigneeUid]
  );
  const [sortState, setSortState] = useState<SecurityEpisodesSortState>(DEFAULT_SORT);
  const [columns, setColumns] = useState<string[]>([
    '@timestamp',
    'workflow_status',
    'tags',
    'assignees',
  ]);
  const [rowHeight, setRowHeight] = useState(2);

  const {
    data: episodesData,
    dataView,
    isLoading,
    refetch,
  } = useFetchSecurityEpisodes({
    spaceId,
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

  const onSort = useCallback((nextSort: string[][]) => {
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
  }, []);

  const ruleIds = useMemo(
    () => [...new Set(episodesData?.map((row) => row['rule.id']) ?? [])],
    [episodesData]
  );

  const { rulesCache, loading: isLoadingRules } = useAlertingRulesCache({
    ruleIds,
    services,
  });

  const rows = useMemo(() => episodesData?.map(alertEpisodeToDataTableRecord), [episodesData]);

  const assigneeUids = useMemo(() => {
    const uids = new Set<string>();
    for (const ep of episodesData ?? []) {
      if (ep.last_assignee_uid) uids.add(ep.last_assignee_uid);
    }
    return [...uids];
  }, [episodesData]);

  const handleOpenFlyout = useCallback(
    (episodeId: string) => {
      openFlyout({
        right: {
          id: AlertsV2DetailsPanelKey,
          params: { episodeId },
        },
      });
    },
    [openFlyout]
  );

  const handleOpenFlyoutNotes = useCallback(
    (episodeId: string) => {
      openFlyout({
        right: {
          id: AlertsV2DetailsPanelKey,
          params: { episodeId, initialTab: 'notes' },
        },
      });
    },
    [openFlyout]
  );

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
        getDiscoverHref: () => undefined,
      }).filter(
        (a) =>
          a.id !== 'ALERTING_V2_RESOLVE_EPISODE' &&
          a.id !== 'ALERTING_V2_UNRESOLVE_EPISODE' &&
          a.id !== 'ALERTING_V2_VIEW_EPISODE_DETAILS' &&
          a.id !== 'ALERTING_V2_OPEN_EPISODE_IN_DISCOVER' &&
          a.id !== 'ALERTING_V2_ACK_EPISODE' &&
          a.id !== 'ALERTING_V2_UNACK_EPISODE'
      ),
    [services, queryClient]
  );

  const securityActions = useMemo(
    () => createWorkflowActions({ http: services.http, notifications: services.notifications }),
    [services.http, services.notifications]
  );

  const rowAdditionalLeadingControls: RowControlColumn[] = useMemo(
    () => [
      {
        id: 'ruleAlerts-expand',
        width: 38,
        render: (Control, { record }) => (
          <Control
            iconType="expand"
            label={alertsI18n.FLYOUT_TITLE}
            onClick={() => handleOpenFlyout(record.id)}
            tooltipContent={alertsI18n.FLYOUT_TITLE}
          />
        ),
      },
      {
        id: 'ruleAlerts-actions',
        width: 38,
        render: (Control, { record }) => {
          const episode = dataTableRecordToEpisode(record);
          return (
            <TakeActionDropdown
              episodeActions={episodeActions}
              securityActions={securityActions}
              episode={episode as any}
              onActionSuccess={refetch}
              onShowNotes={() => handleOpenFlyoutNotes(record.id)}
              renderCustomButton={(onClick: () => void) => (
                <Control
                  iconType="boxesHorizontal"
                  label={alertsI18n.TAKE_ACTION}
                  onClick={onClick}
                  tooltipContent={alertsI18n.TAKE_ACTION}
                />
              )}
            />
          );
        },
      } as RowControlColumn,
    ],
    [securityActions, episodeActions, refetch, handleOpenFlyout, handleOpenFlyoutNotes]
  );

  const customBulkActions: CustomBulkActions = useMemo(
    () => [
      ...securityActions.map((action) => ({
        key: action.id,
        label: action.displayName,
        icon: action.iconType,
        isAvailable: ({ selectedDocIds }: { selectedDocIds: string[] }) =>
          action.isCompatible({
            episodes: getEpisodesFromDocIds(selectedDocIds, episodesData ?? []),
          }),
        onClick: ({ selectedDocIds }: { selectedDocIds: string[] }) =>
          action.execute({
            episodes: getEpisodesFromDocIds(selectedDocIds, episodesData ?? []),
            onSuccess: refetch,
          }),
      })),
      ...episodeActions.map((action) => ({
        key: action.id,
        label: action.displayName,
        icon: action.iconType,
        isAvailable: ({ selectedDocIds }: { selectedDocIds: string[] }) =>
          action.isCompatible({
            episodes: getEpisodesFromDocIds(selectedDocIds, episodesData ?? []) as any,
          }),
        onClick: ({ selectedDocIds }: { selectedDocIds: string[] }) =>
          action.execute({
            episodes: getEpisodesFromDocIds(selectedDocIds, episodesData ?? []) as any,
            onSuccess: refetch,
          }),
      })),
    ],
    [securityActions, episodeActions, episodesData, refetch]
  );

  const onTimeChange = useCallback(({ start, end }: { start: string; end: string }) => {
    setTimeRange({ from: start, to: end });
  }, []);

  const onSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  }, []);

  const onSetColumns = useCallback((cols: string[], _hideTimeCol: boolean) => {
    setColumns(cols);
  }, []);

  const externalCustomRenderers = useMemo<CustomCellRenderer>(
    () => ({
      workflow_status: ({ row }) => {
        const value = (row.flattened.workflow_status as string) ?? 'open';
        switch (value) {
          case 'acknowledged':
            return <EuiBadge color="warning">{alertsI18n.STATUS_ACKNOWLEDGED}</EuiBadge>;
          case 'closed':
            return <EuiBadge color="default">{alertsI18n.STATUS_CLOSED}</EuiBadge>;
          case 'open':
          default:
            return <EuiBadge color="primary">{alertsI18n.STATUS_OPEN}</EuiBadge>;
        }
      },
      tags: ({ row }) => {
        const raw = row.flattened.last_tags;
        const safeTags = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
        return <AlertEpisodeTags tags={safeTags} />;
      },
      'rule.id': (props) => (
        <EpisodeRuleCell
          {...props}
          rulesCache={rulesCache}
          isLoadingRules={isLoadingRules}
          rowHeight={rowHeight}
        />
      ),
      assignees: ({ row }) => {
        const assigneeUid = row.flattened.last_assignee_uid as string | undefined;
        return <EpisodeAssigneeCell assigneeUid={assigneeUid} userProfile={services.userProfile} />;
      },
    }),
    [rulesCache, isLoadingRules, rowHeight, services.userProfile]
  );

  return (
    <div
      data-test-subj="ruleAlertsTable"
      css={css`
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        min-height: 0;
        min-width: 0;
      `}
    >
      <EuiFlexGroup
        direction="column"
        css={css`
          flex: 1;
          min-width: 0;
        `}
      >
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
            <EuiFlexItem grow>
              <EuiFieldSearch
                compressed
                placeholder={alertsI18n.SEARCH_PLACEHOLDER}
                value={searchInput}
                onChange={onSearchChange}
                isClearable
                aria-label={alertsI18n.SEARCH_PLACEHOLDER}
                fullWidth
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFilterGroup compressed>
                <WorkflowStatusFilter
                  selectedStatus={selectedWorkflowStatus}
                  onStatusChange={setSelectedWorkflowStatus}
                />
                <AlertEpisodesTagFilter
                  selectedTags={selectedTags}
                  onTagsChange={setSelectedTags}
                  services={services}
                  timeRange={timeRange}
                  data-test-subj="ruleAlerts-tagFilter"
                />
                <AlertEpisodesAssigneeFilter
                  selectedAssigneeUid={selectedAssigneeUid}
                  onAssigneeChange={setSelectedAssigneeUid}
                  assigneeUids={assigneeUids}
                  data-test-subj="ruleAlerts-assigneeFilter"
                />
              </EuiFilterGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiSuperDatePicker
                compressed
                start={timeRange.from}
                end={timeRange.to}
                onTimeChange={onTimeChange}
                onRefresh={() => refetch()}
                isLoading={isLoading}
                showUpdateButton="iconOnly"
                updateButtonProps={{ fill: false }}
                width="auto"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiSpacer size="s" />
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
              <span id="ruleAlertsTableAriaLabel">{alertsI18n.ALERTS_V2_TABLE_ARIA_LABEL}</span>
            </EuiScreenReaderOnly>
            {!dataView ? (
              <EuiLoadingSpinner />
            ) : (
              <UnifiedDataTable
                ariaLabelledBy="ruleAlertsTableAriaLabel"
                settings={TABLE_SETTINGS}
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
                customGridColumnsConfiguration={CUSTOM_GRID_COLUMNS}
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
                customBulkActions={customBulkActions}
                rowAdditionalLeadingControls={rowAdditionalLeadingControls}
                enableComparisonMode={false}
                services={{
                  ...services,
                  toastNotifications: services.notifications.toasts,
                }}
              />
            )}
          </CellActionsProvider>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
