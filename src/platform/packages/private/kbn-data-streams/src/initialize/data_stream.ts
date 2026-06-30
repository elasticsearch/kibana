/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import invariant from 'node:assert';
import type * as api from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { prettyPrintAndSortKeys } from '@kbn/utils';
import { errors as EsErrors } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/logging';
import { retryEs } from '../retry_es';
import type { AnyDataStreamDefinition } from '../types';

function normalizeLifecycle(
  lifecycle: api.IndicesDataStreamLifecycleWithRollover | undefined
): api.IndicesDataStreamLifecycle | undefined {
  if (!lifecycle) {
    return undefined;
  }
  return {
    ...lifecycle,
    // Set enabled `true` to make comparison with ES response stable
    enabled: lifecycle.enabled ?? true,
  };
}

function lifecycleDefinitionChanged({
  existingIndexTemplate,
  dataStream,
}: {
  existingIndexTemplate: api.IndicesGetIndexTemplateIndexTemplateItem | undefined;
  dataStream: AnyDataStreamDefinition;
}) {
  const currentLifecycle = normalizeLifecycle(
    existingIndexTemplate?.index_template.template?.lifecycle
  );
  const desiredLifecycle = normalizeLifecycle(dataStream.template.lifecycle);

  const stringifyLifecycle = (lifecycle: api.IndicesDataStreamLifecycle | undefined) =>
    lifecycle ? prettyPrintAndSortKeys(lifecycle) : undefined;

  return stringifyLifecycle(currentLifecycle) !== stringifyLifecycle(desiredLifecycle);
}

async function applyDataStreamLifecycle({
  logger,
  elasticsearchClient,
  dataStream,
}: {
  logger: Logger;
  elasticsearchClient: ElasticsearchClient;
  dataStream: AnyDataStreamDefinition;
}) {
  const lifecycle = dataStream.template.lifecycle;

  if (lifecycle) {
    logger.debug(`Updating lifecycle on existing data stream: ${dataStream.name}`);
    await retryEs(
      () =>
        elasticsearchClient.indices.putDataLifecycle({
          name: dataStream.name,
          ...normalizeLifecycle(lifecycle),
        }),
      { logger, dataStreamName: dataStream.name }
    );
    return;
  }

  logger.debug(`Removing lifecycle from existing data stream: ${dataStream.name}`);
  try {
    await retryEs(
      () =>
        elasticsearchClient.indices.deleteDataLifecycle({
          name: dataStream.name,
        }),
      { logger, dataStreamName: dataStream.name }
    );
  } catch (error) {
    if (error instanceof EsErrors.ResponseError && error.statusCode === 404) {
      // Data stream has no lifecycle configuration, treat as idempotent remove.
      return;
    }
    throw error;
  }
}

/**
 * https://www.elastic.co/docs/manage-data/data-store/data-streams/set-up-data-stream
 *
 * Endeavour to be idempotent and race-condition safe.
 */
export async function initializeDataStream({
  logger,
  dataStream,
  elasticsearchClient,
  existingDataStream,
  existingIndexTemplate,
  skipCreation = true,
}: {
  logger: Logger;
  dataStream: AnyDataStreamDefinition;
  elasticsearchClient: ElasticsearchClient;
  existingDataStream: api.IndicesDataStream | undefined;
  existingIndexTemplate: api.IndicesGetIndexTemplateIndexTemplateItem | undefined;
  skipCreation?: boolean;
}): Promise<{ uptoDate: boolean }> {
  const version = dataStream.version;
  logger.debug(`Setting up data stream: ${dataStream.name} v${version}`);

  if (skipCreation && !existingDataStream) {
    // data stream does not exist and we will not create it.
    logger.debug(`Skipping data stream creation during lazy initialization: ${dataStream.name}.`);
    return { uptoDate: false };
  }

  if (existingIndexTemplate) {
    const deployedVersion = existingIndexTemplate.index_template?._meta?.version;
    invariant(
      typeof deployedVersion === 'number' && deployedVersion > 0,
      `Datastream ${dataStream.name} metadata is in an unexpected state, expected version to be a number but got ${deployedVersion}`
    );

    // Only short-circuit when the data stream itself already exists. If the template was
    // installed earlier (e.g. via `initializeTemplate`) but the data stream was never
    // created, we still need to fall through to the creation path below.
    if (existingDataStream && deployedVersion >= version) {
      logger.debug(`Deployed ${dataStream.name} v${deployedVersion} already applied and updated.`);
      return { uptoDate: true };
    }
  }

  if (existingDataStream) {
    logger.debug(
      `Data stream already exists: ${dataStream.name}, applying mappings to write index`
    );

    // https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-get-data-stream#operation-indices-get-data-stream-200-body-application-json-data_streams-indices
    // The last item in this array contains information about the stream’s current write index.
    const { indices } = existingDataStream;
    const writeIndex = indices[indices.length - 1];
    if (!writeIndex) {
      logger.debug(
        `Data stream ${dataStream.name} has no write index yet, cannot apply mappings or settings.`
      );
      // data stream has no write index yet, cannot apply mappings or settings.
      return { uptoDate: false };
    } else {
      const {
        template: { mappings },
      } = await retryEs(
        () => elasticsearchClient.indices.simulateIndexTemplate({ name: dataStream.name }),
        { logger, dataStreamName: dataStream.name }
      );

      logger.debug(`Applying mappings to write index: ${writeIndex.index_name}`);
      await retryEs(
        () =>
          elasticsearchClient.indices.putMapping({
            index: writeIndex.index_name,
            ...mappings,
          }),
        { logger, dataStreamName: dataStream.name }
      );
    }

    if (
      lifecycleDefinitionChanged({
        existingIndexTemplate,
        dataStream,
      })
    ) {
      await applyDataStreamLifecycle({
        logger,
        elasticsearchClient,
        dataStream,
      });
    }

    // data stream updated successfully
    return { uptoDate: true };
  }

  logger.debug(`Creating data stream: ${dataStream.name}.`);
  try {
    await retryEs(
      () =>
        elasticsearchClient.indices.createDataStream({
          name: dataStream.name,
        }),
      { logger, dataStreamName: dataStream.name }
    );
  } catch (error) {
    if (
      error instanceof EsErrors.ResponseError &&
      error.statusCode === 400 &&
      error.body?.error.type === 'resource_already_exists_exception'
    ) {
      // Data stream already exists, we can ignore this error, probably racing another create call
      logger.debug(`Data stream already exists: ${dataStream.name}`);
    } else {
      throw error;
    }
  }

  // data stream created and updated successfully
  return { uptoDate: true };
}
