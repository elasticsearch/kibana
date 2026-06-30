/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
  EuiWindowEvent,
} from '@elastic/eui';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { noop } from 'lodash/fp';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { buildEsQuery } from '@kbn/es-query';
import { getEsQueryConfig } from '@kbn/data-plugin/common';
import { useUpdateAssetCriticality } from '../../../../entity_analytics/api/hooks/use_update_asset_criticality';
import { PageScope } from '../../../../data_view_manager/constants';
import type { NarrowDateRange } from '../../../../common/components/ml/types';
import { useCalculateEntityRiskScore } from '../../../../entity_analytics/api/hooks/use_calculate_entity_risk_score';
import { useAssetCriticalityPrivileges } from '../../../../entity_analytics/components/asset_criticality/use_asset_criticality';
import { AssetCriticalityAccordion } from '../../../../entity_analytics/components/asset_criticality/asset_criticality_selector';
import { AlertsByStatus } from '../../../../overview/components/detection_response/alerts_by_status';
import { useSignalIndex } from '../../../../detections/containers/detection_engine/alerts/use_signal_index';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { InputsModelId } from '../../../../common/store/inputs/constants';
import { type HostItem, LastEventIndexKey } from '../../../../../common/search_strategy';
import { EntityType } from '../../../../../common/entity_analytics/types';
import { SecurityPageName } from '../../../../app/types';
import { FiltersGlobal } from '../../../../common/components/filters_global';
import { HeaderPage } from '../../../../common/components/header_page';
import { Title } from '../../../../common/components/header_page/title';
import { LastEventTime } from '../../../../common/components/last_event_time';
import { AnomalyTableProvider } from '../../../../common/components/ml/anomaly/anomaly_table_provider';
import { buildAnomaliesTableInfluencersFilterQuery } from '../../../../common/components/ml/anomaly/anomaly_table_euid';
import { hostToCriteria } from '../../../../common/components/ml/criteria/host_to_criteria';
import { hasMlUserPermissions } from '../../../../../common/machine_learning/has_ml_user_permissions';
import { useMlCapabilities } from '../../../../common/components/ml/hooks/use_ml_capabilities';
import { scoreIntervalToDateTime } from '../../../../common/components/ml/score/score_interval_to_datetime';
import { TabNavigation } from '../../../../common/components/navigation/tab_navigation';
import {
  HOST_OVERVIEW_RISK_SCORE_QUERY_ID,
  HostOverview,
} from '../../../../overview/components/host_overview';
import { SiemSearchBar } from '../../../../common/components/search_bar';
import { SecuritySolutionPageWrapper } from '../../../../common/components/page_wrapper';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useKibana, useUiSetting } from '../../../../common/lib/kibana';
import { inputsSelectors } from '../../../../common/store';
import { setHostDetailsTablesActivePageToZero } from '../../store/actions';
import { setAbsoluteRangeDatePicker } from '../../../../common/store/inputs/actions';
import { SpyRoute } from '../../../../common/utils/route/spy_routes';
import { HostDetailsTabs } from './details_tabs';
import { navTabsHostDetails } from './nav_tabs';
import type { HostDetailsProps } from './types';
import { HostsType } from '../../store/model';
import { getHostDetailsPageFilters } from './helpers';
import { useGlobalFullScreen } from '../../../../common/containers/use_full_screen';
import { Display } from '../display';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { ID, useHostDetails } from '../../containers/hosts/details';
import { manageQuery } from '../../../../common/components/page/manage_query';
import { useInvalidFilterQuery } from '../../../../common/hooks/use_invalid_filter_query';
import { EmptyPrompt } from '../../../../common/components/empty_prompt';
import { AlertCountByRuleByStatus } from '../../../../common/components/alert_count_by_status';
import { useLicense } from '../../../../common/hooks/use_license';
import { ResponderActionButton } from '../../../../common/components/endpoint/responder';
import { useRefetchOverviewPageRiskScore } from '../../../../entity_analytics/api/hooks/use_refetch_overview_page_risk_score';
import { useDataView } from '../../../../data_view_manager/hooks/use_data_view';
import { useSelectedPatterns } from '../../../../data_view_manager/hooks/use_selected_patterns';
import { PageLoader } from '../../../../common/components/page_loader';
import {
  useEntityFromStore,
  type EntityStoreRecord,
} from '../../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import { ObservedDataSection as HostObservedDataSection } from '../../../../flyout/entity_details/host_right/components/observed_data_section';
import { HOST_PANEL_OBSERVED_HOST_QUERY_ID } from '../../../../flyout/entity_details/host_right';
import { useObservedHost } from '../../../../flyout/entity_details/host_right/hooks/use_observed_host';
import { buildRiskScoreStateFromEntityRecord } from '../../../../flyout/entity_details/shared/entity_store_risk_utils';
import { NO_CORRESPONDING_ENTITY_EXISTS } from '../../../../flyout/entity_details/shared/translations';
import { useSecurityDefaultPatterns } from '../../../../data_view_manager/hooks/use_security_default_patterns';
import type { Entity } from '../../../../../common/api/entity_analytics';
import { euidDslFilterToPageFilters } from '../../../helpers';

const ES_HOST_FIELD = 'host.name';
const HostOverviewManage = manageQuery(HostOverview);

const HostDetailsHeaderTitle: React.FC<{
  detailName: string;
  displayEntityId?: string;
}> = ({ detailName, displayEntityId }) => (
  <>
    <Title title={detailName} />
    {displayEntityId ? (
      <>
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued" data-test-subj="host-details-page-entity-id">
          {displayEntityId}
        </EuiText>
      </>
    ) : null}
  </>
);
HostDetailsHeaderTitle.displayName = 'HostDetailsHeaderTitle';

const HostDetailsAssetCriticalitySection: React.FC<{
  canRead: boolean;
  detailName: string;
  entityStoreV2Enabled: boolean;
  noEntityInStore: boolean;
  observedHostEntityRecord: EntityStoreRecord | null | undefined;
  storeRecord: EntityStoreRecord | null | undefined;
  onSaveViaEntityStore: (updatedRecord: Entity) => Promise<void>;
  onCriticalityChange: () => void;
}> = ({
  canRead,
  detailName,
  entityStoreV2Enabled,
  noEntityInStore,
  observedHostEntityRecord,
  storeRecord,
  onSaveViaEntityStore,
  onCriticalityChange,
}) => {
  if (!canRead || (entityStoreV2Enabled && noEntityInStore)) {
    return null;
  }
  return (
    <AssetCriticalityAccordion
      entity={{ name: detailName, type: EntityType.host }}
      onChange={onCriticalityChange}
      entityRecord={entityStoreV2Enabled ? observedHostEntityRecord ?? undefined : undefined}
      criticalityFromEntityStore={
        entityStoreV2Enabled && observedHostEntityRecord
          ? storeRecord?.asset?.criticality
          : undefined
      }
      onSaveViaEntityStore={entityStoreV2Enabled && storeRecord ? onSaveViaEntityStore : undefined}
    />
  );
};
HostDetailsAssetCriticalitySection.displayName = 'HostDetailsAssetCriticalitySection';

const HostDetailsComponent: React.FC<HostDetailsProps> = ({
  detailName,
  hostDetailsPagePath,
  entityId,
  identityFields,
}) => {
  const { search: urlStateQuery } = useLocation();
  const dispatch = useDispatch();
  const getGlobalFiltersQuerySelector = useMemo(
    () => inputsSelectors.globalFiltersQuerySelector(),
    []
  );
  const getGlobalQuerySelector = useMemo(() => inputsSelectors.globalQuerySelector(), []);
  const query = useDeepEqualSelector(getGlobalQuerySelector);
  const globalFilters = useDeepEqualSelector(getGlobalFiltersQuerySelector);

  const { to, from, deleteQuery, setQuery, isInitializing } = useGlobalTime();
  const { globalFullScreen } = useGlobalFullScreen();
  const { signalIndexName } = useSignalIndex();

  const capabilities = useMlCapabilities();
  const {
    services: { uiSettings },
  } = useKibana();

  const resolvedIdentityFields = useMemo(
    () => identityFields ?? { [ES_HOST_FIELD]: detailName },
    [identityFields, detailName]
  );

  const isEnterprisePlus = useLicense().isEnterprise();

  const narrowDateRange = useCallback<NarrowDateRange>(
    (score, interval) => {
      const fromTo = scoreIntervalToDateTime(score, interval);
      dispatch(
        setAbsoluteRangeDatePicker({
          id: InputsModelId.global,
          from: fromTo.from,
          to: fromTo.to,
        })
      );
    },
    [dispatch]
  );

  const { dataView, status } = useDataView(PageScope.explore);
  const selectedPatterns = useSelectedPatterns(PageScope.explore);
  const indicesExist = !!dataView.matchedIndices?.length;

  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);

  const hostStoreIdentityFields = useMemo(() => {
    if (entityId) {
      return undefined;
    }
    return Object.keys(resolvedIdentityFields).length > 0 ? resolvedIdentityFields : undefined;
  }, [entityId, resolvedIdentityFields]);

  const entityFromStoreResult = useEntityFromStore({
    entityId,
    identityFields: hostStoreIdentityFields,
    entityType: 'host',
    skip: !entityStoreV2Enabled || isInitializing,
  });

  const euidApi = useEntityStoreEuidApi();

  const noEntityInStore =
    entityStoreV2Enabled && !entityFromStoreResult.isLoading && !entityFromStoreResult.entityRecord;

  const hostDetailsEventsPageFilters = useMemo(() => {
    // Builds Kibana (not ES DSL) filters
    // Fallback to host.name filter if EUID-based filter cannot be built for any reason
    const legacyFilters = getHostDetailsPageFilters(detailName);
    if (!entityStoreV2Enabled || noEntityInStore) {
      return legacyFilters;
    }
    const entityDslFilter = euidApi?.euid?.dsl.getEuidFilterBasedOnDocument(
      EntityType.host,
      entityFromStoreResult.entityRecord
    );
    return entityDslFilter ? euidDslFilterToPageFilters(entityDslFilter) : legacyFilters;
  }, [
    detailName,
    entityFromStoreResult.entityRecord,
    entityStoreV2Enabled,
    noEntityInStore,
    euidApi?.euid,
  ]);

  const { indexPatterns: securityDefaultPatterns } = useSecurityDefaultPatterns();

  // observedHost.entityRecord returns entityStoreFromResult.entityRecord when entityStoreV2Enabled
  const observedHost = useObservedHost(
    detailName,
    PageScope.explore,
    entityStoreV2Enabled ? entityFromStoreResult : undefined
  );

  const [loading, { inspect, hostDetails: hostOverview, id, refetch }] = useHostDetails({
    endDate: to,
    startDate: from,
    hostName: detailName,
    entityId: entityStoreV2Enabled ? entityFromStoreResult.entityRecord?.entity?.id : undefined,
    indexNames: selectedPatterns,
    skip: selectedPatterns.length === 0,
  });

  const hostDetailsForOverview = entityStoreV2Enabled ? observedHost.details : hostOverview;
  const isHostOverviewLoading = entityStoreV2Enabled ? observedHost.isLoading : loading;

  const hostRiskScoreStateFromEntityStore = useMemo(
    () =>
      entityStoreV2Enabled && observedHost.entityRecord
        ? buildRiskScoreStateFromEntityRecord(EntityType.host, observedHost.entityRecord, {
            refetch: observedHost.refetchEntityStore ?? (() => {}),
            isLoading: observedHost.isLoading,
            error: null,
            inspect: entityFromStoreResult?.inspect,
          })
        : undefined,
    [
      entityFromStoreResult?.inspect,
      entityStoreV2Enabled,
      observedHost.entityRecord,
      observedHost.isLoading,
      observedHost.refetchEntityStore,
    ]
  );

  const displayEntityId = useMemo(
    () => (entityStoreV2Enabled ? observedHost.entityRecord?.entity?.id : entityId),
    [entityId, entityStoreV2Enabled, observedHost.entityRecord?.entity?.id]
  );

  const [rawFilteredQueryForHostDetailsIdentity, kqlError] = useMemo(() => {
    try {
      return [
        buildEsQuery(
          dataView,
          [query],
          [...hostDetailsEventsPageFilters, ...globalFilters],
          getEsQueryConfig(uiSettings)
        ),
      ];
    } catch (e) {
      return [undefined, e];
    }
  }, [dataView, query, hostDetailsEventsPageFilters, globalFilters, uiSettings]);

  const stringifiedHostDetailsIdentityFilterQuery = useMemo(
    () =>
      rawFilteredQueryForHostDetailsIdentity != null
        ? JSON.stringify(rawFilteredQueryForHostDetailsIdentity)
        : undefined,
    [rawFilteredQueryForHostDetailsIdentity]
  );

  useInvalidFilterQuery({
    id: ID,
    filterQuery: stringifiedHostDetailsIdentityFilterQuery,
    kqlError,
    query,
    startDate: from,
    endDate: to,
  });

  useEffect(() => {
    dispatch(setHostDetailsTablesActivePageToZero());
  }, [dispatch, detailName]);

  const { hasAlertsRead, hasIndexRead } = useAlertsPrivileges();
  const canReadAlerts = hasAlertsRead && hasIndexRead;

  const additionalFilters = useMemo(
    () => (rawFilteredQueryForHostDetailsIdentity ? [rawFilteredQueryForHostDetailsIdentity] : []),
    [rawFilteredQueryForHostDetailsIdentity]
  );

  const entity = useMemo(
    () => ({
      type: EntityType.host as const,
      name: detailName,
      identifiers: resolvedIdentityFields,
    }),
    [detailName, resolvedIdentityFields]
  );
  const privileges = useAssetCriticalityPrivileges(entity.name);

  const refetchRiskScore = useRefetchOverviewPageRiskScore(HOST_OVERVIEW_RISK_SCORE_QUERY_ID);
  const { calculateEntityRiskScore } = useCalculateEntityRiskScore({
    identifierType: EntityType.host,
    entityId: displayEntityId,
    identifier: detailName,
    onSuccess: refetchRiskScore,
  });

  const { updateAssetCriticalityRecord } = useUpdateAssetCriticality('host', {
    onSuccess: calculateEntityRiskScore,
  });

  const canReadAssetCriticality = !!privileges.data?.has_read_permissions;

  if (status === 'pristine') {
    return <PageLoader />;
  }

  return (
    <>
      {indicesExist ? (
        <>
          <EuiWindowEvent event="resize" handler={noop} />
          <FiltersGlobal>
            <SiemSearchBar dataView={dataView} id={InputsModelId.global} />
          </FiltersGlobal>

          <SecuritySolutionPageWrapper
            noPadding={globalFullScreen}
            data-test-subj="hostDetailsPage"
          >
            <Display show={!globalFullScreen}>
              <HeaderPage
                border
                subtitle={
                  <LastEventTime
                    indexKey={LastEventIndexKey.hostDetails}
                    hostName={detailName}
                    indexNames={selectedPatterns}
                  />
                }
                title={detailName}
                titleNode={
                  <HostDetailsHeaderTitle
                    detailName={detailName}
                    displayEntityId={displayEntityId}
                  />
                }
                rightSideItems={[
                  hostDetailsForOverview.endpoint?.hostInfo?.metadata.elastic.agent.id && (
                    <ResponderActionButton
                      agentId={hostDetailsForOverview.endpoint?.hostInfo?.metadata.elastic.agent.id}
                      agentType="endpoint"
                    />
                  ),
                ]}
              />
              {noEntityInStore && (
                <>
                  <EuiCallOut
                    title={NO_CORRESPONDING_ENTITY_EXISTS}
                    color="warning"
                    iconType="warning"
                    data-test-subj="host-details-no-entity-warning"
                    announceOnMount
                  />
                  <EuiSpacer size="m" />
                  <HostObservedDataSection
                    identityFields={resolvedIdentityFields}
                    observedHost={observedHost}
                    contextID={PageScope.explore}
                    scopeId={PageScope.explore}
                    queryId={HOST_PANEL_OBSERVED_HOST_QUERY_ID}
                  />
                  <EuiHorizontalRule />
                  <EuiSpacer />
                </>
              )}
              <HostDetailsAssetCriticalitySection
                canRead={canReadAssetCriticality}
                detailName={detailName}
                entityStoreV2Enabled={entityStoreV2Enabled}
                noEntityInStore={noEntityInStore}
                observedHostEntityRecord={observedHost.entityRecord}
                storeRecord={entityFromStoreResult.entityRecord}
                onSaveViaEntityStore={updateAssetCriticalityRecord}
                onCriticalityChange={calculateEntityRiskScore}
              />
              {!noEntityInStore && (
                <>
                  <AnomalyTableProvider
                    criteriaFields={hostToCriteria({
                      hostItem: hostDetailsForOverview,
                      euid: euidApi?.euid,
                      entityRecord: entityStoreV2Enabled
                        ? entityFromStoreResult.entityRecord
                        : undefined,
                    })}
                    filterQuery={buildAnomaliesTableInfluencersFilterQuery({
                      euid: euidApi?.euid,
                      entityType: 'host',
                      isScopedToEntity: true,
                      identityFields: resolvedIdentityFields,
                      fallbackDisplayName: detailName,
                    })}
                    startDate={from}
                    endDate={to}
                    skip={isInitializing}
                  >
                    {({ isLoadingAnomaliesData, anomaliesData, jobNameById }) => (
                      <HostOverviewManage
                        id={id}
                        isInDetailsSidePanel={false}
                        data={hostDetailsForOverview as HostItem}
                        anomaliesData={anomaliesData}
                        isLoadingAnomaliesData={isLoadingAnomaliesData}
                        loading={isHostOverviewLoading}
                        startDate={from}
                        endDate={to}
                        narrowDateRange={narrowDateRange}
                        setQuery={setQuery}
                        refetch={
                          entityStoreV2Enabled
                            ? observedHost.refetchEntityStore ??
                              observedHost.refetchObservedDetails ??
                              refetch
                            : refetch
                        }
                        inspect={
                          entityStoreV2Enabled
                            ? entityFromStoreResult?.inspect ??
                              observedHost.observedDetailsInspect ??
                              inspect
                            : inspect
                        }
                        hostName={detailName}
                        indexNames={
                          entityStoreV2Enabled ? securityDefaultPatterns : selectedPatterns
                        }
                        jobNameById={jobNameById}
                        scopeId={PageScope.explore}
                        riskScoreState={hostRiskScoreStateFromEntityStore}
                        firstSeenFromEntityStore={
                          entityStoreV2Enabled
                            ? observedHost.firstSeen?.date ?? undefined
                            : undefined
                        }
                        lastSeenFromEntityStore={
                          entityStoreV2Enabled
                            ? observedHost.lastSeen?.date ?? undefined
                            : undefined
                        }
                      />
                    )}
                  </AnomalyTableProvider>
                  <EuiHorizontalRule />
                  <EuiSpacer />
                </>
              )}

              {canReadAlerts && (
                <>
                  <EuiFlexGroup>
                    <EuiFlexItem>
                      <AlertsByStatus
                        signalIndexName={signalIndexName}
                        entityType={EntityType.host}
                        entityRecord={entityStoreV2Enabled ? observedHost.entityRecord : undefined}
                        identityFields={resolvedIdentityFields}
                        additionalFilters={additionalFilters}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <AlertCountByRuleByStatus
                        identityFields={resolvedIdentityFields}
                        signalIndexName={signalIndexName}
                        additionalFilters={additionalFilters}
                        entityType={EntityType.host}
                        entityRecord={entityStoreV2Enabled ? observedHost.entityRecord : undefined}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer />
                </>
              )}

              <TabNavigation
                navTabs={navTabsHostDetails({
                  hasMlUserPermissions: hasMlUserPermissions(capabilities),
                  hostName: detailName,
                  isEnterprise: isEnterprisePlus,
                  entityId,
                  identityFields: resolvedIdentityFields,
                  urlStateQuery,
                })}
              />

              <EuiSpacer />
            </Display>

            <HostDetailsTabs
              indexNames={selectedPatterns}
              isInitializing={isInitializing}
              deleteQuery={deleteQuery}
              hostDetailsFilter={hostDetailsEventsPageFilters}
              to={to}
              from={from}
              detailName={detailName}
              type={HostsType.details}
              setQuery={setQuery}
              entityRecord={
                entityStoreV2Enabled ? observedHost.entityRecord ?? undefined : undefined
              }
              filterQuery={stringifiedHostDetailsIdentityFilterQuery}
              hostDetailsPagePath={hostDetailsPagePath}
              identityFields={resolvedIdentityFields}
              entityId={displayEntityId}
            />
          </SecuritySolutionPageWrapper>
        </>
      ) : (
        <EmptyPrompt />
      )}

      <SpyRoute pageName={SecurityPageName.hosts} />
    </>
  );
};

HostDetailsComponent.displayName = 'HostDetailsComponent';

export const HostDetails = React.memo(HostDetailsComponent);
