/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiHorizontalRule } from '@elastic/eui';
import type { Entity } from '../../../../common/api/entity_analytics';
import { ObservedDataSection } from './components/observed_data_section';
import { useHasEntityResolutionLicense } from '../../../common/hooks/use_has_entity_resolution_license';
import { EntityHighlightsAccordion } from '../../../entity_analytics/components/entity_details_flyout/components/entity_highlights';
import { EntityInsight } from '../../../cloud_security_posture/components/entity_insight';
import { AssetCriticalityAccordion } from '../../../entity_analytics/components/asset_criticality/asset_criticality_selector';
import { FlyoutRiskSummary } from '../../../entity_analytics/components/risk_summary_flyout/risk_summary';
import type { RiskScoreState } from '../../../entity_analytics/api/hooks/use_risk_score';
import { EntityIdentifierFields, EntityType } from '../../../../common/entity_analytics/types';
import { HOST_PANEL_OBSERVED_HOST_QUERY_ID, HOST_PANEL_RISK_SCORE_QUERY_ID } from './constants';
import type { EntityDetailsPath } from '../shared/components/left_panel/left_panel_header';
import type { IdentityFields } from '../../document_details/shared/utils';
import type { ObservedEntityData } from '../shared/components/observed_entity/types';
import type { EntityRiskScore, HostItem } from '../../../../common/search_strategy';
import { VisualizationsSection } from '../shared/components/right/visualizations_section';
import { ResolutionSection } from '../../../entity_analytics/components/entity_resolution/resolution_section';

type ObservedHostData = Omit<ObservedEntityData<HostItem>, 'anomalies'>;

interface HostPanelContentProps {
  observedHost: ObservedHostData;
  riskScoreState: RiskScoreState<EntityType.host>;
  contextID: string;
  scopeId: string;
  openDetailsPanel: (path: EntityDetailsPath) => void;
  identityFields: IdentityFields;
  onAssetCriticalityChange: () => void;
  recalculatingScore: boolean;
  isPreviewMode: boolean;
  /** When using Entity Store v2: entity record for asset criticality upsert. */
  entityRecord?: Entity;
  /** When true (e.g. entity store v2 enabled but no entity found), hide risk score and asset criticality. */
  skipRiskAndCriticality?: boolean;
  entityStoreEntityId?: string;
  /** See {@link RiskSummaryProps.prefetchedResolutionRisk}. */
  prefetchedResolutionRisk?: EntityRiskScore<EntityType.host>;
}

export const HostPanelContent = ({
  identityFields,
  observedHost,
  riskScoreState,
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
}: HostPanelContentProps) => {
  const hasEntityResolutionLicense = useHasEntityResolutionLicense();

  // Extract hostName from identityFields for components that need a string
  // Priority: identityFields['host.name'] > identityFields[first key]
  const hostName =
    identityFields[EntityIdentifierFields.hostName] || Object.values(identityFields)[0] || '';

  return (
    <>
      {!skipRiskAndCriticality && (
        <EntityHighlightsAccordion
          entityIdentifier={entityRecord?.entity?.id ?? hostName}
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
              recalculatingScore={recalculatingScore}
              queryId={HOST_PANEL_RISK_SCORE_QUERY_ID}
              openDetailsPanel={openDetailsPanel}
              isPreviewMode={isPreviewMode}
              entityId={entityRecord?.entity?.id}
              prefetchedResolutionRisk={prefetchedResolutionRisk}
            />
            <EuiHorizontalRule />
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
            entityType={EntityType.host}
            scopeId={scopeId}
            openDetailsPanel={openDetailsPanel}
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
