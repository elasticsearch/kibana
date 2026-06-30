/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';

export interface BulkCreateEntityMetadataDocsResult {
  /** Number of docs successfully appended. */
  successful: number;
  /** Number of docs dropped after exhausting the helper's retries. */
  failed: number;
}

/**
 * Append documents to the entity metadata datastream. The datastream is
 * append-only, so the bulk op is `create` rather than `update`. The caller
 * owns the doc shape — this primitive is event-action agnostic so future
 * metadata kinds (behaviors, anomalies, alerts) can reuse it without
 * needing a new write path.
 *
 * Uses `esClient.helpers.bulk` (matching `ingestEntities`) rather than a
 * hand-rolled `esClient.bulk`: the helper streams from the datasource instead
 * of materializing the whole `operations` array, chunks by `flushBytes` so a
 * high-fan-out run can't exceed `http.max_content_length`, and retries 429s.
 * Per-doc drops are surfaced via `onDrop` and logged here; the call resolves
 * to `{ successful, failed }` counts.
 *
 */
export const bulkCreateEntityMetadataDocs = async <TDoc extends object>(
  esClient: ElasticsearchClient,
  params: {
    index: string;
    docs: TDoc[];
    logger: Logger;
  }
): Promise<BulkCreateEntityMetadataDocsResult> => {
  const { successful, failed } = await esClient.helpers.bulk({
    datasource: params.docs,
    index: params.index,
    refresh: false,
    onDocument: () => ({ create: {} }),
    onDrop: (dropped) => {
      params.logger.error(
        `entity metadata doc dropped from bulk operation (reason: ${
          dropped.error?.reason || 'unknown error'
        })`
      );
    },
  });

  return { successful, failed };
};
