/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type BaseFeature } from '@kbn/significant-events-schema';
import type { EvaluationCriterion, Evaluator } from '@kbn/evals';
import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';

export const VALID_KI_FEATURE_TYPES = [
  'entity',
  'infrastructure',
  'technology',
  'dependency',
  'schema',
] as const;

export type ValidKIFeatureType = (typeof VALID_KI_FEATURE_TYPES)[number];

export interface KIFeatureExtractionEvaluationExample {
  input: {
    sample_documents?: Array<SearchHit<Record<string, unknown>>>;
  } & Record<string, unknown>;
  output: {
    criteria: EvaluationCriterion[];
    weight?: number;
    min_features?: number;
    max_features?: number;
    required_types?: ValidKIFeatureType[];
    forbidden_types?: ValidKIFeatureType[];
    expect_entity_filters?: boolean;
    expected_ground_truth: string;
    expected?: string;
  };
  metadata: Record<string, unknown> | null;
}

export interface KIFeatureExtractionEvaluationDataset {
  name: string;
  description: string;
  examples: KIFeatureExtractionEvaluationExample[];
}

interface KIFeatureExtractionTaskOutput {
  features: BaseFeature[];
  traceId?: string | null;
  sample_documents?: Array<SearchHit<Record<string, unknown>>>;
}

export type KIFeatureExtractionOutput = BaseFeature[] | KIFeatureExtractionTaskOutput;

export type KIFeatureExtractionEvaluator = Evaluator<
  KIFeatureExtractionEvaluationExample,
  KIFeatureExtractionOutput
>;

export const getFeaturesFromOutput = (
  output: KIFeatureExtractionOutput | undefined
): BaseFeature[] => {
  if (!output) {
    return [];
  }
  return Array.isArray(output) ? output : output.features ?? [];
};
