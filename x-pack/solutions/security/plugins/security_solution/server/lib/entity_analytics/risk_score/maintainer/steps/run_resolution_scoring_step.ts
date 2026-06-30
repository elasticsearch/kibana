/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { EntityUpdateClient } from '@kbn/entity-store/server';
import type { EntityType } from '../../../../../../common/entity_analytics/types';
import type { WatchlistObject } from '../../../../../../common/api/entity_analytics/watchlists/management/common.gen';
import type { RiskScoreDataClient } from '../../risk_score_data_client';
import { calculateResolutionEntityScores } from './score_resolution_entities';
import { persistScoresToEntityStore, persistScoresToRiskIndex } from './persist_scores';
import type { ResolutionStepResult } from './pipeline_types';
import type { ScopedLogger } from '../utils/with_log_context';

interface RunResolutionScoringParams {
  esClient: ElasticsearchClient;
  crudClient: EntityUpdateClient;
  logger: ScopedLogger;
  entityType: EntityType;
  alertsIndex: string;
  lookupIndex: string;
  pageSize: number;
  sampleSize: number;
  now: string;
  calculationRunId: string;
  abortSignal?: AbortSignal;
  watchlistConfigs: Map<string, WatchlistObject>;
  idBasedRiskScoringEnabled: boolean;
  writer: Awaited<ReturnType<RiskScoreDataClient['getWriter']>>;
  targetEntityIds?: string[];
  refresh?: Parameters<typeof persistScoresToRiskIndex>[0]['refresh'];
}

export const runResolutionScoringStep = async ({
  esClient,
  crudClient,
  logger: runLogger,
  entityType,
  alertsIndex,
  lookupIndex,
  pageSize,
  sampleSize,
  now,
  calculationRunId,
  abortSignal,
  watchlistConfigs,
  idBasedRiskScoringEnabled,
  writer,
  targetEntityIds,
  refresh,
}: RunResolutionScoringParams): Promise<ResolutionStepResult> => {
  runLogger.debug(
    `starting phase 2 resolution scoring: page_size=${pageSize}, sample_size=${sampleSize}`
  );
  let pagesProcessed = 0;
  let scoresWrittenResolution = 0;
  let abortedBetweenPages = false;

  for await (const pageScores of calculateResolutionEntityScores({
    esClient,
    crudClient,
    logger: runLogger,
    entityType,
    alertsIndex,
    lookupIndex,
    pageSize,
    sampleSize,
    now,
    calculationRunId,
    watchlistConfigs,
    abortSignal,
    targetEntityIds,
  })) {
    if (abortSignal?.aborted) {
      runLogger.info('Resolution scoring aborted between pages');
      abortedBetweenPages = true;
      break;
    }
    pagesProcessed += 1;
    if (pageScores.length > 0) {
      scoresWrittenResolution += await persistScoresToRiskIndex({
        writer,
        entityType,
        scores: pageScores,
        logger: runLogger,
        refresh,
      });
      await persistScoresToEntityStore({
        crudClient,
        logger: runLogger,
        entityType,
        scores: pageScores,
        enabled: idBasedRiskScoringEnabled,
      });
    }
  }

  if (scoresWrittenResolution === 0) {
    const skipReason = abortedBetweenPages
      ? 'aborted'
      : pagesProcessed === 0
      ? 'lookup_empty'
      : 'no_matching_alerts';
    runLogger.debug(
      `phase 2 resolution scoring produced no writes: reason=${skipReason}, pages=${pagesProcessed}`
    );
    return {
      scoresWritten: 0,
      pagesProcessed,
      skippedReason: !abortedBetweenPages && pagesProcessed === 0 ? 'lookup_empty' : undefined,
    };
  }

  runLogger.debug(
    `phase 2 resolution scoring wrote ${scoresWrittenResolution} docs across ${pagesProcessed} page(s)`
  );

  return {
    scoresWritten: scoresWrittenResolution,
    pagesProcessed,
  };
};
