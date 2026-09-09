/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolHandlerContext } from '@kbn/agent-builder-server';
import { getCallerAiIndexDataReadService, type AiIndexToolDeps } from '../ai_index_read_service';

export interface ListAiIndicesItem {
  id: string;
  esql_target: string;
  description?: string;
  managed: boolean;
  /** Present only when running inside an agent. */
  assigned_to_agent?: boolean;
}

export interface ListAiIndicesResult {
  ai_indices: ListAiIndicesItem[];
}

export const listAiIndicesHandler = async ({
  deps,
  context: { esClient, request, agentConfiguration },
}: {
  deps: AiIndexToolDeps;
  context: Pick<ToolHandlerContext, 'esClient' | 'request' | 'agentConfiguration'>;
}): Promise<ListAiIndicesResult> => {
  const readService = await getCallerAiIndexDataReadService({ deps, esClient, request });
  const aiIndices = await readService.listVisible();
  const assignedIds = agentConfiguration ? new Set(agentConfiguration.ai_indices ?? []) : undefined;

  return {
    ai_indices: aiIndices.map(({ id, dest, description, managed }) => ({
      id,
      esql_target: dest.value,
      description,
      managed,
      ...(assignedIds ? { assigned_to_agent: assignedIds.has(id) } : {}),
    })),
  };
};
