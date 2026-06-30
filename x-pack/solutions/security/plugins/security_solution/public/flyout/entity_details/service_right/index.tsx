/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import type { FlyoutPanelProps } from '@kbn/expandable-flyout';
import { TableId } from '@kbn/securitysolution-data-table';
import { useEntityStoreEuidApi, FF_ENABLE_ENTITY_STORE_V2 } from '@kbn/entity-store/public';
import { EuiSpacer } from '@elastic/eui';
import type { CriticalityLevelWithUnassigned } from '../../../../common/entity_analytics/asset_criticality/types';
import type { ESQuery } from '../../../../common/typed_json';
import { buildEntityNameFilter, type RiskSeverity } from '../../../../common/search_strategy';
import { useUiSetting } from '../../../common/lib/kibana';
import { useRefetchQueryById } from '../../../entity_analytics/api/hooks/use_refetch_query_by_id';
import type { Refetch } from '../../../common/types';
import { useUpdateAssetCriticality } from '../../../entity_analytics/api/hooks/use_update_asset_criticality';
import { useRiskScore } from '../../../entity_analytics/api/hooks/use_risk_score';
import { useEntityRiskScoreRecalculation } from '../../../entity_analytics/api/hooks/use_entity_risk_score_recalculation';
import { useQueryInspector } from '../../../common/components/page/manage_query';
import { useGlobalTime } from '../../../common/containers/use_global_time';
import { FlyoutLoading } from '../../../flyout_v2/shared/components/flyout_loading';
import { FlyoutNavigation } from '../../shared/components/flyout_navigation';
import { ServicePanelContent } from './content';
import { ServicePanelHeader } from './header';
import { useObservedService } from './hooks/use_observed_service';
import { EntityType } from '../../../../common/entity_analytics/types';
import type { IdentityFields } from '../../document_details/shared/utils';
import { EntityDetailsLeftPanelTab } from '../shared/components/left_panel/left_panel_header';
import { useNavigateToServiceDetails } from './hooks/use_navigate_to_service_details';
import { useEntityFromStore } from '../shared/hooks/use_entity_from_store';
import { getRiskFromEntityRecord } from '../shared/entity_store_risk_utils';
import { FlyoutBody } from '../../shared/components/flyout_body';
import { useEntityPanelTabs, TABLE_TAB_ID } from '../shared/hooks/use_entity_panel_tabs';
import { EntityPanelHeaderTabs } from '../shared/components/entity_panel_tabs';
import { EntityStoreTableTab } from '../shared/components/entity_store_table_tab';
import { EntitySummaryGrid } from '../shared/components/entity_summary_grid';
import { ENTITY_ANALYTICS_TABLE_ID } from '../../../entity_analytics/components/home/constants';

export interface ServicePanelProps extends Record<string, unknown> {
  contextID: string;
  scopeId: string;
  entityId: string;
  serviceName: string;
  isPreviewMode?: boolean;
}

export interface ServicePanelExpandableFlyoutProps extends FlyoutPanelProps {
  key: 'service-panel';
  params: ServicePanelProps;
}

export const SERVICE_PANEL_RISK_SCORE_QUERY_ID = 'servicePanelRiskScoreQuery';
const FIRST_RECORD_PAGINATION = {
  cursorStart: 0,
  querySize: 1,
};

export const ServicePanel = memo(function ServicePanel({
  contextID,
  scopeId,
  entityId,
  serviceName,
  isPreviewMode = false,
}: ServicePanelProps) {
  const safeContextID = contextID ?? scopeId ?? 'service-panel';
  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);
  const serviceStoreIdentityFields = useMemo(
    () => (!entityId && serviceName ? { 'service.name': serviceName } : undefined),
    [entityId, serviceName]
  );
  const entityFromStoreResult = useEntityFromStore({
    entityId,
    identityFields: serviceStoreIdentityFields,
    entityType: 'service',
    skip: !entityStoreV2Enabled,
  });

  const euidApi = useEntityStoreEuidApi();
  const documentEntityIdentifiers = useMemo<IdentityFields>(() => {
    return (
      euidApi?.euid?.getEntityIdentifiersFromDocument(
        'service',
        entityFromStoreResult.entityRecord ?? {}
      ) ?? {}
    );
  }, [entityFromStoreResult.entityRecord, euidApi?.euid]);

  const serviceNameFilterQuery = useMemo(
    () => (serviceName ? buildEntityNameFilter(EntityType.service, [serviceName]) : undefined),
    [serviceName]
  );
  const riskScoreState = useRiskScore({
    riskEntity: EntityType.service,
    filterQuery: serviceNameFilterQuery as unknown as ESQuery | undefined,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: entityStoreV2Enabled,
  });

  const { inspect, loading, data: serviceRisk } = riskScoreState;
  const { setQuery, deleteQuery } = useGlobalTime();
  const observedService = useObservedService(documentEntityIdentifiers, scopeId);
  const serviceRiskData = serviceRisk && serviceRisk.length > 0 ? serviceRisk[0] : undefined;
  const isRiskScoreExist = !!serviceRiskData?.service.risk;

  const refetchEntitiesTable = useRefetchQueryById(ENTITY_ANALYTICS_TABLE_ID);

  const onRecalculation = useCallback(() => {
    (refetchEntitiesTable as Refetch | null)?.();
  }, [refetchEntitiesTable]);

  const { entityRiskScores, recalculatingScore, calculateEntityRiskScore } =
    useEntityRiskScoreRecalculation({
      entityType: EntityType.service,
      identifier: serviceName,
      entityId: entityFromStoreResult.entityRecord?.entity?.id,
      entityStoreV2Enabled,
      entityFromStoreResult,
      riskScoreState,
      onRecalculation,
    });

  const onAssetCriticalityChanged = useCallback(() => {
    (refetchEntitiesTable as Refetch | null)?.();
    calculateEntityRiskScore();
  }, [calculateEntityRiskScore, refetchEntitiesTable]);

  const { updateAssetCriticalityLevel } = useUpdateAssetCriticality('service', {
    onSuccess: onAssetCriticalityChanged,
  });

  useQueryInspector({
    deleteQuery,
    inspect,
    loading,
    queryId: SERVICE_PANEL_RISK_SCORE_QUERY_ID,
    refetch: riskScoreState.refetch,
    setQuery,
  });

  const entityStoreEntityId = entityStoreV2Enabled
    ? entityFromStoreResult.entityRecord?.entity?.id
    : undefined;

  const onCriticalitySave = entityFromStoreResult.entityRecord
    ? (level: CriticalityLevelWithUnassigned) =>
        updateAssetCriticalityLevel(level, entityFromStoreResult.entityRecord)
    : undefined;

  const openDetailsPanel = useNavigateToServiceDetails({
    serviceName,
    entityId,
    scopeId,
    contextID: safeContextID,
    isRiskScoreExist,
    identityFields: documentEntityIdentifiers,
    isPreviewMode,
    entityStoreEntityId,
  });

  const defaultTab = useMemo(() => {
    if (isRiskScoreExist) return EntityDetailsLeftPanelTab.RISK_INPUTS;
    if (entityStoreEntityId) return EntityDetailsLeftPanelTab.RESOLUTION_GROUP;
    return EntityDetailsLeftPanelTab.RISK_INPUTS;
  }, [isRiskScoreExist, entityStoreEntityId]);

  const openPanelFirstTab = useCallback(
    () =>
      openDetailsPanel({
        tab: defaultTab,
      }),
    [openDetailsPanel, defaultTab]
  );

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
      <FlyoutNavigation
        flyoutIsExpandable={isRiskScoreExist || !!entityStoreEntityId}
        expandDetails={openPanelFirstTab}
        isPreviewMode={isPreviewMode}
        isRulePreview={scopeId === TableId.rulePreview}
      />
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
            riskScoreState={riskScoreState}
            entityRiskScores={entityRiskScores}
            recalculatingScore={recalculatingScore}
            onAssetCriticalityChange={onAssetCriticalityChanged}
            contextID={safeContextID}
            scopeId={scopeId}
            openDetailsPanel={openDetailsPanel}
            isPreviewMode={isPreviewMode}
            entityStoreEntityId={entityStoreEntityId}
          />
        )}
      </FlyoutBody>
    </>
  );
});

ServicePanel.displayName = 'ServicePanel';
