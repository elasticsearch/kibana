/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { ACTIVITY_INDEX_NAME } from '../constants';
import { ACTIVITY_INDEX_MAPPING } from '../mappings/activity';

/**
 * Idempotently creates `.cases-activity` if it doesn't already exist.
 * Safe to call from multiple Kibana nodes concurrently — the second
 * caller hits an `already_exists` exception and short-circuits. Mirrors
 * `ensureCaseIndex` for the `.cases` surface.
 *
 * Settings:
 *   - `index.hidden: true` — not surfaced by default in `_cat/indices`
 *     and excluded from queries that don't opt in.
 *   - `auto_expand_replicas: '0-1'` — 0 replicas on single-node clusters
 *     (dev/CI), 1 replica on multi-node clusters. Without this, ES
 *     defaults to `number_of_replicas: 1`, costing 2 shards per index on
 *     a single-node cluster and triggering `validation_exception` on
 *     environments already near the 1000-shard default.
 *
 * No `index.mode: lookup`: `.cases-activity` is the fact table in the
 * analytics model. ES|QL queries
 * `FROM .cases-activity | LOOKUP JOIN .cases ON cases.id`; the
 * lookup-mode index is on the `.cases` side.
 *
 * Failure policy: throws on unexpected errors so callers can decide how
 * to handle them. See `ensureCaseIndex` for the full rationale — the
 * same plugin-start vs `/reset` split applies here.
 */
export async function ensureActivityIndex({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: ACTIVITY_INDEX_NAME });
    if (exists) {
      logger.debug(`${ACTIVITY_INDEX_NAME} already exists; skipping bootstrap`);
      return;
    }

    await esClient.indices.create({
      index: ACTIVITY_INDEX_NAME,
      settings: {
        'index.hidden': true,
        'index.auto_expand_replicas': '0-1',
      },
      mappings: ACTIVITY_INDEX_MAPPING,
    });

    logger.info(`bootstrapped ${ACTIVITY_INDEX_NAME}`);
  } catch (err) {
    // Two Kibana nodes starting in parallel can both pass the `exists`
    // check and race on `create`. The loser gets
    // `resource_already_exists_exception`, which is a no-op here — the
    // index exists, that's all that was needed.
    const errType = err?.body?.error?.type ?? err?.meta?.body?.error?.type;
    if (errType === 'resource_already_exists_exception') {
      logger.debug(`${ACTIVITY_INDEX_NAME} already exists (concurrent bootstrap)`);
      return;
    }

    // Surface shard-limit failures with an actionable message. See
    // `ensureCaseIndex` for the full explanation — the same fix applies:
    //
    //   PUT _cluster/settings
    //   { "persistent": { "cluster.max_shards_per_node": 1500 } }
    if (errType === 'validation_exception') {
      const reason: string =
        err?.body?.error?.reason ?? err?.meta?.body?.error?.reason ?? err?.message ?? '';
      if (reason.includes('shards')) {
        throw new Error(
          `Bootstrap of ${ACTIVITY_INDEX_NAME} failed: cluster may be at the shard limit. ` +
            `Increase cluster.max_shards_per_node. ` +
            `Original error: ${reason}`
        );
      }
    }

    throw err;
  }
}
