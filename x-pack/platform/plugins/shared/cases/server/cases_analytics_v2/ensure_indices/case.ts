/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { CASE_INDEX_NAME } from '../constants';
import { CASE_INDEX_MAPPING } from '../mappings/case';

/**
 * Idempotently creates `.cases` if it doesn't already exist. Safe to call
 * from multiple Kibana nodes concurrently — the second caller hits an
 * `already_exists` exception and short-circuits.
 *
 * Settings:
 *   - `index.hidden: true` — not surfaced by default in `_cat/indices`
 *     and excluded from queries that don't opt in. Default visibility is
 *     restricted to administrators querying directly via Console.
 *   - `index.mode: lookup` — required for `LOOKUP JOIN` from ES|QL on
 *     the activity / attachments surfaces. Single primary shard; cases
 *     data fits comfortably (millions of cases at ~2KB/doc is a few GB,
 *     well under shard limits).
 *   - `auto_expand_replicas: '0-1'` — 0 replicas on single-node clusters
 *     (dev/CI), 1 replica on multi-node clusters. Without this, ES
 *     defaults to `number_of_replicas: 1`, so the index costs 2 shards
 *     (1 primary + 1 replica) even on a single-node cluster. Dev and CI
 *     environments that already have many indices hit the default
 *     `cluster.max_shards_per_node` limit (1000) and the bootstrap
 *     fails with `validation_exception` before the feature can start.
 *     `auto_expand_replicas` avoids this with no production trade-off:
 *     on multi-node clusters the replica is added automatically for HA,
 *     and `LOOKUP JOIN` is unaffected because it operates on the primary
 *     shard — replicas are transparent read copies.
 *
 * Failure policy: log, don't throw. Bootstrap failure must not block
 * plugin start; cases-analytics is a downstream feature. Administrators
 * see ERROR logs and can re-trigger via `/reset`.
 */
export async function ensureCaseIndex({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: CASE_INDEX_NAME });
    if (exists) {
      logger.debug(`${CASE_INDEX_NAME} already exists; skipping bootstrap`);
      return;
    }

    await esClient.indices.create({
      index: CASE_INDEX_NAME,
      settings: {
        'index.hidden': true,
        'index.mode': 'lookup',
        'index.auto_expand_replicas': '0-1',
      },
      mappings: CASE_INDEX_MAPPING,
    });

    logger.info(`bootstrapped ${CASE_INDEX_NAME}`);
  } catch (err) {
    // Two Kibana nodes starting in parallel can both pass the `exists`
    // check and race on `create`. The loser gets
    // `resource_already_exists_exception`, which is a no-op here — the
    // index exists, that's all that was needed.
    const errType = err?.body?.error?.type ?? err?.meta?.body?.error?.type;
    if (errType === 'resource_already_exists_exception') {
      logger.debug(`${CASE_INDEX_NAME} already exists (concurrent bootstrap)`);
      return;
    }

    // Anything else: log and continue. Bootstrap can be re-attempted via
    // the administrator `/reset` endpoint; the plugin must still start.
    logger.error(`failed to bootstrap ${CASE_INDEX_NAME}: ${err.message}`, { error: err });
  }
}
