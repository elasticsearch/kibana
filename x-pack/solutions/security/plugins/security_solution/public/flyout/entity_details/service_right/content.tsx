/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiHorizontalRule } from '@elastic/eui';
import React from 'react';
import type { EntityRiskScore, ServiceItem } from '../../../../common/search_strategy';
import type { Entity } from '../../../../common/api/entity_analytics';
import { AssetCriticalityAccordion } from '../../../entity_analytics/components/asset_criticality/asset_criticality_selector';
import { FlyoutRiskSummary } from '../../../entity_analytics/components/risk_summary_flyout/risk_summary';
import type { RiskScoreState } from '../../../entity_analytics/api/hooks/use_risk_score';
import { EntityType } from '../../../../common/entity_analytics/types';
import { SERVICE_PANEL_RISK_SCORE_QUERY_ID } from '.';
import { ObservedEntity } from '../shared/components/observed_entity';
import type { ObservedEntityData } from '../shared/components/observed_entity/types';
import { useObservedServiceItems } from './hooks/use_observed_service_items';
import type { EntityDetailsPath } from '../shared/components/left_panel/left_panel_header';
import { VisualizationsSection } from '../shared/components/right/visualizations_section';
import { ResolutionSection } from '../../../entity_analytics/components/entity_resolution/resolution_section';
import { useHasEntityResolutionLicense } from '../../../common/hooks/use_has_entity_resolution_license';

export const OBSERVED_SERVICE_QUERY_ID = 'observedServiceDetailsQuery';

interface ServicePanelContentProps {
  serviceName: string;
  observedService: ObservedEntityData<ServiceItem>;
  riskScoreState: RiskScoreState<EntityType.service>;
  recalculatingScore: boolean;
  contextID: string;
  scopeId: string;
  isPreviewMode: boolean;
  onAssetCriticalityChange: () => void;
  openDetailsPanel: (path: EntityDetailsPath) => void;
  entityRecord?: Entity;
  entityStoreEntityId?: string;
  /** See {@link RiskSummaryProps.prefetchedResolutionRisk}. */
  prefetchedResolutionRisk?: EntityRiskScore<EntityType.service>;
}

export const ServicePanelContent = ({
  serviceName,
  entityRecord,
  observedService,
  riskScoreState,
  recalculatingScore,
  contextID,
  scopeId,
  isPreviewMode,
  openDetailsPanel,
  onAssetCriticalityChange,
  entityStoreEntityId,
  prefetchedResolutionRisk,
}: ServicePanelContentProps) => {
  const observedFields = useObservedServiceItems(observedService);
  const hasEntityResolutionLicense = useHasEntityResolutionLicense();

  return (
    <>
      {riskScoreState.hasEngineBeenInstalled && riskScoreState.data?.length !== 0 && (
        <>
          <FlyoutRiskSummary
            riskScoreData={riskScoreState}
            recalculatingScore={recalculatingScore}
            queryId={SERVICE_PANEL_RISK_SCORE_QUERY_ID}
            openDetailsPanel={openDetailsPanel}
            isPreviewMode={isPreviewMode}
            entityType={EntityType.service}
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
      {entityStoreEntityId && hasEntityResolutionLicense && (
        <>
          <ResolutionSection
            entityId={entityStoreEntityId}
            entityType={EntityType.service}
            scopeId={scopeId}
            openDetailsPanel={openDetailsPanel}
          />
          <EuiHorizontalRule />
        </>
      )}
      {!entityRecord && (
        <AssetCriticalityAccordion
          entity={{ name: serviceName, type: EntityType.service }}
          onChange={onAssetCriticalityChange}
        />
      )}
      <ObservedEntity
        observedData={{ ...observedService, entityId: entityRecord?.entity?.id }}
        contextID={contextID}
        scopeId={scopeId}
        observedFields={observedFields}
      />
      <EuiHorizontalRule margin="m" />
    </>
  );
};
