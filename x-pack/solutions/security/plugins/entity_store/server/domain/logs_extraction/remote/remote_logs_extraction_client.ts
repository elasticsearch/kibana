/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import moment from 'moment';
import { unflattenObject } from '@kbn/object-utils';
import { get } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import { entityStoreMetrics } from '../../../monitor/metrics';
import type { Entity } from '../../../../common/domain/definitions/entity.gen';
import {
  EntityType,
  type ManagedEntityDefinition,
} from '../../../../common/domain/definitions/entity_schema';
import {
  ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
  type LogSlicePaginationParams,
  type PaginationParams,
} from '../query_builder_commons';
import {
  buildRemoteLogsExtractionEsqlQuery,
  extractRemotePaginationParams,
} from './remote_logs_extraction_query_builder';
import {
  buildLogPaginationCursorProbeEsql,
  interpretLogPaginationCursorRows,
  parseLogPaginationCursorRow,
  type LogPaginationCursor,
} from '../log_pagination_probe_query_builder';
import { executeEsqlQuery } from '../../../infra/elasticsearch/esql';
import { ingestEntities } from '../../../infra/elasticsearch/ingest';
import { getUpdatesEntitiesDataStreamName } from '../../asset_manager/updates_data_stream';
import {
  applyMaxLagCutoff,
  capExtractionWindowEnd,
  resolveRemoteExtractionWindow,
} from '../extraction_window';
import { capAtMaxLogsPerWindow } from '../effective_page_limits';
import type { RemoteExtractionStrategy } from './strategies';

interface RemoteExtractToUpdatesParams {
  type: EntityType;
  remoteIndexPatterns: string[];
  docsLimit: number;
  maxLogsPerPage: number;
  lookbackPeriod: string;
  delay: string;
  frequency: string;
  entityDefinition: ManagedEntityDefinition;
  abortController?: AbortController;
  windowOverride?: { fromDateISO: string; toDateISO: string };
  maxTimeWindowSize: string;
  /** Total raw log documents allowed per run. 0 = disabled. */
  maxLogsPerWindow: number;
  /** What to do when the cap fires: preserve cursor (defer) or advance to window end (drop). */
  maxLogsPerWindowCapBehavior: 'defer' | 'drop';
}

interface RemoteExtractToUpdatesResult {
  count: number;
  pages: number;
  logsProcessed?: number;
  error?: Error;
  logsCapApplied?: boolean;
}

export class RemoteLogsExtractionClient {
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly namespace: string,
    public readonly strategy: RemoteExtractionStrategy
  ) {
    this.logger = logger.get(`remote.${strategy.id}`);
  }

  public async extractToUpdates(
    params: RemoteExtractToUpdatesParams
  ): Promise<RemoteExtractToUpdatesResult> {
    try {
      return await this.doExtractToUpdates(params);
    } catch (error) {
      const wrappedError = new Error(
        `Failed to extract to updates from remote indices: ${error.message}`
      );
      this.logger.error(wrappedError);
      return { count: 0, pages: 0, error: wrappedError };
    }
  }

  private async doExtractToUpdates({
    type,
    remoteIndexPatterns,
    docsLimit,
    maxLogsPerPage,
    lookbackPeriod,
    delay,
    frequency,
    entityDefinition,
    abortController,
    windowOverride,
    maxTimeWindowSize,
    maxLogsPerWindow,
    maxLogsPerWindowCapBehavior,
  }: RemoteExtractToUpdatesParams): Promise<RemoteExtractToUpdatesResult> {
    if (remoteIndexPatterns.length === 0) {
      return { count: 0, pages: 0 };
    }

    const state =
      windowOverride != null
        ? { checkpointTimestamp: null, paginationRecoveryId: null }
        : await this.strategy.stateClient.findOrInit(type);

    const {
      effectiveFromDateISO: resolvedFromDateISO,
      effectiveWindowEnd,
      recoveryId,
      isWindowOverride,
    } = resolveRemoteExtractionWindow({
      config: { lookbackPeriod, delay },
      state,
      windowOverride,
      logger: this.logger,
    });

    const effectiveFromDateISO = isWindowOverride
      ? resolvedFromDateISO
      : applyMaxLagCutoff({
          fromDateISO: resolvedFromDateISO,
          effectiveWindowEnd,
          lookbackPeriod,
          frequency,
          logger: this.logger,
        });

    if (effectiveFromDateISO >= effectiveWindowEnd) {
      this.logger.error(
        `extraction window is empty (from=${effectiveFromDateISO} >= to=${effectiveWindowEnd}), skipping`
      );
      return { count: 0, pages: 0 };
    }

    if (isWindowOverride) {
      // Manual windowOverride runs as a single pass without persisting checkpoint.
      const result = await this.runLogsPaginationOuterLoop({
        type,
        remoteIndexPatterns,
        toDateISO: effectiveWindowEnd,
        docsLimit,
        maxLogsPerPage,
        maxLogsPerWindow,
        entityDefinition,
        abortController,
        effectiveFromDateISO,
        recoveryId,
        skipStateUpdates: true,
      });
      if (result.logsCapApplied) {
        entityStoreMetrics.extractionLogsCapApplied.add(1, {
          entity_type: type,
          namespace: this.namespace,
          behavior: maxLogsPerWindowCapBehavior,
          remote: true,
        });
        this.logger.warn(
          `${this.strategy.id.toUpperCase()} extraction volume cap reached for entity type "${type}" (manual run): processed ${
            result.logsProcessed
          } logs (limit: ${maxLogsPerWindow}). Cap behavior: "${maxLogsPerWindowCapBehavior}". Cursor is not persisted.`
        );
      }
      entityStoreMetrics.extractionLogsProcessed.record(result.logsProcessed ?? 0, {
        entity_type: type,
        namespace: this.namespace,
        remote: true,
      });
      return result;
    }

    let totalCount = 0;
    let totalPages = 0;
    let totalLogs = 0;
    let currentFromDateISO = effectiveFromDateISO;
    // Recovery applies only to the first sub-window. The inner outer-loop persists
    // `checkpointTimestamp` after every slice, so a crash mid-run resumes from the last
    // completed slice's end — no per-sub-window checkpoint write is needed.
    let recoveryIdForFirstSubWindow = recoveryId;

    let hasNextPage = true;
    while (hasNextPage) {
      if (abortController?.signal.aborted) {
        break;
      }
      if (currentFromDateISO >= effectiveWindowEnd) {
        break;
      }

      const { toDateISO: subWindowEnd, isCapped } = capExtractionWindowEnd({
        fromDateISO: currentFromDateISO,
        effectiveWindowEnd,
        maxTimeWindowSize,
        logger: this.logger,
      });

      // Pass remaining budget so the cap is tracked correctly across sub-windows.
      const remainingCap = maxLogsPerWindow > 0 ? maxLogsPerWindow - totalLogs : 0;
      const subResult = await this.runLogsPaginationOuterLoop({
        type,
        remoteIndexPatterns,
        toDateISO: subWindowEnd,
        docsLimit,
        maxLogsPerPage,
        maxLogsPerWindow: remainingCap,
        entityDefinition,
        abortController,
        effectiveFromDateISO: currentFromDateISO,
        recoveryId: recoveryIdForFirstSubWindow,
        skipStateUpdates: false,
      });
      recoveryIdForFirstSubWindow = undefined;

      totalCount += subResult.count;
      totalPages += subResult.pages;
      totalLogs += subResult.logsProcessed ?? 0;

      if (subResult.logsCapApplied) {
        entityStoreMetrics.extractionLogsCapApplied.add(1, {
          entity_type: type,
          namespace: this.namespace,
          behavior: maxLogsPerWindowCapBehavior,
          remote: true,
        });
        entityStoreMetrics.extractionLogsProcessed.record(totalLogs, {
          entity_type: type,
          namespace: this.namespace,
          remote: true,
        });
        this.logger.warn(
          `${this.strategy.id.toUpperCase()} extraction volume cap reached for entity type "${type}": processed ${totalLogs} logs (limit: ${maxLogsPerWindow}). Cap behavior: "${maxLogsPerWindowCapBehavior}".`
        );
        if (maxLogsPerWindowCapBehavior === 'drop') {
          this.logger.warn(
            `Dropping remaining ${this.strategy.id} logs. Advancing checkpoint to end of window: ${effectiveWindowEnd}.`
          );
          await this.strategy.stateClient.update(type, {
            checkpointTimestamp: effectiveWindowEnd,
            paginationRecoveryId: null,
          });
        }
        return {
          count: totalCount,
          pages: totalPages,
          logsProcessed: totalLogs,
          logsCapApplied: true,
        };
      }

      // if the window was capped we consider we have a next page
      hasNextPage = isCapped;
      currentFromDateISO = subWindowEnd;
    }

    if (totalCount === 0) {
      await this.strategy.stateClient.clearRecoveryId(type);
    }

    entityStoreMetrics.extractionLogsProcessed.record(totalLogs, {
      entity_type: type,
      namespace: this.namespace,
      remote: true,
    });

    return { count: totalCount, pages: totalPages };
  }

  /**
   * Outer loop: advances through the time window one probe-capped log slice at a time.
   * Each iteration runs the probe to discover the slice boundary, then delegates entity
   * ingestion to the inner loop. Advances `effectiveFromDateISO` and persists the slice
   * boundary after each slice completes.
   */
  private async runLogsPaginationOuterLoop({
    type,
    remoteIndexPatterns,
    toDateISO,
    docsLimit,
    maxLogsPerPage,
    maxLogsPerWindow,
    entityDefinition,
    abortController,
    effectiveFromDateISO: initialFromDateISO,
    recoveryId: initialRecoveryId,
    skipStateUpdates,
  }: {
    type: EntityType;
    remoteIndexPatterns: string[];
    toDateISO: string;
    docsLimit: number;
    maxLogsPerPage: number;
    maxLogsPerWindow: number;
    entityDefinition: ManagedEntityDefinition;
    abortController?: AbortController;
    effectiveFromDateISO: string;
    recoveryId: string | undefined;
    skipStateUpdates: boolean;
  }): Promise<RemoteExtractToUpdatesResult> {
    const effectiveMaxLogsPerPage = capAtMaxLogsPerWindow(maxLogsPerPage, maxLogsPerWindow);
    const effectiveDocsLimit = capAtMaxLogsPerWindow(docsLimit, maxLogsPerWindow);
    let totalCount = 0;
    let totalPages = 0;
    let totalLogs = 0;

    const onAbort = () => {
      this.logger.info(
        `Aborting logs extraction, entities extracted until abort: ${totalCount}, in ${totalPages} pages`
      );
      entityStoreMetrics.extractionTaskAborted.add(1, {
        entity_type: type,
        namespace: this.namespace,
        remote: true,
      });
    };
    abortController?.signal.addEventListener('abort', onAbort);

    let effectiveFromDateISO = initialFromDateISO;
    let recoveryId = initialRecoveryId;
    let sliceStart: LogSlicePaginationParams | undefined;

    let isLastLogsPage = false;

    do {
      const logPaginationCursor = await this.runProbe({
        remoteIndexPatterns,
        type,
        fromDateISO: effectiveFromDateISO,
        toDateISO,
        sliceStart,
        maxLogsPerPage: effectiveMaxLogsPerPage,
        abortController,
      });

      if (!logPaginationCursor.hasLogsToProcess) {
        break;
      }

      let { logsPaginationCursor: sliceEnd } = logPaginationCursor;
      isLastLogsPage = logPaginationCursor.isLastLogsPage;

      const bumpedSliceEnd = this.detectLogSliceStall(
        sliceStart,
        sliceEnd,
        logPaginationCursor.sliceLogCount,
        effectiveMaxLogsPerPage
      );
      if (bumpedSliceEnd) {
        sliceEnd = bumpedSliceEnd;
        entityStoreMetrics.extractionLogsPerPageDropped.add(1, {
          entity_type: type,
          namespace: this.namespace,
          remote: true,
        });
      } else {
        totalLogs += logPaginationCursor.sliceLogCount;

        // Recovery cursor is only used in the first slice; clear it after consumption
        const recoveryIdForThisSlice = recoveryId;
        recoveryId = undefined;

        const { count, pages } = await this.runEntitiesPaginationInnerLoop({
          type,
          remoteIndexPatterns,
          fromDateISO: effectiveFromDateISO,
          toDateISO,
          docsLimit: effectiveDocsLimit,
          entityDefinition,
          abortController,
          sliceStart,
          sliceEnd,
          recoveryId: recoveryIdForThisSlice,
          skipStateUpdates,
        });

        totalCount += count;
        totalPages += pages;
      }

      // Advance the window: the completed slice end becomes the next slice start
      sliceStart = sliceEnd;
      effectiveFromDateISO = sliceEnd.timestampCursor;
      if (!skipStateUpdates) {
        await this.strategy.stateClient.update(type, {
          checkpointTimestamp: sliceEnd.timestampCursor,
          paginationRecoveryId: null,
        });
      }

      if (!bumpedSliceEnd && maxLogsPerWindow > 0 && totalLogs >= maxLogsPerWindow) {
        this.logger.info(
          `${this.strategy.id.toUpperCase()} entities extracted: ${totalCount}, logs processed: ${totalLogs}, in ${totalPages} pages`
        );
        return {
          count: totalCount,
          pages: totalPages,
          logsProcessed: totalLogs,
          logsCapApplied: true,
        };
      }
    } while (!isLastLogsPage);

    this.logger.info(
      `${this.strategy.id.toUpperCase()} entities extracted: ${totalCount}, logs processed: ${totalLogs}, in ${totalPages} pages`
    );

    return {
      count: totalCount,
      pages: totalPages,
      logsProcessed: totalLogs,
      logsCapApplied: false,
    };
  }

  /**
   * Runs the probe query to determine the inclusive upper boundary of the next log slice.
   * The probe uses `INLINE STATS count(*)` before `LIMIT maxLogsPerPage` to both cap the
   * slice and signal whether more slices remain (`isLastLogsPage`).
   */
  private async runProbe({
    remoteIndexPatterns,
    type,
    fromDateISO,
    toDateISO,
    sliceStart,
    maxLogsPerPage,
    abortController,
  }: {
    remoteIndexPatterns: string[];
    type: EntityType;
    fromDateISO: string;
    toDateISO: string;
    sliceStart: LogSlicePaginationParams | undefined;
    maxLogsPerPage: number;
    abortController?: AbortController;
  }): Promise<LogPaginationCursor> {
    const probeQuery = buildLogPaginationCursorProbeEsql({
      indexPatterns: remoteIndexPatterns,
      type,
      fromDateISO,
      toDateISO,
      logsPageCursorStart: sliceStart,
      maxLogsPerPage,
    });

    this.logger.info(
      `${this.strategy.id} probe: from=${fromDateISO} to=${toDateISO}${
        sliceStart ? ` sliceStart=${sliceStart.timestampCursor}` : ''
      }`
    );

    const probeStart = Date.now();
    const probeResponse = await executeEsqlQuery({
      esClient: this.strategy.client,
      query: probeQuery,
      abortController,
    });
    entityStoreMetrics.extractionProbeQueryDurationMs.record(Date.now() - probeStart, {
      entity_type: type,
      namespace: this.namespace,
      remote: true,
    });

    return interpretLogPaginationCursorRows(
      parseLogPaginationCursorRow(probeResponse),
      maxLogsPerPage
    );
  }

  /**
   * Inner loop: paginates through entity pages within a single log slice (bounded by
   * `sliceStart`/`sliceEnd`). Persists the entity cursor after each full page so a crash
   * mid-slice can be recovered on the next run.
   *
   * Recovery checkpoint: `checkpointTimestamp` is set to `entityPagination.timestampCursor` (the
   * `_firstSeenLog` of the last processed entity) and `paginationRecoveryId` to its ID. On
   * recovery the outer loop sets `effectiveFromDateISO = checkpointTimestamp`, which becomes the
   * `fromDateISO` argument to `buildPaginationSection`; the recovery WHERE clause is then
   * `_firstSeenLog > checkpointTimestamp OR (_firstSeenLog = checkpointTimestamp AND id > recoveryId)`,
   * which resumes exactly from the last cursor without re-processing earlier entities.
   */
  private async runEntitiesPaginationInnerLoop({
    type,
    remoteIndexPatterns,
    fromDateISO,
    toDateISO,
    docsLimit,
    entityDefinition,
    abortController,
    sliceStart,
    sliceEnd,
    recoveryId: initialRecoveryId,
    skipStateUpdates,
  }: {
    type: EntityType;
    remoteIndexPatterns: string[];
    fromDateISO: string;
    toDateISO: string;
    docsLimit: number;
    entityDefinition: ManagedEntityDefinition;
    abortController?: AbortController;
    sliceStart: LogSlicePaginationParams | undefined;
    sliceEnd: LogSlicePaginationParams;
    recoveryId: string | undefined;
    skipStateUpdates: boolean;
  }): Promise<{ count: number; pages: number }> {
    let count = 0;
    let pages = 0;

    // When recovering mid-slice, seed a dummy pagination so buildPaginationSection emits
    // the WHERE clause; recoveryId drives the actual cursor on the first page only.
    let entityPagination: PaginationParams | undefined = initialRecoveryId
      ? { timestampCursor: fromDateISO, idCursor: initialRecoveryId }
      : undefined;
    let recoveryId = initialRecoveryId;

    do {
      const query = buildRemoteLogsExtractionEsqlQuery({
        indexPatterns: remoteIndexPatterns,
        entityDefinition,
        fromDateISO,
        toDateISO,
        docsLimit,
        logsPageCursorStart: sliceStart,
        logsPageCursorEnd: sliceEnd,
        pagination: entityPagination,
        recoveryId,
      });
      recoveryId = undefined; // one-shot: used only on the first page of a recovered slice

      this.logger.info(
        `extraction from=${fromDateISO} to=${toDateISO} sliceEnd=${sliceEnd.timestampCursor}${
          entityPagination
            ? ` entityPagination=${entityPagination.timestampCursor}|${entityPagination.idCursor}`
            : ''
        }`
      );

      const queryStart = Date.now();
      const esqlResponse = await executeEsqlQuery({
        esClient: this.strategy.client,
        query,
        abortController,
      });
      entityStoreMetrics.extractionQueryDurationMs.record(Date.now() - queryStart, {
        entity_type: type,
        namespace: this.namespace,
        remote: true,
      });

      count += esqlResponse.values.length;
      entityPagination = extractRemotePaginationParams(esqlResponse, docsLimit);

      if (esqlResponse.values.length > 0) {
        pages++;
        entityStoreMetrics.extractionEntitiesUpserted.add(esqlResponse.values.length, {
          entity_type: type,
          namespace: this.namespace,
          remote: true,
        });
        const ingestStart = Date.now();
        await ingestEntities({
          esClient: this.strategy.client,
          esqlResponse,
          targetIndex: getUpdatesEntitiesDataStreamName(this.namespace),
          logger: this.logger,
          abortController,
          fieldsToIgnore: [ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD],
          transformDocument: this.buildTransformDocument(type),
          refresh: false,
          onDropped: () =>
            entityStoreMetrics.extractionBulkDropped.add(1, {
              entity_type: type,
              namespace: this.namespace,
              remote: true,
            }),
        });
        entityStoreMetrics.extractionIngestDurationMs.record(Date.now() - ingestStart, {
          entity_type: type,
          namespace: this.namespace,
          remote: true,
        });
      }

      if (entityPagination && !skipStateUpdates) {
        await this.strategy.stateClient.update(type, {
          checkpointTimestamp: entityPagination.timestampCursor,
          paginationRecoveryId: entityPagination.idCursor,
        });
      }
    } while (entityPagination);

    return { count, pages };
  }

  /** Returns the bumped slice-end cursor when a stall is detected, null otherwise. Logs a warning on stall. */
  private detectLogSliceStall(
    sliceStart: LogSlicePaginationParams | undefined,
    sliceEnd: LogSlicePaginationParams,
    sliceLogCount: number,
    maxLogsPerPage: number
  ): LogSlicePaginationParams | null {
    if (
      sliceStart &&
      sliceStart.timestampCursor === sliceEnd.timestampCursor &&
      sliceLogCount >= maxLogsPerPage
    ) {
      const bumpedTs = moment(sliceEnd.timestampCursor).add(1, 'ms').toISOString();
      this.logger.warn(
        `${this.strategy.id.toUpperCase()} log-slice probe stalled at ${
          sliceEnd.timestampCursor
        } with a full page (${sliceLogCount} docs); advancing cursor by 1ms. Docs sharing this timestamp beyond maxLogsPerPage will be dropped.`
      );
      return { timestampCursor: bumpedTs };
    }
    return null;
  }

  /**
   * Returns a document transformer that rewrites `@timestamp` to a synthetic value
   * just past now, incrementing by 1ms per doc, so the next local extraction run
   * picks up these updates in the correct order. This is bounded by the `delay`
   * configured on the main extraction.
   */
  private buildTransformDocument(type: EntityType) {
    let timestampIncrement = 1;
    return (doc: Record<string, unknown>) => {
      timestampIncrement++;
      const timestamp = moment().utc().add(timestampIncrement, 'ms').toISOString();
      return this.transformDocForUpsert(type, doc, timestamp);
    };
  }

  private transformDocForUpsert(
    type: EntityType,
    data: Partial<Entity>,
    timestamp: string
  ): Record<string, unknown> {
    const doc: Record<string, unknown> = unflattenObject({
      ...data,
      '@timestamp': timestamp,
    });

    if (type === EntityType.enum.generic) {
      return doc;
    }

    const entityDoc = get(doc, ['entity']);
    const typeDoc = get(doc, [type, 'entity']);
    const finalEntity = {
      ...(typeDoc || {}),
      ...(entityDoc || {}),
    };

    set(doc, [type, 'entity'], finalEntity);
    delete doc.entity;
    return doc;
  }
}
