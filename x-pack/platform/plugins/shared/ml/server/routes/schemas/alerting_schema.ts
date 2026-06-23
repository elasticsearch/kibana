/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { mlAnomalyDetectionAlertParamsSchema } from '@kbn/response-ops-rule-params/anomaly_detection';
import type { anomalyDetectionJobsHealthRuleParamsSchema } from '@kbn/response-ops-rule-params/anomaly_detection_jobs_health';

import { ALERT_PREVIEW_SAMPLE_SIZE } from '../../../common/constants/alerts';

export const mlAnomalyDetectionAlertPreviewRequest = schema.object({
  alertParams: mlAnomalyDetectionAlertParamsSchema,
  /**
   * Relative time range to look back from now, e.g. 1y, 8m, 15d
   */
  timeRange: schema.string({ maxLength: 10000 }),
  /**
   * Number of top hits to return
   */
  sampleSize: schema.number({ defaultValue: ALERT_PREVIEW_SAMPLE_SIZE, min: 0 }),
});

export type MlAnomalyDetectionAlertParams = TypeOf<typeof mlAnomalyDetectionAlertParamsSchema>;

export type MlAnomalyDetectionAlertPreviewRequest = TypeOf<
  typeof mlAnomalyDetectionAlertPreviewRequest
>;

export type AnomalyDetectionJobsHealthRuleParams = TypeOf<
  typeof anomalyDetectionJobsHealthRuleParamsSchema
>;

export type TestsConfig = AnomalyDetectionJobsHealthRuleParams['testsConfig'];
export type JobSelection = AnomalyDetectionJobsHealthRuleParams['includeJobs'];
