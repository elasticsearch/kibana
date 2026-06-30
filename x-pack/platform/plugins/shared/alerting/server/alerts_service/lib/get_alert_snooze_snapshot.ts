/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import {
  ALERT_INSTANCE_ID,
  ALERT_RULE_UUID,
  ALERT_STATUS,
  ALERT_STATUS_ACTIVE,
} from '@kbn/rule-data-utils';

export interface GetAlertSnoozeSnapshotParams {
  indices: string[];
  alertId: string;
  ruleId: string;
  fields: string[];
}

interface GetAlertSnoozeSnapshotParamsWithDeps extends GetAlertSnoozeSnapshotParams {
  logger: Logger;
  esClient: ElasticsearchClient;
}

export async function getAlertSnoozeSnapshot({
  indices,
  alertId,
  ruleId,
  fields,
  logger,
  esClient,
}: GetAlertSnoozeSnapshotParamsWithDeps): Promise<Record<string, unknown> | null> {
  try {
    const response = await esClient.search({
      index: indices,
      allow_no_indices: true,
      size: 1,
      _source: fields,
      query: {
        bool: {
          must: [
            { term: { [ALERT_RULE_UUID]: ruleId } },
            { term: { [ALERT_STATUS]: ALERT_STATUS_ACTIVE } },
          ],
          filter: [{ term: { [ALERT_INSTANCE_ID]: alertId } }],
        },
      },
    });

    const hit = response.hits.hits[0];
    if (!hit) {
      return null;
    }

    // Alert documents use flat dot-notation keys in _source
    const source = (hit._source ?? {}) as Record<string, unknown>;
    return fields.reduce<Record<string, unknown>>((snapshot, field) => {
      const value = source[field];
      snapshot[field] = value !== undefined ? value : null;
      return snapshot;
    }, {});
  } catch (error) {
    logger.error(
      `Error fetching snooze snapshot for alertId: ${alertId} and ruleId: ${ruleId} - ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}
