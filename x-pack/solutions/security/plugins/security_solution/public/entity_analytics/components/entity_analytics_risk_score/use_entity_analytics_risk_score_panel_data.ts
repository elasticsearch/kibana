/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityRiskScore } from '../../../../common/search_strategy';
import { EntityType } from '../../../../common/entity_analytics/types';
import type { ESQuery } from '../../../../common/typed_json';
import { useEntityStoreRiskScoreKpi } from '../../api/hooks/use_entity_store_risk_score_kpi';
import { useEntityStoreRiskScore } from '../../api/hooks/use_entity_store_risk_score';
import { useRiskScoreKpi } from '../../api/hooks/use_risk_score_kpi';
import { useRiskScore } from '../../api/hooks/use_risk_score';

export const useEntityAnalyticsRiskScorePanelData = <T extends EntityType>({
  riskEntity,
  toggleStatus,
  filterQuery,
  timerange,
}: {
  riskEntity: T;
  toggleStatus: boolean;
  filterQuery?: ESQuery | string;
  timerange: { from: string; to: string };
}) => {
  // Entity store v2 only carries risk for host/user; service/generic risk
  // continues to flow through the legacy risk-score search strategy.
  const isHostOrUserRiskEntity = riskEntity === EntityType.host || riskEntity === EntityType.user;

  const legacyKpi = useRiskScoreKpi({
    filterQuery,
    skip: !toggleStatus || isHostOrUserRiskEntity,
    timerange,
    riskEntity,
  });

  const entityStoreKpi = useEntityStoreRiskScoreKpi({
    filterQuery,
    skip: !toggleStatus || !isHostOrUserRiskEntity,
    timerange,
    riskEntity,
  });

  const kpi = isHostOrUserRiskEntity ? entityStoreKpi : legacyKpi;

  const legacyRiskScore = useRiskScore({
    filterQuery,
    skip: !toggleStatus || isHostOrUserRiskEntity,
    pagination: {
      cursorStart: 0,
      querySize: 5,
    },
    timerange,
    riskEntity,
    includeAlertsCount: true,
  });

  const entityStoreRiskScore = useEntityStoreRiskScore({
    filterQuery,
    skip: !toggleStatus || !isHostOrUserRiskEntity,
    pagination: {
      cursorStart: 0,
      querySize: 5,
    },
    timerange,
    riskEntity: riskEntity as EntityType.host,
  });

  const riskScore = isHostOrUserRiskEntity ? entityStoreRiskScore : legacyRiskScore;

  return {
    severityCount: kpi.severityCount,
    isKpiLoading: kpi.loading,
    refetchKpi: kpi.refetch,
    inspectKpi: kpi.inspect,
    data: riskScore.data as Array<EntityRiskScore<T>> | undefined,
    isTableLoading: riskScore.loading,
    inspect: riskScore.inspect,
    refetch: riskScore.refetch,
    isAuthorized: riskScore.isAuthorized,
    hasEngineBeenInstalled: riskScore.hasEngineBeenInstalled,
  };
};
