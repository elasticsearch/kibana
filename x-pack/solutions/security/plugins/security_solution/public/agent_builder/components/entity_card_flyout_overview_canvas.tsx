/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { ISessionService } from '@kbn/data-plugin/public';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { useHasMisconfigurations } from '@kbn/cloud-security-posture/src/hooks/use_has_misconfigurations';
import { useHasVulnerabilities } from '@kbn/cloud-security-posture/src/hooks/use_has_vulnerabilities';
import { EuiSpacer } from '@elastic/eui';
import { noop } from 'lodash/fp';
import { useUpdateAssetCriticality } from '../../entity_analytics/api/hooks/use_update_asset_criticality';
import { buildEuidCspPreviewOptions } from '../../cloud_security_posture/utils/build_euid_csp_preview_options';
import { useNonClosedAlerts } from '../../cloud_security_posture/hooks/use_non_closed_alerts';
import { DETECTION_RESPONSE_ALERTS_BY_STATUS_ID } from '../../overview/components/detection_response/alerts_by_status/types';
import { useRefetchQueryById } from '../../entity_analytics/api/hooks/use_refetch_query_by_id';
import { RISK_INPUTS_TAB_QUERY_ID } from '../../entity_analytics/components/entity_details_flyout/tabs/risk_inputs/risk_inputs_tab';
import type { Refetch } from '../../common/types';
import { useCalculateEntityRiskScore } from '../../entity_analytics/api/hooks/use_calculate_entity_risk_score';
import { useRiskScore } from '../../entity_analytics/api/hooks/use_risk_score';
import { useQueryInspector } from '../../common/components/page/manage_query';
import { useGlobalTime } from '../../common/containers/use_global_time';
import {
  buildEntityNameFilter,
  buildHostNamesFilter,
  buildUserNamesFilter,
  EntityType as SearchEntityType,
  type EntityRiskScore,
  type RiskSeverity,
  type RiskStats,
} from '../../../common/search_strategy';
import { useKibana } from '../../common/lib/kibana';
import { HostPanelContent } from '../../flyout/entity_details/host_right/content';
import { HostPanelHeader } from '../../flyout/entity_details/host_right/header';
import { useObservedHost } from '../../flyout/entity_details/host_right/hooks/use_observed_host';
import { EntityType } from '../../../common/entity_analytics/types';
import {
  buildRiskScoreStateFromEntityRecord,
  getRiskFromEntityRecord,
} from '../../flyout/entity_details/shared/entity_store_risk_utils';
import { useEntityFromStore } from '../../flyout/entity_details/shared/hooks/use_entity_from_store';
import type { CriticalityLevelWithUnassigned } from '../../../common/entity_analytics/asset_criticality/types';
import {
  mergeLegacyIdentityWhenStoreEntityMissing,
  type IdentityFields,
} from '../../flyout/document_details/shared/utils';
import { HOST_PANEL_RISK_SCORE_QUERY_ID } from '../../flyout/entity_details/host_right/constants';
import { FlyoutBody } from '../../flyout/shared/components/flyout_body';
import {
  useEntityPanelTabs,
  TABLE_TAB_ID,
} from '../../flyout/entity_details/shared/hooks/use_entity_panel_tabs';
import { EntityPanelHeaderTabs } from '../../flyout/entity_details/shared/components/entity_panel_tabs';
import { EntityStoreTableTab } from '../../flyout/entity_details/shared/components/entity_store_table_tab';
import { EntitySummaryGrid } from '../../flyout/entity_details/shared/components/entity_summary_grid';
import { HostDetailsPanelKey } from '../../flyout/entity_details/host_details_left';
import {
  HostPanelKey,
  ServicePanelKey,
  UserPanelKey,
} from '../../flyout/entity_details/shared/constants';
import type { EntityDetailsPath } from '../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { EntityEventTypes } from '../../common/lib/telemetry';
import { UserPanelContent } from '../../flyout/entity_details/user_right/content';
import { UserPanelHeader } from '../../flyout/entity_details/user_right/header';
import { useObservedUser } from '../../flyout/entity_details/user_right/hooks/use_observed_user';
import { useManagedUser } from '../../flyout/entity_details/shared/hooks/use_managed_user';
import { USER_PANEL_RISK_SCORE_QUERY_ID } from '../../flyout/entity_details/user_right/constants';
import { UserDetailsPanelKey } from '../../flyout/entity_details/user_details_left';
import { ServicePanelContent } from '../../flyout/entity_details/service_right/content';
import { ServicePanelHeader } from '../../flyout/entity_details/service_right/header';
import { useObservedService } from '../../flyout/entity_details/service_right/hooks/use_observed_service';
import { ServiceDetailsPanelKey } from '../../flyout/entity_details/service_details_left';
import { SERVICE_PANEL_RISK_SCORE_QUERY_ID } from '../../flyout/entity_details/service_right';
import type { ESQuery } from '../../../common/typed_json';
import { FlyoutLoading } from '../../flyout_v2/shared/components/flyout_loading';
import { APP_UI_ID } from '../../../common/constants';
import type {
  EntityAttachmentIdentifier,
  EntityAttachmentRiskStats,
} from '../attachment_types/entity_attachment/types';
import { useEntityForAttachment } from '../attachment_types/entity_attachment/use_entity_for_attachment';
import {
  getHostNameForHostDetailsUrl,
  getServiceNameForServiceDetailsUrl,
  getUserNameForUserDetailsUrl,
  navigateToEntityAnalyticsWithFlyoutInApp,
  type SecurityAgentBuilderChrome,
} from '../attachment_types/entity_explore_navigation';
import type { RiskScoreState } from '../../entity_analytics/api/hooks/use_risk_score';

const AGENT_BUILDER_ENTITY_CARD_SCOPE = 'agent-builder-entity-card';

const FIRST_RECORD_PAGINATION = {
  cursorStart: 0,
  querySize: 1,
};

/**
 * Builds a {@link RiskScoreState} directly from the rich `EntityAttachmentRiskStats`
 * payload embedded by the server-side `security.get_entity` tool. The attachment
 * payload carries the same field set as a risk-index document (category_1_score,
 * category_1_count, category_2_score, modifiers, …) — far richer than the entity
 * store's summary `entity.risk` (which only has `calculated_level`/`calculated_score`/
 * `calculated_score_norm`). Mirrors how the inline `EntityCard` consumes
 * `attachmentRiskStats` so the Preview Only flyout's `FlyoutRiskSummary` shows the
 * same Alerts/Asset Criticality/Watchlists/Result rows the chat card already does
 * (instead of the all-zero stub `buildRiskScoreStateFromEntityRecord` produces when
 * the entity store record lacks category breakdowns).
 */
const buildEntityRiskScoreFromAttachmentRiskStats = <T extends EntityType>(
  entityType: T,
  attachmentRiskStats: EntityAttachmentRiskStats,
  entityName: string
): EntityRiskScore<T> => {
  const riskStats = {
    ...attachmentRiskStats,
    rule_risks: [],
    multipliers: [],
  } as unknown as RiskStats;

  return {
    '@timestamp': attachmentRiskStats['@timestamp'] ?? new Date().toISOString(),
    [entityType]: { name: entityName, risk: riskStats },
  } as unknown as EntityRiskScore<T>;
};

const buildRiskScoreStateFromAttachmentRiskStats = <T extends EntityType>(
  entityType: T,
  attachmentRiskStats: EntityAttachmentRiskStats,
  entityName: string
): RiskScoreState<T> => {
  const dataItem = buildEntityRiskScoreFromAttachmentRiskStats(
    entityType,
    attachmentRiskStats,
    entityName
  );

  return {
    data: [dataItem] as RiskScoreState<T>['data'],
    inspect: { dsl: [], response: [] },
    isInspected: false,
    refetch: () => {},
    totalCount: 1,
    isAuthorized: true,
    hasEngineBeenInstalled: true,
    loading: false,
    error: null,
  };
};

const useOpenHostInvestigationInEntityAnalytics = ({
  application,
  agentBuilder,
  chrome,
  openSidebarConversation,
  hostName,
  entityIdForPanels,
  scopeId,
  safeContextID,
  isRiskScoreExist,
  hasMisconfigurationFindings,
  hasVulnerabilitiesFindings,
  hasNonClosedAlerts,
  entityStoreEntityId,
  searchSession,
}: {
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  openSidebarConversation?: () => void;
  hostName: string;
  entityIdForPanels?: string;
  scopeId: string;
  safeContextID: string;
  isRiskScoreExist: boolean;
  hasMisconfigurationFindings: boolean;
  hasVulnerabilitiesFindings: boolean;
  hasNonClosedAlerts: boolean;
  entityStoreEntityId?: string;
  searchSession?: ISessionService;
}): ((path?: EntityDetailsPath) => void) => {
  const { telemetry } = useKibana().services;

  return useCallback(
    (path?: EntityDetailsPath) => {
      telemetry.reportEvent(EntityEventTypes.RiskInputsExpandedFlyoutOpened, {
        entity: SearchEntityType.host,
      });
      navigateToEntityAnalyticsWithFlyoutInApp({
        application,
        appId: APP_UI_ID,
        agentBuilder,
        chrome,
        openSidebarConversation,
        searchSession,
        flyout: {
          preview: [],
          left: {
            id: HostDetailsPanelKey,
            params: {
              entityId: entityIdForPanels,
              hostName,
              scopeId,
              isRiskScoreExist,
              path,
              hasMisconfigurationFindings,
              hasVulnerabilitiesFindings,
              hasNonClosedAlerts,
              entityStoreEntityId,
            },
          },
          right: {
            id: HostPanelKey,
            params: {
              contextID: safeContextID,
              scopeId,
              hostName,
              entityId: entityIdForPanels,
            },
          },
        },
      });
    },
    [
      application,
      agentBuilder,
      chrome,
      openSidebarConversation,
      entityIdForPanels,
      hasMisconfigurationFindings,
      hasNonClosedAlerts,
      hasVulnerabilitiesFindings,
      hostName,
      isRiskScoreExist,
      safeContextID,
      scopeId,
      entityStoreEntityId,
      searchSession,
      telemetry,
    ]
  );
};

const HostEntityFlyoutOverviewCanvas: React.FC<{
  hostName: string;
  entityId?: string;
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  openSidebarConversation?: () => void;
  searchSession?: ISessionService;
  attachmentRiskStats?: EntityAttachmentRiskStats;
  attachmentResolutionRiskStats?: EntityAttachmentRiskStats;
}> = ({
  hostName,
  entityId,
  application,
  agentBuilder,
  chrome,
  openSidebarConversation,
  searchSession,
  attachmentRiskStats,
  attachmentResolutionRiskStats,
}) => {
  const euidApi = useEntityStoreEuidApi();

  const safeContextID = AGENT_BUILDER_ENTITY_CARD_SCOPE;
  const scopeId = AGENT_BUILDER_ENTITY_CARD_SCOPE;
  const isPreviewMode = false;

  const { to, from, setQuery, deleteQuery, isInitializing } = useGlobalTime();

  const hostStoreIdentityFields = useMemo(
    () => (!entityId && hostName ? { 'host.name': hostName } : undefined),
    [entityId, hostName]
  );

  const entityFromStoreResult = useEntityFromStore({
    entityId,
    identityFields: hostStoreIdentityFields,
    entityType: 'host',
    skip: isInitializing,
  });

  const documentEntityIdentifiers = useMemo<IdentityFields>(() => {
    const legacyFields =
      hostName != null && hostName !== '' ? { 'host.name': hostName } : ({} as IdentityFields);
    const fromStore =
      euidApi?.euid?.getEntityIdentifiersFromDocument('host', entityFromStoreResult.entityRecord) ??
      {};
    return mergeLegacyIdentityWhenStoreEntityMissing(fromStore, legacyFields);
  }, [euidApi?.euid, entityFromStoreResult.entityRecord, hostName]);

  const hostNameFilterQuery = useMemo(
    () => (hostName ? buildHostNamesFilter([hostName]) : undefined),
    [hostName]
  );

  const observedHost = useObservedHost(hostName, scopeId, entityFromStoreResult);

  const riskScoreState = useRiskScore({
    riskEntity: EntityType.host,
    filterQuery: hostNameFilterQuery,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: !!observedHost?.entityRecord,
  });

  const { inspect, refetch, loading } = riskScoreState;
  const { data: hostRisk } = riskScoreState;
  const hostRiskData = hostRisk && hostRisk.length > 0 ? hostRisk[0] : undefined;

  const refetchRiskInputsTab = useRefetchQueryById(RISK_INPUTS_TAB_QUERY_ID);
  const refetchRiskScore = useCallback(() => {
    refetch();
    (refetchRiskInputsTab as Refetch | null)?.();
  }, [refetch, refetchRiskInputsTab]);

  const { isLoading: recalculatingScore, calculateEntityRiskScore } = useCalculateEntityRiskScore(
    EntityType.host,
    hostName,
    { onSuccess: refetchRiskScore }
  );

  const { updateAssetCriticalityLevel } = useUpdateAssetCriticality('host', {
    onSuccess: calculateEntityRiskScore,
  });

  const { hasMisconfigurationFindings } = useHasMisconfigurations(
    buildEuidCspPreviewOptions('host', entityFromStoreResult.entityRecord, euidApi, {
      legacyIdentityFields:
        hostName != null && hostName !== '' ? { 'host.name': hostName } : undefined,
    })
  );

  const { hasVulnerabilitiesFindings } = useHasVulnerabilities(
    buildEuidCspPreviewOptions('host', entityFromStoreResult.entityRecord, euidApi, {
      legacyIdentityFields:
        hostName != null && hostName !== '' ? { 'host.name': hostName } : undefined,
    })
  );
  const { hasNonClosedAlerts } = useNonClosedAlerts({
    identityFields: documentEntityIdentifiers,
    entityType: EntityType.host,
    to,
    from,
    queryId: `${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}HOST_NAME_RIGHT`,
  });

  const panelDisplayEntityId = observedHost.entityRecord?.entity?.id;

  const hasEntityStoreRecord = observedHost.entityRecord != null;

  useQueryInspector({
    deleteQuery,
    inspect: hasEntityStoreRecord ? entityFromStoreResult?.inspect ?? null : inspect,
    loading: hasEntityStoreRecord ? entityFromStoreResult?.isLoading ?? false : loading,
    queryId: HOST_PANEL_RISK_SCORE_QUERY_ID,
    refetch: hasEntityStoreRecord ? entityFromStoreResult?.refetch ?? (() => {}) : refetch,
    setQuery,
  });

  const riskScoreStateFromStore = observedHost.entityRecord
    ? buildRiskScoreStateFromEntityRecord(EntityType.host, observedHost.entityRecord, {
        refetch: observedHost.refetchEntityStore ?? (() => {}),
        isLoading: observedHost.isLoading,
        error: null,
        inspect: entityFromStoreResult?.inspect,
      })
    : null;

  const riskScoreStateFromAttachment = useMemo(
    () =>
      attachmentRiskStats
        ? buildRiskScoreStateFromAttachmentRiskStats(EntityType.host, attachmentRiskStats, hostName)
        : null,
    [attachmentRiskStats, hostName]
  );

  const prefetchedResolutionRisk = useMemo(
    () =>
      attachmentResolutionRiskStats
        ? buildEntityRiskScoreFromAttachmentRiskStats(
            EntityType.host,
            attachmentResolutionRiskStats,
            hostName
          )
        : undefined,
    [attachmentResolutionRiskStats, hostName]
  );

  const effectiveRiskScoreState =
    riskScoreStateFromAttachment ?? riskScoreStateFromStore ?? riskScoreState;
  const isRiskScoreExist =
    riskScoreStateFromAttachment != null ||
    (observedHost.entityRecord
      ? !!getRiskFromEntityRecord(observedHost.entityRecord)
      : !!hostRiskData?.host?.risk);

  const onCriticalitySave =
    entityFromStoreResult.entityRecord && observedHost.entityRecord
      ? (level: CriticalityLevelWithUnassigned) =>
          updateAssetCriticalityLevel(level, observedHost.entityRecord)
      : undefined;

  const entityStoreEntityId = observedHost.entityRecord?.entity?.id;

  const openDetailsPanel = useOpenHostInvestigationInEntityAnalytics({
    application,
    agentBuilder,
    chrome,
    openSidebarConversation,
    hostName,
    entityIdForPanels: panelDisplayEntityId,
    scopeId,
    safeContextID,
    isRiskScoreExist,
    hasMisconfigurationFindings,
    hasVulnerabilitiesFindings,
    hasNonClosedAlerts,
    entityStoreEntityId,
    searchSession,
  });

  const noEntityInStore = !entityFromStoreResult.isLoading && !observedHost.entityRecord;

  const { tabs, selectedTabId, setSelectedTabId } = useEntityPanelTabs({
    entityRecord: observedHost.entityRecord ?? null,
  });

  const tabsNode = tabs ? (
    <EntityPanelHeaderTabs
      tabs={tabs}
      selectedTabId={selectedTabId}
      setSelectedTabId={setSelectedTabId}
    />
  ) : undefined;

  return (
    <>
      <HostPanelHeader
        hostName={hostName}
        lastSeen={observedHost.lastSeen}
        entityId={panelDisplayEntityId}
        identityFields={documentEntityIdentifiers}
        isEntityInStore={!!observedHost.entityRecord}
        riskLevel={
          observedHost.entityRecord
            ? ((getRiskFromEntityRecord(observedHost.entityRecord)?.calculated_level ??
                'Unknown') as RiskSeverity)
            : undefined
        }
      />
      <FlyoutBody>
        {observedHost.entityRecord && (
          <EntitySummaryGrid
            entityRecord={observedHost.entityRecord}
            criticalityLevel={entityFromStoreResult.entityRecord?.asset?.criticality}
            onCriticalitySave={onCriticalitySave}
          />
        )}
        {tabsNode}
        {tabs && <EuiSpacer size="l" />}
        {tabs && selectedTabId === TABLE_TAB_ID && observedHost.entityRecord ? (
          <EntityStoreTableTab entityRecord={observedHost.entityRecord} />
        ) : (
          <HostPanelContent
            identityFields={documentEntityIdentifiers}
            observedHost={observedHost}
            riskScoreState={effectiveRiskScoreState}
            contextID={safeContextID}
            scopeId={scopeId}
            openDetailsPanel={openDetailsPanel}
            recalculatingScore={recalculatingScore}
            onAssetCriticalityChange={calculateEntityRiskScore}
            isPreviewMode={isPreviewMode}
            entityRecord={observedHost.entityRecord ?? undefined}
            skipRiskAndCriticality={noEntityInStore}
            entityStoreEntityId={entityStoreEntityId}
            prefetchedResolutionRisk={prefetchedResolutionRisk}
          />
        )}
      </FlyoutBody>
    </>
  );
};

const useOpenUserInvestigationInEntityAnalytics = ({
  application,
  agentBuilder,
  chrome,
  openSidebarConversation,
  userName,
  entityIdForPanels,
  identityFields,
  scopeId,
  safeContextID,
  isRiskScoreExist,
  hasMisconfigurationFindings,
  hasNonClosedAlerts,
  entityStoreEntityId,
  searchSession,
}: {
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  openSidebarConversation?: () => void;
  userName: string;
  entityIdForPanels?: string;
  identityFields: IdentityFields;
  scopeId: string;
  safeContextID: string;
  isRiskScoreExist: boolean;
  hasMisconfigurationFindings: boolean;
  hasNonClosedAlerts: boolean;
  entityStoreEntityId?: string;
  searchSession?: ISessionService;
}): ((path: EntityDetailsPath) => void) => {
  const { telemetry } = useKibana().services;

  return useCallback(
    (path: EntityDetailsPath) => {
      telemetry.reportEvent(EntityEventTypes.RiskInputsExpandedFlyoutOpened, {
        entity: SearchEntityType.user,
      });
      navigateToEntityAnalyticsWithFlyoutInApp({
        application,
        appId: APP_UI_ID,
        agentBuilder,
        chrome,
        openSidebarConversation,
        searchSession,
        flyout: {
          preview: [],
          left: {
            id: UserDetailsPanelKey,
            params: {
              userName,
              identityFields,
              isRiskScoreExist,
              scopeId,
              path,
              entityId: entityIdForPanels,
              hasMisconfigurationFindings,
              hasNonClosedAlerts,
              entityStoreEntityId,
            },
          },
          right: {
            id: UserPanelKey,
            params: {
              contextID: safeContextID,
              userName,
              identityFields,
              entityId: entityIdForPanels,
              scopeId,
            },
          },
        },
      });
    },
    [
      application,
      agentBuilder,
      chrome,
      openSidebarConversation,
      entityIdForPanels,
      hasMisconfigurationFindings,
      hasNonClosedAlerts,
      identityFields,
      isRiskScoreExist,
      safeContextID,
      scopeId,
      entityStoreEntityId,
      searchSession,
      telemetry,
      userName,
    ]
  );
};

const UserEntityFlyoutOverviewCanvas: React.FC<{
  userName: string;
  entityId?: string;
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  openSidebarConversation?: () => void;
  searchSession?: ISessionService;
  attachmentRiskStats?: EntityAttachmentRiskStats;
  attachmentResolutionRiskStats?: EntityAttachmentRiskStats;
}> = ({
  userName,
  entityId: entityIdProp,
  application,
  agentBuilder,
  chrome,
  openSidebarConversation,
  searchSession,
  attachmentRiskStats,
  attachmentResolutionRiskStats,
}) => {
  const euidApi = useEntityStoreEuidApi();

  const safeContextID = AGENT_BUILDER_ENTITY_CARD_SCOPE;
  const scopeId = AGENT_BUILDER_ENTITY_CARD_SCOPE;
  const isPreviewMode = false;

  const { to, from, setQuery, deleteQuery, isInitializing } = useGlobalTime();

  const userStoreIdentityFields = useMemo(
    () => (!entityIdProp && userName ? { 'user.name': userName } : undefined),
    [entityIdProp, userName]
  );

  const entityFromStoreResult = useEntityFromStore({
    entityId: entityIdProp,
    identityFields: userStoreIdentityFields,
    entityType: 'user',
    skip: isInitializing,
  });

  const documentEntityIdentifiers = useMemo<IdentityFields>(() => {
    const legacyFields =
      userName != null && userName !== '' ? { 'user.name': userName } : ({} as IdentityFields);
    const fromStore =
      euidApi?.euid?.getEntityIdentifiersFromDocument('user', entityFromStoreResult.entityRecord) ??
      {};
    return mergeLegacyIdentityWhenStoreEntityMissing(fromStore, legacyFields);
  }, [euidApi?.euid, entityFromStoreResult.entityRecord, userName]);

  const userNameFilterQuery = useMemo(
    () => (userName ? buildUserNamesFilter([userName]) : undefined),
    [userName]
  );
  const observedUser = useObservedUser(userName, scopeId, entityFromStoreResult);

  const panelDisplayEntityId = observedUser.entityRecord?.entity?.id;

  const riskScoreState = useRiskScore({
    riskEntity: EntityType.user,
    filterQuery: userNameFilterQuery,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: !!observedUser?.entityRecord,
  });

  const { inspect, refetch, loading } = riskScoreState;
  const managedUser = useManagedUser();

  const { data: userRisk } = riskScoreState;
  const userRiskData = userRisk && userRisk.length > 0 ? userRisk[0] : undefined;

  const refetchRiskInputsTab = useRefetchQueryById(RISK_INPUTS_TAB_QUERY_ID);
  const refetchRiskScore = useCallback(() => {
    refetch();
    (refetchRiskInputsTab as Refetch | null)?.();
  }, [refetch, refetchRiskInputsTab]);

  const { isLoading: recalculatingScore, calculateEntityRiskScore } = useCalculateEntityRiskScore(
    EntityType.user,
    userName,
    { onSuccess: refetchRiskScore }
  );

  const { updateAssetCriticalityLevel } = useUpdateAssetCriticality('user', {
    onSuccess: calculateEntityRiskScore,
  });

  const { hasMisconfigurationFindings } = useHasMisconfigurations(
    buildEuidCspPreviewOptions('user', entityFromStoreResult.entityRecord, euidApi, {
      legacyIdentityFields:
        userName != null && userName !== '' ? { 'user.name': userName } : undefined,
    })
  );

  const { hasNonClosedAlerts } = useNonClosedAlerts({
    identityFields: documentEntityIdentifiers,
    entityType: EntityType.user,
    to,
    from,
    queryId: `${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}USER_NAME_RIGHT`,
  });

  const useEntityStoreInspectForRisk = observedUser.entityRecord != null;

  useQueryInspector({
    deleteQuery,
    inspect: useEntityStoreInspectForRisk ? entityFromStoreResult?.inspect ?? null : inspect,
    loading: useEntityStoreInspectForRisk ? entityFromStoreResult?.isLoading ?? false : loading,
    queryId: USER_PANEL_RISK_SCORE_QUERY_ID,
    refetch: useEntityStoreInspectForRisk ? entityFromStoreResult?.refetch ?? (() => {}) : refetch,
    setQuery,
  });

  const isRiskScoreExist = observedUser.entityRecord
    ? !!getRiskFromEntityRecord(observedUser.entityRecord)
    : !!userRiskData?.user?.risk;

  const entityStoreEntityId = observedUser.entityRecord?.entity?.id;

  const openDetailsPanel = useOpenUserInvestigationInEntityAnalytics({
    application,
    agentBuilder,
    chrome,
    openSidebarConversation,
    userName,
    entityIdForPanels: panelDisplayEntityId,
    identityFields: documentEntityIdentifiers,
    scopeId,
    safeContextID,
    isRiskScoreExist,
    hasMisconfigurationFindings,
    hasNonClosedAlerts,
    entityStoreEntityId,
    searchSession,
  });

  const riskScoreStateFromStore = observedUser.entityRecord
    ? buildRiskScoreStateFromEntityRecord(EntityType.user, observedUser.entityRecord, {
        refetch: observedUser.refetchEntityStore ?? (() => {}),
        isLoading: observedUser.isLoading,
        error: null,
        inspect: entityFromStoreResult?.inspect,
      })
    : null;

  const riskScoreStateFromAttachment = useMemo(
    () =>
      attachmentRiskStats
        ? buildRiskScoreStateFromAttachmentRiskStats(EntityType.user, attachmentRiskStats, userName)
        : null,
    [attachmentRiskStats, userName]
  );

  const prefetchedResolutionRisk = useMemo(
    () =>
      attachmentResolutionRiskStats
        ? buildEntityRiskScoreFromAttachmentRiskStats(
            EntityType.user,
            attachmentResolutionRiskStats,
            userName
          )
        : undefined,
    [attachmentResolutionRiskStats, userName]
  );

  const effectiveRiskScoreState =
    riskScoreStateFromAttachment ?? riskScoreStateFromStore ?? riskScoreState;

  const onCriticalitySave = entityFromStoreResult.entityRecord
    ? (level: CriticalityLevelWithUnassigned) =>
        updateAssetCriticalityLevel(level, entityFromStoreResult.entityRecord)
    : undefined;

  const entityStoreLookupRequested =
    Boolean(entityIdProp) ||
    Boolean(userStoreIdentityFields && Object.keys(userStoreIdentityFields).length > 0);

  const noEntityInStore =
    entityStoreLookupRequested &&
    !entityFromStoreResult.isLoading &&
    !entityFromStoreResult.entityRecord;

  const { tabs, selectedTabId, setSelectedTabId } = useEntityPanelTabs({
    entityRecord: entityFromStoreResult.entityRecord ?? null,
  });

  const tabsNode = tabs ? (
    <EntityPanelHeaderTabs
      tabs={tabs}
      selectedTabId={selectedTabId}
      setSelectedTabId={setSelectedTabId}
    />
  ) : undefined;

  return (
    <>
      <UserPanelHeader
        lastSeen={observedUser.lastSeen}
        managedUser={managedUser}
        userName={userName}
        entityId={panelDisplayEntityId}
        identityFields={documentEntityIdentifiers}
        isEntityInStore={!!entityFromStoreResult.entityRecord}
        riskLevel={
          entityFromStoreResult.entityRecord
            ? ((getRiskFromEntityRecord(entityFromStoreResult.entityRecord)?.calculated_level ??
                'Unknown') as RiskSeverity)
            : undefined
        }
      />
      <FlyoutBody>
        {entityFromStoreResult.entityRecord && (
          <EntitySummaryGrid
            entityRecord={entityFromStoreResult.entityRecord}
            criticalityLevel={entityFromStoreResult.entityRecord?.asset?.criticality}
            onCriticalitySave={onCriticalitySave}
          />
        )}
        {tabsNode}
        {tabs && <EuiSpacer size="l" />}
        {tabs && selectedTabId === TABLE_TAB_ID && entityFromStoreResult.entityRecord ? (
          <EntityStoreTableTab entityRecord={entityFromStoreResult.entityRecord} />
        ) : (
          <UserPanelContent
            observedUser={observedUser}
            riskScoreState={effectiveRiskScoreState}
            recalculatingScore={recalculatingScore}
            onAssetCriticalityChange={calculateEntityRiskScore}
            contextID={safeContextID}
            scopeId={scopeId}
            openDetailsPanel={openDetailsPanel}
            isPreviewMode={isPreviewMode}
            identityFields={documentEntityIdentifiers}
            entityRecord={observedUser.entityRecord ?? undefined}
            skipRiskAndCriticality={noEntityInStore}
            entityStoreEntityId={entityStoreEntityId}
            prefetchedResolutionRisk={prefetchedResolutionRisk}
          />
        )}
      </FlyoutBody>
    </>
  );
};

const useOpenServiceInvestigationInEntityAnalytics = ({
  application,
  agentBuilder,
  chrome,
  openSidebarConversation,
  serviceName,
  entityId,
  identityFields,
  scopeId,
  safeContextID,
  isRiskScoreExist,
  entityStoreEntityId,
  searchSession,
}: {
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  openSidebarConversation?: () => void;
  serviceName: string;
  entityId: string;
  identityFields: IdentityFields;
  scopeId: string;
  safeContextID: string;
  isRiskScoreExist: boolean;
  entityStoreEntityId?: string;
  searchSession?: ISessionService;
}): ((path: EntityDetailsPath) => void) => {
  const { telemetry } = useKibana().services;

  return useCallback(
    (path: EntityDetailsPath) => {
      telemetry.reportEvent(EntityEventTypes.RiskInputsExpandedFlyoutOpened, {
        entity: SearchEntityType.service,
      });
      navigateToEntityAnalyticsWithFlyoutInApp({
        application,
        appId: APP_UI_ID,
        agentBuilder,
        chrome,
        openSidebarConversation,
        searchSession,
        flyout: {
          preview: [],
          left: {
            id: ServiceDetailsPanelKey,
            params: {
              isRiskScoreExist,
              identityFields,
              scopeId,
              entityId,
              serviceName,
              entityStoreEntityId,
              path,
            },
          },
          right: {
            id: ServicePanelKey,
            params: {
              contextID: safeContextID,
              scopeId,
              entityId,
              serviceName,
            },
          },
        },
      });
    },
    [
      application,
      agentBuilder,
      chrome,
      openSidebarConversation,
      entityId,
      entityStoreEntityId,
      identityFields,
      isRiskScoreExist,
      safeContextID,
      scopeId,
      serviceName,
      searchSession,
      telemetry,
    ]
  );
};

const ServiceEntityFlyoutOverviewCanvas: React.FC<{
  serviceName: string;
  entityId: string;
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  openSidebarConversation?: () => void;
  searchSession?: ISessionService;
  attachmentRiskStats?: EntityAttachmentRiskStats;
  attachmentResolutionRiskStats?: EntityAttachmentRiskStats;
}> = ({
  serviceName,
  entityId,
  application,
  agentBuilder,
  chrome,
  openSidebarConversation,
  searchSession,
  attachmentRiskStats,
  attachmentResolutionRiskStats,
}) => {
  const safeContextID = AGENT_BUILDER_ENTITY_CARD_SCOPE;
  const scopeId = AGENT_BUILDER_ENTITY_CARD_SCOPE;
  const isPreviewMode = false;
  const serviceStoreIdentityFields = useMemo(
    () => (!entityId && serviceName ? { 'service.name': serviceName } : undefined),
    [entityId, serviceName]
  );
  const entityFromStoreResult = useEntityFromStore({
    entityId,
    identityFields: serviceStoreIdentityFields,
    entityType: 'service',
    skip: false,
  });

  const euidApi = useEntityStoreEuidApi();
  const documentEntityIdentifiers = useMemo<IdentityFields>(() => {
    const legacyFields =
      serviceName != null && serviceName !== ''
        ? { 'service.name': serviceName }
        : ({} as IdentityFields);
    const fromStore =
      euidApi?.euid?.getEntityIdentifiersFromDocument(
        'service',
        entityFromStoreResult.entityRecord ?? {}
      ) ?? {};
    return mergeLegacyIdentityWhenStoreEntityMissing(fromStore, legacyFields);
  }, [entityFromStoreResult.entityRecord, euidApi?.euid, serviceName]);

  const serviceNameFilterQuery = useMemo(
    () => (serviceName ? buildEntityNameFilter(EntityType.service, [serviceName]) : undefined),
    [serviceName]
  );
  const observedService = useObservedService(documentEntityIdentifiers, scopeId);
  const riskScoreState = useRiskScore({
    riskEntity: EntityType.service,
    filterQuery: serviceNameFilterQuery as unknown as ESQuery | undefined,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: !!entityFromStoreResult.entityRecord,
  });

  const { inspect, refetch, loading } = riskScoreState;
  const { setQuery, deleteQuery } = useGlobalTime();
  const { data: serviceRisk } = riskScoreState;
  const serviceRiskData = serviceRisk && serviceRisk.length > 0 ? serviceRisk[0] : undefined;

  const riskScoreStateFromAttachment = useMemo(
    () =>
      attachmentRiskStats
        ? buildRiskScoreStateFromAttachmentRiskStats(
            EntityType.service,
            attachmentRiskStats,
            serviceName
          )
        : null,
    [attachmentRiskStats, serviceName]
  );

  const prefetchedResolutionRisk = useMemo(
    () =>
      attachmentResolutionRiskStats
        ? buildEntityRiskScoreFromAttachmentRiskStats(
            EntityType.service,
            attachmentResolutionRiskStats,
            serviceName
          )
        : undefined,
    [attachmentResolutionRiskStats, serviceName]
  );

  const effectiveRiskScoreState = riskScoreStateFromAttachment ?? riskScoreState;
  const isRiskScoreExist = riskScoreStateFromAttachment != null || !!serviceRiskData?.service.risk;

  const refetchRiskInputsTab = useRefetchQueryById(RISK_INPUTS_TAB_QUERY_ID) ?? noop;
  const refetchRiskScore = useCallback(() => {
    refetch();
    (refetchRiskInputsTab as Refetch)();
  }, [refetch, refetchRiskInputsTab]);

  const { isLoading: recalculatingScore, calculateEntityRiskScore } = useCalculateEntityRiskScore(
    EntityType.service,
    serviceName,
    { onSuccess: refetchRiskScore }
  );

  const { updateAssetCriticalityLevel } = useUpdateAssetCriticality('service', {
    onSuccess: calculateEntityRiskScore,
  });

  useQueryInspector({
    deleteQuery,
    inspect,
    loading,
    queryId: SERVICE_PANEL_RISK_SCORE_QUERY_ID,
    refetch,
    setQuery,
  });

  const entityStoreEntityId = entityFromStoreResult.entityRecord?.entity?.id;

  const onCriticalitySave = entityFromStoreResult.entityRecord
    ? (level: CriticalityLevelWithUnassigned) =>
        updateAssetCriticalityLevel(level, entityFromStoreResult.entityRecord)
    : undefined;

  const openDetailsPanel = useOpenServiceInvestigationInEntityAnalytics({
    application,
    agentBuilder,
    chrome,
    openSidebarConversation,
    serviceName,
    entityId,
    identityFields: documentEntityIdentifiers,
    scopeId,
    safeContextID,
    isRiskScoreExist,
    entityStoreEntityId,
    searchSession,
  });

  const { tabs, selectedTabId, setSelectedTabId } = useEntityPanelTabs({
    entityRecord: entityFromStoreResult.entityRecord ?? null,
  });

  const tabsNode = tabs ? (
    <EntityPanelHeaderTabs
      tabs={tabs}
      selectedTabId={selectedTabId}
      setSelectedTabId={setSelectedTabId}
    />
  ) : undefined;

  if (observedService.isLoading) {
    return <FlyoutLoading />;
  }

  return (
    <>
      <ServicePanelHeader
        serviceName={serviceName}
        observedService={observedService}
        isEntityInStore={!!entityFromStoreResult.entityRecord}
        riskLevel={
          entityFromStoreResult.entityRecord
            ? ((getRiskFromEntityRecord(entityFromStoreResult.entityRecord)?.calculated_level ??
                'Unknown') as RiskSeverity)
            : undefined
        }
      />
      <FlyoutBody>
        {entityFromStoreResult.entityRecord && (
          <EntitySummaryGrid
            entityRecord={entityFromStoreResult.entityRecord}
            criticalityLevel={entityFromStoreResult.entityRecord?.asset?.criticality}
            onCriticalitySave={onCriticalitySave}
          />
        )}
        {tabsNode}
        {tabs && <EuiSpacer size="l" />}
        {tabs && selectedTabId === TABLE_TAB_ID && entityFromStoreResult.entityRecord ? (
          <EntityStoreTableTab entityRecord={entityFromStoreResult.entityRecord} />
        ) : (
          <ServicePanelContent
            entityRecord={entityFromStoreResult.entityRecord ?? undefined}
            serviceName={serviceName}
            observedService={observedService}
            riskScoreState={effectiveRiskScoreState}
            recalculatingScore={recalculatingScore}
            onAssetCriticalityChange={calculateEntityRiskScore}
            contextID={safeContextID}
            scopeId={scopeId}
            openDetailsPanel={openDetailsPanel}
            isPreviewMode={isPreviewMode}
            entityStoreEntityId={entityStoreEntityId}
            prefetchedResolutionRisk={prefetchedResolutionRisk}
          />
        )}
      </FlyoutBody>
    </>
  );
};

export interface EntityCardFlyoutOverviewCanvasProps {
  /**
   * Attachment identifier emitted by the Security skill/tool. Entry component resolves the
   * canonical entity store record client-side via `useEntityForAttachment` and dispatches to
   * the per-type canvas with `hostName`/`userName`/`serviceName` + optional `entityId`.
   */
  identifier: EntityAttachmentIdentifier;
  application: ApplicationStart;
  agentBuilder?: AgentBuilderPluginStart;
  chrome?: SecurityAgentBuilderChrome;
  openSidebarConversation?: () => void;
  /**
   * Optional search session service. Forwarded to the per-type flyout canvas so the
   * `navigateToEntityAnalyticsWithFlyoutInApp` helper can clear the active search session
   * before the legitimate `agent_builder → securitySolutionUI` navigation.
   */
  searchSession?: ISessionService;
  /** Rich risk-doc projection from `security.get_entity`; preferred over entity-store summary risk. */
  riskStats?: EntityAttachmentRiskStats;
  /** Resolution-group risk fallback; threaded through to {@link FlyoutRiskSummary}. */
  resolutionRiskStats?: EntityAttachmentRiskStats;
}

/**
 * Dispatches the appropriate host/user/service entity flyout overview canvas for an Agent
 * Builder `security.entity` attachment. `generic` identifier types return `null` because the
 * Security expandable flyout only supports host/user/service panels today.
 *
 * The surface is intentionally decoupled from the inline `EntityCard` (which bypasses Redux and
 * Security providers). This canvas mounts inside `SecurityReduxEmbeddedProvider`, so it can
 * reuse all Security flyout hooks (`useGlobalTime`, `useRiskScore`, `useObservedHost`, sourcerer,
 * etc.) exactly like the in-app expandable flyout.
 */
export const EntityCardFlyoutOverviewCanvas: React.FC<EntityCardFlyoutOverviewCanvasProps> = ({
  identifier,
  application,
  agentBuilder,
  chrome,
  openSidebarConversation,
  searchSession,
  riskStats,
  resolutionRiskStats,
}) => {
  const { data, isLoading } = useEntityForAttachment(identifier);

  if (isLoading && !data) {
    return <FlyoutLoading />;
  }

  const entityName = data?.displayName ?? identifier.identifier;
  const entityId = data?.entityId ?? identifier.entityStoreId ?? identifier.identifier;
  const sources = data?.sources ?? [];
  const exploreRow = {
    entity_type: identifier.identifierType,
    entity_id: entityId,
    entity_name: entityName,
    source: sources.length > 0 ? { entity: { source: sources } } : undefined,
  };

  if (identifier.identifierType === 'host') {
    const hostName = getHostNameForHostDetailsUrl(exploreRow);
    return (
      <HostEntityFlyoutOverviewCanvas
        hostName={hostName}
        entityId={entityId}
        application={application}
        agentBuilder={agentBuilder}
        chrome={chrome}
        openSidebarConversation={openSidebarConversation}
        searchSession={searchSession}
        attachmentRiskStats={riskStats}
        attachmentResolutionRiskStats={resolutionRiskStats}
      />
    );
  }

  if (identifier.identifierType === 'user') {
    const userName = getUserNameForUserDetailsUrl(exploreRow);
    return (
      <UserEntityFlyoutOverviewCanvas
        userName={userName}
        entityId={entityId}
        application={application}
        agentBuilder={agentBuilder}
        chrome={chrome}
        openSidebarConversation={openSidebarConversation}
        searchSession={searchSession}
        attachmentRiskStats={riskStats}
        attachmentResolutionRiskStats={resolutionRiskStats}
      />
    );
  }

  if (identifier.identifierType === 'service') {
    const displayName = getServiceNameForServiceDetailsUrl(exploreRow);
    return (
      <ServiceEntityFlyoutOverviewCanvas
        serviceName={displayName}
        entityId={entityId}
        application={application}
        agentBuilder={agentBuilder}
        chrome={chrome}
        openSidebarConversation={openSidebarConversation}
        searchSession={searchSession}
        attachmentRiskStats={riskStats}
        attachmentResolutionRiskStats={resolutionRiskStats}
      />
    );
  }

  return null;
};
