/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnomalyDetectorType } from '@kbn/apm-types';
import type { MlClient } from '../../../lib/helpers/get_ml_client';
import { getServiceAnomalies } from '../../service_map/get_service_anomalies';

interface AggregationParams {
  environment: string;
  mlClient?: MlClient;
  start: number;
  end: number;
  searchQuery: string | undefined;
}

export type ServiceAnomalyScoresResponse = Array<{
  serviceName: string;
  anomalyScore: number;
  detectorType?: AnomalyDetectorType;
}>;

export async function getServiceAnomalyScores({
  environment,
  mlClient,
  start,
  end,
  searchQuery,
}: AggregationParams): Promise<ServiceAnomalyScoresResponse> {
  if (!mlClient) {
    return [];
  }

  const { serviceAnomalies } = await getServiceAnomalies({
    mlClient,
    environment,
    start,
    end,
    searchQuery,
  });

  return serviceAnomalies.map(({ serviceName, anomalyScore, detectorType }) => ({
    serviceName,
    anomalyScore,
    detectorType,
  }));
}
