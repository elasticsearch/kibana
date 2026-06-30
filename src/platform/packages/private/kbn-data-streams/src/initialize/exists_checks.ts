/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { errors as EsErrors } from '@elastic/elasticsearch';
import type * as api from '@elastic/elasticsearch/lib/api/types';
import type { Logger } from '@kbn/logging';
import { retryEs } from '../retry_es';

export const getExistingIndexTemplate = async (
  elasticsearchClient: ElasticsearchClient,
  dataStreamName: string,
  logger: Logger
) => {
  let existingIndexTemplate: api.IndicesGetIndexTemplateIndexTemplateItem | undefined;
  try {
    ({
      index_templates: [existingIndexTemplate],
    } = await retryEs(
      () => elasticsearchClient.indices.getIndexTemplate({ name: dataStreamName }),
      { logger, dataStreamName }
    ));
  } catch (error) {
    if (error instanceof EsErrors.ResponseError && error.statusCode === 404) {
      // Index template does not exist, we will create it
    } else {
      throw error;
    }
  }

  return existingIndexTemplate;
};

export const getExistingDataStream = async (
  elasticsearchClient: ElasticsearchClient,
  dataStreamName: string,
  logger: Logger
) => {
  let existingDataStream: api.IndicesDataStream | undefined;
  try {
    ({
      data_streams: [existingDataStream],
    } = await retryEs(() => elasticsearchClient.indices.getDataStream({ name: dataStreamName }), {
      logger,
      dataStreamName,
    }));
  } catch (error) {
    if (error instanceof EsErrors.ResponseError && error.statusCode === 404) {
      // Data stream does not exist, we will create it
    } else {
      throw error;
    }
  }

  return existingDataStream;
};
