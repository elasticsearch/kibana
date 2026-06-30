/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { MAX_ID_LENGTH, MAX_RULE_NAME_LENGTH } from './constants';

export const dependencyEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  protocol: z.string().optional(),
  exposure: z.string().optional(),
});

export const infraComponentSchema = z.object({
  title: z.string().optional(),
  workloads: z.array(z.string()).optional(),
  exposure: z.string().optional(),
});

export const causeKiSchema = z.object({
  name: z.string().optional(),
  stream_name: z.string().optional(),
});

export const evidenceSchema = z.object({
  rule_name: z.string().max(MAX_RULE_NAME_LENGTH).optional(),
  rule_uuid: z.string().max(MAX_ID_LENGTH).optional(),
  result: z.string().optional(),
  description: z.string().optional(),
  stream_name: z.string().optional(),
  row_count: z.number().optional(),
  collected_at: z.string().optional(),
  esql_query: z.string().nullable().optional(),
  confirmed: z.boolean().optional(),
});
