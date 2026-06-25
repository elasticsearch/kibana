/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { LiveHistoryRow } from '../../../common/api/unified_history/types';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { getResultCountsForActions } from '../../lib/get_result_counts_for_actions';
import { mapLiveHitToRow } from './map_live_hit_to_row';
import type { LiveActionHit } from './map_live_hit_to_row';
import type { SortValues } from './query_live_actions_dsl';

export interface ProcessLiveHistoryParams {
  liveHits: LiveActionHit[];
  osqueryContext: OsqueryAppContext;
  spaceId: string;
  integrationNamespaces?: readonly string[];
  ccsEnabled?: boolean;
  logger: Logger;
}

export interface ProcessLiveHistoryResult {
  liveRows: LiveHistoryRow[];
  sortValuesMap: Map<string, SortValues>;
}

const collectSubActionIds = (hit: LiveActionHit): string[] => {
  const source = (hit._source ?? {}) as Record<string, unknown>;
  const queries = (source.queries ?? []) as Array<{ action_id?: string }>;

  return queries.map((q) => q.action_id).filter((id): id is string => !!id);
};

export const processLiveHistory = async ({
  liveHits,
  osqueryContext,
  spaceId,
  integrationNamespaces,
  ccsEnabled = false,
  logger,
}: ProcessLiveHistoryParams): Promise<ProcessLiveHistoryResult> => {
  const liveRows: LiveHistoryRow[] = liveHits.map(mapLiveHitToRow);

  const sortValuesMap = new Map<string, SortValues>();
  for (const hit of liveHits) {
    if (hit.sort) {
      const actionId = hit.fields?.action_id ?? (hit._source as Record<string, unknown>)?.action_id;
      const id = Array.isArray(actionId) ? actionId[0] : actionId;
      if (typeof id === 'string') {
        sortValuesMap.set(id, hit.sort);
      }
    }
  }

  if (liveRows.length > 0) {
    try {
      await enrichWithResultCounts(
        liveHits,
        liveRows,
        osqueryContext,
        spaceId,
        integrationNamespaces ?? [spaceId],
        ccsEnabled
      );
    } catch (err) {
      logger.warn(`Failed to enrich live rows with result counts: ${(err as Error).message}`);
    }
  }

  return { liveRows, sortValuesMap };
};

const enrichWithResultCounts = async (
  liveHits: LiveActionHit[],
  liveRows: LiveHistoryRow[],
  osqueryContext: OsqueryAppContext,
  spaceId: string,
  integrationNamespaces: readonly string[],
  ccsEnabled: boolean
): Promise<void> => {
  const allSubActionIds = liveHits.flatMap(collectSubActionIds);
  const uniqueActionIds = [...new Set(allSubActionIds)];

  if (uniqueActionIds.length === 0) return;

  const [coreStart] = await osqueryContext.getStartServices();
  const internalEsClient = coreStart.elasticsearch.client.asInternalUser;
  const resultCountsMap = await getResultCountsForActions(
    internalEsClient,
    uniqueActionIds,
    spaceId,
    integrationNamespaces,
    ccsEnabled
  );

  for (let i = 0; i < liveRows.length; i++) {
    const row = liveRows[i];
    const hit = liveHits[i];
    const source = (hit._source ?? {}) as Record<string, unknown>;
    const queries = (source.queries ?? []) as Array<{ action_id?: string }>;

    if (row.packId || row.packName) {
      let totalRows = 0;
      let queriesWithResults = 0;
      let successCount = 0;
      let errorCount = 0;
      let maxRespondedAgents = 0;

      for (const query of queries) {
        if (query.action_id) {
          const counts = resultCountsMap.get(query.action_id);
          if (counts) {
            totalRows += counts.totalRows;
            if (counts.totalRows > 0) {
              queriesWithResults++;
            }

            if (counts.respondedAgents > maxRespondedAgents) {
              maxRespondedAgents = counts.respondedAgents;
              successCount = counts.successfulAgents;
              errorCount = counts.errorAgents;
            }
          }
        }
      }

      liveRows[i] = {
        ...row,
        totalRows,
        queriesWithResults,
        queriesTotal: queries.length,
        successCount,
        errorCount,
      };
    } else {
      const queryActionId = queries[0]?.action_id;
      const counts = queryActionId ? resultCountsMap.get(queryActionId) : undefined;
      liveRows[i] = {
        ...row,
        totalRows: counts?.totalRows ?? 0,
        successCount: counts?.successfulAgents ?? 0,
        errorCount: counts?.errorAgents ?? 0,
      };
    }
  }
};
