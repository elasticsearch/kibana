/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import type { EntityType } from '../../../../common/entity_analytics/types';
import { useRiskScore, type RiskScoreState } from './use_risk_score';
import { useResolutionGroup } from '../../components/entity_resolution/hooks/use_resolution_group';
import { getEntityId } from '../../components/entity_resolution/helpers';

const FIRST_RECORD_PAGINATION = {
  cursorStart: 0,
  querySize: 1,
};

export interface EntityRiskScoresState<T extends EntityType> {
  base: RiskScoreState<T>;
  resolution: {
    state: RiskScoreState<T>;
    hasResolutionGroup: boolean;
    resolutionTargetEntityId: string | undefined;
  };
  refetch: () => void;
}

/**
 * Fetches an entity's base and resolution-group risk scores in parallel, with one
 * `refetch` that refreshes both queries.
 */
export const useEntityRiskScores = <T extends EntityType>(
  entityType: T,
  entityId: string | undefined
): EntityRiskScoresState<T> => {
  const baseFilterQuery = useMemo(
    () =>
      entityId
        ? {
            bool: {
              filter: [{ term: { [`${entityType}.risk.id_value`]: entityId } }],
              must_not: [{ term: { [`${entityType}.risk.score_type`]: 'resolution' } }],
            },
          }
        : undefined,
    [entityId, entityType]
  );
  const base = useRiskScore({
    riskEntity: entityType,
    filterQuery: baseFilterQuery,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: !entityId,
  });

  const { data: resolutionGroup } = useResolutionGroup(entityId ?? '', {
    enabled: Boolean(entityId),
  });
  const hasResolutionGroup = (resolutionGroup?.group_size ?? 0) > 1;
  const resolutionTargetEntityId = useMemo(
    () => (resolutionGroup?.target ? getEntityId(resolutionGroup.target) : undefined),
    [resolutionGroup?.target]
  );
  const shouldFetchResolution = hasResolutionGroup && Boolean(resolutionTargetEntityId);
  const resolutionFilterQuery = useMemo(
    () =>
      shouldFetchResolution && resolutionTargetEntityId
        ? {
            bool: {
              filter: [
                { term: { [`${entityType}.risk.id_value`]: resolutionTargetEntityId } },
                { term: { [`${entityType}.risk.score_type`]: 'resolution' } },
              ],
            },
          }
        : undefined,
    [entityType, resolutionTargetEntityId, shouldFetchResolution]
  );
  const resolution = useRiskScore({
    riskEntity: entityType,
    filterQuery: resolutionFilterQuery,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: !shouldFetchResolution,
  });

  const refetch = useCallback(() => {
    base.refetch();
    resolution.refetch();
  }, [base, resolution]);

  return {
    base,
    resolution: { state: resolution, hasResolutionGroup, resolutionTargetEntityId },
    refetch,
  };
};
