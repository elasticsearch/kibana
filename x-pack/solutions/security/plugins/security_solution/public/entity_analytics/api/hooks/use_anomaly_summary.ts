/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import type {
  AnomalySummaryRequestBody,
  GetAnomalySummaryRequestBodyInput,
} from '../../../../common/api/entity_analytics';
import { useEntityAnalyticsRoutes } from '../api';

export const ANOMALY_SUMMARY_QUERY_KEY = ['POST', 'FETCH_ANOMALY_SUMMARY'] as const;

interface UseAnomalySummaryParams {
  entityId: string;
  entityType: string;
  body?: GetAnomalySummaryRequestBodyInput;
  enabled?: boolean;
}

const DEFAULT_BODY: Required<Pick<AnomalySummaryRequestBody, 'page' | 'page_size' | 'sort'>> = {
  page: 1,
  page_size: 10,
  sort: [{ field: 'timestamp', order: 'desc' }],
};

export const useAnomalySummary = ({
  entityId,
  entityType,
  body,
  enabled = true,
}: UseAnomalySummaryParams) => {
  const { fetchAnomalySummary } = useEntityAnalyticsRoutes();

  const resolvedBody: AnomalySummaryRequestBody = { ...DEFAULT_BODY, ...body };

  return useQuery(
    [...ANOMALY_SUMMARY_QUERY_KEY, entityType, entityId, resolvedBody],
    ({ signal }) => fetchAnomalySummary({ entityType, entityId, body: resolvedBody, signal }),
    { enabled: enabled && !!entityId, keepPreviousData: true, refetchOnWindowFocus: false }
  );
};
