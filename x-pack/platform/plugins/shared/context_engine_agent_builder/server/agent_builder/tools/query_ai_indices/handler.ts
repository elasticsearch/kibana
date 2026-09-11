/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolHandlerContext } from '@kbn/agent-builder-server';
import type {
  QueryAiIndicesRequest,
  QueryAiIndicesResponse,
} from '@kbn/context-engine-plugin/common/http_api/ai_indices';
import { getAiIndexDataReadServiceForUser, type AiIndexToolDeps } from '../ai_index_read_service';

/** Runs the same code as `POST /api/context_engine/ai_index/_query`. */
export const queryAiIndicesHandler = async ({
  deps,
  request: queryRequest,
  context: { esClient, request },
}: {
  deps: AiIndexToolDeps;
  request: QueryAiIndicesRequest;
  context: Pick<ToolHandlerContext, 'esClient' | 'request'>;
}): Promise<QueryAiIndicesResponse> => {
  const readService = await getAiIndexDataReadServiceForUser({ deps, esClient, request });
  return readService.query(queryRequest);
};
