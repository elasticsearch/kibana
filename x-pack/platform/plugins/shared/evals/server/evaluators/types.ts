/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { Logger } from '@kbn/logging';

export interface TraceAccessor {
  traceId: string;
  esClient: ElasticsearchClient;
}

export interface EvaluatorContext {
  trace: TraceAccessor;
  referenceData?: Record<string, unknown>;
  inferenceClient?: BoundInferenceClient;
  log: Logger;
}

export interface EvaluatorResult {
  scores: Array<{
    name: string;
    score?: number | null;
    label?: string;
    explanation?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface EvaluatorDefinition {
  name: string;
  version: string;
  kind: 'llm' | 'code';
  description: string;
  supportedInputs: Array<'trace' | 'reference_data'>;
  evaluate(ctx: EvaluatorContext): Promise<EvaluatorResult>;
}

export interface EvaluatorRegistry {
  list(): EvaluatorDefinition[];
  get(name: string, version?: string): EvaluatorDefinition | undefined;
}
