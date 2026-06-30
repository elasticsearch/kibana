/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiSpacer,
  EuiWindowEvent,
  useEuiTheme,
} from '@elastic/eui';
import styled from '@emotion/styled';
import { noop } from 'lodash/fp';
import type { DataView } from '@kbn/data-views-plugin/common';

import { isEqual } from 'lodash';
import { useAssistantContext } from '@kbn/elastic-assistant';
import { useLoadConnectors } from '@kbn/inference-connectors';
import type { Filter } from '@kbn/es-query';
import type { FilterGroupHandler } from '@kbn/alerts-ui-shared';
import { dataTableSelectors, tableDefaults, TableId } from '@kbn/securitysolution-data-table';
import { useGlobalTime } from '../../../common/containers/use_global_time';
import { useKibana } from '../../../common/lib/kibana';
import { useIsExperimentalFeatureEnabled } from '../../../common/hooks/use_experimental_features';
import { AttacksEventTypes } from '../../../common/lib/telemetry';
import { useFindAttackDiscoveries } from '../../../attack_discovery/pages/use_find_attack_discoveries';
import { useShallowEqualSelector } from '../../../common/hooks/use_selector';
import { useAttackDiscoveryControls } from '../../../attack_discovery/pages/use_attack_discovery_controls';
import { Actions } from '../../../attack_discovery/pages/header/actions';
import { SCHEDULE_TAB_ID } from '../../../attack_discovery/pages/settings_flyout/constants';
import { FilterByAssigneesPopover } from '../../../common/components/filter_by_assignees_popover/filter_by_assignees_popover';
import { useLocalStorage } from '../../../common/components/local_storage';
import { getSettingKey } from '../../../common/components/local_storage/helpers';
import { PAGE_TITLE } from '../../pages/attacks/translations';
import { HeaderPage } from '../../../common/components/header_page';
import { IconSparkles } from '../../../common/icons/sparkles';
import { SecuritySolutionPageWrapper } from '../../../common/components/page_wrapper';
import { useGlobalFullScreen } from '../../../common/containers/use_full_screen';
import { Display } from '../../../explore/hosts/pages/display';
import { SearchBarSection } from './search_bar/search_bar_section';
import { TableSection } from './table/table_section';
import type { AssigneesIdsSelection } from '../../../common/components/assignees/types';
import { TypeFilter } from './filters/type_filter';
import { ConnectorFilter } from '../../../attack_discovery/pages/results/history/search_and_filter/connector_filter';

import type { Status } from '../../../../common/api/detection_engine';
import { FiltersSection } from './filters/filters_section';
import { KPIsSection } from './kpis/kpis_section';
import { AttacksTour, AttacksTourProvider, WelcomeTourCallout } from './tour';

import type { SettingsOverrideOptions } from '../../../attack_discovery/pages/results/history/types';

export const CONTENT_TEST_ID = 'attacks-page-content';
export const SECURITY_SOLUTION_PAGE_WRAPPER_TEST_ID = 'attacks-page-security-solution-page-wrapper';
export const ATTACKS_PAGE_ACTIONS_TEST_ID = 'attacks-page-actions';
export const ATTACKS_PAGE_TYPE_FILTER_TEST_ID = 'attacks-page-type-filter';
export const ATTACKS_PAGE_ASSIGNEE_FILTER_TEST_ID = 'attacks-page-assignee-filter';
export const ATTACKS_PAGE_CONNECTOR_FILTER_TEST_ID = 'attacks-page-connector-filter';
export const ATTACKS_PAGE_STANDARD_FILTERS_TEST_ID = 'attacks-page-standard-filters';
const FILTERS_SECTION_WIDTH = 480;

const ATTACKS_PAGE = 'attacks';
const FILTER_CATEGORY = 'filters';
const TYPE_FILTER_SETTING_NAME = 'typeFilter';
const ASSIGNEES_FILTER_SETTING_NAME = 'assigneesFilter';
const CONNECTOR_FILTER_SETTING_NAME = 'connectorFilter';

/**
 * Need a 100% height here to account for the graph/analyze tool, which sets no explicit height parameters, but fills the available space.
 */
const StyledFullHeightContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
`;

const VerticalDivider = styled(EuiFlexItem)`
  align-self: stretch;
  border-left: ${({ theme: { euiTheme } }) => euiTheme.border.thin};
`;

export interface AttacksPageContentProps {
  /**
   * DataView for the attacks page
   */
  dataView: DataView;
}

/**
 * Renders the content of the attacks page: search bar, header, filters, KPIs, and table sections.
 */
export const AttacksPageContent = React.memo(({ dataView }: AttacksPageContentProps) => {
  const containerElement = useRef<HTMLDivElement | null>(null);

  const { globalFullScreen } = useGlobalFullScreen();
  const [selectedTypes, setSelectedTypes] = useLocalStorage<string[]>({
    key: getSettingKey({
      category: FILTER_CATEGORY,
      page: ATTACKS_PAGE,
      setting: TYPE_FILTER_SETTING_NAME,
    }),
    defaultValue: [],
    isInvalidDefault: (value) => !Array.isArray(value),
  });
  const [selectedConnectorNames, setSelectedConnectorNames] = useLocalStorage<string[]>({
    key: getSettingKey({
      category: FILTER_CATEGORY,
      page: ATTACKS_PAGE,
      setting: CONNECTOR_FILTER_SETTING_NAME,
    }),
    defaultValue: [],
    isInvalidDefault: (value) => !Array.isArray(value),
  });
  const {
    services: { settings, telemetry },
  } = useKibana();
  const { euiTheme } = useEuiTheme();

  const { http } = useAssistantContext();
  const { data: aiConnectors } = useLoadConnectors({
    http,
    featureId: 'attack_discovery',
    settings,
  });
  const { from } = useGlobalTime();
  const { data } = useFindAttackDiscoveries({
    http,
    isAssistantEnabled: true,
    start: from,
    includeAllAuthors: true,
  });
  const aiConnectorNames = useMemo(() => data?.connector_names ?? [], [data]);

  const isTourFlagEnabled = useIsExperimentalFeatureEnabled('attacksPageTourEnabled');
  // Drives the tour's optional attack-details step. Derived from the table's
  // grouped results (which honor every active filter) instead of a standalone
  // query, and kept `undefined` until those results load so the tour treats
  // attack presence as unknown (never as `false`) in the meantime.
  const [hasAttacks, setHasAttacks] = useState<boolean | undefined>(undefined);
  const onAttackIdsChange = useCallback(
    (attackIds: string[] | undefined) =>
      setHasAttacks(attackIds === undefined ? undefined : attackIds.length > 0),
    []
  );

  const { connectorId, isLoading, onGenerate, openFlyout, settingsFlyout } =
    useAttackDiscoveryControls();

  const handleOpenFlyout = useCallback(
    (tabId: string) => {
      openFlyout(tabId);
      if (tabId === SCHEDULE_TAB_ID) {
        telemetry.reportEvent(AttacksEventTypes.ScheduleFlyoutOpened, {
          source: 'attacks_page_header',
        });
      } else {
        telemetry.reportEvent(AttacksEventTypes.SettingsFlyoutOpened, {
          source: 'attacks_page_header',
        });
      }
    },
    [openFlyout, telemetry]
  );

  const handleGenerate = useCallback(
    async (overrideOptions?: SettingsOverrideOptions) => {
      telemetry.reportEvent(AttacksEventTypes.GenerateClicked, {
        source: 'attacks_page_header',
      });
      return onGenerate(overrideOptions);
    },
    [onGenerate, telemetry]
  );

  const openSchedulesFlyout = useCallback(() => {
    handleOpenFlyout(SCHEDULE_TAB_ID);
  }, [handleOpenFlyout]);

  const [assignees, setAssignees] = useLocalStorage<AssigneesIdsSelection[]>({
    key: getSettingKey({
      category: FILTER_CATEGORY,
      page: ATTACKS_PAGE,
      setting: ASSIGNEES_FILTER_SETTING_NAME,
    }),
    defaultValue: [],
    isInvalidDefault: (value) => !Array.isArray(value),
  });

  const onAssigneesSelectionChange = useCallback(
    (newAssignees: AssigneesIdsSelection[]) => {
      if (!isEqual(newAssignees, assignees)) {
        setAssignees(newAssignees);
      }
    },
    [assignees, setAssignees]
  );
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [pageFilters, setPageFilters] = useState<Filter[]>();
  const [pageFilterHandler, setPageFilterHandler] = useState<FilterGroupHandler | undefined>();

  const getTable = useMemo(() => dataTableSelectors.getTableByIdSelector(), []);
  const isTableLoading = useShallowEqualSelector(
    (state) => (getTable(state, TableId.alertsOnAlertsPage) ?? tableDefaults).isLoading
  );

  useEffect(() => {
    if (!pageFilterHandler) return;
    // if the table is reloaded because of action by the user
    // (e.g. closed and alert)
    // We want reload the values in the Attacks Page filters
    if (!isTableLoading) pageFilterHandler.reload();
  }, [isTableLoading, pageFilterHandler]);

  const pageContent = useMemo(
    () => (
      <StyledFullHeightContainer data-test-subj={CONTENT_TEST_ID} ref={containerElement}>
        <EuiWindowEvent event="resize" handler={noop} />
        <SearchBarSection dataView={dataView} />
        <SecuritySolutionPageWrapper
          noPadding={globalFullScreen}
          data-test-subj={SECURITY_SOLUTION_PAGE_WRAPPER_TEST_ID}
        >
          <Display show={!globalFullScreen}>
            <HeaderPage
              title={
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap={false}>
                  <EuiFlexItem grow={false}>{PAGE_TITLE}</EuiFlexItem>
                  <EuiSpacer size="m" />
                  <EuiFlexItem
                    grow={false}
                    style={{ marginLeft: euiTheme.size.s, marginTop: euiTheme.size.s }}
                  >
                    <IconSparkles />
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
            >
              <EuiFlexGroup gutterSize="m" data-test-subj={ATTACKS_PAGE_ACTIONS_TEST_ID}>
                <EuiFlexItem>
                  <Actions
                    isLoading={isLoading}
                    onGenerate={handleGenerate}
                    openFlyout={handleOpenFlyout}
                    isDisabled={connectorId == null}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </HeaderPage>
            <EuiHorizontalRule margin="none" />
            <EuiSpacer size="l" />
            {isTourFlagEnabled && (
              <>
                <WelcomeTourCallout />
                <AttacksTour />
              </>
            )}
            <EuiFlexGroup direction="row" responsive={false} wrap={true}>
              <EuiFlexItem grow={1} style={{ maxWidth: FILTERS_SECTION_WIDTH }}>
                <EuiFlexGroup direction="row" responsive={false}>
                  <EuiFlexItem grow={1} data-test-subj={ATTACKS_PAGE_TYPE_FILTER_TEST_ID}>
                    <TypeFilter
                      selectedTypes={selectedTypes}
                      setSelectedTypes={setSelectedTypes}
                      compressed={true}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={1} data-test-subj={ATTACKS_PAGE_ASSIGNEE_FILTER_TEST_ID}>
                    <FilterByAssigneesPopover
                      selectedUserIds={assignees}
                      onSelectionChange={onAssigneesSelectionChange}
                      compressed={true}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={1} data-test-subj={ATTACKS_PAGE_CONNECTOR_FILTER_TEST_ID}>
                    <ConnectorFilter
                      aiConnectors={aiConnectors}
                      connectorNames={aiConnectorNames}
                      selectedConnectorNames={selectedConnectorNames}
                      setSelectedConnectorNames={setSelectedConnectorNames}
                      compressed={true}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <VerticalDivider grow={false} aria-hidden={true} />
              <EuiFlexItem
                grow={1}
                style={{ minWidth: FILTERS_SECTION_WIDTH }}
                data-test-subj={ATTACKS_PAGE_STANDARD_FILTERS_TEST_ID}
              >
                <FiltersSection
                  dataView={dataView}
                  pageFilters={pageFilters}
                  setStatusFilter={setStatusFilter}
                  setPageFilters={setPageFilters}
                  setPageFilterHandler={setPageFilterHandler}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="l" />
          </Display>

          <EuiSpacer />
          <KPIsSection
            pageFilters={pageFilters}
            assignees={assignees}
            selectedConnectorNames={selectedConnectorNames}
            selectedTypes={selectedTypes}
            dataView={dataView}
          />

          <EuiSpacer />
          <TableSection
            dataView={dataView}
            statusFilter={statusFilter}
            pageFilters={pageFilters}
            assignees={assignees}
            selectedConnectorNames={selectedConnectorNames}
            selectedTypes={selectedTypes}
            openSchedulesFlyout={openSchedulesFlyout}
            onAttackIdsChange={isTourFlagEnabled ? onAttackIdsChange : undefined}
          />

          {settingsFlyout}
        </SecuritySolutionPageWrapper>
      </StyledFullHeightContainer>
    ),
    [
      aiConnectorNames,
      aiConnectors,
      assignees,
      connectorId,
      dataView,
      euiTheme.size.s,
      globalFullScreen,
      handleGenerate,
      handleOpenFlyout,
      isLoading,
      isTourFlagEnabled,
      onAssigneesSelectionChange,
      onAttackIdsChange,
      openSchedulesFlyout,
      pageFilters,
      selectedConnectorNames,
      selectedTypes,
      setSelectedConnectorNames,
      setSelectedTypes,
      settingsFlyout,
      statusFilter,
    ]
  );

  if (isTourFlagEnabled) {
    return <AttacksTourProvider hasAttacks={hasAttacks}>{pageContent}</AttacksTourProvider>;
  }

  return pageContent;
});
AttacksPageContent.displayName = 'AttacksPageContent';
