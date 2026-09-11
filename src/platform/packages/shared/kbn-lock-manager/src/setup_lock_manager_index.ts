/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { errors } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import type { IndicesGetMappingResponse } from '@elastic/elasticsearch/lib/api/types';

const LOCKS_INDEX_ALIAS = '.kibana_locks';
const INDEX_PATTERN = `${LOCKS_INDEX_ALIAS}*`;
export const LOCKS_CONCRETE_INDEX_NAME = `${LOCKS_INDEX_ALIAS}-000001`;
export const LOCKS_COMPONENT_TEMPLATE_NAME = `${LOCKS_INDEX_ALIAS}-component`;
export const LOCKS_INDEX_TEMPLATE_NAME = `${LOCKS_INDEX_ALIAS}-index-template`;

export async function removeLockIndexWithIncorrectMappings(
  esClient: ElasticsearchClient,
  logger: Logger
) {
  let res: IndicesGetMappingResponse;
  try {
    res = await esClient.indices.getMapping({ index: LOCKS_CONCRETE_INDEX_NAME });
  } catch (error) {
    const isNotFoundError = error instanceof errors.ResponseError && error.statusCode === 404;
    if (!isNotFoundError) {
      logger.error(
        `Failed to get mapping for lock index "${LOCKS_CONCRETE_INDEX_NAME}": ${error.message}`
      );
    }

    return;
  }

  const indexMappings = Object.values(res);
  if (indexMappings.length === 0) {
    logger.warn(`No mappings found for "${LOCKS_CONCRETE_INDEX_NAME}"`);
    return;
  }
  const { mappings } = indexMappings[0];
  if (!mappings) {
    logger.debug(`Mappings object is empty for "${LOCKS_CONCRETE_INDEX_NAME}"`);
    return;
  }
  const hasIncorrectMappings =
    mappings.properties?.token?.type !== 'keyword' ||
    mappings.properties?.expiresAt?.type !== 'date';

  if (hasIncorrectMappings) {
    logger.warn(`Lock index "${LOCKS_CONCRETE_INDEX_NAME}" has incorrect mappings.`);
    try {
      await esClient.indices.delete({ index: LOCKS_CONCRETE_INDEX_NAME });
      logger.info(`Lock index "${LOCKS_CONCRETE_INDEX_NAME}" removed successfully.`);
    } catch (error) {
      logger.error(`Failed to remove lock index "${LOCKS_CONCRETE_INDEX_NAME}": ${error.message}`);
    }
  }
}

export async function ensureTemplatesAndIndexCreated(
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<void> {
  await esClient.cluster.putComponentTemplate({
    name: LOCKS_COMPONENT_TEMPLATE_NAME,
    template: {
      mappings: {
        dynamic: false,
        properties: {
          token: { type: 'keyword' },
          metadata: { enabled: false },
          createdAt: { type: 'date' },
          expiresAt: { type: 'date' },
        },
      },
    },
  });
  logger.info(
    `Component template ${LOCKS_COMPONENT_TEMPLATE_NAME} created or updated successfully.`
  );

  await esClient.indices.putIndexTemplate({
    name: LOCKS_INDEX_TEMPLATE_NAME,
    index_patterns: [INDEX_PATTERN],
    composed_of: [LOCKS_COMPONENT_TEMPLATE_NAME],
    priority: 500,
    template: {
      settings: {
        number_of_shards: 1,
        auto_expand_replicas: '0-1',
        hidden: true,
      },
    },
  });
  logger.info(`Index template ${LOCKS_INDEX_TEMPLATE_NAME} created or updated successfully.`);

  try {
    await esClient.indices.create({ index: LOCKS_CONCRETE_INDEX_NAME });
    logger.info(`Index ${LOCKS_CONCRETE_INDEX_NAME} created successfully.`);
  } catch (error) {
    const isIndexAlreadyExistsError =
      error instanceof errors.ResponseError &&
      error.body.error.type === 'resource_already_exists_exception';

    // Handle the case where the index name already exists as an alias (e.g., after a reindex operation during cluster upgrade)
    const isIndexNameExistsAsAliasError =
      error instanceof errors.ResponseError &&
      error.body.error.type === 'invalid_index_name_exception';

    if (isIndexAlreadyExistsError || isIndexNameExistsAsAliasError) {
      logger.debug(`Index ${LOCKS_CONCRETE_INDEX_NAME} already exists. Skipping creation.`);
      return;
    }

    logger.error(`Unable to create index ${LOCKS_CONCRETE_INDEX_NAME}: ${error.message}`);
    throw error;
  }
}

export async function setupLockManagerIndex(esClient: ElasticsearchClient, logger: Logger) {
  await removeLockIndexWithIncorrectMappings(esClient, logger); // TODO: should be removed in the future (after 9.1). See https://github.com/elastic/kibana/issues/218944
  await ensureTemplatesAndIndexCreated(esClient, logger);
}
