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
import type { Logger } from '@kbn/logging';
import { retryEs } from '../retry_es';
import type { AnyDataStreamDefinition } from '../types';
import { applyDefaults } from './defaults';

/**
 * https://www.elastic.co/docs/manage-data/data-store/data-streams/set-up-data-stream
 *
 * Endeavour to be idempotent and race-condition safe.
 */
export async function initializeIndexTemplate({
  logger,
  dataStream,
  elasticsearchClient,
  existingIndexTemplate,
  skipCreation = true,
}: {
  logger: Logger;
  dataStream: AnyDataStreamDefinition;
  elasticsearchClient: ElasticsearchClient;
  existingIndexTemplate: api.IndicesGetIndexTemplateIndexTemplateItem | undefined;
  skipCreation?: boolean;
}): Promise<{ uptoDate: boolean }> {
  const version = dataStream.version;
  logger.debug(`Setting up index template for data stream: ${dataStream.name} v${version}`);

  const previousVersions: number[] = [];
  dataStream = applyDefaults(dataStream);

  if (skipCreation && !existingIndexTemplate) {
    // index template does not exist so it is not updated.
    logger.debug(
      `Skipping index template creation during lazy initialization: ${dataStream.name}.`
    );
    return { uptoDate: false };
  }

  // index template exists so we always update it.
  if (existingIndexTemplate) {
    logger.debug(`Index template already exists: ${dataStream.name}, updating it.`);
    const deployedVersion = existingIndexTemplate.index_template?._meta?.version;
    invariant(
      typeof deployedVersion === 'number' && deployedVersion > 0,
      `Datastream ${dataStream.name} metadata is in an unexpected state, expected version to be a number but got ${deployedVersion}`
    );

    if (deployedVersion >= version) {
      // index already applied and updated.
      logger.debug(`Deployed ${dataStream.name} v${deployedVersion} already applied and updated.`);
      return { uptoDate: true };
    }
    previousVersions.push(
      deployedVersion,
      ...existingIndexTemplate.index_template?._meta?.previousVersions
    );
  }

  logger.debug(`Putting index template: ${dataStream.name}.`);
  // Should be idempotent
  await retryEs(
    () =>
      elasticsearchClient.indices.putIndexTemplate({
        name: dataStream.name,
        priority: dataStream.template.priority,
        index_patterns: [`${dataStream.name}*`],
        composed_of: dataStream.template.composedOf,
        data_stream: {
          hidden: dataStream.hidden,
        },
        template: {
          aliases: dataStream.template.aliases,
          mappings: dataStream.template.mappings,
          lifecycle: dataStream.template.lifecycle,
          settings: dataStream.template.settings,
        },
        _meta: {
          ...dataStream.template._meta,
          version,
          previousVersions,
        },
      }),
    { logger, dataStreamName: dataStream.name }
  );

  // index template updated
  return { uptoDate: true };
}
