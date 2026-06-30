/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AlertInstanceContext,
  AlertInstanceState,
  RuleExecutorOptions,
} from '@kbn/alerting-plugin/server';
import type { Alert } from '@kbn/alerts-as-data-utils';
import type { PersistenceServices } from '@kbn/rule-registry-plugin/server';
import { isEmpty } from 'lodash';
import moment from 'moment';
import objectHash from 'object-hash';
import { hasStatsCommand } from '@kbn/streams-schema';
import { MAX_ALERTS_PER_EXECUTION, MAX_DEDUP_IDS, MATCH_LOOKBACK_MINUTES } from './common';
import { buildEsqlSearchRequest } from './lib/build_esql_search_request';
import { executeEsqlRequest } from './lib/execute_esql_request';
import type { EsqlRuleInstanceState, EsqlRuleParams } from './types';

export async function getRuleExecutor(
  options: RuleExecutorOptions<
    EsqlRuleParams,
    EsqlRuleInstanceState,
    AlertInstanceState,
    AlertInstanceContext,
    'default',
    Alert
  > & {
    services: PersistenceServices;
  }
) {
  const { services, params, logger, state, startedAt, spaceId, rule } = options;
  const { scopedClusterClient, alertWithPersistence } = services;

  // The executor cannot self-heal (no rulesClient access); cleanup is
  // handled by syncQueries / the demotedToStats path in QueryClient.
  // This guard prevents wasted ES queries until the next sync cycle runs.
  if (hasStatsCommand(params.query)) {
    logger.error(
      `Rule "${rule.id}" contains a STATS query that cannot produce document-level alerts. ` +
        `This is a transient state — the rule will be uninstalled on the next syncQueries cycle. Skipping execution.`
    );
    return { state: { previousOriginalDocumentIds: [] } };
  }

  const previousOriginalDocumentIds = state.previousOriginalDocumentIds ?? [];

  const now = moment(startedAt);

  const esqlRequest = buildEsqlSearchRequest({
    query: params.query,
    timestampField: params.timestampField,
    from: now.clone().subtract(MATCH_LOOKBACK_MINUTES, 'minutes').toISOString(),
    to: now.clone().toISOString(),
    previousOriginalDocumentIds,
  });

  const allResults = await executeEsqlRequest({
    esClient: scopedClusterClient.asCurrentUser,
    esqlRequest,
    logger,
  });

  // ES|QL views (query streams) expose no real `_id`, so the `must_not terms _id`
  // dedup filter pushed to ES is a no-op for their synthesized ids. Dedup
  // client-side here too; for concrete indices ES already pruned these, so this
  // is a no-op and keeps a single dedup path for both. Seed the set with previous
  // runs and add each accepted id as we go, so duplicates are removed both across
  // runs and within this batch (two identical view rows hash to the same `_id`).
  const seenDocumentIds = new Set(previousOriginalDocumentIds);
  const results = allResults.filter((result) => {
    if (seenDocumentIds.has(result._id)) {
      return false;
    }
    seenDocumentIds.add(result._id);
    return true;
  });

  if (results.length === 0) {
    return {
      state: {
        previousOriginalDocumentIds,
      },
    };
  }

  const alertDocIdToDocumentIdMap = new Map<string, string>();
  const alerts = results.map((result) => {
    const alertDocId = objectHash([result._id, rule.id, spaceId]);
    alertDocIdToDocumentIdMap.set(alertDocId, result._id);

    return {
      _id: alertDocId,
      _source: {
        original_source: {
          _id: result._id,
          ...result._source,
        },
      },
    };
  });

  const refreshOnIndexingAlerts = false;
  const { createdAlerts, errors } = await alertWithPersistence(
    alerts,
    refreshOnIndexingAlerts,
    MAX_ALERTS_PER_EXECUTION
  );

  if (!isEmpty(errors)) {
    logger.error(
      `alertWithPersistence completed with ${errors.length} error(s) (${
        createdAlerts.length
      } alerts created): ${JSON.stringify(errors)}`
    );
  }

  const originalDocumentIds: string[] = [];
  for (const alert of createdAlerts) {
    const docId = alertDocIdToDocumentIdMap.get(alert._id);
    if (docId) {
      originalDocumentIds.push(docId);
    } else {
      logger.warn(
        `Alert "${alert._id}" has no mapped original document ID; skipping dedup entry — this may cause duplicate alerts on the next run`
      );
    }
  }

  // Previous IDs come first, new IDs are appended — slice(-N) keeps the most recent ones.
  const mergedIds = [...new Set([...previousOriginalDocumentIds, ...originalDocumentIds])];

  return {
    state: {
      previousOriginalDocumentIds:
        mergedIds.length > MAX_DEDUP_IDS ? mergedIds.slice(-MAX_DEDUP_IDS) : mergedIds,
    },
  };
}
