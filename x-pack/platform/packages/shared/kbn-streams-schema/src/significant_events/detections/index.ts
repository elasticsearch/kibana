/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { MAX_ID_LENGTH } from '../constants';

const detectionEvidenceSchema = z.object({
  change_point_type: z.string().optional(),
  p_value: z.number().optional(),
});

export const detectionSchema = z.object({
  '@timestamp': z.iso.datetime(),
  kind: z.enum(['detection', 'quiet', 'handled']),
  processed: z.boolean(),
  detection_id: z.string().max(MAX_ID_LENGTH),
  rule_uuid: z.string(),
  rule_name: z.string(),
  stream_name: z.string().optional(),
  alert_count: z.number().optional(),
  alert_index: z.string().optional(),
  workflow_execution_id: z.string().optional(),
  resolution_lookback_minutes: z.number().optional(),
  peak_alert_count: z.number().optional(),
  detection_evidence: detectionEvidenceSchema.optional(),
  alert_samples: z.array(z.record(z.string(), z.unknown())).optional(),
  rules_activity: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type Detection = z.infer<typeof detectionSchema>;
