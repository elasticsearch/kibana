/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { retryTransientEsErrors } from '../../../../../lib/retry_transient_es_errors';

interface CreateIndexOptions {
  esClient: ElasticsearchClient;
  indexName: string;
  mappings: MappingTypeMapping;
  logger: Logger;
}

export const createIndexWithMappings = async ({
  esClient,
  indexName,
  mappings,
  logger,
}: CreateIndexOptions): Promise<void> => {
  try {
    // Check if index already exists
    const indexExists = await retryTransientEsErrors(
      () => esClient.indices.exists({ index: indexName }),
      { logger }
    );

    if (indexExists) {
      logger?.debug(`Index ${indexName} already exists`);
      return;
    }

    logger?.debug(`Creating index ${indexName} with mappings`);

    await retryTransientEsErrors(
      () =>
        esClient.indices.create({
          index: indexName,
          mappings,
          settings: { index: { hidden: true } },
        }),
      { logger }
    );

    logger?.debug(`Successfully created index ${indexName}`);
  } catch (error) {
    // If the index already exists, we can ignore the error
    if (error?.meta?.body?.error?.type === 'resource_already_exists_exception') {
      logger?.debug(`Index ${indexName} already exists (created by another process)`);
      return;
    }

    logger?.error(`Failed to create index ${indexName}: ${error}`);
    throw error;
  }
};

export const createOrUpdateIndex = async ({
  esClient,
  indexName,
  mappings,
  logger,
}: CreateIndexOptions): Promise<void> => {
  try {
    const indexExists = await retryTransientEsErrors(
      () =>
        esClient.indices.exists({
          index: indexName,
        }),
      { logger }
    );

    if (!indexExists) {
      // Create new index
      await createIndexWithMappings({
        esClient,
        indexName,
        mappings,
        logger,
      });
    } else {
      // Apply the dynamic hidden setting to indices from earlier Kibana versions.
      await retryTransientEsErrors(
        () =>
          esClient.indices.putMapping({
            index: indexName,
            ...mappings,
          }),
        { logger }
      );
      logger.debug(`Updated mappings for existing index ${indexName}`);
      await retryTransientEsErrors(
        () =>
          esClient.indices.putSettings({
            index: indexName,
            settings: { index: { hidden: true } },
          }),
        { logger }
      );
      logger.debug(`Applied hidden setting for existing index ${indexName}`);
    }
  } catch (error) {
    logger?.error(`Failed to create or update index ${indexName}: ${error}`);
    throw error;
  }
};
