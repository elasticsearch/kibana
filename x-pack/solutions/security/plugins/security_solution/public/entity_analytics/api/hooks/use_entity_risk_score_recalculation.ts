/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@kbn/react-query';
import type { EntityType } from '../../../../common/entity_analytics/types';
import type { Refetch } from '../../../common/types';
import { useEntityRiskScores, type EntityRiskScoresState } from './use_entity_risk_scores';
import { useCalculateEntityRiskScore } from './use_calculate_entity_risk_score';
import { useRefetchQueryById } from './use_refetch_query_by_id';
import { RISK_INPUTS_TAB_QUERY_ID } from '../../components/entity_details_flyout/tabs/risk_inputs/risk_inputs_tab';
import { RESOLUTION_GROUP_QUERY_KEY } from '../../components/entity_resolution/hooks/use_resolution_group';

interface UseEntityRiskScoreRecalculationParams<T extends EntityType> {
  entityType: T;
  identifier: string;
  entityId: string | undefined;
  entityStoreV2Enabled: boolean;
  entityFromStoreResult: { refetch: () => void };
  riskScoreState: { refetch: () => void };
  onRecalculation?: () => void;
}

interface UseEntityRiskScoreRecalculationResult<T extends EntityType> {
  entityRiskScores: EntityRiskScoresState<T>;
  calculateEntityRiskScore: () => void;
  recalculatingScore: boolean;
}

/**
 * Encapsulates the repeated pattern of fetching entity risk scores and wiring
 * up the recalculation callback that appears in every entity-detail panel:
 *   1. useEntityRiskScores — fetches base + resolution scores by EUID
 *   2. onRiskScoreUpdated — refetches V1 or V2 data after a recalculation
 *   3. useCalculateEntityRiskScore — triggers an on-demand recalculation
 *
 * Pass `onRecalculation` for any additional invalidations that differ per
 * context (e.g. entities table in flyout panels, attachment query client in
 * the agent-builder canvas).
 */
export const useEntityRiskScoreRecalculation = <T extends EntityType>({
  entityType,
  identifier,
  entityId,
  entityStoreV2Enabled,
  entityFromStoreResult,
  riskScoreState,
  onRecalculation,
}: UseEntityRiskScoreRecalculationParams<T>): UseEntityRiskScoreRecalculationResult<T> => {
  const entityRiskScores = useEntityRiskScores(entityType, entityId);
  const refetchRiskInputsTab = useRefetchQueryById(RISK_INPUTS_TAB_QUERY_ID);
  const queryClient = useQueryClient();

  const onRiskScoreUpdated = useCallback(() => {
    if (entityStoreV2Enabled) {
      entityFromStoreResult.refetch();
    } else {
      riskScoreState.refetch();
    }
    entityRiskScores.refetch();
    (refetchRiskInputsTab as Refetch | null)?.();
    queryClient.invalidateQueries({ queryKey: [RESOLUTION_GROUP_QUERY_KEY] });
    onRecalculation?.();
  }, [
    entityStoreV2Enabled,
    entityFromStoreResult,
    riskScoreState,
    entityRiskScores,
    refetchRiskInputsTab,
    queryClient,
    onRecalculation,
  ]);

  const { isLoading: recalculatingScore, calculateEntityRiskScore } = useCalculateEntityRiskScore({
    identifierType: entityType,
    identifier,
    entityId,
    onSuccess: onRiskScoreUpdated,
  });

  return { entityRiskScores, calculateEntityRiskScore, recalculatingScore };
};
