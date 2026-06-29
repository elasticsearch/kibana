/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { ESQLSearchResponse } from '@kbn/es-types';
import { isEsqlUnknownIndexError } from '@kbn/storage-adapter';

/**
 * Runs an ES|QL query and returns `undefined` when the target index or data
 * stream has not been created yet (lazy initialization before first write).
 */
export const runEsqlQuery = async (
  esClient: ElasticsearchClient,
  query: string
): Promise<ESQLSearchResponse | undefined> => {
  try {
    return (await esClient.esql.query({ query })) as ESQLSearchResponse;
  } catch (error) {
    if (isEsqlUnknownIndexError(error)) {
      return undefined;
    }
    throw error;
  }
};
