/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InfluencersFilterQuery } from '@kbn/ml-anomaly-utils';
import type { RuntimeMappings } from '@kbn/ml-runtime-field-utils';
import type { IndicesOptions } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { MlApi } from '../ml_api_service';

export function resultsServiceProvider(mlApi: MlApi): {
  getScoresByBucket(
    jobIds: string[],
    earliestMs: number,
    latestMs: number,
    intervalMs: number,
    perPage?: number,
    fromPage?: number,
    swimLaneSeverity?: SeverityThreshold[],
    influencersFilterQuery?: InfluencersFilterQuery
  ): Promise<any>;
  getOverallBucketScores(
    jobIds: any,
    topN: any,
    earliestMs: any,
    latestMs: any,
    interval?: any,
    overallScore?: number
  ): Promise<any>;
  getEventRateData(
    index: string,
    query: any,
    timeFieldName: string,
    earliestMs: number,
    latestMs: number,
    intervalMs: number,
    runtimeMappings?: RuntimeMappings,
    indicesOptions?: IndicesOptions,
    projectRouting?: string
  ): Promise<any>;
  getRecordMaxScoreByTime(
    jobId: string,
    criteriaFields: any[],
    earliestMs: number,
    latestMs: number,
    intervalMs: number,
    actualPlotFunctionIfMetric?: string
  ): Promise<any>;
};
