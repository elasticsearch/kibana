/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import moment from 'moment';
import { entityStoreMetrics } from '../../monitor/metrics';
import type { EntityStoreGlobalState } from '../saved_objects';
import type { EntityStoreGlobalStateClient } from '../saved_objects';
import { createIndex, reindex, updateByQueryWithScript } from '../../infra/elasticsearch';
import { getLatestEntitiesIndexName } from '../../../common/domain/entity_index';
import { getErrorMessage } from '../../../common';
import { getHistorySnapshotIndexName } from '../asset_manager/history_snapshot_index';
import { HISTORY_SNAPSHOT_RESET_SCRIPT } from './constants';

export type RunHistorySnapshotResult =
  | { ok: true; historySnapshotIndex: string; docCount: number; resetCount: number }
  | { ok: true; skipped: true }
  | { ok: false; error: Error };

export interface RunHistorySnapshotOptions {
  abortSignal?: AbortSignal;
}

export { HISTORY_SNAPSHOT_RESET_SCRIPT } from './constants';

const POLL_INTERVAL_MS = 30 * 1000;
const POLL_MIN_INTERVAL_MS = 5 * 1000;

export interface HistorySnapshotClientDependencies {
  logger: Logger;
  esClient: ElasticsearchClient;
  namespace: string;
  globalStateClient: EntityStoreGlobalStateClient;
}

export class HistorySnapshotClient {
  private readonly logger: Logger;
  private readonly esClient: ElasticsearchClient;
  private readonly namespace: string;
  private readonly globalStateClient: EntityStoreGlobalStateClient;

  constructor({
    logger,
    esClient,
    namespace,
    globalStateClient,
  }: HistorySnapshotClientDependencies) {
    this.logger = logger;
    this.esClient = esClient;
    this.namespace = namespace;
    this.globalStateClient = globalStateClient;
  }

  public async runHistorySnapshot(
    options: RunHistorySnapshotOptions = {}
  ): Promise<RunHistorySnapshotResult> {
    const { abortSignal } = options;

    const globalState = await this.globalStateClient.findOrThrow();

    if (globalState.historySnapshot?.status !== 'started') {
      this.logger.debug('History snapshot status is not started, skipping run');
      return { ok: true, skipped: true };
    }

    const timestampNow = moment.utc().toISOString();
    const snapshotDate = moment.utc().toDate();
    const latestIndex = getLatestEntitiesIndexName(this.namespace);
    const historySnapshotIndex = getHistorySnapshotIndexName(this.namespace, snapshotDate);

    try {
      await createIndex(this.esClient, historySnapshotIndex, { throwIfExists: false });

      const reindexStart = Date.now();
      const reindexResult = await reindex(this.esClient, {
        source: { index: latestIndex },
        dest: { index: historySnapshotIndex },
        signal: abortSignal,
        waitForTask: {
          logger: this.logger,
          minTimeout: POLL_MIN_INTERVAL_MS,
          maxTimeout: POLL_INTERVAL_MS,
          forever: true,
        },
      });
      entityStoreMetrics.historySnapshotReindexDurationMs.record(Date.now() - reindexStart, {
        namespace: this.namespace,
      });

      const docCount = reindexResult.total;
      if (docCount === 0) {
        await this.updateGlobalStateOnSuccess(globalState);
        entityStoreMetrics.historySnapshotSuccess.add(1, { namespace: this.namespace });
        entityStoreMetrics.historySnapshotDocCount.record(0, { namespace: this.namespace });
        return { ok: true, historySnapshotIndex, docCount: 0, resetCount: 0 };
      }

      const resetStart = Date.now();
      const updateResult = await updateByQueryWithScript(this.esClient, {
        index: latestIndex,
        query: { match_all: {} },
        script: HISTORY_SNAPSHOT_RESET_SCRIPT,
        params: { timestampNow },
        signal: abortSignal,
        waitForTask: {
          logger: this.logger,
          minTimeout: POLL_MIN_INTERVAL_MS,
          maxTimeout: POLL_INTERVAL_MS,
          forever: true,
        },
      });
      entityStoreMetrics.historySnapshotResetDurationMs.record(Date.now() - resetStart, {
        namespace: this.namespace,
      });

      await this.updateGlobalStateOnSuccess(globalState);
      entityStoreMetrics.historySnapshotSuccess.add(1, { namespace: this.namespace });
      entityStoreMetrics.historySnapshotDocCount.record(docCount, { namespace: this.namespace });
      return {
        ok: true,
        historySnapshotIndex,
        docCount,
        resetCount: updateResult.updated,
      };
    } catch (err) {
      const caughtError = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`history snapshot failed: ${caughtError.message}`, { error: caughtError });
      await this.updateGlobalStateOnError(globalState, caughtError);
      return { ok: false, error: new Error('History snapshot failed') };
    }
  }

  private async updateGlobalStateOnSuccess(globalState: EntityStoreGlobalState): Promise<void> {
    try {
      await this.globalStateClient.update({
        historySnapshot: {
          ...globalState.historySnapshot,
          lastExecutionTimestamp: moment.utc().toISOString(),
          lastError: undefined,
        },
      });
    } catch (updateErr) {
      this.logger.error(
        `history snapshot: failed to update global state: ${getErrorMessage(updateErr)}`
      );
    }
  }

  private async updateGlobalStateOnError(
    globalState: EntityStoreGlobalState,
    error: Error
  ): Promise<void> {
    try {
      await this.globalStateClient.update({
        historySnapshot: {
          ...globalState.historySnapshot,
          lastError: {
            message: error.message,
            timestamp: moment.utc().toISOString(),
          },
        },
      });
    } catch (updateErr) {
      this.logger.error(
        `history snapshot: failed to update global state: ${getErrorMessage(updateErr)}`
      );
    }
  }
}
