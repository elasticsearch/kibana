/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useEntityAnalyticsRoutes } from '../api';

export const ANOMALY_OVERVIEW_QUERY_KEY = ['POST', 'FETCH_ANOMALY_OVERVIEW'] as const;

interface UseAnomalyOverviewParams {
  entityId: string;
  entityType: string;
  from?: number;
  to?: number;
  threatTactics?: string[];
  minScore?: number;
  maxScore?: number;
  enabled?: boolean;
}

export const useAnomalyOverview = ({
  entityId,
  entityType,
  from,
  to,
  threatTactics,
  minScore,
  maxScore,
  enabled = true,
}: UseAnomalyOverviewParams) => {
  const { fetchAnomalyOverview } = useEntityAnalyticsRoutes();

  const hasBody =
    from !== undefined ||
    to !== undefined ||
    (threatTactics && threatTactics.length > 0) ||
    minScore !== undefined ||
    maxScore !== undefined;
  const body = hasBody
    ? { from, to, threat_tactics: threatTactics, min_score: minScore, max_score: maxScore }
    : undefined;

  return useQuery(
    [
      ...ANOMALY_OVERVIEW_QUERY_KEY,
      entityType,
      entityId,
      from,
      to,
      threatTactics,
      minScore,
      maxScore,
    ],
    ({ signal }) => fetchAnomalyOverview({ entityType, entityId, body, signal }),
    { enabled: enabled && !!entityId, keepPreviousData: true, refetchOnWindowFocus: false }
  );
};
