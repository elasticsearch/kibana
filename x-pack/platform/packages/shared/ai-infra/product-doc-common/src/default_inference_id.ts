/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defaultInferenceEndpoints } from '@kbn/inference-common';
import { ResourceTypes, type ResourceType } from './resource_type';

export const productDocInferenceIdCandidates = [
  defaultInferenceEndpoints.JINAv5,
  defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
  defaultInferenceEndpoints.ELSER,
] as const;

export interface ResolveDefaultInferenceIdOptions {
  resourceType?: ResourceType;
}

const prefersJinaEmbeddings = (resourceType?: ResourceType): boolean =>
  resourceType !== ResourceTypes.securityLabs;

/**
 * Resolves the default inference ID for knowledge base installation,
 * matching the priority used by GenAI Settings.
 *
 * Product documentation prefers Jina v5 when available. Security Labs content
 * does not support Jina embeddings yet, so ELSER is preferred instead.
 */
export const resolveDefaultInferenceId = (
  endpointIds: ReadonlySet<string>,
  { resourceType }: ResolveDefaultInferenceIdOptions = {}
): string => {
  if (prefersJinaEmbeddings(resourceType) && endpointIds.has(defaultInferenceEndpoints.JINAv5)) {
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
  isDocumentationAvailable: (inferenceId: string) => Promise<boolean | undefined | null>;
}): Promise<string | undefined> => {
  const defaultInferenceId = await getDefaultInferenceId();
  const candidateInferenceIds = getProductDocInferenceIdCandidates(defaultInferenceId);

  for (const inferenceId of candidateInferenceIds) {
    try {
      if (await isDocumentationAvailable(inferenceId)) {
        return inferenceId;
      }
    } catch {
      // Try the next candidate inference ID.
    }
  }

  return undefined;
};
