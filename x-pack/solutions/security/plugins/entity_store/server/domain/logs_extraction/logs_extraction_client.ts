/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import moment from 'moment';
import { SavedObjectsErrorHelpers, type ElasticsearchClient } from '@kbn/core/server';
import type { DataViewsService } from '@kbn/data-views-plugin/common';
import { isNonLocalIndexName } from '@kbn/es-query';
import { entityStoreMetrics } from '../../monitor/metrics';
import type {
  EntityType,
  ManagedEntityDefinition,
} from '../../../common/domain/definitions/entity_schema';
import { getEntityDefinition } from '../../../common/domain/definitions/registry';
import {
  type LogSlicePaginationParams,
  type PaginationParams,
  ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
} from './query_builder_commons';
import {
  buildLogPaginationCursorProbeEsql,
  interpretLogPaginationCursorRows,
  type LogPaginationCursor,
  parseLogPaginationCursorRow,
} from './log_pagination_probe_query_builder';
import {
  buildLogsExtractionEsqlQuery,
  buildRemainingLogsCountQuery,
  extractMainPaginationParams,
  HASHED_ID_FIELD,
} from './logs_extraction_query_builder';
import {
  applyMaxLagCutoff,
  capExtractionWindowEnd,
  resolveMainExtractionWindow,
  validateExtractionWindow,
} from './extraction_window';
import { capAtMaxLogsPerWindow } from './effective_page_limits';
import { getLatestEntitiesIndexName } from '../../../common/domain/entity_index';
import { getUpdatesEntitiesDataStreamName } from '../asset_manager/updates_data_stream';
import { executeEsqlQuery } from '../../infra/elasticsearch/esql';
import { ingestEntities } from '../../infra/elasticsearch/ingest';
import { resolveClosedIndexAdjustments } from '../../infra/elasticsearch/resolve_closed_indices';
import {
  getAlertsIndexName,
  getSecuritySolutionDataViewName,
} from '../asset_manager/external_indices_contants';
import {
  type LogExtractionConfig,
  LogExtractionConfig as LogExtractionConfigSchema,
} from '../saved_objects';
import {
  type EngineDescriptorClient,
  type EngineLogExtractionState,
  type EntityStoreGlobalStateClient,
} from '../saved_objects';
import { ENGINE_STATUS } from '../constants';
import type { RemoteLogsExtractionClient } from './remote';
import { EntityStoreNotRunningError } from '../errors';
import type { LogExtractionUpdateParams } from '../../routes/constants';

/** Engine state with all cursor fields cleared. Used between sub-window iterations so a fresh
 * sub-window does not re-trigger recovery from cursors persisted by an earlier sub-window. */
const FRESH_ENGINE_LOG_EXTRACTION_STATE: EngineLogExtractionState = {
  checkpointTimestamp: null,
  paginationId: null,
  lastExecutionTimestamp: null,
};

interface LogsExtractionOptions {
  specificWindow?: {
    fromDateISO: string;
    toDateISO: string;
  };
  abortController?: AbortController;
}

interface ExtractedLogsSummarySuccess {
  success: true;
  isRemote: boolean;
  count: number;
  pages: number;
  scannedIndices: string[];
  lastSearchTimestamp: string;
  logsCapApplied: boolean;
  logsProcessed: number;
}

interface ExtractedLogsSummaryError {
  success: false;
  isRemote: boolean;
  error: Error;
}

type ExtractedLogsSummary = ExtractedLogsSummarySuccess | ExtractedLogsSummaryError;

export interface LogsExtractionClientDependencies {
  logger: Logger;
  namespace: string;
  esClient: ElasticsearchClient;
  dataViewsService: DataViewsService;
  engineDescriptorClient: EngineDescriptorClient;
  globalStateClient: EntityStoreGlobalStateClient;
  remoteLogsExtractionClient: RemoteLogsExtractionClient;
}

export class LogsExtractionClient {
  logger: Logger;
  namespace: string;
  esClient: ElasticsearchClient;
  dataViewsService: DataViewsService;
  engineDescriptorClient: EngineDescriptorClient;
  globalStateClient: EntityStoreGlobalStateClient;
  remoteLogsExtractionClient: RemoteLogsExtractionClient;
  constructor({
    logger,
    namespace,
    esClient,
    dataViewsService,
    engineDescriptorClient,
    globalStateClient,
    remoteLogsExtractionClient,
  }: LogsExtractionClientDependencies) {
    this.logger = logger;
    this.namespace = namespace;
    this.esClient = esClient;
    this.dataViewsService = dataViewsService;
    this.engineDescriptorClient = engineDescriptorClient;
    this.globalStateClient = globalStateClient;
    this.remoteLogsExtractionClient = remoteLogsExtractionClient;
  }

  private async getLogExtractionConfigAndState(
    type: EntityType
  ): Promise<{ config: LogExtractionConfig; engineState: EngineLogExtractionState }> {
    const engineDescriptor = await this.engineDescriptorClient.findOrThrow(type);
    if (engineDescriptor.status !== ENGINE_STATUS.STARTED) {
      throw new EntityStoreNotRunningError();
    }
    const globalState = await this.globalStateClient.findOrThrow();
    return { config: globalState.logsExtraction, engineState: engineDescriptor.logExtractionState };
  }

  public async extractLogs(
    type: EntityType,
    opts?: LogsExtractionOptions
  ): Promise<ExtractedLogsSummary> {
    this.logger.debug('starting entity extraction');

    let isRemote = false;

    try {
      const { config, engineState } = await this.getLogExtractionConfigAndState(type);
      const entityDefinition = getEntityDefinition(type, this.namespace);
      const {
        isRemote: resolvedIsRemote,
        count,
        pages,
        indexPatterns,
        lastSearchTimestamp,
        remoteError,
        logsCapDeferred,
        logsCapApplied,
        logsProcessed,
      } = await this.runQueryAndIngestDocs({
        type,
        config,
        engineState,
        opts,
        entityDefinition,
      });

      isRemote = resolvedIsRemote;

      const operationResult = {
        success: true as const,
        isRemote,
        count,
        pages,
        scannedIndices: indexPatterns,
        lastSearchTimestamp,
        logsCapApplied,
        logsProcessed,
      };

      if (opts?.specificWindow) {
        return operationResult;
      }

      if (logsCapDeferred) {
        // Cursor is already persisted at the last completed slice end inside runMainExtractionLoop;
        // do not overwrite it — only clear any stale error.
        await this.engineDescriptorClient.update(type, {
          error: remoteError ? { message: remoteError.message, action: 'extractLogs' } : null,
        });
      } else {
        await this.engineDescriptorClient.update(type, {
          logExtractionState: {
            checkpointTimestamp: null,
            paginationId: null,
            lastExecutionTimestamp: lastSearchTimestamp || moment().utc().toISOString(),
          },
          error: remoteError ? { message: remoteError.message, action: 'extractLogs' } : null,
        });
      }

      return operationResult;
    } catch (error) {
      return await this.handleError(error, type, isRemote);
    }
  }

  public async updateConfig(params: LogExtractionUpdateParams): Promise<LogExtractionConfig> {
    const globalState = await this.globalStateClient.findOrThrow();
    const mergedConfig = LogExtractionConfigSchema.parse({
      ...globalState.logsExtraction,
      ...params,
    });
    await this.globalStateClient.update({ logsExtraction: mergedConfig });
    return mergedConfig;
  }

  public async getRemainingLogsCount(type: EntityType): Promise<number> {
    try {
      const { config, engineState } = await this.getLogExtractionConfigAndState(type);
      const indexPatterns = await this.getLocalIndexPatterns(
        config.additionalIndexPatterns,
        config.excludedIndexPatterns
      );
      const { fromDateISO } = resolveMainExtractionWindow({ config, engineState });
      const toDateISO = moment().utc().toISOString();
      const logsPageCursorStart = paginationFromOptionalFields(engineState.checkpointTimestamp);
      const query = buildRemainingLogsCountQuery({
        indexPatterns,
        type,
        fromDateISO,
        toDateISO,
        logsPageCursorStart,
      });
      const esqlResponse = await executeEsqlQuery({
        esClient: this.esClient,
        query,
      });
      const countColumnIdx = esqlResponse.columns.findIndex((col) => col.name === 'document_count');
      if (countColumnIdx === -1 || esqlResponse.values.length === 0) {
        return 0;
      }
      const count = esqlResponse.values[0][countColumnIdx];

      return Number(count);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get remaining logs count for entity type "${type}": ${message}`);
      throw error;
    }
  }

  private async runQueryAndIngestDocs({
    type,
    config,
    engineState,
    opts,
    entityDefinition,
  }: {
    type: EntityType;
    config: LogExtractionConfig;
    engineState: EngineLogExtractionState;
    opts?: LogsExtractionOptions;
    entityDefinition: ManagedEntityDefinition;
  }): Promise<{
    isRemote: boolean;
    count: number;
    pages: number;
    indexPatterns: string[];
    lastSearchTimestamp: string;
    remoteError?: Error;
    logsCapDeferred: boolean;
    logsCapApplied: boolean;
    logsProcessed: number;
  }> {
    const { localIndexPatterns, remoteIndexPatterns } = await this.getLocalAndRemoteIndexPatterns(
      config.additionalIndexPatterns,
      config.excludedIndexPatterns
    );

    const mainPromise = this.runMainPath({
      type,
      config,
      engineState,
      opts,
      entityDefinition,
      latestIndex: getLatestEntitiesIndexName(this.namespace),
      indexPatterns: localIndexPatterns,
    });

    const remoteStrategyIndexPatterns = this.remoteLogsExtractionClient.strategy.buildPatterns({
      localIndexPatterns,
      remoteIndexPatterns,
    });
    const remotePromise = this.remoteLogsExtractionClient.extractToUpdates({
      type,
      entityDefinition,
      remoteIndexPatterns: remoteStrategyIndexPatterns,
      docsLimit: config.docsLimit,
      maxLogsPerPage: config.maxLogsPerPage,
      lookbackPeriod: config.lookbackPeriod,
      delay: config.delay,
      frequency: config.frequency,
      maxTimeWindowSize: config.maxTimeWindowSize,
      maxLogsPerWindow: config.maxLogsPerWindow,
      maxLogsPerWindowCapBehavior: config.maxLogsPerWindowCapBehavior,
      abortController: opts?.abortController,
      windowOverride: opts?.specificWindow,
    });

    const [mainResult, remoteResult] = await Promise.all([mainPromise, remotePromise]);

    return {
      ...mainResult,
      isRemote: remoteStrategyIndexPatterns.length > 0,
      indexPatterns: [...localIndexPatterns, ...remoteStrategyIndexPatterns],
      remoteError: remoteResult.error,
    };
  }

  /**
   * Main-path dispatcher: a manual `specificWindow` runs the extraction loop once with the
   * supplied bounds; a scheduled run walks the time window as a sequence of capped sub-windows.
   *
   * Sub-window loop (scheduled runs): bounds probe cost in lagging environments by limiting
   * each iteration's WHERE-clause to `maxTimeWindowSize` of data. After each iteration the
   * cursor state is cleared and `lastExecutionTimestamp` advances to the sub-window end so a
   * crash between sub-windows resumes correctly on the next scheduled run.
   */
  private async runMainPath({
    type,
    config,
    engineState,
    opts,
    entityDefinition,
    indexPatterns,
    latestIndex,
  }: {
    type: EntityType;
    config: LogExtractionConfig;
    engineState: EngineLogExtractionState;
    opts?: LogsExtractionOptions;
    entityDefinition: ManagedEntityDefinition;
    indexPatterns: string[];
    latestIndex: string;
  }): Promise<{
    count: number;
    pages: number;
    indexPatterns: string[];
    lastSearchTimestamp: string;
    logsCapDeferred: boolean;
    logsCapApplied: boolean;
    logsProcessed: number;
  }> {
    const { docsLimit, maxLogsPerPage, maxLogsPerWindow, maxLogsPerWindowCapBehavior } = config;

    if (opts?.specificWindow) {
      const { fromDateISO, toDateISO } = opts.specificWindow;
      validateExtractionWindow(fromDateISO, toDateISO);
      const result = await this.runMainExtractionLoop({
        type,
        engineState,
        opts,
        indexPatterns,
        latestIndex,
        fromDateISO,
        toDateISO,
        docsLimit,
        maxLogsPerPage,
        maxLogsPerWindow,
        entityDefinition,
      });
      let { lastSearchTimestamp } = result;
      if (result.logsCapApplied) {
        this.logger.warn(
          `Entity extraction volume cap reached for entity type "${type}": processed ${result.logsProcessed} logs (limit: ${maxLogsPerWindow}). Cap behavior: "${maxLogsPerWindowCapBehavior}". This is a manual (force) run — cursor is not persisted.`
        );
        entityStoreMetrics.extractionLogsCapApplied.add(1, {
          entity_type: type,
          namespace: this.namespace,
          behavior: maxLogsPerWindowCapBehavior,
          remote: false,
        });
        if (maxLogsPerWindowCapBehavior === 'drop') {
          lastSearchTimestamp = toDateISO;
        }
      }
      entityStoreMetrics.extractionLogsProcessed.record(result.logsProcessed, {
        entity_type: type,
        namespace: this.namespace,
        remote: false,
      });
      return {
        ...result,
        lastSearchTimestamp,
        indexPatterns,
        logsCapDeferred: false,
        logsCapApplied: result.logsCapApplied,
      };
    }

    const { fromDateISO: resolvedFromDateISO, effectiveWindowEnd } = resolveMainExtractionWindow({
      config,
      engineState,
    });
    // Surface clock skew / corrupted state loudly if the persisted resume point is in the future.
    validateExtractionWindow(resolvedFromDateISO, effectiveWindowEnd);

    const initialFromDateISO = applyMaxLagCutoff({
      fromDateISO: resolvedFromDateISO,
      effectiveWindowEnd,
      lookbackPeriod: config.lookbackPeriod,
      frequency: config.frequency,
      logger: this.logger,
    });

    let currentFromDateISO = initialFromDateISO;
    // Recovery cursors on the engine state apply only to the first sub-window of this run; once
    // it completes, subsequent sub-windows iterate over fresh time ranges and must not re-trigger
    // entity-page recovery from a stale paginationId.
    let currentEngineState = engineState;
    let totalCount = 0;
    let totalPages = 0;
    let totalLogs = 0;
    let lastSubWindowEnd = currentFromDateISO;

    let hasNextPage = true;
    while (hasNextPage) {
      if (opts?.abortController?.signal.aborted) {
        break;
      }
      if (currentFromDateISO >= effectiveWindowEnd) {
        break;
      }

      const { toDateISO, isCapped } = capExtractionWindowEnd({
        fromDateISO: currentFromDateISO,
        effectiveWindowEnd,
        maxTimeWindowSize: config.maxTimeWindowSize,
        logger: this.logger,
      });

      // Pass remaining budget into the inner loop so that cross-sub-window accumulation is
      // tracked correctly: remaining=0 means no cap (maxLogsPerWindow=0 disabled).
      const remainingCap = maxLogsPerWindow > 0 ? maxLogsPerWindow - totalLogs : 0;
      const subResult = await this.runMainExtractionLoop({
        type,
        engineState: currentEngineState,
        opts,
        indexPatterns,
        latestIndex,
        fromDateISO: currentFromDateISO,
        toDateISO,
        docsLimit,
        maxLogsPerPage,
        maxLogsPerWindow: remainingCap,
        entityDefinition,
      });

      totalCount += subResult.count;
      totalPages += subResult.pages;
      totalLogs += subResult.logsProcessed;
      lastSubWindowEnd = subResult.lastSearchTimestamp;

      if (subResult.logsCapApplied) {
        this.logger.warn(
          `Entity extraction volume cap reached for entity type "${type}": processed ${totalLogs} logs (limit: ${maxLogsPerWindow}). Cap behavior: "${maxLogsPerWindowCapBehavior}".`
        );
        entityStoreMetrics.extractionLogsCapApplied.add(1, {
          entity_type: type,
          namespace: this.namespace,
          behavior: maxLogsPerWindowCapBehavior,
          remote: false,
        });
        if (maxLogsPerWindowCapBehavior === 'drop') {
          this.logger.warn(
            `Dropping remaining logs in window. Advancing cursor to end of window: ${effectiveWindowEnd}.`
          );
          lastSubWindowEnd = effectiveWindowEnd;
        } else {
          this.logger.warn(
            `Deferring remaining logs in window. Task will resume from last processed position on next run.`
          );
        }
        entityStoreMetrics.extractionLogsProcessed.record(totalLogs, {
          entity_type: type,
          namespace: this.namespace,
          remote: false,
        });
        return {
          count: totalCount,
          pages: totalPages,
          indexPatterns,
          lastSearchTimestamp: lastSubWindowEnd,
          logsCapDeferred: maxLogsPerWindowCapBehavior === 'defer',
          logsCapApplied: true,
          logsProcessed: totalLogs,
        };
      }

      // if the window was capped we consider we have a next page
      hasNextPage = isCapped;
      currentFromDateISO = toDateISO;
      currentEngineState = FRESH_ENGINE_LOG_EXTRACTION_STATE;
    }

    entityStoreMetrics.extractionLogsProcessed.record(totalLogs, {
      entity_type: type,
      namespace: this.namespace,
      remote: false,
    });
    return {
      count: totalCount,
      pages: totalPages,
      indexPatterns,
      lastSearchTimestamp: lastSubWindowEnd,
      logsCapDeferred: false,
      logsCapApplied: false,
      logsProcessed: totalLogs,
    };
  }

  /**
   * Main LOOKUP extraction: outer loop over capped raw-log slices, inner loop over entity pages per slice.
   */
  private async runMainExtractionLoop({
    type,
    engineState: initialEngineState,
    opts,
    indexPatterns,
    latestIndex,
    fromDateISO,
    toDateISO,
    docsLimit,
    maxLogsPerPage,
    maxLogsPerWindow,
    entityDefinition,
  }: {
    type: EntityType;
    engineState: EngineLogExtractionState;
    opts?: LogsExtractionOptions;
    indexPatterns: string[];
    latestIndex: string;
    fromDateISO: string;
    toDateISO: string;
    docsLimit: number;
    maxLogsPerPage: number;
    maxLogsPerWindow: number;
    entityDefinition: ManagedEntityDefinition;
  }) {
    const effectiveMaxLogsPerPage = capAtMaxLogsPerWindow(maxLogsPerPage, maxLogsPerWindow);
    const effectiveDocsLimit = capAtMaxLogsPerWindow(docsLimit, maxLogsPerWindow);
    let totalCount = 0;
    let totalLogs = 0;
    let pages = 0;
    let logsCapApplied = false;
    let logsCapTimestamp: string | undefined;
    let state: EngineLogExtractionState = { ...initialEngineState };

    const onAbort = () => {
      this.logger.debug('Aborting execution mid logs extraction');
      entityStoreMetrics.extractionTaskAborted.add(1, {
        entity_type: type,
        namespace: this.namespace,
        remote: false,
      });
    };
    opts?.abortController?.signal.addEventListener('abort', onAbort);

    /** One-shot `paginationId` from a prior run: consumed by the first bounded extraction batch for entity-level pagination. */
    let recoveryId = initialEngineState.paginationId ?? undefined;
    if (recoveryId) {
      this.logger.warn(
        `Resuming with paginationId ${recoveryId} and extraction window from ${fromDateISO} (checkpoint at ${
          state.checkpointTimestamp ?? 'n/a'
        }).`
      );
    }

    try {
      let lastLogsPages = false;
      /** First outer iteration of this `extractLogs` run: run the boundary probe from the time window only, not the persisted log-slice start. */
      let isFirstRunInThisCycle = true;
      do {
        const entityPagination: PaginationParams | undefined =
          state.checkpointTimestamp && state.paginationId
            ? { timestampCursor: state.checkpointTimestamp, idCursor: state.paginationId }
            : undefined;
        // always find a new cursor via probe on first run
        const logsPageCursorStart = isFirstRunInThisCycle
          ? undefined
          : paginationFromOptionalFields(state.checkpointTimestamp);

        const probe = await this.runLogPaginationCursorProbeForNextPage({
          indexPatterns,
          type,
          fromDateISO,
          toDateISO,
          logsPageCursorStart,
          maxLogsPerPage: effectiveMaxLogsPerPage,
          opts,
        });

        if (!probe.hasLogsToProcess) {
          break;
        }

        let logsPageCursorEnd = probe.logsPaginationCursor;
        lastLogsPages = probe.isLastLogsPage;

        const bumpedCursorEnd = this.detectLogSliceStall(
          logsPageCursorStart,
          logsPageCursorEnd,
          probe.sliceLogCount,
          effectiveMaxLogsPerPage
        );
        if (bumpedCursorEnd) {
          logsPageCursorEnd = bumpedCursorEnd;
          entityStoreMetrics.extractionLogsPerPageDropped.add(1, {
            entity_type: type,
            namespace: this.namespace,
            remote: false,
          });
        } else {
          totalLogs += probe.sliceLogCount;

          const sliceIngestOutcome = await this.ingestEntityPagesWithinCurrentLogPage({
            type,
            opts,
            indexPatterns,
            latestIndex,
            entityDefinition,
            docsLimit: effectiveDocsLimit,
            fromDateISO,
            toDateISO,
            logsPageCursorStart,
            logsPageCursorEnd,
            entityPagination,
            recoveryId,
            state,
          });

          totalCount += sliceIngestOutcome.addedToTotalCount;
          pages += sliceIngestOutcome.addedToPageCount;
          state = sliceIngestOutcome.state;

          recoveryId = undefined;
        }

        state = this.advanceEngineStateAfterLogPageCompletes(state, logsPageCursorEnd);
        await this.persistMainLogExtractionStateIfNotManualWindow(type, opts, state);
        isFirstRunInThisCycle = false;

        const windowLogCapEnabled = maxLogsPerWindow > 0;
        const windowOverloaded = totalLogs >= maxLogsPerWindow;
        if (!bumpedCursorEnd && windowLogCapEnabled && windowOverloaded) {
          logsCapApplied = true;
          logsCapTimestamp = logsPageCursorEnd.timestampCursor;
          break;
        }
      } while (!lastLogsPages);
    } finally {
      opts?.abortController?.signal.removeEventListener('abort', onAbort);
    }

    return {
      count: totalCount,
      pages,
      indexPatterns,
      logsProcessed: totalLogs,
      // When cap fires the caller (runMainPath) applies maxLogsPerWindowCapBehavior to determine the final
      // lastSearchTimestamp; here we report where the loop actually stopped.
      lastSearchTimestamp: logsCapTimestamp ?? toDateISO,
      logsCapApplied,
    };
  }

  /**
   * Locates the inclusive upper bound of the next raw-log page (probe ESQL). Runs every outer log-slice iteration.
   */
  private async runLogPaginationCursorProbeForNextPage({
    indexPatterns,
    type,
    fromDateISO,
    toDateISO,
    logsPageCursorStart,
    maxLogsPerPage,
    opts,
  }: {
    indexPatterns: string[];
    type: EntityType;
    fromDateISO: string;
    toDateISO: string;
    logsPageCursorStart: LogSlicePaginationParams | undefined;
    maxLogsPerPage: number;
    opts?: LogsExtractionOptions;
  }): Promise<LogPaginationCursor> {
    const logPaginationCursorProbeQuery = buildLogPaginationCursorProbeEsql({
      indexPatterns,
      type,
      fromDateISO,
      toDateISO,
      logsPageCursorStart,
      maxLogsPerPage,
    });

    const probeStart = Date.now();
    const logPaginationCursorProbeResponse = await executeEsqlQuery({
      esClient: this.esClient,
      query: logPaginationCursorProbeQuery,
      abortController: opts?.abortController,
    });
    entityStoreMetrics.extractionProbeQueryDurationMs.record(Date.now() - probeStart, {
      entity_type: type,
      namespace: this.namespace,
      remote: false,
    });

    const parsedLogPaginationCursor = parseLogPaginationCursorRow(logPaginationCursorProbeResponse);

    const interpretedLogPaginationCursor = interpretLogPaginationCursorRows(
      parsedLogPaginationCursor,
      maxLogsPerPage
    );

    if (parsedLogPaginationCursor) {
      this.logger.debug(
        `Log pagination cursor probe: ${parsedLogPaginationCursor.sliceDocCount} docs in slice, next page ends at ${parsedLogPaginationCursor.logsPaginationCursor.timestampCursor}`
      );
    }

    if (!interpretedLogPaginationCursor.hasLogsToProcess) {
      return { hasLogsToProcess: false };
    }

    return {
      hasLogsToProcess: true,
      logsPaginationCursor: interpretedLogPaginationCursor.logsPaginationCursor,
      isLastLogsPage: interpretedLogPaginationCursor.isLastLogsPage,
      sliceLogCount: interpretedLogPaginationCursor.sliceLogCount,
    };
  }

  /**
   * Bounded extraction ESQL + ingest for each entity page within one raw-log slice.
   */
  private async ingestEntityPagesWithinCurrentLogPage({
    type,
    opts,
    indexPatterns,
    latestIndex,
    entityDefinition,
    docsLimit,
    fromDateISO,
    toDateISO,
    logsPageCursorStart,
    logsPageCursorEnd,
    entityPagination,
    recoveryId,
    state: initialSliceState,
  }: {
    type: EntityType;
    opts?: LogsExtractionOptions;
    indexPatterns: string[];
    latestIndex: string;
    entityDefinition: ManagedEntityDefinition;
    docsLimit: number;
    fromDateISO: string;
    toDateISO: string;
    logsPageCursorStart: LogSlicePaginationParams | undefined;
    logsPageCursorEnd: LogSlicePaginationParams;
    entityPagination: PaginationParams | undefined;
    recoveryId: string | undefined;
    state: EngineLogExtractionState;
  }): Promise<{
    addedToTotalCount: number;
    addedToPageCount: number;
    state: EngineLogExtractionState;
  }> {
    let state = initialSliceState;
    let addedToTotalCount = 0;
    let addedToPageCount = 0;

    let pagination = entityPagination;
    let recoveryIdForBounded = recoveryId;

    do {
      const query = buildLogsExtractionEsqlQuery({
        indexPatterns,
        latestIndex,
        entityDefinition,
        docsLimit,
        fromDateISO,
        toDateISO,
        pagination,
        recoveryId: recoveryIdForBounded,
        logsPageCursorStart,
        logsPageCursorEnd,
      });

      recoveryIdForBounded = undefined;

      this.logger.debug(
        `Running query to extract logs from ${fromDateISO} to ${toDateISO} ${
          pagination
            ? `with pagination: ${pagination.timestampCursor} | ${pagination.idCursor}`
            : ''
        }`
      );

      const queryStart = Date.now();
      const esqlResponse = await executeEsqlQuery({
        esClient: this.esClient,
        query,
        abortController: opts?.abortController,
      });
      entityStoreMetrics.extractionQueryDurationMs.record(Date.now() - queryStart, {
        entity_type: type,
        namespace: this.namespace,
        remote: false,
      });

      addedToTotalCount += esqlResponse.values.length;
      pagination = extractMainPaginationParams(esqlResponse, docsLimit);
      if (esqlResponse.values.length > 0) {
        addedToPageCount++;
      }

      this.logger.debug(`Found ${esqlResponse.values.length}, ingesting them`);
      const ingestStart = Date.now();
      await ingestEntities({
        esClient: this.esClient,
        esqlResponse,
        esIdField: HASHED_ID_FIELD,
        fieldsToIgnore: [ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD],
        targetIndex: latestIndex,
        logger: this.logger,
        abortController: opts?.abortController,
        refresh: true,
        onDropped: () =>
          entityStoreMetrics.extractionBulkDropped.add(1, {
            entity_type: type,
            namespace: this.namespace,
            remote: false,
          }),
      });
      entityStoreMetrics.extractionIngestDurationMs.record(Date.now() - ingestStart, {
        entity_type: type,
        namespace: this.namespace,
        remote: false,
      });
      entityStoreMetrics.extractionEntitiesUpserted.add(esqlResponse.values.length, {
        entity_type: type,
        namespace: this.namespace,
        remote: false,
      });

      if (pagination) {
        state = {
          ...state,
          checkpointTimestamp: pagination.timestampCursor,
          paginationId: pagination.idCursor,
        };
        await this.persistMainLogExtractionStateIfNotManualWindow(type, opts, state);
      }
    } while (pagination);

    return { addedToTotalCount, addedToPageCount, state };
  }

  /**
   * After all entity pages for a slice: drop entity + slice-end fields and advance the log-slice cursor to the slice end.
   */
  private advanceEngineStateAfterLogPageCompletes(
    state: EngineLogExtractionState,
    logsPageCursorEnd: LogSlicePaginationParams
  ): EngineLogExtractionState {
    return {
      ...state,
      checkpointTimestamp: logsPageCursorEnd.timestampCursor,
      paginationId: null,
    };
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
        `Log-slice probe stalled at ${sliceEnd.timestampCursor} with a full page (${sliceLogCount} docs); advancing cursor by 1ms. Docs sharing this timestamp beyond maxLogsPerPage will be dropped.`
      );
      return { timestampCursor: bumpedTs };
    }
    return null;
  }

  private async persistMainLogExtractionStateIfNotManualWindow(
    type: EntityType,
    opts: LogsExtractionOptions | undefined,
    logExtractionState: Partial<EngineLogExtractionState>
  ): Promise<void> {
    if (opts?.specificWindow) {
      return;
    }
    await this.engineDescriptorClient.update(type, {
      logExtractionState: logExtractionState as EngineLogExtractionState,
    });
  }

  private async handleError(
    error: any,
    type: EntityType,
    isRemote: boolean
  ): Promise<ExtractedLogsSummary> {
    if (
      SavedObjectsErrorHelpers.isNotFoundError(error) ||
      error instanceof EntityStoreNotRunningError
    ) {
      return {
        success: false,
        isRemote,
        error: new Error(`Entity store is not started for type ${type}`),
      };
    }

    await this.engineDescriptorClient.update(type, {
      error: { message: error.message, action: 'extractLogs' },
    });
    return { success: false, isRemote, error };
  }

  /**
   * Returns local index patterns and remote patterns separately.
   * Cluster-prefixed patterns (`cluster1:logs-*`) go to remote (CCS strategy).
   * Unqualified patterns stay local; CPS strategy reuses local patterns for linked projects.
   * Main extraction uses local patterns only (LOOKUP JOIN does not support remote).
   */
  public async getLocalAndRemoteIndexPatterns(
    additionalIndexPatterns: string[] = [],
    excludedIndexPatterns: string[] = []
  ): Promise<{ localIndexPatterns: string[]; remoteIndexPatterns: string[] }> {
    const all = await this.getAllIndexPatternsIncludingRemote(additionalIndexPatterns);
    const alertsIndex = getAlertsIndexName(this.namespace);
    const withoutAlerts = all.filter((index) => index !== alertsIndex);

    const localIndexPatterns: string[] = [];
    const remoteIndexPatterns: string[] = [];

    withoutAlerts.forEach((index) => {
      if (isNonLocalIndexName(index)) {
        remoteIndexPatterns.push(index);
      } else {
        localIndexPatterns.push(index);
      }
    });

    // Pre-flight: find data streams with closed backing indices and build adjustments.
    // Open backing indices must be added as positives BEFORE any negations.
    const { openBackingIndices, negations: closedNegations } = await resolveClosedIndexAdjustments(
      this.esClient,
      localIndexPatterns,
      this.logger
    );
    localIndexPatterns.push(...openBackingIndices);

    // Append after includes: ES negation only subtracts from earlier entries in the same expression.
    // e.g. `logs-*,-logs-proxy-*` excludes proxy logs, but `-logs-proxy-*,logs-*` does not.
    excludedIndexPatterns.forEach((pattern) => {
      if (isNonLocalIndexName(pattern)) {
        remoteIndexPatterns.push(`-${pattern}`);
      } else {
        localIndexPatterns.push(`-${pattern}`);
      }
    });

    // Closed-index negations go last — after all positive includes and user exclusions.
    localIndexPatterns.push(...closedNegations);

    return { localIndexPatterns, remoteIndexPatterns };
  }

  public async getLocalIndexPatterns(
    additionalIndexPatterns: string[] = [],
    excludedIndexPatterns: string[] = []
  ): Promise<string[]> {
    const { localIndexPatterns } = await this.getLocalAndRemoteIndexPatterns(
      additionalIndexPatterns,
      excludedIndexPatterns
    );
    return localIndexPatterns;
  }

  /**
   * Builds the full list of index patterns (updates, additional, security data view),
   * including cluster-prefixed patterns from the data view, without alerts or
   * local/remote splitting applied.
   */
  private async getAllIndexPatternsIncludingRemote(
    additionalIndexPatterns: string[] = []
  ): Promise<string[]> {
    const updatesDataStream = getUpdatesEntitiesDataStreamName(this.namespace);
    const indexPatterns: string[] = [updatesDataStream, ...additionalIndexPatterns];

    try {
      const secSolDataView = await this.dataViewsService.get(
        getSecuritySolutionDataViewName(this.namespace)
      );
      const secSolIndices = secSolDataView.getIndexPattern().split(',');
      indexPatterns.push(...secSolIndices);
    } catch (error) {
      // Not found is a acceptable state in tests and fresh environments
      if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
        this.logger.warn('Security solution data view not found, defaulting to logs-*');
      } else {
        this.logger.warn(
          'Problems finding security solution data view indices, defaulting to logs-*'
        );
        this.logger.warn(error);
      }

      indexPatterns.push('logs-*');
    }

    return indexPatterns;
  }
}

function paginationFromOptionalFields(ts: string | null): LogSlicePaginationParams | undefined {
  if (ts) {
    return { timestampCursor: ts };
  }
  return undefined;
}
