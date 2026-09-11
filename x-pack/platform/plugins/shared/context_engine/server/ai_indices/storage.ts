/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { IndexStorageSettings, IStorageClient } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type {
  AiIndexAutomation,
  AiIndexDest,
  AiIndexFeedbackAnalysis,
  AiIndexSource,
} from '../../common/http_api/ai_indices';

export const aiIndicesIndexName = '.contextengine-ai-indices';

export const buildAiIndexDocId = (spaceId: string, aiIndexId: string): string =>
  `${spaceId}:${aiIndexId}`;

const storageSettings = {
  name: aiIndicesIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      space: types.keyword({}),
      description: types.text({}),
      managed: types.boolean({}),
      date_created: types.date({}),
      date_modified: types.date({}),
      dest: types.object({
        properties: { type: types.keyword({}), value: types.keyword({}) },
      }),
      automations: types.object({
        properties: { type: types.keyword({}), value: types.keyword({}) },
      }),
      sources: types.object({
        properties: { type: types.keyword({}), value: types.keyword({}) },
      }),
      feedback_analysis: types.object({
        properties: {
          enabled: types.boolean({}),
          agent_id: types.keyword({}),
          schedule: types.object({ properties: { interval: types.keyword({}) } }),
          // `from` holds either date math (`now-30d`) or an ISO date, so it is
          // mapped as a keyword rather than a date.
          signal_time_range: types.object({
            properties: { type: types.keyword({}), from: types.keyword({}) },
          }),
          // Read back and handed to the analysis run, never queried, and long
          // enough to exceed the default `ignore_above`. Indexing it would only
          // cost space and silently drop the longer filters.
          signal_filter: types.keyword({ index: false, doc_values: false }),
          allowed_actions: types.keyword({}),
        },
      }),
    },
  },
} satisfies IndexStorageSettings;

export interface AiIndexDocument {
  id: string;
  space: string;
  description?: string;
  feedback_analysis?: AiIndexFeedbackAnalysis;
  // Optional for backward compatibility with entries written before managed
  // indices existed; absence is treated as unmanaged (`false`) on read.
  managed?: boolean;
  date_created: string;
  date_modified: string;
  dest: AiIndexDest;
  automations: AiIndexAutomation[];
  sources: AiIndexSource[];
}

export type AiIndexStorageSettings = typeof storageSettings;

export type AiIndexStorageClient = IStorageClient<AiIndexStorageSettings, AiIndexDocument>;

export const createAiIndexStorageClient = ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): AiIndexStorageClient => {
  const adapter = new StorageIndexAdapter<AiIndexStorageSettings, AiIndexDocument>(
    esClient,
    logger,
    storageSettings
  );
  return adapter.getClient();
};
