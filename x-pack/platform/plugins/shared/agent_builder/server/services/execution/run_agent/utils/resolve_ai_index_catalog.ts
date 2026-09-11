/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { AiIndexDetail, AiIndexResolver } from '@kbn/agent-builder-server';
import { defaultAiIndices } from '../../../agents/default_ai_indices';
import type { AiIndexCatalogEntry } from '../types';

/** Used when no resolver is registered or it fails. */
const fallbackEntry = (id: string): AiIndexCatalogEntry => {
  if (!Object.hasOwn(defaultAiIndices, id)) {
    return { id };
  }
  const { esqlTarget, description } = defaultAiIndices[id];
  return { id, esqlTarget, description };
};

/**
 * Builds the prompt's AI Index catalog. Defaults go through the resolver too, so the prompt agrees
 * with what the caller can list; ids the resolver omits are rendered bare.
 */
export const resolveAiIndexCatalog = async ({
  aiIndices,
  request,
  resolver,
  logger,
}: {
  aiIndices: string[];
  request: KibanaRequest;
  resolver?: AiIndexResolver;
  logger?: Logger;
}): Promise<AiIndexCatalogEntry[]> => {
  const ids = [...new Set(aiIndices)];
  if (!resolver || ids.length === 0) {
    return ids.map(fallbackEntry);
  }

  let details: AiIndexDetail[];
  try {
    details = await resolver({ ids, request });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger?.warn(
      `Failed to resolve AI index details, falling back to static defaults and bare ids: ${message}`
    );
    return ids.map(fallbackEntry);
  }

  const resolvedById = new Map(details.map((detail) => [detail.id, detail]));
  return ids.map((id) => {
    const resolved = resolvedById.get(id);
    return resolved
      ? { id, esqlTarget: resolved.esqlTarget, description: resolved.description }
      : { id };
  });
};
