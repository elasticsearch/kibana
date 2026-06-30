/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiHorizontalRule } from '@elastic/eui';
import React from 'react';
import { useIsExperimentalFeatureEnabled } from '../../../common/hooks/use_experimental_features';
import type { Entity } from '../../../../common/api/entity_analytics';
import { useAnomalyOverview } from '../../../entity_analytics/api/hooks/use_anomaly_overview';
import { ObservedDataSection } from './components/observed_data_section';
import { useHasEntityResolutionLicense } from '../../../common/hooks/use_has_entity_resolution_license';
import { EntityHighlightsAccordion } from '../../../entity_analytics/components/entity_details_flyout/components/entity_highlights';
import { AssetCriticalityAccordion } from '../../../entity_analytics/components/asset_criticality/asset_criticality_selector';
import { FlyoutRiskSummary } from '../../../entity_analytics/components/risk_summary_flyout/risk_summary';
import type { RiskScoreState } from '../../../entity_analytics/api/hooks/use_risk_score';
import type { EntityRiskScoresState } from '../../../entity_analytics/api/hooks/use_entity_risk_scores';
import { EntityIdentifierFields, EntityType } from '../../../../common/entity_analytics/types';
import { USER_PANEL_OBSERVED_USER_QUERY_ID, USER_PANEL_RISK_SCORE_QUERY_ID } from '.';
import type { EntityDetailsPath } from '../shared/components/left_panel/left_panel_header';
import { EntityInsight } from '../../../cloud_security_posture/components/entity_insight';
import type { IdentityFields } from '../../document_details/shared/utils';
import type { EntityRiskScore, UserItem } from '../../../../common/search_strategy';
import type { ObservedEntityData } from '../shared/components/observed_entity/types';
import type { EntityStoreRecord } from '../shared/hooks/use_entity_from_store';
import { VisualizationsSection } from '../shared/components/right/visualizations_section';
import { ResolutionSection } from '../../../entity_analytics/components/entity_resolution/resolution_section';
import { AnomaliesSection } from '../../../entity_analytics/components/anomalies/anomalies_section';

export type ObservedUserData = Omit<ObservedEntityData<UserItem>, 'anomalies'> & {
  entityRecord?: EntityStoreRecord | null;
  refetchEntityStore?: () => void;
};

interface UserPanelContentProps {
  identityFields: IdentityFields;
  observedUser: ObservedUserData;
  riskScoreState: RiskScoreState<EntityType.user>;
  entityRiskScores: EntityRiskScoresState<EntityType.user>;
  recalculatingScore: boolean;
  contextID: string;
  scopeId: string;
  onAssetCriticalityChange: () => void;
  openDetailsPanel: (path: EntityDetailsPath) => void;
  isPreviewMode: boolean;
  entityRecord?: Entity;
  /** When true (e.g. entity store v2 enabled but no entity found), hide risk score and asset criticality. */
  skipRiskAndCriticality?: boolean;
  entityStoreEntityId?: string;
  /** See {@link RiskSummaryProps.prefetchedResolutionRisk}. */
  prefetchedResolutionRisk?: EntityRiskScore<EntityType.user>;
}

export const UserPanelContent = ({
  identityFields,
  observedUser,
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
}: UserPanelContentProps) => {
  const hasEntityResolutionLicense = useHasEntityResolutionLicense();
  const isAnomalyDetailsEnabled = useIsExperimentalFeatureEnabled('entityAnalyticsAnomalyDetails');

  const anomalyOverview = useAnomalyOverview({
    entityId: entityStoreEntityId ?? '',
    entityType: EntityType.user,
    enabled: isAnomalyDetailsEnabled && !!entityStoreEntityId,
  });

  // Extract userName from identityFields for components that need a string
  // Priority: identityFields['user.name'] > identityFields[first key]
  const userName =
    identityFields[EntityIdentifierFields.userName] || Object.values(identityFields)[0] || '';

  return (
    <>
      {!skipRiskAndCriticality && (
        <EntityHighlightsAccordion
          entityIdentifier={entityRecord ? entityRecord.entity.id : userName}
          entityType={EntityType.user}
        />
      )}
      {!skipRiskAndCriticality &&
        riskScoreState.hasEngineBeenInstalled &&
        riskScoreState.data?.length !== 0 && (
          <>
            <FlyoutRiskSummary
              riskScoreData={riskScoreState}
              entityRiskScores={entityRiskScores}
              recalculatingScore={recalculatingScore}
              queryId={USER_PANEL_RISK_SCORE_QUERY_ID}
              openDetailsPanel={openDetailsPanel}
              isPreviewMode={isPreviewMode}
              entityType={EntityType.user}
              entityId={entityRecord?.entity.id}
              prefetchedResolutionRisk={prefetchedResolutionRisk}
            />
            <EuiHorizontalRule />
          </>
        )}
      {isAnomalyDetailsEnabled &&
        entityStoreEntityId &&
        anomalyOverview.data &&
        anomalyOverview.data.totalAnomaliesCount > 0 && (
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
            openDetailsPanel={openDetailsPanel}
          />
          <EuiHorizontalRule margin="m" />
        </>
      )}
      {entityStoreEntityId && !isPreviewMode && hasEntityResolutionLicense && (
        <>
          <ResolutionSection
            entityId={entityStoreEntityId}
            entityType={EntityType.user}
            scopeId={scopeId}
            openDetailsPanel={openDetailsPanel}
          />
          <EuiHorizontalRule />
        </>
      )}
      {!skipRiskAndCriticality && !entityRecord && (
        <AssetCriticalityAccordion
          entity={{ name: userName, type: EntityType.user }}
          onChange={onAssetCriticalityChange}
        />
      )}
      <EntityInsight
        entityRecord={entityRecord}
        identityFields={identityFields}
        isPreviewMode={isPreviewMode}
        openDetailsPanel={openDetailsPanel}
        entityType={EntityType.user}
      />
      <ObservedDataSection
        identityFields={identityFields}
        entityRecord={entityRecord}
        userName={userName}
        observedUser={observedUser}
        contextID={contextID}
        scopeId={scopeId}
        queryId={USER_PANEL_OBSERVED_USER_QUERY_ID}
      />
      <EuiHorizontalRule margin="m" />
    </>
  );
};
