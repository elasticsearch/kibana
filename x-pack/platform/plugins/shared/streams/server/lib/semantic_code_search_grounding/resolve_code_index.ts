/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';

/**
 * Resolves the `owner/repo` repository identifier for a code index by reading
 * the `repository` keyword field that Semantic Code Search stamps onto every
 * indexed chunk. This is preferred over parsing the index name, which can be
 * customized at index time and is therefore not a reliable source.
 *
 * The repository identifier is what the SCS git-history workflows
 * (`code-history-*`) filter on. Returns `undefined` when the field is absent
 * (e.g. an index created by an older SCS version) or on any read error, in
 * which case the git-history grounding tools are simply not exposed.
 */
export const resolveRepositoryForCodeIndex = async ({
  esClient,
  codeIndex,
  logger,
}: {
  esClient: ElasticsearchClient;
  codeIndex: string;
  logger: Logger;
}): Promise<string | undefined> => {
  try {
    const response = await esClient.search<{ repository?: string }>({
      index: codeIndex,
      size: 1,
      _source: ['repository'],
      query: { exists: { field: 'repository' } },
      terminate_after: 1,
    });

    const repository = response.hits.hits[0]?._source?.repository;
    return typeof repository === 'string' && repository.length > 0 ? repository : undefined;
  } catch (error) {
    logger.warn(
      `Failed to resolve repository for code index "${codeIndex}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
};

/**
 * Reverse of `resolveRepositoryForCodeIndex`: given a repository identifier
 * (e.g. `"acme/checkout"`), finds the `code-*` index that contains chunks with
 * that repository stamp. Used when the agent selects by repository so that
 * legacy index-addressed SCS workflows still receive an `index` param.
 *
 * Returns `undefined` when no matching index is found or on any read error.
 */
export const resolveIndexForRepository = async ({
  esClient,
  repository,
  logger,
}: {
  esClient: ElasticsearchClient;
  repository: string;
  logger: Logger;
}): Promise<string | undefined> => {
  try {
    const response = await esClient.search({
      index: 'code-*',
      size: 1,
      _source: false,
      query: { term: { repository } },
      terminate_after: 1,
    });

    const index = response.hits.hits[0]?._index;
    return typeof index === 'string' && index.length > 0 ? index : undefined;
  } catch (error) {
    logger.warn(
      `Failed to resolve code index for repository "${repository}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
};
