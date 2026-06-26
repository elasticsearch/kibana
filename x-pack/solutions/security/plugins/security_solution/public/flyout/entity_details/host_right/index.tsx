/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import type { FlyoutPanelProps } from '@kbn/expandable-flyout';
import { useHasMisconfigurations } from '@kbn/cloud-security-posture/src/hooks/use_has_misconfigurations';
import { useHasVulnerabilities } from '@kbn/cloud-security-posture/src/hooks/use_has_vulnerabilities';
import { TableId } from '@kbn/securitysolution-data-table';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { EuiSpacer } from '@elastic/eui';
import { useAssetCriticalityPrivileges } from '../../../entity_analytics/components/asset_criticality/use_asset_criticality';
import { useUpdateAssetCriticality } from '../../../entity_analytics/api/hooks/use_update_asset_criticality';
import { buildEuidCspPreviewOptions } from '../../../cloud_security_posture/utils/build_euid_csp_preview_options';
import { useNonClosedAlerts } from '../../../cloud_security_posture/hooks/use_non_closed_alerts';
import { DETECTION_RESPONSE_ALERTS_BY_STATUS_ID } from '../../../overview/components/detection_response/alerts_by_status/types';
import { useRefetchQueryById } from '../../../entity_analytics/api/hooks/use_refetch_query_by_id';
import { RISK_INPUTS_TAB_QUERY_ID } from '../../../entity_analytics/components/entity_details_flyout/tabs/risk_inputs/risk_inputs_tab';
import type { Refetch } from '../../../common/types';
import { useCalculateEntityRiskScore } from '../../../entity_analytics/api/hooks/use_calculate_entity_risk_score';
import { useRiskScore } from '../../../entity_analytics/api/hooks/use_risk_score';
import { useQueryInspector } from '../../../common/components/page/manage_query';
import { useGlobalTime } from '../../../common/containers/use_global_time';
import { buildHostNamesFilter, type RiskSeverity } from '../../../../common/search_strategy';
import { useKibana } from '../../../common/lib/kibana';
import { FlyoutNavigation } from '../../shared/components/flyout_navigation';
import { HostPanelFooter } from './footer';
import { HostPanelContent } from './content';
import { HostPanelHeader } from './header';
import { EntityDetailsLeftPanelTab } from '../shared/components/left_panel/left_panel_header';
import { HostPreviewPanelFooter } from '../host_preview/footer';
import { useNavigateToHostDetails } from './hooks/use_navigate_to_host_details';
import { EntityType } from '../../../../common/entity_analytics/types';
import { useObservedHost } from './hooks/use_observed_host';
import {
  buildRiskScoreStateFromEntityRecord,
  getRiskFromEntityRecord,
} from '../shared/entity_store_risk_utils';
import { useEntityFromStore, type EntityStoreRecord } from '../shared/hooks/use_entity_from_store';
import type { CriticalityLevelWithUnassigned } from '../../../../common/entity_analytics/asset_criticality/types';
import { ENABLE_ASSET_INVENTORY_SETTING } from '../../../../common/constants';
import {
  mergeLegacyIdentityWhenStoreEntityMissing,
  type IdentityFields,
} from '../../document_details/shared/utils';
import { HOST_PANEL_RISK_SCORE_QUERY_ID, HOST_PANEL_OBSERVED_HOST_QUERY_ID } from './constants';
import { FlyoutBody } from '../../shared/components/flyout_body';
import { useEntityPanelTabs, TABLE_TAB_ID } from '../shared/hooks/use_entity_panel_tabs';
import { EntityPanelHeaderTabs } from '../shared/components/entity_panel_tabs';
import { EntityStoreTableTab } from '../shared/components/entity_store_table_tab';
import { EntitySummaryGrid } from '../shared/components/entity_summary_grid';

export { HOST_PANEL_RISK_SCORE_QUERY_ID, HOST_PANEL_OBSERVED_HOST_QUERY_ID };

export interface HostPanelProps extends Record<string, unknown> {
  contextID: string;
  scopeId: string;
  isPreviewMode: boolean;
  /**
   * Display name from the source row / document (typically `host.name`).
   */
  hostName: string;
  /**
   * Canonical Entity Store v2 id (`entity.id`) when already resolved (e.g. from alerts/events table).
   */
  entityId?: string;
}

export interface HostPanelExpandableFlyoutProps extends FlyoutPanelProps {
  key: 'host-panel' | 'host-preview-panel';
  params: HostPanelProps;
}

export const HostPreviewPanelKey: HostPanelExpandableFlyoutProps['key'] = 'host-preview-panel';

const FIRST_RECORD_PAGINATION = {
  cursorStart: 0,
  querySize: 1,
};

export const HostPanel = memo(function HostPanel({
  contextID,
  scopeId,
  isPreviewMode = false,
  hostName,
  entityId,
}: HostPanelProps) {
  const { uiSettings } = useKibana().services;
  const euidApi = useEntityStoreEuidApi();
  const assetInventoryEnabled = uiSettings.get(ENABLE_ASSET_INVENTORY_SETTING, true);
  const safeContextID = contextID ?? scopeId ?? 'host-panel';
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
    entityRecord: entityFromStoreResult.entityRecord,
    to,
    from,
    queryId: `${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}HOST_NAME_RIGHT`,
  });

  const panelDisplayEntityId = observedHost.entityRecord?.entity?.id;

  const hasEntityStoreRecord = observedHost.entityRecord != null;

  const assetCriticalityPrivileges = useAssetCriticalityPrivileges(entityId ?? hostName);

  useQueryInspector({
    deleteQuery,
    inspect: hasEntityStoreRecord ? entityFromStoreResult?.inspect ?? null : inspect,
    loading: hasEntityStoreRecord ? entityFromStoreResult?.isLoading ?? false : loading,
    queryId: HOST_PANEL_RISK_SCORE_QUERY_ID,
    refetch: hasEntityStoreRecord ? entityFromStoreResult?.refetch ?? (() => {}) : refetch,
    setQuery,
  });

  const entityFromStore: EntityStoreRecord | undefined = observedHost.entityRecord ?? undefined;
  const riskScoreStateFromStore = observedHost.entityRecord
    ? buildRiskScoreStateFromEntityRecord(EntityType.host, observedHost.entityRecord, {
        refetch: observedHost.refetchEntityStore ?? (() => {}),
        isLoading: observedHost.isLoading,
        error: null,
        inspect: entityFromStoreResult?.inspect,
      })
    : null;

  const effectiveRiskScoreState = riskScoreStateFromStore ?? riskScoreState;
  const isRiskScoreExist = observedHost.entityRecord
    ? !!getRiskFromEntityRecord(observedHost.entityRecord)
    : !!hostRiskData?.host?.risk;

  const onCriticalitySave =
    !!assetCriticalityPrivileges.data?.has_write_permissions &&
    entityFromStoreResult.entityRecord &&
    observedHost.entityRecord
      ? (level: CriticalityLevelWithUnassigned) =>
          updateAssetCriticalityLevel(level, observedHost.entityRecord)
      : undefined;

  const entityStoreEntityId = observedHost.entityRecord?.entity?.id;

  const openDetailsPanel = useNavigateToHostDetails({
    hostName,
    entityId: panelDisplayEntityId,
    scopeId,
    isRiskScoreExist,
    hasMisconfigurationFindings,
    hasVulnerabilitiesFindings,
    hasNonClosedAlerts,
    isPreviewMode,
    contextID: safeContextID,
    entityStoreEntityId,
  });

  const defaultTab = useMemo(() => {
    if (isRiskScoreExist) return EntityDetailsLeftPanelTab.RISK_INPUTS;
    if (hasMisconfigurationFindings || hasVulnerabilitiesFindings || hasNonClosedAlerts)
      return EntityDetailsLeftPanelTab.CSP_INSIGHTS;
    if (entityStoreEntityId) return EntityDetailsLeftPanelTab.RESOLUTION_GROUP;
    return EntityDetailsLeftPanelTab.RISK_INPUTS;
  }, [
    isRiskScoreExist,
    hasMisconfigurationFindings,
    hasVulnerabilitiesFindings,
    hasNonClosedAlerts,
    entityStoreEntityId,
  ]);

  const openDefaultPanel = useCallback(
    () => openDetailsPanel({ tab: defaultTab }),
    [openDetailsPanel, defaultTab]
  );

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
      <FlyoutNavigation
        flyoutIsExpandable={
          isRiskScoreExist ||
          hasMisconfigurationFindings ||
          hasVulnerabilitiesFindings ||
          hasNonClosedAlerts ||
          !!entityStoreEntityId
        }
        expandDetails={openDefaultPanel}
        isPreviewMode={isPreviewMode}
        isRulePreview={scopeId === TableId.rulePreview}
      />
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
          />
        )}
      </FlyoutBody>
      {isPreviewMode && (
        <HostPreviewPanelFooter
          hostName={hostName}
          entityId={panelDisplayEntityId}
          contextID={safeContextID}
          scopeId={scopeId}
        />
      )}
      {!isPreviewMode && assetInventoryEnabled && (
        <HostPanelFooter identityFields={documentEntityIdentifiers} entity={entityFromStore} />
      )}
    </>
  );
});

HostPanel.displayName = 'HostPanel';
