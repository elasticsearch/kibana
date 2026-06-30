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
import { LastEventIndexKey } from '@kbn/timelines-plugin/common';
import { useUpdateAssetCriticality } from '../../../../entity_analytics/api/hooks/use_update_asset_criticality';
import { PageScope } from '../../../../data_view_manager/constants';
import { useCalculateEntityRiskScore } from '../../../../entity_analytics/api/hooks/use_calculate_entity_risk_score';
import { useAssetCriticalityPrivileges } from '../../../../entity_analytics/components/asset_criticality/use_asset_criticality';
import { AssetCriticalityAccordion } from '../../../../entity_analytics/components/asset_criticality/asset_criticality_selector';
import { AlertsByStatus } from '../../../../overview/components/detection_response/alerts_by_status';
import { useSignalIndex } from '../../../../detections/containers/detection_engine/alerts/use_signal_index';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { InputsModelId } from '../../../../common/store/inputs/constants';
import { EntityType } from '../../../../../common/entity_analytics/types';
import { SecurityPageName } from '../../../../app/types';
import { FiltersGlobal } from '../../../../common/components/filters_global';
import { HeaderPage } from '../../../../common/components/header_page';
import { Title } from '../../../../common/components/header_page/title';
import { LastEventTime } from '../../../../common/components/last_event_time';
import { AnomalyTableProvider } from '../../../../common/components/ml/anomaly/anomaly_table_provider';
import { buildAnomaliesTableInfluencersFilterQuery } from '../../../../common/components/ml/anomaly/anomaly_table_euid';
import { getCriteriaFromUsersType } from '../../../../common/components/ml/criteria/get_criteria_from_users_type';
import { hasMlUserPermissions } from '../../../../../common/machine_learning/has_ml_user_permissions';
import { useMlCapabilities } from '../../../../common/components/ml/hooks/use_ml_capabilities';
import { scoreIntervalToDateTime } from '../../../../common/components/ml/score/score_interval_to_datetime';
import { TabNavigation } from '../../../../common/components/navigation/tab_navigation';
import {
  USER_OVERVIEW_RISK_SCORE_QUERY_ID,
  UserOverview,
  type UserSummaryProps,
} from '../../../../overview/components/user_overview';
import { SiemSearchBar } from '../../../../common/components/search_bar';
import { SecuritySolutionPageWrapper } from '../../../../common/components/page_wrapper';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useKibana, useUiSetting } from '../../../../common/lib/kibana';
import { inputsSelectors } from '../../../../common/store';
import { setUsersDetailsTablesActivePageToZero } from '../../store/actions';
import { setAbsoluteRangeDatePicker } from '../../../../common/store/inputs/actions';
import { SpyRoute } from '../../../../common/utils/route/spy_routes';
import { UsersDetailsTabs } from './details_tabs';
import { navTabsUsersDetails } from './nav_tabs';
import type { UsersDetailsProps } from './types';
import { UsersType } from '../../store/model';
import { getUsersDetailsPageFilters } from './helpers';
import { useGlobalFullScreen } from '../../../../common/containers/use_full_screen';
import { Display } from '../../../hosts/pages/display';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { useObservedUserDetails } from '../../containers/users/observed_details';
import { manageQuery } from '../../../../common/components/page/manage_query';
import { useInvalidFilterQuery } from '../../../../common/hooks/use_invalid_filter_query';
import { EmptyPrompt } from '../../../../common/components/empty_prompt';
import { AlertCountByRuleByStatus } from '../../../../common/components/alert_count_by_status';
import { useRefetchOverviewPageRiskScore } from '../../../../entity_analytics/api/hooks/use_refetch_overview_page_risk_score';
import { useDataView } from '../../../../data_view_manager/hooks/use_data_view';
import { useSelectedPatterns } from '../../../../data_view_manager/hooks/use_selected_patterns';
import { PageLoader } from '../../../../common/components/page_loader';
import {
  useEntityFromStore,
  type EntityStoreRecord,
} from '../../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import { ObservedDataSection as UserObservedDataSection } from '../../../../flyout/entity_details/user_right/components/observed_data_section';
import { USER_PANEL_OBSERVED_USER_QUERY_ID } from '../../../../flyout/entity_details/user_right';
import { useObservedUser } from '../../../../flyout/entity_details/user_right/hooks/use_observed_user';
import { buildRiskScoreStateFromEntityRecord } from '../../../../flyout/entity_details/shared/entity_store_risk_utils';
import { NO_CORRESPONDING_ENTITY_EXISTS } from '../../../../flyout/entity_details/shared/translations';
import { useSecurityDefaultPatterns } from '../../../../data_view_manager/hooks/use_security_default_patterns';
import type { UserItem } from '../../../../../common/search_strategy';
import type { Entity } from '../../../../../common/api/entity_analytics';
import { euidDslFilterToPageFilters } from '../../../helpers';

const USERS_DETAILS_OVERVIEW_QUERY_ID = 'UsersDetailsQueryId';
const ES_USER_FIELD = 'user.name';

const UserOverviewManage = manageQuery(UserOverview);

const UserDetailsHeaderTitle: React.FC<{
  detailName: string;
  displayEntityId?: string;
}> = ({ detailName, displayEntityId }) => (
  <>
    <Title title={detailName} />
    {displayEntityId ? (
      <>
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued" data-test-subj="user-details-page-entity-id">
          {displayEntityId}
        </EuiText>
      </>
    ) : null}
  </>
);
UserDetailsHeaderTitle.displayName = 'UserDetailsHeaderTitle';

const UserDetailsAssetCriticalitySection: React.FC<{
  canRead: boolean;
  detailName: string;
  entityStoreV2Enabled: boolean;
  noEntityInStore: boolean;
  observedUserEntityRecord: EntityStoreRecord | null | undefined;
  storeRecord: EntityStoreRecord | null | undefined;
  onSaveViaEntityStore: (updatedRecord: Entity) => Promise<void>;
  onCriticalityChange: () => void;
}> = ({
  canRead,
  detailName,
  entityStoreV2Enabled,
  noEntityInStore,
  observedUserEntityRecord,
  storeRecord,
  onSaveViaEntityStore,
  onCriticalityChange,
}) => {
  if (!canRead || (entityStoreV2Enabled && noEntityInStore)) {
    return null;
  }
  return (
    <AssetCriticalityAccordion
      entity={{ name: detailName, type: EntityType.user }}
      onChange={onCriticalityChange}
      entityRecord={entityStoreV2Enabled ? observedUserEntityRecord ?? undefined : undefined}
      criticalityFromEntityStore={
        entityStoreV2Enabled && observedUserEntityRecord
          ? storeRecord?.asset?.criticality
          : undefined
      }
      onSaveViaEntityStore={entityStoreV2Enabled && storeRecord ? onSaveViaEntityStore : undefined}
    />
  );
};
UserDetailsAssetCriticalitySection.displayName = 'UserDetailsAssetCriticalitySection';

const UsersDetailsComponent: React.FC<UsersDetailsProps> = ({
  detailName,
  usersDetailsPagePath,
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
    () => identityFields ?? { [ES_USER_FIELD]: detailName },
    [identityFields, detailName]
  );

  const narrowDateRange = useCallback<UserSummaryProps['narrowDateRange']>(
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
  const indicesExist = dataView.hasMatchedIndices();

  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);

  const userStoreIdentityFields = useMemo(() => {
    if (entityId) {
      return undefined;
    }
    return Object.keys(resolvedIdentityFields).length > 0 ? resolvedIdentityFields : undefined;
  }, [entityId, resolvedIdentityFields]);

  const entityFromStoreResult = useEntityFromStore({
    entityId,
    identityFields: userStoreIdentityFields,
    entityType: 'user',
    skip: !entityStoreV2Enabled || isInitializing,
  });

  const euidApi = useEntityStoreEuidApi();

  const noEntityInStore =
    entityStoreV2Enabled && !entityFromStoreResult.isLoading && !entityFromStoreResult.entityRecord;

  const usersDetailsEventsPageFilters = useMemo(() => {
    // Builds Kibana (not ES DSL) filters
    // Fallback to user.name filter if EUID-based filter cannot be built for any reason
    const legacyFilters = getUsersDetailsPageFilters(detailName);
    if (!entityStoreV2Enabled || noEntityInStore) {
      return legacyFilters;
    }

    const entityDslFilter = euidApi?.euid?.dsl.getEuidFilterBasedOnDocument(
      EntityType.user,
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

  // observedUser.entityRecord returns entityStoreFromResult.entityRecord when entityStoreV2Enabled
  const observedUser = useObservedUser(
    detailName,
    PageScope.explore,
    entityStoreV2Enabled ? entityFromStoreResult : undefined
  );

  const [loading, { inspect, userDetails: userOverview, id, refetch }] = useObservedUserDetails({
    id: USERS_DETAILS_OVERVIEW_QUERY_ID,
    endDate: to,
    startDate: from,
    userName: detailName,
    entityId: entityStoreV2Enabled ? entityFromStoreResult?.entityRecord?.entity?.id : undefined,
    indexNames: selectedPatterns,
    skip: selectedPatterns.length === 0,
  });

  const userDetailsForOverview = entityStoreV2Enabled ? observedUser.details : userOverview;
  const isUserOverviewLoading = entityStoreV2Enabled ? observedUser.isLoading : loading;

  const userRiskScoreStateFromEntityStore = useMemo(
    () =>
      entityStoreV2Enabled && observedUser.entityRecord
        ? buildRiskScoreStateFromEntityRecord(EntityType.user, observedUser.entityRecord, {
            refetch: observedUser.refetchEntityStore ?? (() => {}),
            isLoading: observedUser.isLoading,
            error: null,
            inspect: entityFromStoreResult?.inspect,
          })
        : undefined,
    [
      entityFromStoreResult?.inspect,
      entityStoreV2Enabled,
      observedUser.entityRecord,
      observedUser.isLoading,
      observedUser.refetchEntityStore,
    ]
  );

  const displayEntityId = useMemo(
    () => (entityStoreV2Enabled ? observedUser.entityRecord?.entity?.id : entityId),
    [entityId, entityStoreV2Enabled, observedUser.entityRecord?.entity?.id]
  );

  const [rawFilteredQueryForUserDetailsIdentity, kqlError] = useMemo(() => {
    try {
      return [
        buildEsQuery(
          dataView,
          [query],
          [...usersDetailsEventsPageFilters, ...globalFilters],
          getEsQueryConfig(uiSettings)
        ),
      ];
    } catch (e) {
      return [undefined, e];
    }
  }, [dataView, query, usersDetailsEventsPageFilters, globalFilters, uiSettings]);

  const stringifiedUserDetailsIdentityFilterQuery = useMemo(
    () =>
      rawFilteredQueryForUserDetailsIdentity != null
        ? JSON.stringify(rawFilteredQueryForUserDetailsIdentity)
        : undefined,
    [rawFilteredQueryForUserDetailsIdentity]
  );

  useInvalidFilterQuery({
    id: USERS_DETAILS_OVERVIEW_QUERY_ID,
    filterQuery: stringifiedUserDetailsIdentityFilterQuery,
    kqlError,
    query,
    startDate: from,
    endDate: to,
  });

  useEffect(() => {
    dispatch(setUsersDetailsTablesActivePageToZero());
  }, [dispatch, detailName]);

  const { hasAlertsRead, hasIndexRead } = useAlertsPrivileges();
  const canReadAlerts = hasAlertsRead && hasIndexRead;

  const additionalFilters = useMemo(
    () => (rawFilteredQueryForUserDetailsIdentity ? [rawFilteredQueryForUserDetailsIdentity] : []),
    [rawFilteredQueryForUserDetailsIdentity]
  );

  const entity = useMemo(
    () => ({
      type: EntityType.user as const,
      name: detailName,
      identifiers: resolvedIdentityFields,
    }),
    [detailName, resolvedIdentityFields]
  );
  const privileges = useAssetCriticalityPrivileges(entity.name);

  const refetchRiskScore = useRefetchOverviewPageRiskScore(USER_OVERVIEW_RISK_SCORE_QUERY_ID);
  const { calculateEntityRiskScore } = useCalculateEntityRiskScore({
    identifierType: EntityType.user,
    entityId: displayEntityId,
    identifier: detailName,
    onSuccess: refetchRiskScore,
  });

  const { updateAssetCriticalityRecord } = useUpdateAssetCriticality('user', {
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
            data-test-subj="usersDetailsPage"
          >
            <Display show={!globalFullScreen}>
              <HeaderPage
                border
                subtitle={
                  <LastEventTime
                    indexKey={LastEventIndexKey.userDetails}
                    indexNames={selectedPatterns}
                    userName={detailName}
                  />
                }
                title={detailName}
                titleNode={
                  <UserDetailsHeaderTitle
                    detailName={detailName}
                    displayEntityId={displayEntityId}
                  />
                }
              />
              {noEntityInStore && (
                <>
                  <EuiCallOut
                    title={NO_CORRESPONDING_ENTITY_EXISTS}
                    color="warning"
                    iconType="warning"
                    data-test-subj="user-details-no-entity-warning"
                    announceOnMount
                  />
                  <EuiSpacer size="m" />
                  <UserObservedDataSection
                    userName={detailName}
                    identityFields={resolvedIdentityFields}
                    observedUser={observedUser}
                    contextID={PageScope.explore}
                    scopeId={PageScope.explore}
                    queryId={USER_PANEL_OBSERVED_USER_QUERY_ID}
                  />
                  <EuiHorizontalRule />
                  <EuiSpacer />
                </>
              )}
              <UserDetailsAssetCriticalitySection
                canRead={canReadAssetCriticality}
                detailName={detailName}
                entityStoreV2Enabled={entityStoreV2Enabled}
                noEntityInStore={noEntityInStore}
                observedUserEntityRecord={observedUser.entityRecord}
                storeRecord={entityFromStoreResult.entityRecord}
                onSaveViaEntityStore={updateAssetCriticalityRecord}
                onCriticalityChange={calculateEntityRiskScore}
              />
              {!noEntityInStore && (
                <>
                  <AnomalyTableProvider
                    criteriaFields={getCriteriaFromUsersType({
                      type: UsersType.details,
                      userName: detailName,
                      identityFields: resolvedIdentityFields,
                      euid: euidApi?.euid,
                      entityRecord: entityStoreV2Enabled
                        ? entityFromStoreResult.entityRecord
                        : undefined,
                    })}
                    filterQuery={buildAnomaliesTableInfluencersFilterQuery({
                      euid: euidApi?.euid,
                      entityType: 'user',
                      entityRecord: entityStoreV2Enabled
                        ? entityFromStoreResult.entityRecord
                        : undefined,
                      isScopedToEntity: true,
                      identityFields: resolvedIdentityFields,
                      fallbackDisplayName: detailName,
                    })}
                    startDate={from}
                    endDate={to}
                    skip={isInitializing}
                  >
                    {({ isLoadingAnomaliesData, anomaliesData, jobNameById }) => (
                      <UserOverviewManage
                        id={id}
                        isInDetailsSidePanel={false}
                        data={userDetailsForOverview as UserItem}
                        anomaliesData={anomaliesData}
                        isLoadingAnomaliesData={isLoadingAnomaliesData}
                        loading={isUserOverviewLoading}
                        startDate={from}
                        endDate={to}
                        narrowDateRange={narrowDateRange}
                        setQuery={setQuery}
                        refetch={
                          entityStoreV2Enabled
                            ? observedUser.refetchEntityStore ??
                              observedUser.refetchObservedDetails ??
                              refetch
                            : refetch
                        }
                        inspect={
                          entityStoreV2Enabled
                            ? entityFromStoreResult?.inspect ??
                              observedUser.observedDetailsInspect ??
                              inspect
                            : inspect
                        }
                        userName={detailName}
                        indexPatterns={
                          entityStoreV2Enabled ? securityDefaultPatterns : selectedPatterns
                        }
                        jobNameById={jobNameById}
                        scopeId={PageScope.explore}
                        riskScoreState={userRiskScoreStateFromEntityStore}
                        firstSeenFromEntityStore={
                          entityStoreV2Enabled
                            ? observedUser.firstSeen?.date ?? undefined
                            : undefined
                        }
                        lastSeenFromEntityStore={
                          entityStoreV2Enabled
                            ? observedUser.lastSeen?.date ?? undefined
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
                        entityType={EntityType.user}
                        entityRecord={entityStoreV2Enabled ? observedUser.entityRecord : undefined}
                        identityFields={resolvedIdentityFields}
                        additionalFilters={additionalFilters}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <AlertCountByRuleByStatus
                        identityFields={resolvedIdentityFields}
                        signalIndexName={signalIndexName}
                        entityType={EntityType.user}
                        entityRecord={entityStoreV2Enabled ? observedUser.entityRecord : undefined}
                        additionalFilters={additionalFilters}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer />
                </>
              )}

              <TabNavigation
                navTabs={navTabsUsersDetails(detailName, hasMlUserPermissions(capabilities), {
                  entityId,
                  identityFields: resolvedIdentityFields,
                  urlStateQuery,
                })}
              />

              <EuiSpacer />
            </Display>

            <UsersDetailsTabs
              indexNames={selectedPatterns}
              isInitializing={isInitializing}
              deleteQuery={deleteQuery}
              userDetailFilter={usersDetailsEventsPageFilters}
              to={to}
              from={from}
              detailName={detailName}
              type={UsersType.details}
              setQuery={setQuery}
              entityRecord={
                entityStoreV2Enabled ? observedUser.entityRecord ?? undefined : undefined
              }
              filterQuery={stringifiedUserDetailsIdentityFilterQuery}
              usersDetailsPagePath={usersDetailsPagePath}
              identityFields={resolvedIdentityFields}
              entityId={displayEntityId}
            />
          </SecuritySolutionPageWrapper>
        </>
      ) : (
        <EmptyPrompt />
      )}

      <SpyRoute pageName={SecurityPageName.users} />
    </>
  );
};

UsersDetailsComponent.displayName = 'UsersDetailsComponent';

export const UsersDetails = React.memo(UsersDetailsComponent);
