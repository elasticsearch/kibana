/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { v4 as uuid } from 'uuid';
import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiIconTip,
  EuiInMemoryTable,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useHasMisconfigurations } from '@kbn/cloud-security-posture/src/hooks/use_has_misconfigurations';
import { MISCONFIGURATION_INSIGHT_USER_DETAILS } from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { ExpandablePanel } from '../../../../flyout_v2/shared/components/expandable_panel';
import type { RelatedHost } from '../../../../../common/search_strategy/security_solution/related_entities/related_hosts';
import { buildUserNamesFilter, type RiskSeverity } from '../../../../../common/search_strategy';
import { UserOverview } from '../../../../overview/components/user_overview';
import { AnomalyTableProvider } from '../../../../common/components/ml/anomaly/anomaly_table_provider';
import { InspectButton, InspectButtonContainer } from '../../../../common/components/inspect';
import { EntityType } from '../../../../../common/entity_analytics/types';
import { RiskScoreLevel } from '../../../../entity_analytics/components/severity/common';
import { DefaultFieldRenderer } from '../../../../timelines/components/field_renderers/default_renderer';
import { CellActions as DocumentDetailsCellActions } from '../../shared/components/cell_actions';
import { CellActions as AttackDetailsCellActions } from '../../../attack_details/components/cell_actions';
import { InputsModelId } from '../../../../common/store/inputs/constants';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { scoreIntervalToDateTime } from '../../../../common/components/ml/score/score_interval_to_datetime';
import { setAbsoluteRangeDatePicker } from '../../../../common/store/inputs/actions';
import { hostToCriteria } from '../../../../common/components/ml/criteria/host_to_criteria';
import { manageQuery } from '../../../../common/components/page/manage_query';
import { useUserRelatedHosts } from '../../../../common/containers/related_entities/related_hosts';
import { useMlCapabilities } from '../../../../common/components/ml/hooks/use_ml_capabilities';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import {
  USER_DETAILS_ALERT_COUNT_TEST_ID,
  USER_DETAILS_MISCONFIGURATIONS_TEST_ID,
  USER_DETAILS_RELATED_HOSTS_IP_LINK_TEST_ID,
  USER_DETAILS_RELATED_HOSTS_LINK_TEST_ID,
  USER_DETAILS_RELATED_HOSTS_TABLE_TEST_ID,
  USER_DETAILS_TEST_ID,
} from './test_ids';
import {
  HOST_IP_FIELD_NAME,
  HOST_NAME_FIELD_NAME,
} from '../../../../timelines/components/timeline/body/renderers/constants';
import { useKibana } from '../../../../common/lib/kibana';
import { ENTITY_RISK_LEVEL } from '../../../../entity_analytics/components/risk_score/translations';
import { useHasSecurityCapability } from '../../../../helper_hooks';
import { UserPreviewPanelKey } from '../../../entity_details/user_right';
import { USER_PREVIEW_BANNER } from '../../../../flyout_v2/document/main/components/user_entity_overview';
import { PreviewLink } from '../../../shared/components/preview_link';
import type { NarrowDateRange } from '../../../../common/components/ml/types';
import { MisconfigurationsInsight } from '../../../../flyout_v2/document/main/components/misconfiguration_insight';
import { AlertCountInsight } from '../../../../flyout_v2/document/main/components/alert_count_insight';
import { DocumentEventTypes } from '../../../../common/lib/telemetry';
import { buildEuidCspPreviewOptions } from '../../../../cloud_security_posture/utils/build_euid_csp_preview_options';
import { useNonClosedAlerts } from '../../../../cloud_security_posture/hooks/use_non_closed_alerts';
import { useRiskScore } from '../../../../entity_analytics/api/hooks/use_risk_score';
import { useNavigateToUserDetails } from '../../../entity_details/user_right/hooks/use_navigate_to_user_details';
import { useSelectedPatterns } from '../../../../data_view_manager/hooks/use_selected_patterns';
import { useSecurityDefaultPatterns } from '../../../../data_view_manager/hooks/use_security_default_patterns';
import { useEntityFromStore } from '../../../entity_details/shared/hooks/use_entity_from_store';
import { useObservedUser } from '../../../entity_details/user_right/hooks/use_observed_user';
import {
  buildRiskScoreStateFromEntityRecord,
  getRiskFromEntityRecord,
} from '../../../entity_details/shared/entity_store_risk_utils';
import {
  CspInsightLeftPanelSubTab,
  EntityDetailsLeftPanelTab,
} from '../../../entity_details/shared/components/left_panel/left_panel_header';
import { mergeLegacyIdentityWhenStoreEntityMissing, type IdentityFields } from '../../shared/utils';

const USER_DETAILS_ID = 'entities-users-details';
const RELATED_HOSTS_ID = 'entities-users-related-hosts';
const USER_DETAILS_INSIGHTS_ID = 'user-details-insights';

const UserOverviewManage = manageQuery(UserOverview);
const RelatedHostsManage = manageQuery(InspectButtonContainer);

export interface UserDetailsProps {
  /**
   * User name
   */
  userName: string;
  /**
   * Host entity id
   */
  entityId?: string;
  /**
   * timestamp of alert or event
   */
  timestamp: string;
  /**
   * Maintain backwards compatibility // TODO remove when possible
   */
  scopeId: string;
  /**
   * Whether the panel is expanded on first render. Defaults to true (document details).
   * Set to false for attack flyout so multiple entity panels start collapsed.
   */
  expandedOnFirstRender?: boolean;
  /**
   * When true, related-entity cell actions use the attack flyout implementation.
   * Set for attack flyout entity panels; omit in document details flyout.
   */
  isAttackDetails?: boolean;
}

/**
 * User details and related users, displayed in the document details expandable flyout left section under the Insights tab, Entities tab
 */
export const UserDetails: React.FC<UserDetailsProps> = ({
  userName,
  entityId,
  timestamp,
  scopeId,
  expandedOnFirstRender = true,
  isAttackDetails = false,
}) => {
  const EntityCellActions = isAttackDetails ? AttackDetailsCellActions : DocumentDetailsCellActions;

  const { to, from, deleteQuery, setQuery, isInitializing } = useGlobalTime();
  const selectedPatterns = useSelectedPatterns();
  const { indexPatterns: securityDefaultPatterns } = useSecurityDefaultPatterns();

  const dispatch = useDispatch();
  const { telemetry } = useKibana().services;
  // create a unique, but stable (across re-renders) query id
  const userDetailsQueryId = useMemo(() => `${USER_DETAILS_ID}-${uuid()}`, []);
  const relatedHostsQueryId = useMemo(() => `${RELATED_HOSTS_ID}-${uuid()}`, []);

  const hasEntityAnalyticsCapability = useHasSecurityCapability('entity-analytics');
  const isPlatinumOrTrialLicense = useMlCapabilities().isPlatinumOrTrialLicense;
  const isEntityAnalyticsAuthorized = isPlatinumOrTrialLicense && hasEntityAnalyticsCapability;

  const { openPreviewPanel } = useExpandableFlyoutApi();

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

  const timerange = useMemo(
    () => ({
      from,
      to,
    }),
    [from, to]
  );

  const filterQuery = useMemo(
    () => (userName ? buildUserNamesFilter([userName]) : undefined),
    [userName]
  );

  const riskScoreStateFromApi = useRiskScore({
    filterQuery,
    riskEntity: EntityType.user,
    timerange,
    skip: userName == null,
  });
  const userRiskData =
    riskScoreStateFromApi.data && riskScoreStateFromApi.data.length > 0
      ? riskScoreStateFromApi.data[0]
      : undefined;

  const euidApi = useEntityStoreEuidApi();

  const openUserPreview = useCallback(() => {
    openPreviewPanel({
      id: UserPreviewPanelKey,
      params: {
        userName,
        entityId,
        scopeId,
        banner: USER_PREVIEW_BANNER,
      },
    });
    telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutOpened, {
      location: scopeId,
      panel: 'preview',
    });
  }, [openPreviewPanel, userName, entityId, scopeId, telemetry]);

  const entityFromStoreResult = useEntityFromStore({
    entityId,
    entityType: 'user',
    skip: isInitializing,
  });
  const observedUser = useObservedUser(userName, scopeId, entityFromStoreResult);

  // Always show observed user fields from the same indices useObservedUser queries (security
  // defaults). A duplicate useObservedUserDetails against sourcerer patterns (e.g. alerts-only)
  // returns sparse objects that are still truthy, which hid real data behind "—" rows.
  const effectiveUserDetails = observedUser.details;
  const isUserLoading = observedUser.isLoading;

  const userRiskScoreStateFromEntityStore = useMemo(
    () =>
      observedUser.entityRecord
        ? buildRiskScoreStateFromEntityRecord(EntityType.user, observedUser.entityRecord, {
            refetch: observedUser.refetchEntityStore ?? (() => {}),
            isLoading: observedUser.isLoading,
            error: null,
            inspect: entityFromStoreResult?.inspect,
          })
        : undefined,
    [
      observedUser.entityRecord,
      observedUser.refetchEntityStore,
      observedUser.isLoading,
      entityFromStoreResult?.inspect,
    ]
  );

  const effectiveRiskScoreState =
    userRiskScoreStateFromEntityStore ??
    (riskScoreStateFromApi.data?.length ? riskScoreStateFromApi : undefined);

  const isRiskScoreExist = observedUser.entityRecord
    ? !!getRiskFromEntityRecord(observedUser.entityRecord)?.calculated_level
    : !!userRiskData?.user?.risk;

  const identityFields = useMemo(
    () =>
      euidApi?.euid.getEntityIdentifiersFromDocument(
        'user',
        entityFromStoreResult.entityRecord ?? entityFromStoreResult.entity ?? {}
      ),
    [euidApi?.euid, entityFromStoreResult.entityRecord, entityFromStoreResult.entity]
  );

  const userIdentityFields = useMemo(() => {
    const legacyFields =
      userName != null && userName !== '' ? { 'user.name': userName } : ({} as IdentityFields);
    return mergeLegacyIdentityWhenStoreEntityMissing(identityFields ?? {}, legacyFields);
  }, [userName, identityFields]);

  const userCspIdentityDoc = observedUser.details;
  const { hasMisconfigurationFindings } = useHasMisconfigurations(
    buildEuidCspPreviewOptions('user', userCspIdentityDoc, euidApi, {
      legacyIdentityFields: userIdentityFields,
    })
  );

  const { hasNonClosedAlerts } = useNonClosedAlerts({
    identityFields: userIdentityFields ?? null,
    entityType: EntityType.user,
    to,
    from,
    queryId: USER_DETAILS_INSIGHTS_ID,
  });

  const openDetailsPanel = useNavigateToUserDetails({
    userName,
    identityFields: userIdentityFields ?? {},
    entityId: entityFromStoreResult?.entityRecord?.entity?.id,
    scopeId,
    isRiskScoreExist,
    hasMisconfigurationFindings,
    hasNonClosedAlerts,
    isPreviewMode: true,
    contextID: USER_DETAILS_INSIGHTS_ID,
  });

  const {
    loading: isRelatedHostLoading,
    inspect: inspectRelatedHosts,
    relatedHosts,
    totalCount,
    refetch: refetchRelatedHosts,
  } = useUserRelatedHosts({
    userName,
    from: timestamp, // related hosts are hosts this user has successfully authenticated onto AFTER alert time
    skip: selectedPatterns.length === 0,
  });

  const relatedHostsColumns: Array<EuiBasicTableColumn<RelatedHost>> = useMemo(
    () => [
      {
        field: 'host',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.left.insights.entities.relatedHostsNameColumnLabel"
            defaultMessage="Name"
          />
        ),
        render: (host: string) => (
          <EuiText grow={false} size="xs">
            <EntityCellActions field={HOST_NAME_FIELD_NAME} value={host}>
              <PreviewLink
                field={HOST_NAME_FIELD_NAME}
                value={host}
                entityId={entityId}
                scopeId={scopeId}
                data-test-subj={USER_DETAILS_RELATED_HOSTS_LINK_TEST_ID}
              />
            </EntityCellActions>
          </EuiText>
        ),
      },
      {
        field: 'ip',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.left.insights.entities.relatedHostsIpColumnLabel"
            defaultMessage="Ip addresses"
          />
        ),
        render: (ips: string[]) => {
          return (
            <DefaultFieldRenderer
              rowItems={ips}
              attrName={HOST_IP_FIELD_NAME}
              idPrefix={''}
              render={(ip) =>
                ip == null ? (
                  getEmptyTagValue()
                ) : (
                  <PreviewLink
                    field={HOST_IP_FIELD_NAME}
                    value={ip}
                    scopeId={scopeId}
                    data-test-subj={USER_DETAILS_RELATED_HOSTS_IP_LINK_TEST_ID}
                  />
                )
              }
              scopeId={scopeId}
            />
          );
        },
      },
      ...(isEntityAnalyticsAuthorized
        ? [
            {
              field: 'risk',
              name: ENTITY_RISK_LEVEL(EntityType.host),
              truncateText: false,
              mobileOptions: { show: true },
              sortable: false,
              render: (riskScore: RiskSeverity) => {
                if (riskScore != null) {
                  return <RiskScoreLevel severity={riskScore} />;
                }
                return getEmptyTagValue();
              },
            },
          ]
        : []),
    ],
    [EntityCellActions, isEntityAnalyticsAuthorized, scopeId, entityId]
  );

  const relatedHostsCount = useMemo(
    () => (
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="storage" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xxxs">
            <EuiText>
              <FormattedMessage
                id="xpack.securitySolution.flyout.left.insights.entities.relatedHostsCountLabel"
                defaultMessage="Related hosts: {count}"
                values={{ count: totalCount }}
              />
            </EuiText>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [totalCount]
  );

  const pagination: {} = {
    pageSize: 4,
    showPerPageOptions: false,
  };

  const userLink = useMemo(
    () => ({
      callback: openUserPreview,
      tooltip: i18n.translate(
        'xpack.securitySolution.flyout.left.insights.entities.user.userPreviewTitle',
        { defaultMessage: 'Preview user' }
      ),
    }),
    [openUserPreview]
  );

  return (
    <ExpandablePanel
      header={{
        title: userName,
        iconType: 'user',
        headerContent: relatedHostsCount,
        link: userLink,
      }}
      expand={{
        expandable: true,
        expandedOnFirstRender,
      }}
      data-test-subj={USER_DETAILS_TEST_ID}
    >
      <EuiTitle size="xxs">
        <h4>
          <FormattedMessage
            id="xpack.securitySolution.flyout.left.insights.entities.userDetailsInfoTitle"
            defaultMessage="User information"
          />
        </h4>
      </EuiTitle>
      <EuiSpacer size="s" />
      <AnomalyTableProvider
        criteriaFields={hostToCriteria({ hostItem: effectiveUserDetails })}
        startDate={from}
        endDate={to}
        skip={isInitializing}
      >
        {({ isLoadingAnomaliesData, anomaliesData, jobNameById }) => (
          <UserOverviewManage
            id={userDetailsQueryId}
            isInDetailsSidePanel={false}
            data={effectiveUserDetails}
            anomaliesData={anomaliesData}
            isLoadingAnomaliesData={isLoadingAnomaliesData}
            loading={isUserLoading}
            startDate={from}
            endDate={to}
            narrowDateRange={narrowDateRange}
            setQuery={setQuery}
            refetch={observedUser.refetchEntityStore ?? (() => {})}
            inspect={entityFromStoreResult?.inspect}
            userName={userName}
            indexPatterns={securityDefaultPatterns}
            jobNameById={jobNameById}
            scopeId={scopeId}
            isFlyoutOpen={true}
            riskScoreState={effectiveRiskScoreState}
            firstSeenFromEntityStore={observedUser.firstSeen?.date ?? undefined}
            lastSeenFromEntityStore={observedUser.lastSeen?.date ?? undefined}
          />
        )}
      </AnomalyTableProvider>
      <EuiSpacer size="s" />
      <EuiHorizontalRule margin="s" />
      <EuiFlexGrid responsive={false} columns={3} gutterSize="xl">
        <AlertCountInsight
          entityRecord={observedUser.entityRecord}
          identityFields={userIdentityFields ?? {}}
          entityType={EntityType.user}
          queryId={`${USER_DETAILS_INSIGHTS_ID}-alerts-by-status`}
          direction="column"
          onShowAlertCountDetails={() =>
            openDetailsPanel({
              tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
              subTab: CspInsightLeftPanelSubTab.ALERTS,
            })
          }
          data-test-subj={USER_DETAILS_ALERT_COUNT_TEST_ID}
        />
        <MisconfigurationsInsight
          identityFields={userIdentityFields ?? {}}
          direction="column"
          onShowMisconfigurationsDetails={() =>
            openDetailsPanel({
              tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
              subTab: CspInsightLeftPanelSubTab.MISCONFIGURATIONS,
            })
          }
          data-test-subj={USER_DETAILS_MISCONFIGURATIONS_TEST_ID}
          telemetryKey={MISCONFIGURATION_INSIGHT_USER_DETAILS}
        />
      </EuiFlexGrid>
      <EuiSpacer size="l" />
      <EuiPanel hasBorder={true}>
        <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiTitle size="xxs">
              <h4>
                <FormattedMessage
                  id="xpack.securitySolution.flyout.left.insights.entities.relatedHostsTitle"
                  defaultMessage="Related hosts"
                />
              </h4>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiIconTip
              content={
                <FormattedMessage
                  id="xpack.securitySolution.flyout.left.insights.entities.relatedHostsTooltip"
                  defaultMessage="After this event, {userName} logged into these hosts. Check if this activity is normal."
                  values={{ userName }}
                />
              }
              type="info"
              className="eui-alignTop"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <RelatedHostsManage
          id={relatedHostsQueryId}
          inspect={inspectRelatedHosts}
          loading={isRelatedHostLoading}
          setQuery={setQuery}
          deleteQuery={deleteQuery}
          refetch={refetchRelatedHosts}
        >
          <EuiInMemoryTable
            columns={relatedHostsColumns}
            items={relatedHosts}
            loading={isRelatedHostLoading}
            data-test-subj={USER_DETAILS_RELATED_HOSTS_TABLE_TEST_ID}
            pagination={pagination}
            tableCaption={i18n.translate(
              'xpack.securitySolution.flyout.left.insights.entities.relatedHostsCaption',
              { defaultMessage: "User's related hosts" }
            )}
            noItemsMessage={
              <FormattedMessage
                id="xpack.securitySolution.flyout.left.insights.entities.relatedHostsNoDataDescription"
                defaultMessage="No hosts identified"
              />
            }
          />
          <InspectButton
            queryId={relatedHostsQueryId}
            title={
              <FormattedMessage
                id="xpack.securitySolution.flyout.left.insights.entities.relatedHostsInspectButtonTitle"
                defaultMessage="Related hosts"
              />
            }
            inspectIndex={0}
          />
        </RelatedHostsManage>
      </EuiPanel>
    </ExpandablePanel>
  );
};
