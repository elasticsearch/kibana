/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useCallback, useMemo } from 'react';
import { noop } from 'lodash/fp';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { EuiFlyoutHeader, EuiFlyoutBody, EuiSpacer, EuiFlyoutFooter } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { useUpdateAssetCriticality } from '../../../../entity_analytics/api/hooks/use_update_asset_criticality';
import { useRefetchQueryById } from '../../../../entity_analytics/api/hooks/use_refetch_query_by_id';
import type { Refetch } from '../../../../common/types';
import { useEntityRiskScoreRecalculation } from '../../../../entity_analytics/api/hooks/use_entity_risk_score_recalculation';
import { ENTITY_ANALYTICS_TABLE_ID } from '../../../../entity_analytics/components/home/constants';
import { useRiskScore } from '../../../../entity_analytics/api/hooks/use_risk_score';
import { useQueryInspector } from '../../../../common/components/page/manage_query';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { buildHostNamesFilter, type RiskSeverity } from '../../../../../common/search_strategy';
import { useUiSetting, useKibana } from '../../../../common/lib/kibana';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import type { EntityDetailsPath } from '../../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import {
  CspInsightLeftPanelSubTab,
  EntityDetailsLeftPanelTab,
} from '../../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { flyoutProviders } from '../../../shared/components/flyout_provider';
import {
  defaultToolsFlyoutProperties,
  useDefaultDocumentFlyoutProperties,
} from '../../../shared/hooks/use_default_flyout_properties';
import { documentFlyoutHistoryKey } from '../../../shared/constants/flyout_history';
import { RiskInputs } from '../../shared/tools/risk_inputs';
import { MisconfigurationInsights } from '../../shared/tools/misconfiguration_insights';
import { VulnerabilityInsights } from '../tools/vulnerability_insights';
import { AlertsInsights } from '../../shared/tools/alerts_insights';
import { Header } from './header';
import { Content } from './content';
import { Footer } from './footer';
import { useObservedHost } from './hooks/use_observed_host';
import { EntityType } from '../../../../../common/entity_analytics/types';
import {
  buildRiskScoreStateFromEntityRecord,
  getRiskFromEntityRecord,
} from '../../../../flyout/entity_details/shared/entity_store_risk_utils';
import {
  useEntityFromStore,
  type EntityStoreRecord,
} from '../../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import type { CriticalityLevelWithUnassigned } from '../../../../../common/entity_analytics/asset_criticality/types';
import { ENABLE_ASSET_INVENTORY_SETTING } from '../../../../../common/constants';
import {
  mergeLegacyIdentityWhenStoreEntityMissing,
  type IdentityFields,
} from '../../../../flyout/document_details/shared/utils';
import { HOST_PANEL_RISK_SCORE_QUERY_ID } from './constants';
import {
  useEntityPanelTabs,
  TABLE_TAB_ID,
} from '../../../../flyout/entity_details/shared/hooks/use_entity_panel_tabs';
import { EntityPanelHeaderTabs } from '../../../../flyout/entity_details/shared/components/entity_panel_tabs';
import { EntityStoreTableTab } from '../../../../flyout/entity_details/shared/components/entity_store_table_tab';
import { EntitySummaryGrid } from '../../../../flyout/entity_details/shared/components/entity_summary_grid';

export interface HostProps {
  /**
   * Display name from the source row / document (typically `host.name`).
   */
  hostName: string;
  /**
   * The source document record. When provided, entityId is computed from the document's
   * host identity fields using the EUID API. Falls back to the `entityId` prop if the
   * EUID API returns no value.
   */
  hit?: DataTableRecord;
  /**
   * Canonical Entity Store v2 id (`entity.id`) when already resolved (e.g. from alerts/events table).
   * Used directly when `hit` is not provided, or as a fallback when EUID resolution from `hit` yields no value.
   */
  entityId?: string;
  /**
   * Scope id (timeline id, table id, etc.) — used for downstream containers and queries.
   */
  scopeId?: string;
  /**
   * Stable identifier for the host panel context (defaults to `scopeId` or a static fallback).
   */
  contextID?: string;
}

const FIRST_RECORD_PAGINATION = {
  cursorStart: 0,
  querySize: 1,
};

/**
 * Standalone host details flyout content (for use with `overlays.openSystemFlyout`).
 *
 * Runs the same data hooks as the v1 `HostPanel`, but without the expandable-flyout
 * navigation or preview-mode handling. Detail panels (risk inputs, graph view, etc.)
 * open as separate system flyouts via `overlays.openSystemFlyout`.
 */
export const Host: FC<HostProps> = memo(function Host({
  hostName,
  hit,
  entityId: entityIdProp,
  scopeId = '',
  contextID,
}) {
  const { services } = useKibana();
  const { uiSettings, overlays } = services;
  const store = useStore();
  const history = useHistory();
  const euidApi = useEntityStoreEuidApi();

  // Compute entityId from hit when provided, otherwise use the prop
  const entityId = useMemo(
    () => (hit ? euidApi?.euid?.getEuidFromObject('host', hit.flattened) : entityIdProp),
    [hit, euidApi, entityIdProp]
  );
  const assetInventoryEnabled = uiSettings.get(ENABLE_ASSET_INVENTORY_SETTING, true);
  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);
  const isInSecurityApp = useIsInSecurityApp();
  const historyKey = isInSecurityApp ? documentFlyoutHistoryKey : DOC_VIEWER_FLYOUT_HISTORY_KEY;
  const defaultDocumentFlyoutProperties = useDefaultDocumentFlyoutProperties();

  const safeContextID = contextID ?? scopeId ?? 'host-panel';
  const { setQuery, deleteQuery, isInitializing } = useGlobalTime();

  const hostStoreIdentityFields = useMemo(
    () => (!entityId && hostName ? { 'host.name': hostName } : undefined),
    [entityId, hostName]
  );

  const entityFromStoreResult = useEntityFromStore({
    entityId,
    identityFields: hostStoreIdentityFields,
    entityType: 'host',
    skip: !entityStoreV2Enabled || isInitializing,
  });

  const documentEntityIdentifiers = useMemo<IdentityFields>(() => {
    const legacyFields =
      hostName != null && hostName !== '' ? { 'host.name': hostName } : ({} as IdentityFields);
    if (entityStoreV2Enabled) {
      const fromStore =
        euidApi?.euid?.getEntityIdentifiersFromDocument(
          'host',
          entityFromStoreResult.entityRecord
        ) ?? {};
      return mergeLegacyIdentityWhenStoreEntityMissing(fromStore, legacyFields);
    }
    return legacyFields;
  }, [entityStoreV2Enabled, euidApi?.euid, entityFromStoreResult.entityRecord, hostName]);

  const hostNameFilterQuery = useMemo(
    () => (hostName ? buildHostNamesFilter([hostName]) : undefined),
    [hostName]
  );

  const riskScoreState = useRiskScore({
    riskEntity: EntityType.host,
    filterQuery: hostNameFilterQuery,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: entityStoreV2Enabled,
  });

  const { inspect: inspectRiskScore, refetch, loading } = riskScoreState;

  const observedHost = useObservedHost(
    hostName,
    scopeId,
    entityStoreV2Enabled ? entityFromStoreResult : undefined
  );

  const refetchEntitiesTable = useRefetchQueryById(ENTITY_ANALYTICS_TABLE_ID);
  const onRecalculation = useCallback(() => {
    (refetchEntitiesTable as Refetch | null)?.();
  }, [refetchEntitiesTable]);

  const { entityRiskScores, recalculatingScore, calculateEntityRiskScore } =
    useEntityRiskScoreRecalculation({
      entityType: EntityType.host,
      identifier: hostName,
      entityId: entityStoreV2Enabled ? observedHost.entityRecord?.entity.id : undefined,
      entityStoreV2Enabled,
      entityFromStoreResult,
      riskScoreState,
      onRecalculation,
    });

  const onAssetCriticalityChanged = useCallback(() => {
    (refetchEntitiesTable as Refetch | null)?.();
    calculateEntityRiskScore();
  }, [calculateEntityRiskScore, refetchEntitiesTable]);

  const { updateAssetCriticalityLevel } = useUpdateAssetCriticality('host', {
    onSuccess: onAssetCriticalityChanged,
  });

  const panelDisplayEntityId = useMemo(
    () => (entityStoreV2Enabled ? observedHost.entityRecord?.entity?.id : entityId),
    [entityId, entityStoreV2Enabled, observedHost.entityRecord?.entity?.id]
  );

  const useEntityStoreInspectForRisk = entityStoreV2Enabled && observedHost.entityRecord != null;

  useQueryInspector({
    deleteQuery,
    inspect: useEntityStoreInspectForRisk
      ? entityFromStoreResult?.inspect ?? null
      : inspectRiskScore,
    loading: useEntityStoreInspectForRisk ? entityFromStoreResult?.isLoading ?? false : loading,
    queryId: HOST_PANEL_RISK_SCORE_QUERY_ID,
    refetch: useEntityStoreInspectForRisk ? entityFromStoreResult?.refetch ?? noop : refetch,
    setQuery,
  });

  const entityFromStore: EntityStoreRecord | undefined = entityStoreV2Enabled
    ? observedHost.entityRecord ?? undefined
    : undefined;
  const riskScoreStateFromStore =
    entityStoreV2Enabled && observedHost.entityRecord
      ? buildRiskScoreStateFromEntityRecord(EntityType.host, observedHost.entityRecord, {
          refetch: observedHost.refetchEntityStore ?? noop,
          isLoading: observedHost.isLoading,
          error: null,
          inspect: entityFromStoreResult?.inspect,
        })
      : null;

  const effectiveRiskScoreState = riskScoreStateFromStore ?? riskScoreState;

  const onCriticalitySave =
    entityFromStoreResult.entityRecord && observedHost.entityRecord
      ? (level: CriticalityLevelWithUnassigned) =>
          updateAssetCriticalityLevel(level, observedHost.entityRecord)
      : undefined;

  const entityStoreEntityId = entityStoreV2Enabled
    ? observedHost.entityRecord?.entity?.id
    : undefined;

  const noEntityInStore =
    entityStoreV2Enabled && !entityFromStoreResult.isLoading && !observedHost.entityRecord;

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

  const onShowHost = useCallback(() => {
    overlays.openSystemFlyout(
      flyoutProviders({
        services,
        store,
        history,
        children: <Host hostName={hostName} entityId={entityId} scopeId={scopeId} />,
      }),
      { ...defaultDocumentFlyoutProperties, title: hostName, historyKey, session: 'inherit' }
    );
  }, [
    overlays,
    services,
    store,
    history,
    historyKey,
    hostName,
    entityId,
    scopeId,
    defaultDocumentFlyoutProperties,
  ]);

  const openDetailsPanel = useCallback(
    (path: EntityDetailsPath) => {
      const common = {
        ...defaultToolsFlyoutProperties,
        title: hostName,
        historyKey,
        session: 'start' as const,
      };
      const wrap = (children: React.ReactNode) =>
        overlays.openSystemFlyout(flyoutProviders({ services, store, history, children }), common);

      switch (path.tab) {
        case EntityDetailsLeftPanelTab.RISK_INPUTS:
          return wrap(
            <RiskInputs
              entityType={EntityType.host}
              entityName={hostName}
              entityId={entityStoreEntityId}
              onOpenEntity={onShowHost}
            />
          );
        case EntityDetailsLeftPanelTab.CSP_INSIGHTS:
          switch (path.subTab) {
            case CspInsightLeftPanelSubTab.VULNERABILITIES:
              return wrap(
                <VulnerabilityInsights
                  value={hostName}
                  entityId={panelDisplayEntityId}
                  onShowHost={onShowHost}
                />
              );
            case CspInsightLeftPanelSubTab.ALERTS:
              return wrap(
                <AlertsInsights
                  entityType={EntityType.host}
                  value={hostName}
                  entityId={panelDisplayEntityId}
                  onOpenEntity={onShowHost}
                />
              );
            case CspInsightLeftPanelSubTab.MISCONFIGURATIONS:
              return wrap(
                <MisconfigurationInsights
                  entityType={EntityType.host}
                  value={hostName}
                  entityId={panelDisplayEntityId}
                  onOpenEntity={onShowHost}
                />
              );
          }
      }
    },
    [
      overlays,
      services,
      store,
      history,
      historyKey,
      hostName,
      panelDisplayEntityId,
      entityStoreEntityId,
      onShowHost,
    ]
  );

  const riskLevel = observedHost.entityRecord
    ? ((getRiskFromEntityRecord(observedHost.entityRecord)?.calculated_level ??
        'Unknown') as RiskSeverity)
    : undefined;

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <Header
          hostName={hostName}
          lastSeen={observedHost.lastSeen}
          entityId={panelDisplayEntityId}
          identityFields={documentEntityIdentifiers}
          isEntityInStore={!!observedHost.entityRecord}
          riskLevel={riskLevel}
        />
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
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
          <Content
            identityFields={documentEntityIdentifiers}
            observedHost={observedHost}
            riskScoreState={effectiveRiskScoreState}
            entityRiskScores={entityRiskScores}
            contextID={safeContextID}
            scopeId={scopeId}
            openDetailsPanel={openDetailsPanel}
            recalculatingScore={recalculatingScore}
            onAssetCriticalityChange={onAssetCriticalityChanged}
            isPreviewMode={false}
            entityRecord={entityStoreV2Enabled ? observedHost.entityRecord ?? undefined : undefined}
            skipRiskAndCriticality={noEntityInStore}
            entityStoreEntityId={entityStoreEntityId}
            // The v2 flyout does not yet wire up the graph view / resolution group tabs, so hide
            // their navigation here. v1 HostPanel and the agent-builder canvas keep it (default).
            // TODO: remove this prop (and `enableGraphAndResolutionNavigation` in content.tsx) once
            // `openDetailsPanel` handles the GRAPH_VIEW and RESOLUTION_GROUP tabs in this flyout.
            enableGraphAndResolutionNavigation={false}
            hideHeaderIcons
          />
        )}
      </EuiFlyoutBody>
      {assetInventoryEnabled && (
        <EuiFlyoutFooter>
          <Footer identityFields={documentEntityIdentifiers} entity={entityFromStore} />
        </EuiFlyoutFooter>
      )}
    </>
  );
});

Host.displayName = 'Host';
