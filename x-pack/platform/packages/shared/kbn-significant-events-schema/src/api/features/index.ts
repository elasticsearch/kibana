/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { ChatCompletionTokenCount } from '@kbn/inference-common';
import type { BaseFeature } from '../../feature';

export const tokenCountSchema = z.object({
  prompt: z.number(),
  completion: z.number(),
  thinking: z.number().optional(),
  total: z.number(),
  cached: z.number().optional(),
});

const featureSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const iterationResultSchema = z.object({
  runId: z.string(),
  iteration: z.number(),
  durationMs: z.number(),
  state: z.enum(['success', 'failure']),
  tokensUsed: tokenCountSchema,
  newFeatures: z.array(featureSummarySchema),
  updatedFeatures: z.array(featureSummarySchema),
});

export type IterationResult = z.infer<typeof iterationResultSchema>;

export interface IdentifyFeaturesResult {
  features: BaseFeature[];
  durationMs: number;
  iterations?: IterationResult[];
  totalTokensUsed?: ChatCompletionTokenCount;
}
