/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defaultInferenceEndpoints } from '@kbn/inference-common';
import type { ResourceType } from './resource_type';

export const productDocInferenceIdCandidates = [
  defaultInferenceEndpoints.JINAv5,
  defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
  defaultInferenceEndpoints.ELSER,
] as const;

/** Inference IDs that indicate Elastic Inference Service (EIS) is available. */
export const eisInferenceIdCandidates = [
  defaultInferenceEndpoints.JINAv5,
  defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
] as const;

export interface ResolveDefaultInferenceIdOptions {
  /**
   * Reserved for future resource-specific defaults. Currently unused: all knowledge
   * base content (product docs, Security Labs, OpenAPI) shares the same Jina → EIS
   * ELSER → ELSER priority.
   */
  resourceType?: ResourceType;
}

/**
 * Returns true when at least one EIS-backed embedding endpoint is present
 * (Jina v5 or ELSER-in-EIS). Used to gate auto-install of product documentation.
 */
export const isEisAvailable = (endpointIds: ReadonlySet<string>): boolean => {
  return eisInferenceIdCandidates.some((id) => endpointIds.has(id));
};

export const isEisAvailableFromInferenceGet = async (
  inferenceGet: () => Promise<{ endpoints?: Array<{ inference_id: string }> }>
): Promise<boolean> => {
  try {
    const result = await inferenceGet();
    const endpointIds = new Set((result.endpoints ?? []).map((endpoint) => endpoint.inference_id));
    return isEisAvailable(endpointIds);
  } catch {
    return false;
  }
};

/**
 * Resolves the default inference ID for knowledge base installation,
 * matching the priority used by GenAI Settings.
 *
 * All knowledge base content prefers Jina v5 when its endpoint is available
 * (EIS on serverless or Cloud Connected Mode), then EIS ELSER, then the default
 * ELSER. Because Jina is only selected when its endpoint actually exists,
 * on-prem clusters without EIS/CCM fall back to ELSER automatically.
 */
export const resolveDefaultInferenceId = (
  endpointIds: ReadonlySet<string>,
  // Options accepted for API stability; resourceType does not change priority today.
  _options: ResolveDefaultInferenceIdOptions = {}
): string => {
  if (endpointIds.has(defaultInferenceEndpoints.JINAv5)) {
    return defaultInferenceEndpoints.JINAv5;
  }
  if (endpointIds.has(defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID)) {
    return defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID;
  }
  return defaultInferenceEndpoints.ELSER;
};

/**
 * Returns inference IDs to check for installed product documentation, with the
 * environment default first followed by other supported embedding models.
 */
export const getProductDocInferenceIdCandidates = (defaultInferenceId: string): string[] => {
  return [
    defaultInferenceId,
    ...productDocInferenceIdCandidates.filter((id) => id !== defaultInferenceId),
  ];
};

export const resolveDefaultInferenceIdFromInferenceGet = async (
  inferenceGet: () => Promise<{ endpoints?: Array<{ inference_id: string }> }>,
  options: ResolveDefaultInferenceIdOptions = {}
): Promise<string> => {
  try {
    const result = await inferenceGet();
    const endpointIds = new Set((result.endpoints ?? []).map((endpoint) => endpoint.inference_id));
    return resolveDefaultInferenceId(endpointIds, options);
  } catch {
    return defaultInferenceEndpoints.ELSER;
  }
};

export const resolveInstalledProductDocInferenceId = async ({
  getDefaultInferenceId,
  isDocumentationAvailable,
}: {
  getDefaultInferenceId: () => Promise<string>;
  isDocumentationAvailable: (inferenceId: string) => Promise<boolean>;
}): Promise<string | undefined> => {
  const defaultInferenceId = await getDefaultInferenceId();
  const candidateInferenceIds = getProductDocInferenceIdCandidates(defaultInferenceId);

  for (const inferenceId of candidateInferenceIds) {
    if (await isDocumentationAvailable(inferenceId)) {
      return inferenceId;
    }
  }

  return undefined;
};
