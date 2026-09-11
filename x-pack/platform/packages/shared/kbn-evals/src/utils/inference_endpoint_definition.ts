/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceEndpointRequestBody } from '@kbn/inference-common';

type AddEndpointConfig = InferenceEndpointRequestBody['config'];

export interface InferenceEndpointDefinition
  extends Pick<AddEndpointConfig, 'inferenceId' | 'provider' | 'taskType'>,
    Partial<Pick<AddEndpointConfig, 'providerConfig' | 'taskTypeConfig' | 'headers'>> {
  type: 'inference_endpoint';
  id: string;
  name: string;
  secrets?: Partial<InferenceEndpointRequestBody['secrets']>;
}

/**
 * Loads inference endpoint definitions from `KIBANA_TESTING_INFERENCE_ENDPOINTS`.
 * Accepts base64-encoded JSON or raw JSON. Returns an empty array if the env var is not set.
 */
export function loadInferenceEndpoints(): InferenceEndpointDefinition[] {
  const raw = process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS;
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        'KIBANA_TESTING_INFERENCE_ENDPOINTS is not valid base64-encoded JSON or raw JSON'
      );
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('KIBANA_TESTING_INFERENCE_ENDPOINTS must be a JSON object');
  }

  return Object.entries(parsed as Record<string, unknown>).map(([id, def]) => {
    const d = def as Record<string, unknown>;
    if (typeof d.inferenceId !== 'string' || d.inferenceId.length === 0) {
      throw new Error(`Inference endpoint "${id}" is missing required field "inferenceId"`);
    }
    if (typeof d.provider !== 'string' || d.provider.length === 0) {
      throw new Error(`Inference endpoint "${id}" is missing required field "provider"`);
    }
    if (typeof d.taskType !== 'string' || d.taskType.length === 0) {
      throw new Error(`Inference endpoint "${id}" is missing required field "taskType"`);
    }
    return { id, ...d, type: 'inference_endpoint' } as InferenceEndpointDefinition;
  });
}
