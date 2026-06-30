/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiHorizontalRule } from '@elastic/eui';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import type { Entity } from '../../../../../common/api/entity_analytics';
import { ObservedDataSection } from './components/observed_data_section';
import { useAnomalyOverview } from '../../../../entity_analytics/api/hooks/use_anomaly_overview';
import { useAnomalyPrivileges } from '../../../../entity_analytics/api/hooks/use_anomaly_privileges';
import { useHasEntityResolutionLicense } from '../../../../common/hooks/use_has_entity_resolution_license';
import { EntityHighlightsAccordion } from '../../../../entity_analytics/components/entity_details_flyout/components/entity_highlights';
import { EntityInsight } from '../../../../cloud_security_posture/components/entity_insight';
import { AssetCriticalityAccordion } from '../../../../entity_analytics/components/asset_criticality/asset_criticality_selector';
import { FlyoutRiskSummary } from '../../../../entity_analytics/components/risk_summary_flyout/risk_summary';
import type { RiskScoreState } from '../../../../entity_analytics/api/hooks/use_risk_score';
import type { EntityRiskScoresState } from '../../../../entity_analytics/api/hooks/use_entity_risk_scores';
import { EntityIdentifierFields, EntityType } from '../../../../../common/entity_analytics/types';
import { HOST_PANEL_OBSERVED_HOST_QUERY_ID, HOST_PANEL_RISK_SCORE_QUERY_ID } from './constants';
import type { EntityDetailsPath } from '../../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import type { IdentityFields } from '../../../../flyout/document_details/shared/utils';
import type { ObservedEntityData } from '../../../../flyout/entity_details/shared/components/observed_entity/types';
import type { EntityRiskScore, HostItem } from '../../../../../common/search_strategy';
import { VisualizationsSection } from '../../../../flyout/entity_details/shared/components/right/visualizations_section';
import { ResolutionSection } from '../../../../entity_analytics/components/entity_resolution/resolution_section';
import { AnomaliesSection } from '../../../../entity_analytics/components/anomalies/anomalies_section';

type ObservedHostData = Omit<ObservedEntityData<HostItem>, 'anomalies'>;

export interface ContentProps {
  /** Observed host data (anomalies excluded). */
  observedHost: ObservedHostData;
  /** Current risk score state for the host. */
  riskScoreState: RiskScoreState<EntityType.host>;
  /** Base + resolution entity risk scores (Entity Store v2). */
  entityRiskScores: EntityRiskScoresState<EntityType.host>;
  /** Unique context ID passed to child queries. */
  contextID: string;
  /** Scope ID for the timeline or table that opened this flyout. */
  scopeId: string;
  /** Callback to navigate to a detail panel (e.g. risk inputs, asset criticality). */
  openDetailsPanel: (path: EntityDetailsPath) => void;
  /** Key-value map of identity fields used to resolve the host. */
  identityFields: IdentityFields;
  /** Callback invoked after asset criticality is updated. */
  onAssetCriticalityChange: () => void;
  /** Whether the risk score is currently being recalculated. */
  recalculatingScore: boolean;
  /** Whether the flyout is rendered in preview mode. */
  isPreviewMode: boolean;
  /** When using Entity Store v2: entity record for asset criticality upsert. */
  entityRecord?: Entity;
  /** When true (e.g. entity store v2 enabled but no entity found), hide risk score and asset criticality. */
  skipRiskAndCriticality?: boolean;
  /** Entity store entity ID for the host. */
  entityStoreEntityId?: string;
  /** See {@link RiskSummaryProps.prefetchedResolutionRisk}. */
  prefetchedResolutionRisk?: EntityRiskScore<EntityType.host>;
  /**
   * Whether the caller's `openDetailsPanel` can navigate to the graph view and resolution group
   * tabs. The v1 `HostPanel` and the agent-builder canvas forward those tabs to a left panel that
   * renders them, so they leave this on. The v2 `Host` flyout does not yet wire up those tabs, so
   * it sets this to `false` to hide the (otherwise no-op) Show-graph icon and Resolution-group link.
   */
  enableGraphAndResolutionNavigation?: boolean;
}

/**
 * Host details flyout content section.
 */
export const Content = ({
  identityFields,
  observedHost,
  riskScoreState,
  entityRiskScores,
  recalculatingScore,
  contextID,
  scopeId,
  openDetailsPanel,
  onAssetCriticalityChange,
  isPreviewMode,
  entityRecord,
  skipRiskAndCriticality = false,
  entityStoreEntityId,
  prefetchedResolutionRisk,
  enableGraphAndResolutionNavigation = true,
}: ContentProps) => {
  const hasEntityResolutionLicense = useHasEntityResolutionLicense();
  const isAnomalyDetailsEnabled = useIsExperimentalFeatureEnabled('entityAnalyticsAnomalyDetails');
  const { data: anomalyPrivilegesData } = useAnomalyPrivileges(isAnomalyDetailsEnabled);
  const hasAnomalyPrivileges = anomalyPrivilegesData?.has_all_required ?? false;
  const loadAnomalies = isAnomalyDetailsEnabled && hasAnomalyPrivileges && !!entityStoreEntityId;
  const anomalyOverview = useAnomalyOverview({
    entityId: entityStoreEntityId ?? '',
    entityType: EntityType.host,
    enabled: loadAnomalies,
  });

  // Extract hostName from identityFields for components that need a string
  // Priority: identityFields['host.name'] > identityFields[first key]
  const hostName =
    identityFields[EntityIdentifierFields.hostName] || Object.values(identityFields)[0] || '';

  return (
    <>
      {!skipRiskAndCriticality && (
        <EntityHighlightsAccordion
          entityIdentifier={entityRecord ? entityRecord.entity.id : hostName}
          entityType={EntityType.host}
        />
      )}
      {!skipRiskAndCriticality &&
        riskScoreState.hasEngineBeenInstalled &&
        (riskScoreState.loading || (riskScoreState.data?.length ?? 0) > 0) && (
          <>
            <FlyoutRiskSummary
              entityType={EntityType.host}
              riskScoreData={riskScoreState}
              entityRiskScores={entityRiskScores}
              recalculatingScore={recalculatingScore}
              queryId={HOST_PANEL_RISK_SCORE_QUERY_ID}
              openDetailsPanel={openDetailsPanel}
              isPreviewMode={isPreviewMode}
              entityId={entityRecord?.entity.id}
              prefetchedResolutionRisk={prefetchedResolutionRisk}
            />
            <EuiHorizontalRule />
          </>
        )}
      {loadAnomalies && anomalyOverview.data && anomalyOverview.data.totalAnomaliesCount > 0 && (
        <>
          <AnomaliesSection
            data={anomalyOverview.data}
            entityId={entityStoreEntityId}
            isPreviewMode={isPreviewMode}
            openDetailsPanel={openDetailsPanel}
          />
        </>
      )}
      {entityStoreEntityId && (
        <>
          <VisualizationsSection
            entityId={entityStoreEntityId}
            isPreviewMode={isPreviewMode}
            scopeId={scopeId}
            openDetailsPanel={enableGraphAndResolutionNavigation ? openDetailsPanel : undefined}
          />
          <EuiHorizontalRule margin="m" />
        </>
      )}
      {entityStoreEntityId && !isPreviewMode && hasEntityResolutionLicense && (
        <>
          <ResolutionSection
            entityId={entityStoreEntityId}
            entityType={EntityType.host}
            scopeId={scopeId}
            openDetailsPanel={enableGraphAndResolutionNavigation ? openDetailsPanel : undefined}
          />
          <EuiHorizontalRule />
        </>
      )}
      {!skipRiskAndCriticality && !entityRecord && (
        <AssetCriticalityAccordion
          entity={{ name: hostName, type: EntityType.host }}
          onChange={onAssetCriticalityChange}
        />
      )}
      <EntityInsight
        entityRecord={entityRecord}
        identityFields={identityFields}
        isPreviewMode={isPreviewMode}
        openDetailsPanel={openDetailsPanel}
        entityType={EntityType.host}
      />
      <ObservedDataSection
        observedHost={observedHost}
        contextID={contextID}
        identityFields={identityFields}
        entityRecord={entityRecord}
        scopeId={scopeId}
        queryId={HOST_PANEL_OBSERVED_HOST_QUERY_ID}
      />
    </>
  );
};
