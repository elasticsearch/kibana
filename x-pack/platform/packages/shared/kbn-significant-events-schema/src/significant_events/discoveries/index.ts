/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { MAX_STREAM_NAME_LENGTH } from '@kbn/streams-schema';
import {
  dependencyEdgeSchema,
  infraComponentSchema,
  causeKiSchema,
  evidenceSchema,
} from '../common_schemas';
import {
  MAX_ID_LENGTH,
  MAX_RULE_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TEXT_LENGTH,
} from '../constants';

const discoveryDetectionSchema = z.object({
  kind: z.enum(['detection', 'quiet', 'handled']),
  detection_id: z.string().max(MAX_ID_LENGTH).optional(),
  rule_name: z.string().max(MAX_RULE_NAME_LENGTH).optional(),
  rule_uuid: z.string().max(MAX_ID_LENGTH).optional(),
  stream_name: z.string().max(MAX_STREAM_NAME_LENGTH).optional(),
  change_point_type: z.string().max(MAX_ID_LENGTH).optional(),
  p_value: z.number().optional(),
  event_count: z.number().optional(),
  alert_count: z.number().optional(),
});

export const discoverySchema = z.object({
  '@timestamp': z.iso.datetime(),
  kind: z.enum(['discovery', 'clearance', 'handled']),
  discovery_id: z.string().max(MAX_ID_LENGTH),
  discovery_slug: z.string().max(MAX_ID_LENGTH),
  discovered_at: z.iso.datetime().optional(),
  rule_names: z.array(z.string().max(MAX_RULE_NAME_LENGTH)),
  stream_names: z.array(z.string().max(MAX_STREAM_NAME_LENGTH)),
  title: z.string().max(MAX_TITLE_LENGTH),
  summary: z.string().max(MAX_TEXT_LENGTH),
  root_cause: z.string().max(MAX_TEXT_LENGTH),
  criticality: z.number(),
  confidence: z.number(),
  impact: z.string().max(MAX_TEXT_LENGTH),
  detections: z.array(discoveryDetectionSchema),
  dependency_edges: z.array(dependencyEdgeSchema).optional(),
  infra_components: z.array(infraComponentSchema).optional(),
  cause_kis: z.array(causeKiSchema).optional(),
  evidences: z.array(evidenceSchema).optional(),
  parent_discovery_id: z.string().max(MAX_ID_LENGTH).optional(),
  grouped_discovery_ids: z.array(z.string().max(MAX_ID_LENGTH)).optional(),
  grouping_rationale: z.string().max(MAX_TEXT_LENGTH).optional(),
  previous_discovery_id: z.string().max(MAX_ID_LENGTH).optional(),
  change_point_occurrence: z.string().max(MAX_ID_LENGTH).optional(),
  workflow_execution_id: z.string().max(MAX_ID_LENGTH).optional(),
  conversation_id: z.string().max(MAX_ID_LENGTH).optional(),
  closed_by_execution_id: z.string().max(MAX_ID_LENGTH).optional(),
  processed: z.boolean(),
});

export type Discovery = z.infer<typeof discoverySchema>;
