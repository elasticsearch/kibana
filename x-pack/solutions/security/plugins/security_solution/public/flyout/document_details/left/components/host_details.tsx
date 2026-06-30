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
import {
  MISCONFIGURATION_INSIGHT_HOST_DETAILS,
  VULNERABILITIES_INSIGHT_HOST_DETAILS,
} from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { useHasMisconfigurations } from '@kbn/cloud-security-posture/src/hooks/use_has_misconfigurations';
import { useHasVulnerabilities } from '@kbn/cloud-security-posture/src/hooks/use_has_vulnerabilities';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { getEntitiesAlias, ENTITY_LATEST } from '@kbn/entity-store/common';
import { buildEuidCspPreviewOptions } from '../../../../cloud_security_posture/utils/build_euid_csp_preview_options';
import { useNonClosedAlerts } from '../../../../cloud_security_posture/hooks/use_non_closed_alerts';
import { ExpandablePanel } from '../../../../flyout_v2/shared/components/expandable_panel';
import type { RelatedUser } from '../../../../../common/search_strategy/security_solution/related_entities/related_users';
import type { HostItem, RiskSeverity } from '../../../../../common/search_strategy';
import { buildHostNamesFilter } from '../../../../../common/search_strategy';
import { HostOverview } from '../../../../overview/components/host_overview';
import { AnomalyTableProvider } from '../../../../common/components/ml/anomaly/anomaly_table_provider';
import { InspectButton, InspectButtonContainer } from '../../../../common/components/inspect';
import { EntityType } from '../../../../../common/entity_analytics/types';
import { RiskScoreLevel } from '../../../../entity_analytics/components/severity/common';
import {
  DefaultFieldRenderer,
  toFieldRendererItems,
} from '../../../../timelines/components/field_renderers/default_renderer';
import { InputsModelId } from '../../../../common/store/inputs/constants';
import { CellActions as DocumentDetailsCellActions } from '../../shared/components/cell_actions';
import { CellActions as AttackDetailsCellActions } from '../../../attack_details/components/cell_actions';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { manageQuery } from '../../../../common/components/page/manage_query';
import { scoreIntervalToDateTime } from '../../../../common/components/ml/score/score_interval_to_datetime';
import { setAbsoluteRangeDatePicker } from '../../../../common/store/inputs/actions';
import { hostToCriteria } from '../../../../common/components/ml/criteria/host_to_criteria';
import { useHostRelatedUsers } from '../../../../common/containers/related_entities/related_users';
import { useMlCapabilities } from '../../../../common/components/ml/hooks/use_ml_capabilities';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import {
  HOST_DETAILS_ALERT_COUNT_TEST_ID,
  HOST_DETAILS_MISCONFIGURATIONS_TEST_ID,
  HOST_DETAILS_RELATED_USERS_IP_LINK_TEST_ID,
  HOST_DETAILS_RELATED_USERS_LINK_TEST_ID,
  HOST_DETAILS_RELATED_USERS_TABLE_TEST_ID,
  HOST_DETAILS_TEST_ID,
  HOST_DETAILS_VULNERABILITIES_TEST_ID,
} from './test_ids';
import {
  HOST_IP_FIELD_NAME,
  USER_NAME_FIELD_NAME,
} from '../../../../timelines/components/timeline/body/renderers/constants';
import { useKibana, useUiSetting } from '../../../../common/lib/kibana';
import { ENTITY_RISK_LEVEL } from '../../../../entity_analytics/components/risk_score/translations';
import { useHasSecurityCapability } from '../../../../helper_hooks';
import { PreviewLink } from '../../../shared/components/preview_link';
import { HostPreviewPanelKey } from '../../../entity_details/host_right';
import { HOST_PREVIEW_BANNER } from '../../../../flyout_v2/document/main/components/host_entity_overview';
import type { NarrowDateRange } from '../../../../common/components/ml/types';
import { MisconfigurationsInsight } from '../../../../flyout_v2/document/main/components/misconfiguration_insight';
import { VulnerabilitiesInsight } from '../../../../flyout_v2/document/main/components/vulnerabilities_insight';
import { AlertCountInsight } from '../../../../flyout_v2/document/main/components/alert_count_insight';
import { DocumentEventTypes } from '../../../../common/lib/telemetry';
import { DETECTION_RESPONSE_ALERTS_BY_STATUS_ID } from '../../../../overview/components/detection_response/alerts_by_status/types';
import { useNavigateToHostDetails } from '../../../entity_details/host_right/hooks/use_navigate_to_host_details';
import { useRiskScore } from '../../../../entity_analytics/api/hooks/use_risk_score';
import { useSelectedPatterns } from '../../../../data_view_manager/hooks/use_selected_patterns';
import { useSecurityDefaultPatterns } from '../../../../data_view_manager/hooks/use_security_default_patterns';
import { useSpaceId } from '../../../../common/hooks/use_space_id';
import type { EntityFromStoreResult } from '../../../entity_details/shared/hooks/use_entity_from_store';
import { useObservedHost } from '../../../../flyout_v2/entity/host/main/hooks/use_observed_host';
import {
  buildRiskScoreStateFromEntityRecord,
  getRiskFromEntityRecord,
} from '../../../entity_details/shared/entity_store_risk_utils';
import {
  CspInsightLeftPanelSubTab,
  EntityDetailsLeftPanelTab,
} from '../../../entity_details/shared/components/left_panel/left_panel_header';
import { type IdentityFields, mergeLegacyIdentityWhenStoreEntityMissing } from '../../shared/utils';

const HOST_DETAILS_ID = 'entities-hosts-details';
const RELATED_USERS_ID = 'entities-hosts-related-users';
const HOST_DETAILS_INSIGHTS_ID = 'host-details-insights';

const HostOverviewManage = manageQuery(HostOverview);
const RelatedUsersManage = manageQuery(InspectButtonContainer);

export interface HostDetailsProps {
  /**
   * Host name
   */
  hostName: string;
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
   * When provided (e.g. from EntitiesDetails), use this for entity/risk so the left panel
   * shows host risk level even when global time is still initializing.
   */
  hostEntityFromStoreResult?: EntityFromStoreResult<HostItem> | null;
  /**
   * When true, related-entity cell actions use the attack flyout implementation (no DocumentDetailsContext).
   * Set for attack flyout entity panels; omit in document details flyout.
   */
  isAttackDetails?: boolean;
}

/**
 * Host details and related users, displayed in the document details expandable flyout left section under the Insights tab, Entities tab
 */
export const HostDetails: React.FC<HostDetailsProps> = ({
  hostName,
  entityId,
  timestamp,
  scopeId,
  expandedOnFirstRender = true,
  hostEntityFromStoreResult,
  isAttackDetails = false,
}) => {
  const EntityCellActions = isAttackDetails ? AttackDetailsCellActions : DocumentDetailsCellActions;

  const { to, from, deleteQuery, setQuery, isInitializing } = useGlobalTime();
  const selectedPatterns = useSelectedPatterns();

  const { indexPatterns: securityDefaultPatterns } = useSecurityDefaultPatterns();
  const dispatch = useDispatch();
  const { telemetry } = useKibana().services;
  // create a unique, but stable (across re-renders) query id
  const hostDetailsQueryId = useMemo(() => `${HOST_DETAILS_ID}-${uuid()}`, []);
  const relatedUsersQueryId = useMemo(() => `${RELATED_USERS_ID}-${uuid()}`, []);
  const hasEntityAnalyticsCapability = useHasSecurityCapability('entity-analytics');
  const isPlatinumOrTrialLicense = useMlCapabilities().isPlatinumOrTrialLicense;
  const isEntityAnalyticsAuthorized = isPlatinumOrTrialLicense && hasEntityAnalyticsCapability;

  const { openPreviewPanel } = useExpandableFlyoutApi();

  const timerange = useMemo(
    () => ({
      from,
      to,
    }),
    [from, to]
  );

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

  const openHostPreview = useCallback(() => {
    openPreviewPanel({
      id: HostPreviewPanelKey,
      params: {
        hostName,
        entityId,
        scopeId,
        banner: HOST_PREVIEW_BANNER,
      },
    });
    telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutOpened, {
      location: scopeId,
      panel: 'preview',
    });
  }, [openPreviewPanel, hostName, entityId, scopeId, telemetry]);

  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);
  const euidApi = useEntityStoreEuidApi();

  const hostIdentityFieldsForStore = useMemo(
    () =>
      euidApi?.euid.getEntityIdentifiersFromDocument(
        'host',
        hostEntityFromStoreResult?.entityRecord ?? hostEntityFromStoreResult?.entity
      ),
    [euidApi?.euid, hostEntityFromStoreResult?.entityRecord, hostEntityFromStoreResult?.entity]
  );
  const observedHost = useObservedHost(
    hostName,
    scopeId,
    entityStoreV2Enabled ? hostEntityFromStoreResult : undefined
  );

  const spaceId = useSpaceId();
  const relatedUsersIndexNames = useMemo((): string[] => {
    if (entityStoreV2Enabled && spaceId != null) {
      const namespace = spaceId || 'default';
      return [getEntitiesAlias(ENTITY_LATEST, namespace)];
    }
    return selectedPatterns;
  }, [entityStoreV2Enabled, spaceId, selectedPatterns]);

  const filterQuery = useMemo(
    () => (hostName ? buildHostNamesFilter([hostName]) : undefined),
    [hostName]
  );
  const riskScoreStateFromApi = useRiskScore({
    filterQuery,
    riskEntity: EntityType.host,
    skip: hostName == null,
    timerange,
  });
  const hostRiskData =
    riskScoreStateFromApi.data && riskScoreStateFromApi.data.length > 0
      ? riskScoreStateFromApi.data[0]
      : undefined;
  // Same as UserDetails: useObservedHost always queries security default indices; duplicating
  // useHostDetails against sourcerer patterns yields sparse hostDetails that still suppress real data.
  const hostDetails = observedHost.details;
  const isHostLoading = observedHost.isLoading;
  const hostRiskScoreStateFromEntityStore = useMemo(
    () =>
      entityStoreV2Enabled && observedHost.entityRecord
        ? buildRiskScoreStateFromEntityRecord(EntityType.host, observedHost.entityRecord, {
            refetch: observedHost.refetchEntityStore ?? (() => {}),
            isLoading: observedHost.isLoading,
            error: null,
            inspect: hostEntityFromStoreResult?.inspect,
          })
        : undefined,
    [
      entityStoreV2Enabled,
      observedHost.entityRecord,
      observedHost.refetchEntityStore,
      observedHost.isLoading,
      hostEntityFromStoreResult?.inspect,
    ]
  );
  const effectiveRiskScoreState = useMemo(
    () =>
      hostRiskScoreStateFromEntityStore ??
      (riskScoreStateFromApi.data?.length ? riskScoreStateFromApi : undefined),
    [hostRiskScoreStateFromEntityStore, riskScoreStateFromApi]
  );

  const isRiskScoreExist =
    entityStoreV2Enabled && observedHost.entityRecord
      ? !!getRiskFromEntityRecord(observedHost.entityRecord)?.calculated_level
      : !!hostRiskData?.host?.risk;

  const hostInsightsIdentityFields = useMemo(() => {
    const legacyFields =
      hostName != null && hostName !== '' ? { 'host.name': hostName } : ({} as IdentityFields);
    if (!entityStoreV2Enabled) {
      return legacyFields;
    }
    return mergeLegacyIdentityWhenStoreEntityMissing(
      hostIdentityFieldsForStore ?? {},
      legacyFields
    );
  }, [entityStoreV2Enabled, hostIdentityFieldsForStore, hostName]);

  const { hasNonClosedAlerts } = useNonClosedAlerts({
    identityFields: hostInsightsIdentityFields,
    entityType: EntityType.host,
    to,
    from,
    queryId: 'HostEntityOverview',
  });

  const hostEuidIdentityDoc = observedHost.entityRecord ?? hostInsightsIdentityFields;
  const { hasMisconfigurationFindings } = useHasMisconfigurations(
    buildEuidCspPreviewOptions('host', hostEuidIdentityDoc, euidApi, {
      entityStoreV2Enabled,
      legacyIdentityFields: hostInsightsIdentityFields,
    })
  );
  const { hasVulnerabilitiesFindings } = useHasVulnerabilities(
    buildEuidCspPreviewOptions('host', hostEuidIdentityDoc, euidApi, {
      entityStoreV2Enabled,
      legacyIdentityFields: hostInsightsIdentityFields,
    })
  );

  const openDetailsPanel = useNavigateToHostDetails({
    hostName,
    entityId,
    scopeId,
    isRiskScoreExist,
    hasMisconfigurationFindings,
    hasVulnerabilitiesFindings,
    hasNonClosedAlerts,
    isPreviewMode: true, // setting to true to always open a new host flyout
    contextID: HOST_DETAILS_INSIGHTS_ID,
  });

  const {
    loading: isRelatedUsersLoading,
    inspect: inspectRelatedUsers,
    relatedUsers,
    totalCount,
    refetch: refetchRelatedUsers,
  } = useHostRelatedUsers({
    hostName,
    entityId,
    indexNames: relatedUsersIndexNames,
    from: timestamp, // related users are users who were successfully authenticated onto this host AFTER alert time
    skip:
      (entityStoreV2Enabled && spaceId == null) ||
      (!entityStoreV2Enabled && selectedPatterns.length === 0),
  });

  const relatedUsersColumns: Array<EuiBasicTableColumn<RelatedUser>> = useMemo(
    () => [
      {
        field: 'user',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.left.insights.entities.relatedUsersNameColumnLabel"
            defaultMessage="Name"
          />
        ),
        render: (user: string) => (
          <EuiText grow={false} size="xs">
            <EntityCellActions field={USER_NAME_FIELD_NAME} value={user}>
              <PreviewLink
                field={USER_NAME_FIELD_NAME}
                value={user}
                entityId={entityId}
                scopeId={scopeId}
                data-test-subj={HOST_DETAILS_RELATED_USERS_LINK_TEST_ID}
              />
            </EntityCellActions>
          </EuiText>
        ),
      },
      {
        field: 'ip',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.left.insights.entities.relatedUsersIpColumnLabel"
            defaultMessage="Ip addresses"
          />
        ),
        render: (ips: string[]) => {
          return (
            <DefaultFieldRenderer
              rowItems={toFieldRendererItems(ips)}
              attrName={HOST_IP_FIELD_NAME}
              idPrefix={''}
              render={(ip) =>
                ip == null ? (
                  getEmptyTagValue()
                ) : (
                  <PreviewLink
                    field="host.ip"
                    value={ip}
                    scopeId={scopeId}
                    data-test-subj={HOST_DETAILS_RELATED_USERS_IP_LINK_TEST_ID}
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
              name: ENTITY_RISK_LEVEL(EntityType.user),
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

  const relatedUsersCount = useMemo(
    () => (
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="user" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xxxs">
            <EuiText>
              <FormattedMessage
                id="xpack.securitySolution.flyout.left.insights.entities.relatedUsersCountLabel"
                defaultMessage="Related users: {count}"
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

  const hostLink = useMemo(
    () => ({
      callback: openHostPreview,
      tooltip: i18n.translate(
        'xpack.securitySolution.flyout.left.insights.entities.host.hostPreviewTitle',
        { defaultMessage: 'Preview host' }
      ),
    }),
    [openHostPreview]
  );

  return (
    <ExpandablePanel
      header={{
        title: hostName,
        iconType: 'storage',
        headerContent: relatedUsersCount,
        link: hostLink,
      }}
      expand={{ expandable: true, expandedOnFirstRender }}
      data-test-subj={HOST_DETAILS_TEST_ID}
    >
      <EuiTitle size="xxs">
        <h4>
          <FormattedMessage
            id="xpack.securitySolution.flyout.left.insights.entities.hostDetailsInfoTitle"
            defaultMessage="Host information"
          />
        </h4>
      </EuiTitle>
      <EuiSpacer size="s" />
      <AnomalyTableProvider
        criteriaFields={hostToCriteria({
          hostItem: hostDetails,
          euid: euidApi?.euid,
          entityRecord: entityStoreV2Enabled ? hostEntityFromStoreResult?.entityRecord : undefined,
        })}
        startDate={from}
        endDate={to}
        skip={isInitializing}
      >
        {({ isLoadingAnomaliesData, anomaliesData, jobNameById }) => (
          <HostOverviewManage
            id={hostDetailsQueryId}
            hostName={hostName}
            data={hostDetails}
            indexNames={securityDefaultPatterns}
            jobNameById={jobNameById}
            anomaliesData={anomaliesData}
            isLoadingAnomaliesData={isLoadingAnomaliesData}
            isInDetailsSidePanel={false}
            loading={isHostLoading}
            startDate={from}
            endDate={to}
            narrowDateRange={narrowDateRange}
            setQuery={setQuery}
            refetch={
              entityStoreV2Enabled
                ? observedHost.refetchEntityStore ?? (() => {})
                : observedHost.refetchObservedDetails ?? (() => {})
            }
            inspect={
              entityStoreV2Enabled
                ? hostEntityFromStoreResult?.inspect
                : observedHost.observedDetailsInspect
            }
            deleteQuery={deleteQuery}
            scopeId={scopeId}
            isFlyoutOpen={true}
            riskScoreState={effectiveRiskScoreState}
            firstSeenFromEntityStore={
              entityStoreV2Enabled ? observedHost.firstSeen?.date ?? undefined : undefined
            }
            lastSeenFromEntityStore={
              entityStoreV2Enabled ? observedHost.lastSeen?.date ?? undefined : undefined
            }
            showInspectButtonAlways={true}
          />
        )}
      </AnomalyTableProvider>
      <EuiSpacer size="s" />

      <EuiHorizontalRule margin="s" />
      <EuiFlexGrid responsive={false} columns={3} gutterSize="xl">
        <AlertCountInsight
          entityRecord={observedHost.entityRecord}
          identityFields={hostInsightsIdentityFields}
          entityType={EntityType.host}
          queryId={`${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}-document-details-host-entities`}
          direction="column"
          onShowAlertCountDetails={() =>
            openDetailsPanel({
              tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
              subTab: CspInsightLeftPanelSubTab.ALERTS,
            })
          }
          data-test-subj={HOST_DETAILS_ALERT_COUNT_TEST_ID}
        />
        <MisconfigurationsInsight
          identityFields={hostInsightsIdentityFields}
          direction="column"
          onShowMisconfigurationsDetails={() =>
            openDetailsPanel({
              tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
              subTab: CspInsightLeftPanelSubTab.MISCONFIGURATIONS,
            })
          }
          data-test-subj={HOST_DETAILS_MISCONFIGURATIONS_TEST_ID}
          telemetryKey={MISCONFIGURATION_INSIGHT_HOST_DETAILS}
        />
        <VulnerabilitiesInsight
          identityFields={hostInsightsIdentityFields}
          direction="column"
          onShowVulnerabilitiesDetails={() =>
            openDetailsPanel({
              tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
              subTab: CspInsightLeftPanelSubTab.VULNERABILITIES,
            })
          }
          data-test-subj={HOST_DETAILS_VULNERABILITIES_TEST_ID}
          telemetryKey={VULNERABILITIES_INSIGHT_HOST_DETAILS}
        />
      </EuiFlexGrid>
      <EuiSpacer size="l" />
      <EuiPanel hasBorder={true}>
        <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiTitle size="xxs">
              <h4>
                <FormattedMessage
                  id="xpack.securitySolution.flyout.left.insights.entities.relatedUsersTitle"
                  defaultMessage="Related users"
                />
              </h4>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiIconTip
              content={
                <FormattedMessage
                  id="xpack.securitySolution.flyout.left.insights.entities.relatedUsersTooltip"
                  defaultMessage="After this event, these users logged into {hostName}. Check if this activity is normal."
                  values={{ hostName }}
                />
              }
              type="info"
              color="subdued"
              anchorClassName="eui-alignTop"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <RelatedUsersManage
          id={relatedUsersQueryId}
          inspect={inspectRelatedUsers}
          loading={isRelatedUsersLoading}
          setQuery={setQuery}
          deleteQuery={deleteQuery}
          refetch={refetchRelatedUsers}
        >
          <EuiInMemoryTable
            columns={relatedUsersColumns}
            items={relatedUsers}
            loading={isRelatedUsersLoading}
            data-test-subj={HOST_DETAILS_RELATED_USERS_TABLE_TEST_ID}
            pagination={pagination}
            tableCaption={i18n.translate(
              'xpack.securitySolution.flyout.left.insights.entities.relatedUsersTableCaption',
              {
                defaultMessage: 'Related users list',
              }
            )}
            noItemsMessage={
              <FormattedMessage
                id="xpack.securitySolution.flyout.left.insights.entities.relatedUsersNoDataDescription"
                defaultMessage="No users identified"
              />
            }
          />
          <InspectButton
            queryId={relatedUsersQueryId}
            title={
              <FormattedMessage
                id="xpack.securitySolution.flyout.left.insights.entities.relatedUsersInspectButtonTitle"
                defaultMessage="Related users"
              />
            }
            inspectIndex={0}
          />
        </RelatedUsersManage>
      </EuiPanel>
    </ExpandablePanel>
  );
};

HostDetails.displayName = 'HostDetails';
