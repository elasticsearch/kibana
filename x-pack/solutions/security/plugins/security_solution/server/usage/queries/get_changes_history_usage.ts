/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AggregationsAggregationContainer,
  SearchRequest,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { DATA_STREAM_NAME } from '@kbn/change-history';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { SecurityRuleChangeTrackingAction } from '../../../common/detection_engine/rule_management/rule_change_tracking';
import type { ChangesHistoryUsage } from '../detections/rules/types';

/**
 * The `event.action` values that count as a "revision saved" for SBT-01.
 * Matches the UI's own `DIFFABLE_CHANGE_ACTIONS` definition (the "is this a
 * diffable revision" taxonomy already used by the changes-history timeline)
 * so telemetry never silently diverges from what the feature itself surfaces
 * as a revision. See the parity test in get_changes_history_usage.test.ts.
 */
export const REVISION_SAVED_ACTIONS: readonly string[] = [
  RuleChangeTrackingAction.ruleUpdate,
  RuleChangeTrackingAction.ruleCreate,
  SecurityRuleChangeTrackingAction.ruleInstall,
  SecurityRuleChangeTrackingAction.ruleUpgrade,
  SecurityRuleChangeTrackingAction.ruleDuplicate,
  SecurityRuleChangeTrackingAction.ruleImport,
  SecurityRuleChangeTrackingAction.ruleRevert,
  SecurityRuleChangeTrackingAction.ruleRestore,
];

interface ChangesHistoryUsageAggs {
  revision_saved?: { doc_count: number };
  rule_restored?: { doc_count: number };
}

/**
 * Derives the SBT-01 ("revision saved") and SBT-02 ("rule restored") usage
 * counters as two cluster-wide document counts over a rolling `now-24h`..`now`
 * window, aggregated from the `.kibana_change_history` data stream.
 *
 * Degrades to `{ revision_saved: 0, rule_restored: 0 }` (never throws) on
 * any ES error, including `index_not_found_exception` when the
 * `.kibana_change_history` data stream does not exist yet. The catch is local so a missing index
 * only zeros these two fields, never the whole `detection_rules` metrics
 * group.
 * @param esClient the elastic client which should be a system based client
 * @param logger The kibana logger
 * @returns The changes-history usage counts
 */
export const getChangesHistoryUsage = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<ChangesHistoryUsage> => {
  try {
    const requestAggs: Record<string, AggregationsAggregationContainer> = {
      revision_saved: {
        filter: { terms: { 'event.action': [...REVISION_SAVED_ACTIONS] } },
      },
      rule_restored: {
        filter: { term: { 'event.action': SecurityRuleChangeTrackingAction.ruleRestore } },
      },
    };
    const query: SearchRequest = {
      index: DATA_STREAM_NAME,
      size: 0,
      track_total_hits: false,
      query: {
        bool: {
          filter: [
            { term: { 'event.module': 'security' } },
            { term: { 'event.dataset': 'alerting-rules' } },
            { term: { 'object.type': 'alert' } },
            { range: { '@timestamp': { gte: 'now-24h', lte: 'now' } } },
          ],
        },
      },
      aggs: requestAggs,
    };
    logger.debug(() => `Getting changes-history usage with query: ${JSON.stringify(query)}`);

    const response = await esClient.search<never, ChangesHistoryUsageAggs>(query);

    logger.debug(() => `Raw search results of changes-history usage: ${JSON.stringify(response)}`);

    const responseAggs = response.aggregations;

    return {
      revision_saved: responseAggs?.revision_saved?.doc_count ?? 0,
      rule_restored: responseAggs?.rule_restored?.doc_count ?? 0,
    };
  } catch (error) {
    logger.debug(
      `Encountered unexpected condition getting changes-history usage. Error message is: "${error.message}". Error is: "${error}". Telemetry for "changes history" being skipped.`
    );
    return { revision_saved: 0, rule_restored: 0 };
  }
};
