/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import type { Filter } from '@kbn/es-query';
import { isNonLocalIndexName } from '@kbn/es-query';
import { TableId } from '@kbn/securitysolution-data-table';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { GroupingSort, ParsedGroupingAggregation, RawBucket } from '@kbn/grouping/src';
import { isGroupingBucket } from '@kbn/grouping/src';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { AttackDetailsRightPanelKey } from '../../../../flyout/attack_details/constants/panel_keys';
import { ALERT_ATTACK_IDS } from '../../../../../common/field_maps/field_names';
import { PageScope } from '../../../../data_view_manager/constants';
import { useDataTableFilters } from '../../../../common/hooks/use_data_table_filters';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { inputsSelectors } from '../../../../common/store/inputs';
import { useKibana } from '../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useDefaultDocumentFlyoutProperties } from '../../../../flyout_v2/shared/hooks/use_default_flyout_properties';
import { flyoutProviders } from '../../../../flyout_v2/shared/components/flyout_provider';
import { AttackFlyoutWrapper } from '../../../../flyout_v2/attack/main/attack_flyout_wrapper';
import { documentFlyoutHistoryKey } from '../../../../flyout_v2/shared/constants/flyout_history';
import { useUserData } from '../../user_info';
import { useListsConfig } from '../../../containers/detection_engine/lists/use_lists_config';
import {
  buildAlertAssigneesFilter,
  buildShowBuildingBlockFilter,
  buildThreatMatchFilter,
} from '../../alerts_table/default_config';
import type { Status } from '../../../../../common/api/detection_engine';
import { GroupedAlertsTable } from '../../alerts_table/alerts_grouping';
import type { AlertsGroupingAggregation } from '../../alerts_table/grouping_settings/types';
import { useGetDefaultGroupTitleRenderers } from '../../../hooks/attacks/use_get_default_group_title_renderers';
import { useAttackGroupHandler } from '../../../hooks/attacks/use_attack_group_handler';
import type { AssigneesIdsSelection } from '../../../../common/components/assignees/types';
import { AttackDetailsContainer } from './attack_details/attack_details_container';
import { AlertsTab } from './attack_details/alerts_tab';
import { EmptyResultsPrompt } from './empty_results_prompt';
import { dsl } from '../utils/dsl';
import { groupingOptions, groupingSettings } from './grouping_settings/grouping_configs';
import {
  buildAttacksOnlyFilter,
  buildAttackTypeFilter,
  buildConnectorIdFilter,
} from './filtering_configs';
import type { GroupTakeActionItems } from '../../alerts_table/types';
import { AttacksGroupTakeActionItems } from './attacks_group_take_action_items';
import { useGroupStats } from './grouping_settings/use_group_stats';
import { AttacksTableSortSelect, DEFAULT_ATTACKS_SORT } from './attacks_table_sort_select';
import { AlertActionItems } from './alerts_action_items';
import { AttacksViewOptionsPopover } from './attacks_view_options_popover';
import { useLocalStorage } from '../../../../common/components/local_storage';

export const TABLE_SECTION_TEST_ID = 'attacks-page-table-section';
export const ATTACKS_TABLE_SORT_STORAGE_KEY = 'securitySolution:attacksTableSort';

export interface TableSectionProps {
  /**
   * DataView used to fetch the alerts data
   */
  dataView: DataView;

  /**
   * The status filter retrieved from the FiltersSection component to filter the table
   * This is an array of Status values, such as ['open', 'acknowledged', 'closed', 'in-progress']
   */
  statusFilter: Status[];

  /**
   * The page filters retrieved from the FiltersSection component to filter the table
   */
  pageFilters: Filter[] | undefined;

  /**
   * The list of assignees to add to the others filters
   */
  assignees: AssigneesIdsSelection[];
  /**
   * The list of selected connectors ID to filter the table
   */
  selectedConnectorNames: string[];

  /**
   * The list of selected types to filter the table
   */
  selectedTypes: string[];

  /**
   * Callback to open the schedules flyout
   */
  openSchedulesFlyout: () => void;

  /**
   * Optional callback invoked with the attack id group keys whenever the grouped
   * table results change (`undefined` until the first aggregation resolves).
   * Used by the page tour to know whether any attacks match the active filters.
   */
  onAttackIdsChange?: (attackIds: string[] | undefined) => void;
}

/**
 * Renders the alerts table with grouping functionality in the attacks page.
 */
export const TableSection = React.memo(
  ({
    dataView,
    statusFilter,
    pageFilters,
    assignees,
    selectedConnectorNames,
    selectedTypes,
    openSchedulesFlyout,
    onAttackIdsChange,
  }: TableSectionProps) => {
    const getGlobalFiltersQuerySelector = useMemo(
      () => inputsSelectors.globalFiltersQuerySelector(),
      []
    );
    const globalFilters = useDeepEqualSelector(getGlobalFiltersQuerySelector);

    const getGlobalQuerySelector = useMemo(() => inputsSelectors.globalQuerySelector(), []);
    const query = useDeepEqualSelector(getGlobalQuerySelector);

    const { to, from } = useGlobalTime();

    const { services } = useKibana();
    const { telemetry, overlays } = services;

    const newFlyoutSystemEnabled = useIsExperimentalFeatureEnabled('newFlyoutSystemEnabled');
    const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();
    const store = useStore();
    const history = useHistory();

    const [{ loading: userInfoLoading }] = useUserData();

    const { loading: listsConfigLoading } = useListsConfig();

    const { showOnlyThreatIndicatorAlerts } = useDataTableFilters(TableId.alertsOnAttacksPage);

    // for showing / hiding anonymized data:
    const [showAnonymized, setShowAnonymized] = useState<boolean>(false);
    const onToggleShowAnonymized = useCallback(() => setShowAnonymized((current) => !current), []);

    // for showing / hiding attacks only:
    const [showAttacksOnly, setShowAttacksOnly] = useState<boolean>(true);
    const onToggleShowAttacksOnly = useCallback(
      () => setShowAttacksOnly((current) => !current),
      []
    );

    const attacksViewOptionsPopover = useMemo(() => {
      return (
        <AttacksViewOptionsPopover
          showAnonymized={showAnonymized}
          onToggleShowAnonymized={onToggleShowAnonymized}
          showAttacksOnly={showAttacksOnly}
          onToggleShowAttacksOnly={onToggleShowAttacksOnly}
        />
      );
    }, [onToggleShowAnonymized, showAnonymized, onToggleShowAttacksOnly, showAttacksOnly]);

    const [attackIds, setAttackIds] = useState<string[] | undefined>(undefined);
    const { getAttack, isLoading: isAttacksLoading } = useAttackGroupHandler({ attackIds });

    const { openFlyout } = useExpandableFlyoutApi();
    const openAttackDetailsFlyout = useCallback(
      (selectedGroup: string, bucket: RawBucket<AlertsGroupingAggregation>) => {
        const attack = getAttack(selectedGroup, bucket);
        if (attack) {
          if (newFlyoutSystemEnabled) {
            overlays.openSystemFlyout(
              flyoutProviders({
                services,
                store,
                history,
                children: (
                  <AttackFlyoutWrapper
                    attackId={attack.id}
                    indexName={dataView.getIndexPattern()}
                    onAttackUpdated={() => {}}
                  />
                ),
              }),
              {
                ...defaultFlyoutProperties,
                historyKey: documentFlyoutHistoryKey,
                session: 'start',
              }
            );
          } else {
            openFlyout({
              right: {
                id: AttackDetailsRightPanelKey,
                params: {
                  attackId: attack.id,
                  indexName: dataView.getIndexPattern(),
                },
              },
            });
          }
          telemetry.reportEvent(AttacksEventTypes.DetailsFlyoutOpened, {
            id: attack.id,
            source: 'attacks_page_table',
          });
        }
      },
      [
        dataView,
        defaultFlyoutProperties,
        getAttack,
        history,
        newFlyoutSystemEnabled,
        openFlyout,
        overlays,
        services,
        store,
        telemetry,
      ]
    );

    const { defaultGroupTitleRenderers } = useGetDefaultGroupTitleRenderers({
      getAttack,
      showAnonymized,
      isLoading: isAttacksLoading,
      openAttackDetailsFlyout,
    });

    const onAggregationsChange = useCallback(
      (aggs: ParsedGroupingAggregation<AlertsGroupingAggregation>, groupingLevel?: number) => {
        if (groupingLevel != null && groupingLevel !== 0) {
          return;
        }
        const attackIdsGroupBuckets = aggs.groupByFields?.buckets?.filter(
          (bucket) =>
            isGroupingBucket(bucket) &&
            !bucket.isNullGroup &&
            bucket.selectedGroup === ALERT_ATTACK_IDS
        );
        const groupKeys = attackIdsGroupBuckets?.flatMap(({ key }) => key);
        setAttackIds(groupKeys);
        onAttackIdsChange?.(groupKeys);
      },
      [onAttackIdsChange]
    );

    // AlertsTable manages global filters itself, so not including `filters`
    const defaultFilters = useMemo(() => {
      return [
        ...buildShowBuildingBlockFilter(true),
        ...buildThreatMatchFilter(showOnlyThreatIndicatorAlerts),
        ...(pageFilters ?? []),
        ...buildAlertAssigneesFilter(assignees),
        ...buildConnectorIdFilter(selectedConnectorNames),
        ...buildAttackTypeFilter(selectedTypes),
        ...(showAttacksOnly ? buildAttacksOnlyFilter() : []),
      ];
    }, [
      showOnlyThreatIndicatorAlerts,
      pageFilters,
      assignees,
      selectedConnectorNames,
      selectedTypes,
      showAttacksOnly,
    ]);

    const isLoading = useMemo(
      () => userInfoLoading || listsConfigLoading || !Array.isArray(pageFilters),
      [listsConfigLoading, userInfoLoading, pageFilters]
    );

    const renderChildComponent = useCallback(
      (
        groupingFilters: Filter[],
        selectedGroup?: string,
        fieldBucket?: RawBucket<AlertsGroupingAggregation>
      ) => {
        // attack is undefined for the generic group marked as `-` which means this is the group of alerts that do not belong to any attack.
        const attack =
          selectedGroup && fieldBucket ? getAttack(selectedGroup, fieldBucket) : undefined;

        if (!attack) {
          return (
            <AlertsTab
              attackAlertIds={[]}
              defaultFilters={defaultFilters}
              isTableLoading={isLoading}
            />
          );
        }

        return (
          <AttackDetailsContainer
            attack={attack}
            showAnonymized={showAnonymized}
            defaultFilters={defaultFilters}
            isTableLoading={isLoading}
          />
        );
      },
      [defaultFilters, getAttack, isLoading, showAnonymized]
    );

    const groupTakeActionItems: GroupTakeActionItems = useCallback(
      (props) => {
        const attack = getAttack(props.selectedGroup, props.groupBucket);
        if (!attack) return <AlertActionItems statusFilter={statusFilter} {...props} />;
        return (
          <AttacksGroupTakeActionItems
            attack={attack}
            closePopover={props.closePopover}
            telemetrySource="attacks_page_group_take_action"
            isRemoteDocument={isNonLocalIndexName(attack.index ?? '')}
          />
        );
      },
      [getAttack, statusFilter]
    );

    const accordionExtraActionGroupStats = useGroupStats({ getAttack });

    const emptyGroupingComponent = useMemo(
      () => <EmptyResultsPrompt openSchedulesFlyout={openSchedulesFlyout} />,
      [openSchedulesFlyout]
    );

    const [sort, setSort] = useLocalStorage<GroupingSort>({
      key: ATTACKS_TABLE_SORT_STORAGE_KEY,
      defaultValue: DEFAULT_ATTACKS_SORT,
      isInvalidDefault: (value) => {
        return value == null || (Array.isArray(value) && value.length === 0);
      },
    });

    const attacksTableSortSelect = useMemo(
      () => (
        <EuiFlexGroup
          key={`${TABLE_SECTION_TEST_ID}-sort-select`}
          gutterSize="s"
          alignItems="center"
        >
          <EuiSpacer />
          <EuiFlexItem>
            <AttacksTableSortSelect sort={sort} onChange={setSort} />
          </EuiFlexItem>
          <EuiSpacer />
        </EuiFlexGroup>
      ),
      [sort, setSort]
    );

    const dslFilter = useMemo(() => dsl.isNotAttack(), []);

    return (
      <div data-test-subj={TABLE_SECTION_TEST_ID}>
        <GroupedAlertsTable
          accordionButtonContent={defaultGroupTitleRenderers}
          accordionExtraActionGroupStats={accordionExtraActionGroupStats}
          dataView={dataView}
          defaultFilters={defaultFilters}
          defaultGroupingOptions={groupingOptions}
          from={from}
          globalFilters={globalFilters}
          globalQuery={query}
          groupTakeActionItems={groupTakeActionItems}
          loading={isLoading}
          renderChildComponent={renderChildComponent}
          tableId={TableId.alertsOnAttacksPage}
          to={to}
          onAggregationsChange={onAggregationsChange}
          additionalToolbarControls={[attacksViewOptionsPopover, attacksTableSortSelect]}
          pageScope={PageScope.attacks} // allow filtering and grouping by attack fields
          settings={groupingSettings}
          emptyGroupingComponent={emptyGroupingComponent}
          sort={sort}
          unitsCountFilter={dslFilter}
        />
      </div>
    );
  }
);
TableSection.displayName = 'TableSection';
