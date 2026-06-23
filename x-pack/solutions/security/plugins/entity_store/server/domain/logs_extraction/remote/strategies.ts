/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { RemoteLogExtractionStateClient } from '../../saved_objects/remote_log_extraction_state';

/**
 * A remote extraction strategy supplies the ES client, state SO client, and
 * index-pattern selector needed to plug a remote data source into the shared
 * extract-to-updates loop.
 */
export interface RemoteExtractionStrategy {
  readonly id: 'ccs' | 'cps';
  readonly client: ElasticsearchClient;
  readonly stateClient: RemoteLogExtractionStateClient;
  buildPatterns(args: { localIndexPatterns: string[]; remoteIndexPatterns: string[] }): string[];
}

/**
 * this unique string excludes all indices on the origin project from the CPS scope.
 * see https://www.elastic.co/docs/reference/query-languages/esql/esql-cross-serverless-projects#exclude-specific-projects
 */
const EXCLUDED_ORIGIN = '-_origin:*';

const isNotSystemIndex = (indexPattern: string) => !indexPattern.startsWith('.');

export const createCcsStrategy = (
  esClient: ElasticsearchClient,
  stateClient: RemoteLogExtractionStateClient
): RemoteExtractionStrategy => ({
  id: 'ccs',
  client: esClient,
  stateClient,
  buildPatterns: ({ remoteIndexPatterns }) => remoteIndexPatterns,
});

export const createCpsStrategy = (
  cpsClient: ElasticsearchClient,
  stateClient: RemoteLogExtractionStateClient
): RemoteExtractionStrategy => ({
  id: 'cps',
  client: cpsClient,
  stateClient,
  buildPatterns: ({ localIndexPatterns }) => [
    ...localIndexPatterns.filter(isNotSystemIndex), // avoids verification errors on remote clusters
    EXCLUDED_ORIGIN,
  ],
});
