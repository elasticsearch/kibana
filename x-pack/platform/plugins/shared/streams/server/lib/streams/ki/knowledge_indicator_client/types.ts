/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { IDataStreamClient } from '@kbn/data-streams';
import type { FeatureUpsert, StreamQuery } from '@kbn/significant-events-schema';
import type { knowledgeIndicatorsMappings } from '../data_stream';
import type { StoredKnowledgeIndicator } from '../data_stream';
import type { KnowledgeIndicatorType } from '../fields';

export type RuleUnbackedFilter = 'exclude' | 'include' | 'only';

export type KnowledgeIndicatorDataStreamClient = IDataStreamClient<
  typeof knowledgeIndicatorsMappings,
  StoredKnowledgeIndicator & Record<string, unknown>
>;

interface KIBulkIndexFeatureOperation {
  index: { feature: FeatureUpsert };
}
interface KIBulkIndexQueryOperation {
  index: { query: StreamQuery & { rule_backed?: boolean; rule_id?: string } };
}
interface KIBulkDeleteOperation {
  delete: { type: KnowledgeIndicatorType; id: string };
}
interface KIBulkExcludeOperation {
  exclude: { id: string };
}
interface KIBulkRestoreOperation {
  restore: { id: string };
}
export type KIBulkOperation =
  | KIBulkIndexFeatureOperation
  | KIBulkIndexQueryOperation
  | KIBulkDeleteOperation
  | KIBulkExcludeOperation
  | KIBulkRestoreOperation;

export interface KnowledgeIndicatorClientDeps {
  dataStreamClient: KnowledgeIndicatorDataStreamClient;
  esClient: ElasticsearchClient;
  soClient: SavedObjectsClientContract;
  logger: Logger;
}
