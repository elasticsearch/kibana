/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ES_AGGREGATION } from '@kbn/ml-anomaly-utils';
import { type RuntimeMappings } from '@kbn/ml-runtime-field-utils';
import type { Job } from './anomaly_detection_jobs/job';
import type { JobStats } from './anomaly_detection_jobs/job_stats';
import type { IndicesOptions } from './anomaly_detection_jobs/datafeed';
import type { ErrorType } from './errors';

export interface MlJobsResponse {
  jobs: Job[];
  count: number;
}

export interface MlJobsStatsResponse {
  jobs: JobStats[];
  count: number;
}

export interface JobsExistResponse {
  [jobId: string]: {
    exists: boolean;
    isGroup: boolean;
  };
}

export interface BucketSpanEstimatorData {
  aggTypes: Array<ES_AGGREGATION | null>;
  duration: {
    start: number;
    end: number;
  };
  fields: Array<string | null>;
  index: string;
  query?: any;
  splitField?: string;
  timeField?: string;
  runtimeMappings?: RuntimeMappings;
  indicesOptions?: IndicesOptions;
  projectRouting?: string;
}

export interface BulkCreateResults {
  [id: string]: {
    job: { success: boolean; error?: ErrorType };
    datafeed: { success: boolean; error?: ErrorType };
  };
}

export interface BulkUpdateProjectRoutingResponse {
  simulate: boolean;
  results: {
    [jobId: string]: {
      success: boolean;
      error?: unknown;
      /** When `stopDatafeed` failed before the update, for a datafeed that was running. */
      stopError?: unknown;
      /** When `startDatafeed` failed after the update, for a datafeed that was restarted. */
      restartError?: unknown;
      datafeedId: string;
      simulated?: boolean;
    };
  };
}

export interface ResetJobsResponse {
  [jobId: string]: {
    reset: boolean;
    task?: string;
    error?: ErrorType;
  };
}

export interface UpdateGroupsRequest {
  jobs: Array<{ jobId: string; groups: string[] }>;
}
