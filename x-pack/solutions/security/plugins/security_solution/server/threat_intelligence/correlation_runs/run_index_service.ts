/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { getCorrelationRunsIndexName } from '../../../common/threat_intelligence/hub';

export interface RunIndexServiceDeps {
  readonly esClient: ElasticsearchClient;
  readonly logger: Logger;
  readonly spaceId: string;
}

const RUN_INDEX_MAPPINGS = {
  dynamic: 'strict' as const,
  properties: {
    run_id: { type: 'keyword' as const },
    space_id: { type: 'keyword' as const },
    created_by: { type: 'keyword' as const },
    created_at: { type: 'date' as const },
    updated_at: { type: 'date' as const },
    input_type: { type: 'keyword' as const },
    report_id: { type: 'keyword' as const },
    input_summary: { type: 'keyword' as const },
    title: { type: 'text' as const },
    depth: { type: 'keyword' as const },
    status: { type: 'keyword' as const },
    stage: { type: 'keyword' as const },
    error: { type: 'text' as const },
    // `result` stores the depth-tagged pipeline output as a JSON blob.
    // `enabled: false` means ES stores it without indexing — retrieval only.
    result: { type: 'object' as const, enabled: false },
    // `partials` stores per-stage intermediate results — not indexed.
    partials: { type: 'object' as const, enabled: false },
  },
} as const;

export const createRunIndexService = ({ esClient, logger, spaceId }: RunIndexServiceDeps) => {
  const indexName = getCorrelationRunsIndexName(spaceId);

  const ensureIndex = async (): Promise<void> => {
    try {
      const exists = await esClient.indices.exists({ index: indexName });
      if (exists) {
        // Additively apply any new properties (e.g. `title` added in Stage C).
        // ES silently no-ops fields that are already correctly mapped.
        await esClient.indices.putMapping({
          index: indexName,
          properties: RUN_INDEX_MAPPINGS.properties,
        });
        return;
      }

      await esClient.indices.create({
        index: indexName,
        mappings: RUN_INDEX_MAPPINGS,
        settings: { hidden: true },
      });
      logger.info(`[CorrelationRuns] Created index: ${indexName}`);
    } catch (e: unknown) {
      const errType = (e as { meta?: { body?: { error?: { type?: string } } } })?.meta?.body?.error
        ?.type;
      if (errType === 'resource_already_exists_exception') {
        // Race between two concurrent POST requests — harmless.
        return;
      }
      logger.error(`[CorrelationRuns] Failed to create index '${indexName}': ${e}`);
      throw e;
    }
  };

  return { ensureIndex, indexName };
};

export type RunIndexService = ReturnType<typeof createRunIndexService>;
