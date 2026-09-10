/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { useHistory, useLocation } from 'react-router-dom';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useLoadConnectors } from '@kbn/inference-connectors';
import { useQueryClient } from '@kbn/react-query';
import { useOnAssetCriticalityToolEvent } from '../hooks/use_on_asset_criticality_tool_event';
import { SecurityPageName } from '../../app/types';
import { SecuritySolutionPageWrapper } from '../../common/components/page_wrapper';
import { HeaderPage } from '../../common/components/header_page';
import { SiemSearchBar } from '../../common/components/search_bar';
import { InputsModelId } from '../../common/store/inputs/constants';
import { FiltersGlobal } from '../../common/components/filters_global';
import { SpyRoute } from '../../common/utils/route/spy_routes';
import { useKibana } from '../../common/lib/kibana';
import { EntityEventTypes } from '../../common/lib/telemetry';
import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { useLicense } from '../../common/hooks/use_license';
import { PageLoader } from '../../common/components/page_loader';
import { useSpaceId } from '../../common/hooks/use_space_id';
import { useStoredAssistantConnectorId } from '../../onboarding/components/hooks/use_stored_state';
import { WatchlistFilter } from '../components/watchlists/watchlist_filter';
import { useEntityStoreDataView } from '../components/home/use_entity_store_data_view';
import { ENTITY_ANALYTICS_LOCAL_STORAGE_PAGE_SIZE_KEY } from '../components/home/constants';
import {
  DataViewContext,
  useEntityURLState,
  DEFAULT_ENTITIES_TABLE_CONFIG,
  DEFAULT_ENTITIES_TABLE_SORT,
  type EntitiesBaseURLQuery,
  EntitiesTableSection,
  type URLQuery,
} from '../components/home/entities_table';
import { DynamicRiskLevelPanel } from '../components/home/dynamic_risk_level_panel';
import {
  useEntitiesWithAlertsCount,
  useEntitiesWithAnomaliesCount,
  useWatchlistedCount,
  useNewEntityCount,
  useRiskMoversCount,
  useNewlyHighCriticalCount,
} from '../components/home/hooks';
import { SignalCards } from '../components/home/facelift/v5/signal_cards';
import type { ActiveFilter, SignalCardData } from '../components/home/facelift/v5/data';
import { getCardEntityFilter } from '../components/home/queries/card_entity_filters';

import { useGetSecuritySolutionUrl } from '../../common/components/link_to';
import { TabId } from './entity_analytics_management_page';
import { TopThreatHuntingLeads } from '../components/threat_hunting/top_threat_hunting_leads';
import { ThreatHuntingLeadsFlyout } from '../components/threat_hunting/top_threat_hunting_leads/threat_hunting_leads_flyout';
import { useHuntingLeads } from '../components/threat_hunting/top_threat_hunting_leads/use_hunting_leads';
import { useLeadAttachment } from '../components/threat_hunting/top_threat_hunting_leads/use_lead_attachment';
import { HUNT_WITH_AI_PROMPT } from '../prompts';
import { useAgentBuilderAvailability } from '../../agent_builder/hooks/use_agent_builder_availability';
import { QUERY_KEY_ENTITY_ANALYTICS } from '../components/home/entities_table/constants';
import type { HuntingLead } from '../components/threat_hunting/top_threat_hunting_leads/types';
import { useMissingRiskEnginePrivileges } from '../hooks/use_missing_risk_engine_privileges';
import { useEntityEnginePrivileges } from '../components/entity_store/hooks/use_entity_engine_privileges';
import { EntityAnalyticsReadPrivilegesCallout } from '../components/entity_analytics_read_privileges_callout';
import { useLeadGenerationPrivileges } from '../api/hooks/use_lead_generation_privileges';
import { useAnomalyPrivileges } from '../api/hooks/use_anomaly_privileges';
import { NoPrivileges } from '../../common/components/no_privileges';
import { useEntityStoreStatus } from '../components/entity_store/hooks/use_entity_store';
import { EntityStoreDisabledEmptyPrompt } from './entity_store_disabled_empty_prompt';

const PAGE_TITLE = i18n.translate('xpack.securitySolution.entityAnalytics.homePage.pageTitle', {
  defaultMessage: 'Entity analytics',
});

const getDefaultQuery = ({ query, filters }: EntitiesBaseURLQuery): URLQuery => ({
  query,
  filters,
  pageFilters: [],
  sort: DEFAULT_ENTITIES_TABLE_SORT,
  pageIndex: 0,
});

const riskPanelFlexItemStyle = css`
  min-width: 460px;
`;

export const EntityAnalyticsHomePage = () => {
  const riskEngineReadPrivileges = useMissingRiskEnginePrivileges({ readonly: true });
  const entityEnginePrivilegesQuery = useEntityEnginePrivileges();
  const isEnterprise = useLicense().isEnterprise();
  const leadGenerationEnabled =
    useIsExperimentalFeatureEnabled('leadGenerationEnabled') && isEnterprise;
  const anomalyDetailsEnabled = useIsExperimentalFeatureEnabled('entityAnalyticsAnomalyDetails');
  const leadGenerationPrivilegesQuery = useLeadGenerationPrivileges(leadGenerationEnabled);
  const anomalyPrivilegesQuery = useAnomalyPrivileges(anomalyDetailsEnabled);

  if (entityEnginePrivilegesQuery.isLoading || riskEngineReadPrivileges.isLoading) {
    return <PageLoader />;
  }

  const noPrivileges =
    !entityEnginePrivilegesQuery.isError && !entityEnginePrivilegesQuery.data?.has_read_permissions;

  return (
    <>
      <EntityAnalyticsReadPrivilegesCallout
        riskEngineReadPrivileges={riskEngineReadPrivileges}
        entityEnginePrivileges={entityEnginePrivilegesQuery.data}
        leadGenerationPrivileges={leadGenerationPrivilegesQuery.data}
        anomalyPrivileges={anomalyPrivilegesQuery.data}
        id="entity-analytics-home"
      />
      <SecuritySolutionPageWrapper data-test-subj="entityAnalyticsHomePage">
        {noPrivileges ? (
          <NoPrivileges
            pageName={PAGE_TITLE.toLowerCase()}
            docLinkSelector={(docLinks) =>
              docLinks.securitySolution.entityAnalytics.riskScorePrerequisites
            }
          />
        ) : (
          <EntityAnalyticsHomePageContent />
        )}
      </SecuritySolutionPageWrapper>
      <SpyRoute pageName={SecurityPageName.entityAnalyticsHomePage} />
    </>
  );
};

const EntityAnalyticsHomePageContent = () => {
  const { telemetry, agentBuilder, http } = useKibana().services;
  const { isAgentChatExperienceEnabled } = useAgentBuilderAvailability();
  const queryClient = useQueryClient();

  useOnAssetCriticalityToolEvent(() => {
    queryClient.invalidateQueries([QUERY_KEY_ENTITY_ANALYTICS]);
  });

  const { data: availableConnectors } = useLoadConnectors({ http, featureId: 'lead_generation' });
  const isEnterprise = useLicense().isEnterprise();
  const leadGenerationEnabled =
    useIsExperimentalFeatureEnabled('leadGenerationEnabled') && isEnterprise;
  const spaceId = useSpaceId();
  const { dataView, isLoading: dataViewLoading } = useEntityStoreDataView(spaceId);

  const resolvedSpaceId = spaceId ?? 'default';
  const [storedConnectorId, setStoredConnectorId] = useStoredAssistantConnectorId(resolvedSpaceId);
  // Mirror the entity details flyout "Generate" behavior: prefer the stored
  // Options selection when it is still valid, otherwise fall back to the first
  // connector resolved for the lead_generation feature. The server orders that
  // list by Feature Settings (a feature-specific override, else the Global
  // model), so the fallback follows those settings rather than an arbitrary
  // pick. Only when no connector exists at all does this resolve to ''.
  const connectorId = useMemo(() => {
    if (!availableConnectors?.length) {
      return '';
    }
    const storedConnector = spaceId
      ? availableConnectors.find((connector) => connector.id === storedConnectorId)
      : undefined;
    return storedConnector?.id ?? availableConnectors[0]?.id ?? '';
  }, [availableConnectors, spaceId, storedConnectorId]);
  const hasValidConnector = connectorId !== '';
  const safeSetConnectorId = useCallback(
    (id: string | undefined) => {
      if (spaceId) {
        setStoredConnectorId(id);
      }
    },
    [spaceId, setStoredConnectorId]
  );
  const {
    leads,
    totalCount,
    isLoading: isLeadsLoading,
    isGenerating,
    hasGenerated,
    lastRunTimestamp,
    generate,
    isScheduled,
    toggleSchedule,
    readPermissionError: leadsReadPermissionError,
    writePermissionError: leadsWritePermissionError,
  } = useHuntingLeads(connectorId, leadGenerationEnabled, resolvedSpaceId);
  const openAgentBuilderWithLead = useLeadAttachment();

  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null);

  // Only subscribe to `search` rather than the whole `location` object so this
  // component doesn't re-render (and re-create callbacks) on unrelated URL
  // updates like flyout params.
  const { search } = useLocation();
  const history = useHistory();
  const getSecuritySolutionUrl = useGetSecuritySolutionUrl();

  const selectedWatchlistId = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get('watchlistId') || undefined;
  }, [search]);

  const {
    count: alertsCount,
    entityIds: alertsEntityIds,
    isLoading: alertsLoading,
  } = useEntitiesWithAlertsCount({ spaceId: resolvedSpaceId });
  const {
    count: anomaliesCount,
    entityIds: anomaliesEntityIds,
    isLoading: anomaliesLoading,
  } = useEntitiesWithAnomaliesCount({ spaceId: resolvedSpaceId });
  const {
    count: watchlistedCount,
    entityIds: watchlistedEntityIds,
    isLoading: watchlistedLoading,
  } = useWatchlistedCount({ spaceId: resolvedSpaceId });
  const {
    count: newEntityCount,
    entityIds: newEntityEntityIds,
    isLoading: newEntityLoading,
  } = useNewEntityCount({ spaceId: resolvedSpaceId });
  const {
    count: riskMoversCount,
    entityIds: riskMoversEntityIds,
    isLoading: riskMoversLoading,
  } = useRiskMoversCount({ spaceId: resolvedSpaceId });
  const {
    count: newlyHCCount,
    entityIds: newlyHCEntityIds,
    isLoading: newlyHCLoading,
  } = useNewlyHighCriticalCount({ spaceId: resolvedSpaceId });

  const handleFilterForCard = useCallback((cardId: ActiveFilter['cardId']) => {
    setActiveFilter((prev) =>
      prev?.cardId === cardId ? null : { type: 'card', cardId, label: cardId }
    );
  }, []);

  const cardFilter = useMemo((): QueryDslQueryContainer | null => {
    if (!activeFilter || activeFilter.type !== 'card') return null;
    switch (activeFilter.cardId) {
      case 'entitiesWithAlerts':
        return alertsEntityIds.length > 0 ? { terms: { 'entity.id': alertsEntityIds } } : null;
      case 'entitiesWithAnomalies':
        return anomaliesEntityIds.length > 0
          ? { terms: { 'entity.id': anomaliesEntityIds } }
          : null;
      case 'riskMovers':
        return riskMoversEntityIds.length > 0
          ? { terms: { 'entity.id': riskMoversEntityIds } }
          : null;
      case 'newlyHighCritical':
        return newlyHCEntityIds.length > 0 ? { terms: { 'entity.id': newlyHCEntityIds } } : null;
      case 'watchlisted':
        return watchlistedEntityIds.length > 0
          ? { terms: { 'entity.id': watchlistedEntityIds } }
          : null;
      case 'newEntity':
        return newEntityEntityIds.length > 0
          ? { terms: { 'entity.id': newEntityEntityIds } }
          : null;
      default:
        return getCardEntityFilter(activeFilter.cardId);
    }
  }, [
    activeFilter,
    alertsEntityIds,
    anomaliesEntityIds,
    riskMoversEntityIds,
    newlyHCEntityIds,
    watchlistedEntityIds,
    newEntityEntityIds,
  ]);

  const signalCards = useMemo(
    (): SignalCardData[] => [
      {
        id: 'entitiesWithAlerts',
        title: 'Entities with alerts',
        value: alertsLoading ? 0 : alertsCount,
        description: 'Entities with at least one alert in the last 24h',
        filterLabel: 'Entities with alerts (24h)',
      },
      {
        id: 'entitiesWithAnomalies',
        title: 'Entities with anomalies',
        value: anomaliesLoading ? 0 : anomaliesCount,
        description: 'Entities with at least one ML anomaly in the last 24h',
        filterLabel: 'Entities with anomalies (24h)',
      },
      {
        id: 'riskMovers',
        title: 'Risk movers',
        value: riskMoversLoading ? 0 : riskMoversCount,
        description: 'Entities whose risk score rose ≥10 points vs yesterday',
        filterLabel: 'Risk movers',
      },
      {
        id: 'newlyHighCritical',
        title: 'Newly high/critical',
        value: newlyHCLoading ? 0 : newlyHCCount,
        description: 'Entities that crossed into High or Critical risk since yesterday',
        filterLabel: 'Newly high/critical',
      },
      {
        id: 'watchlisted',
        title: 'Watchlisted',
        value: watchlistedLoading ? 0 : watchlistedCount,
        description: 'Entities on a watchlist with a risk score above zero',
        filterLabel: 'Watchlisted',
      },
      {
        id: 'newEntity',
        title: 'New entity',
        value: newEntityLoading ? 0 : newEntityCount,
        description: 'Entities first seen in the last 7 days with a risk score above zero',
        filterLabel: 'New entity (last 7 days)',
      },
    ],
    [
      alertsCount,
      alertsLoading,
      anomaliesCount,
      anomaliesLoading,
      riskMoversCount,
      riskMoversLoading,
      newlyHCCount,
      newlyHCLoading,
      watchlistedCount,
      watchlistedLoading,
      newEntityCount,
      newEntityLoading,
    ]
  );

  const setSelectedWatchlist = useCallback(
    (id?: string, name?: string) => {
      // Read the latest search from `history.location` to keep this callback's
      // reference stable across unrelated URL updates.
      const params = new URLSearchParams(history.location.search);
      if (id) {
        params.set('watchlistId', id);
      } else {
        params.delete('watchlistId');
      }
      if (name) {
        params.set('watchlistName', name);
      } else {
        params.delete('watchlistName');
      }
      history.replace({ ...history.location, search: params.toString() });
    },
    [history]
  );

  const { data: entityStoreStatusData } = useEntityStoreStatus();
  const entityStoreDisabled =
    entityStoreStatusData?.status === 'not_installed' ||
    entityStoreStatusData?.status === 'stopped';
  // While an engine is still provisioning its assets the entity-latest index (and its data
  // view) may not be resolvable yet. Show a loader rather than the entity page or the generic
  // onboarding screen; the status query polls every 5s while installing and re-renders to the
  // homepage once it flips to `running`. See elastic/security-team#18599.
  const entityStoreInstalling = entityStoreStatusData?.status === 'installing';

  const handleOpenFlyout = useCallback(() => setIsFlyoutOpen(true), []);
  const handleCloseFlyout = useCallback(() => setIsFlyoutOpen(false), []);

  const handleOpenLeadInChat = useCallback(
    (lead: HuntingLead) => {
      telemetry.reportEvent(EntityEventTypes.LeadGenerationLeadClicked, {});
      openAgentBuilderWithLead(lead);
    },
    [openAgentBuilderWithLead, telemetry]
  );

  const handleHuntInChat = useCallback(() => {
    telemetry.reportEvent(EntityEventTypes.LeadGenerationHuntWithAiClicked, {});
    agentBuilder?.openChat({
      newConversation: true,
      initialMessage: HUNT_WITH_AI_PROMPT,
      autoSendInitialMessage: false,
      sessionTag: 'security',
    });
  }, [agentBuilder, telemetry]);

  if (dataViewLoading) {
    return <PageLoader />;
  }

  if (entityStoreDisabled) {
    return <EntityStoreDisabledEmptyPrompt />;
  }

  if (entityStoreInstalling) {
    return <PageLoader />;
  }

  return (
    <>
      <FiltersGlobal>
        <SiemSearchBar dataView={dataView} id={InputsModelId.global} hideDatePicker />
      </FiltersGlobal>

      <HeaderPage
        title={PAGE_TITLE}
        rightSideItems={[
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <WatchlistFilter
                selectedId={selectedWatchlistId ?? ''}
                onChangeSelectedId={setSelectedWatchlist}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={i18n.translate(
                  'xpack.securitySolution.entityAnalytics.homePage.watchlistsSettingsButtonAriaLabel',
                  { defaultMessage: 'Watchlists settings' }
                )}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  display="base"
                  iconType="gear"
                  size="m"
                  aria-label={i18n.translate(
                    'xpack.securitySolution.entityAnalytics.homePage.watchlistsSettingsButtonAriaLabel',
                    { defaultMessage: 'Watchlists settings' }
                  )}
                  href={getSecuritySolutionUrl({
                    deepLinkId: SecurityPageName.entityAnalyticsManagement,
                    path: `/${TabId.Watchlists}`,
                  })}
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>,
        ]}
      />

      <EuiFlexGroup direction="column" gutterSize="l">
        {leadGenerationEnabled && !leadsReadPermissionError && (
          <EuiFlexItem>
            <TopThreatHuntingLeads
              leads={leads}
              totalCount={totalCount}
              isLoading={isLeadsLoading}
              isGenerating={isGenerating}
              hasGenerated={hasGenerated}
              lastRunTimestamp={lastRunTimestamp}
              isScheduled={isScheduled}
              onToggleSchedule={toggleSchedule}
              onSeeAll={handleOpenFlyout}
              onLeadClick={handleOpenLeadInChat}
              onHuntInChat={handleHuntInChat}
              onGenerate={generate}
              connectorId={connectorId}
              hasValidConnector={hasValidConnector}
              onConnectorIdSelected={safeSetConnectorId}
              isAgentChatExperienceEnabled={isAgentChatExperienceEnabled}
              hasWritePermissionError={leadsWritePermissionError}
            />
          </EuiFlexItem>
        )}

        <EuiFlexItem>
          <EuiFlexGroup wrap gutterSize="m">
            <EuiFlexItem grow={3} css={riskPanelFlexItemStyle}>
              <EuiPanel hasBorder>
                <DynamicRiskLevelPanel
                  watchlistId={selectedWatchlistId}
                  entityDataView={dataView}
                />
              </EuiPanel>
            </EuiFlexItem>
            <EuiFlexItem grow={5}>
              <SignalCards
                activeFilter={activeFilter}
                cards={signalCards}
                onFilterForCard={handleFilterForCard}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        <EuiPanel hasBorder>
          <EntityAnalyticsEntitiesTable
            watchlistId={selectedWatchlistId}
            cardFilter={cardFilter}
            entityDataView={dataView}
            entityDataViewLoading={dataViewLoading}
          />
        </EuiPanel>
      </EuiFlexGroup>

      {leadGenerationEnabled && isFlyoutOpen && (
        <ThreatHuntingLeadsFlyout
          onClose={handleCloseFlyout}
          onSelectLead={handleOpenLeadInChat}
          lastRunTimestamp={lastRunTimestamp}
        />
      )}
    </>
  );
};

const EntityAnalyticsEntitiesTable = ({
  watchlistId,
  cardFilter,
  entityDataView,
  entityDataViewLoading,
}: {
  watchlistId?: string;
  cardFilter?: QueryDslQueryContainer | null;
  entityDataView: ReturnType<typeof useEntityStoreDataView>['dataView'];
  entityDataViewLoading: boolean;
}) => {
  // Stable provider value so consumers below (e.g. the memoized
  // `EntitiesTableSection` subtree) are not forced to re-render by a new
  // context reference when this component re-renders on an unrelated URL change.
  const dataViewContextValue = useMemo(
    () => ({
      dataView: entityDataView,
      dataViewIsLoading: entityDataViewLoading,
    }),
    [entityDataView, entityDataViewLoading]
  );

  if (entityDataViewLoading) {
    return <EuiLoadingSpinner size="l" data-test-subj="entityAnalyticsEntitiesTableLoader" />;
  }

  return (
    <DataViewContext.Provider value={dataViewContextValue}>
      <EuiFlexItem grow={false}>
        <EuiTitle size="s">
          <h3>
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.homePage.entitiesTableTitle"
              defaultMessage="Entities"
            />
          </h3>
        </EuiTitle>
      </EuiFlexItem>
      <EntityAnalyticsEntitiesTableContent watchlistId={watchlistId} cardFilter={cardFilter} />
    </DataViewContext.Provider>
  );
};

const EntityAnalyticsEntitiesTableContent = ({
  watchlistId,
  cardFilter,
}: {
  watchlistId?: string;
  cardFilter?: QueryDslQueryContainer | null;
}) => {
  const urlState = useEntityURLState({
    paginationLocalStorageKey: ENTITY_ANALYTICS_LOCAL_STORAGE_PAGE_SIZE_KEY,
    defaultQuery: getDefaultQuery,
  });

  const state = useMemo(() => {
    const extraFilters = (
      [
        watchlistId ? { term: { 'entity.attributes.watchlists': watchlistId } } : null,
        cardFilter ?? null,
      ] as Array<QueryDslQueryContainer | null>
    ).filter((f): f is QueryDslQueryContainer => f !== null);

    if (!extraFilters.length) return urlState;

    return {
      ...urlState,
      query: {
        ...urlState.query,
        bool: {
          ...urlState.query?.bool,
          filter: [...(urlState.query?.bool?.filter ?? []), ...extraFilters],
        },
      },
    };
  }, [urlState, watchlistId, cardFilter]);

  return <EntitiesTableSection state={state} config={DEFAULT_ENTITIES_TABLE_CONFIG} />;
};
