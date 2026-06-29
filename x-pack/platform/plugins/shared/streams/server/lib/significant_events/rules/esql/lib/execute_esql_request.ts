/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ESQLSearchResponse } from '@kbn/es-types';
import { createTaskRunError, TaskErrorSource } from '@kbn/task-manager-plugin/server';
import { parseEsqlSourceDocuments, getEsqlDocumentId } from '@kbn/ai-tools';

type Response = Array<{
  _id: string;
  _source: Record<string, unknown>;
}>;

export const executeEsqlRequest = async ({
  esClient,
  esqlRequest,
  logger,
}: {
  esClient: ElasticsearchClient;
  esqlRequest: { query: string; filter: estypes.QueryDslQueryContainer };
  logger: Logger;
}): Promise<Response> => {
  try {
    const response = (await esClient.esql.query({
      query: esqlRequest.query,
      filter: esqlRequest.filter,
      drop_null_columns: true,
    })) as unknown as ESQLSearchResponse;

    return parseEsqlResults(response);
  } catch (error) {
    const message = `Error executing ES|QL request: ${
      error instanceof Error ? error.message : String(error)
    }`;
    logger.debug(message);
    throw createTaskRunError(new Error(message), TaskErrorSource.USER);
  }
};

/**
 * Maps the ES|QL response rows into `{ _id, _source }` documents.
 *
 * Concrete indices expose `METADATA _id, _source`, so the real document id is
 * used. ES|QL views (e.g. query streams' `$.<name>` views) drop that metadata,
 * so {@link parseEsqlSourceDocuments} reconstructs `_source` and reports no id;
 * synthesize a stable `_id` by hashing the reconstructed source. The hash is
 * deterministic across runs (same field values → same id), which keeps
 * content-based dedup working.
 */
const parseEsqlResults = (response: ESQLSearchResponse): Response =>
  parseEsqlSourceDocuments(response).map((doc) => ({
    _id: getEsqlDocumentId(doc),
    _source: doc.source,
  }));
