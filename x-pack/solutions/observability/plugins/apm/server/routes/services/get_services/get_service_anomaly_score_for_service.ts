/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnomalyDetectorType } from '@kbn/apm-types';
import type { MlClient } from '../../../lib/helpers/get_ml_client';
import { getServiceAnomalies } from '../../service_map/get_service_anomalies';

export interface ServiceAnomalyScoreResponse {
  anomalyScore?: number;
  detectorType?: AnomalyDetectorType;
}

/**
 * Max ML record score for a single service in the time range (same aggregation as service inventory).
 * Uses `getServiceAnomalies` with an exact `term` on the ML partition field so short names do not wildcard-match many services.
 */
export async function getServiceAnomalyScoreForService({
  mlClient,
  environment,
  start,
  end,
  serviceName,
}: {
  mlClient: MlClient;
  environment: string;
  start: number;
  end: number;
  serviceName: string;
}): Promise<ServiceAnomalyScoreResponse> {
  const { serviceAnomalies } = await getServiceAnomalies({
    mlClient,
    environment,
    start,
    end,
    exactServiceName: serviceName,
  });

  const row = serviceAnomalies.find((item) => item.serviceName === serviceName);
  if (!row) {
    return {};
  }

  return { anomalyScore: row.anomalyScore, detectorType: row.detectorType };
}
