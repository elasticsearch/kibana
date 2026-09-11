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
  ExtractionMode,
} from '../../../common/domain/definitions/entity_schema';
import { getEntityDefinition } from '../../../common/domain/definitions/registry';
import { type LogSlicePaginationParams, type PaginationParams } from './query_builder_commons';
import {
  buildLogPaginationCursorProbeEsql,
  interpretLogPaginationCursorRows,
  type LogPaginationCursor,
  parseLogPaginationCursorRow,
} from './log_pagination_probe_query_builder';
import {
  buildLogsExtractionEsqlQuery,
  extractMainPaginationParams,
  HASHED_ID_FIELD,
} from './logs_extraction_query_builder';
import {
  applyMaxLagCutoff,
  capExtractionWindowEnd,
  resolveMainExtractionWindow,
  validateExtractionWindow,
} from './extraction_window';
import { capAtMaxLogsPerWindow, pickSampleProbability } from './effective_page_limits';
import { getMergedConfig } from '../config';
import { resolveLatestEntitiesIndexName } from '../asset_manager/resolve_entity_store_indices';
import { executeEsqlQuery } from '../../infra/elasticsearch/esql';
import { executeEsqlQueryRetryingRemoteResources } from '../../infra/elasticsearch/remote_resource_not_supported';
import { ingestEntities } from '../../infra/elasticsearch/ingest';
import { resolveClosedIndexAdjustments } from '../../infra/elasticsearch/resolve_closed_indices';
import {
  isPositiveInternalEsqlViewIndexPattern,
  withInternalEsqlViewExclusions,
} from './internal_esql_view_patterns';
import {
  getAlertsIndexName,
  getSecuritySolutionDataViewName,
} from '../asset_manager/external_indices_contants';
import { type LogExtractionConfig } from '../saved_objects';
import {
  type EngineDescriptor,
  type EngineDescriptorClient,
  type EngineLogExtractionState,
  type EntityStoreGlobalStateClient,
} from '../saved_objects';
import { ENGINE_STATUS } from '../constants';
import { EntityStoreNotRunningError } from '../errors';
import type { LogExtractionInstallParams } from '../../routes/constants';

/** Engine state with all cursor fields cleared. Used between sub-window iterations so a fresh
 * sub-window does not re-trigger recovery from cursors persisted by an earlier sub-window. */
const FRESH_ENGINE_LOG_EXTRACTION_STATE: EngineLogExtractionState = {
  checkpointTimestamp: null,
  paginationId: null,
  lastExecutionTimestamp: null,
  sliceEndTimestamp: null,
};

interface LogsExtractionOptions {
  specificWindow?: {
    fromDateISO: string;
    toDateISO: string;
  };
  signal?: AbortSignal;
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
  extractionMode?: ExtractionMode;
}

export class LogsExtractionClient {
  logger: Logger;
  namespace: string;
  esClient: ElasticsearchClient;
  dataViewsService: DataViewsService;
  engineDescriptorClient: EngineDescriptorClient;
  globalStateClient: EntityStoreGlobalStateClient;
  extractionMode: ExtractionMode;
  constructor({
    logger,
    namespace,
    esClient,
    dataViewsService,
    engineDescriptorClient,
    globalStateClient,
    extractionMode,
  }: LogsExtractionClientDependencies) {
    this.logger = logger;
    this.namespace = namespace;
    this.esClient = esClient;
    this.dataViewsService = dataViewsService;
    this.engineDescriptorClient = engineDescriptorClient;
    this.globalStateClient = globalStateClient;
    this.extractionMode = extractionMode ?? 'single';
  }

  /** Returns the SO update patch for this extraction mode. Each mode writes to its own cursor field
   * so the two processes do not overwrite each other's position. */
  private cursorPatch(state: EngineLogExtractionState): Partial<EngineDescriptor> {
    return this.extractionMode === 'nonPriority'
      ? { nonPriorityLogExtractionState: state }
      : { logExtractionState: state };
  }

  private async getLogExtractionConfigAndState(
    type: EntityType
  ): Promise<{ config: LogExtractionConfig; engineState: EngineLogExtractionState }> {
    const engineDescriptor = await this.engineDescriptorClient.findOrThrow(type);
    if (engineDescriptor.status !== ENGINE_STATUS.STARTED) {
      throw new EntityStoreNotRunningError();
    }
    const globalOverrides = await this.globalStateClient.findLogExtractionOverrides();
    const engineState =
      this.extractionMode === 'nonPriority'
        ? (engineDescriptor.nonPriorityLogExtractionState ?? FRESH_ENGINE_LOG_EXTRACTION_STATE)
        : engineDescriptor.logExtractionState;
    return {
      config: getMergedConfig(type, globalOverrides, engineDescriptor.logExtractionConfig),
      engineState,
    };
  }

  /** Config in effect for one entity type, without requiring the engine to be started. */
  public async getMergedConfigForType(type: EntityType): Promise<LogExtractionConfig> {
    const [globalOverrides, engineDescriptor] = await Promise.all([
      this.globalStateClient.findLogExtractionOverrides(),
      this.engineDescriptorClient.findOrThrow(type),
    ]);
    return getMergedConfig(type, globalOverrides, engineDescriptor.logExtractionConfig);
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
        await this.engineDescriptorClient.update(type, { error: null });
      } else {
        await this.engineDescriptorClient.update(type, {
          ...this.cursorPatch({
            checkpointTimestamp: null,
            paginationId: null,
            lastExecutionTimestamp: lastSearchTimestamp || moment().utc().toISOString(),
            sliceEndTimestamp: null,
          }),
          error: null,
        });
      }

      return operationResult;
    } catch (error) {
      return await this.handleError(error, type, isRemote);
    }
  }

  public async updateConfig(params?: LogExtractionInstallParams): Promise<LogExtractionConfig> {
    const state = await this.globalStateClient.update({ logsExtraction: params });
    return state.logsExtraction;
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
    logsCapDeferred: boolean;
    logsCapApplied: boolean;
    logsProcessed: number;
  }> {
    const { localIndexPatterns, remoteIndexPatterns } = await this.getLocalAndRemoteIndexPatterns(
      config.additionalIndexPatterns,
      config.excludedIndexPatterns
    );

    // ES|QL cannot query remote views (CPS/CCS). Exclude `$.*` on origin and on
    // every remote cluster alias (`*:-$.*`) without naming linked projects.
    const allIndexPatterns = withInternalEsqlViewExclusions([
      ...localIndexPatterns,
      ...remoteIndexPatterns,
    ]);

    const mainResult = await this.runMainPath({
      type,
      config,
      engineState,
      opts,
      entityDefinition,
      latestIndex: await resolveLatestEntitiesIndexName(this.esClient, this.namespace),
      indexPatterns: allIndexPatterns,
    });

    return {
      ...mainResult,
      isRemote: remoteIndexPatterns.length > 0,
      indexPatterns: allIndexPatterns,
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
      if (opts?.signal?.aborted) {
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
    // Escalates above the target probability (up to an exact, unsampled probe) once
    // maxLogsPerPage is too small for the sampling estimator to be accurate — see
    // pickSampleProbability. Computed once per loop invocation: effectiveMaxLogsPerPage is
    // fixed for the whole loop.
    const effectiveSampleProbability = pickSampleProbability(effectiveMaxLogsPerPage);
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
    opts?.signal?.addEventListener('abort', onAbort);

    // Mid-slice resume cursors from a prior interrupted run; consumed by the first outer
    // iteration only, which re-enters the interrupted slice with its exact persisted bounds.
    const { resumeEntityPagination, resumeSliceEnd } = this.resolveMidSliceResume(
      initialEngineState,
      fromDateISO
    );

    try {
      let lastLogsPages = false;
      /** First outer iteration of this `extractLogs` run: run the boundary probe from the time window only, not the persisted log-slice start. */
      let isFirstRunInThisCycle = true;
      do {
        // always find a new cursor via probe on first run
        const logsPageCursorStart = isFirstRunInThisCycle
          ? undefined
          : paginationFromOptionalFields(state.checkpointTimestamp);

        let logsPageCursorEnd: LogSlicePaginationParams;
        let entityPagination: PaginationParams | undefined;
        let bumpedCursorEnd: LogSlicePaginationParams | null = null;
        let sliceLogCount = 0;

        if (isFirstRunInThisCycle && resumeSliceEnd) {
          // Re-enter the interrupted slice with its exact persisted bounds, skipping the probe:
          // the sampled probe is not deterministic, so a re-drawn boundary would strand logs of
          // already-paged entities between the old and new slice end. The slice's log volume was
          // counted by the interrupted run, so it does not count against this run's cap.
          // Note: maxLogsPerWindow caps volume per task execution, not per time window - a
          // resumed execution starts with a fresh budget, so a time window that was interrupted
          // mid-run can consume more than one budget in total.
          logsPageCursorEnd = resumeSliceEnd;
          entityPagination = resumeEntityPagination;
          lastLogsPages = false;
        } else {
          const probe = await this.runLogPaginationCursorProbeForNextPage({
            indexPatterns,
            type,
            fromDateISO,
            toDateISO,
            logsPageCursorStart,
            maxLogsPerPage: effectiveMaxLogsPerPage,
            sampleProbability: effectiveSampleProbability,
            opts,
          });

          if (!probe.hasLogsToProcess && effectiveSampleProbability >= 1) {
            // Sampling wasn't active for this probe (maxLogsPerPage was too small — see
            // pickSampleProbability), so an empty, exact result is definitive: no real docs
            // remain. Stop immediately rather than running a redundant sweep extraction.
            break;
          }

          lastLogsPages = probe.isLastLogsPage;

          if (probe.hasLogsToProcess && !probe.isLastLogsPage) {
            logsPageCursorEnd = probe.logsPaginationCursor;
          } else {
            // if the probe doesn't have more pages to process
            // we keep the natural end of the window as the end cursor
            // This is important because on low document count
            // a sampled probe may return 0 documents. We need to still
            // do a final extraction with the effective end of the window
            // to ensure we don't miss any documents that may have been missed by the probe.
            logsPageCursorEnd = { timestampCursor: toDateISO };
          }

          bumpedCursorEnd = this.detectLogSliceStall(
            logsPageCursorStart,
            logsPageCursorEnd,
            !lastLogsPages,
            effectiveMaxLogsPerPage
          );
          // Only read on the non-bumped path below: a stalled (bumped) slice is dropped, so it
          // never counts against the volume cap.
          sliceLogCount = probe.sliceLogCount;
        }

        if (bumpedCursorEnd) {
          logsPageCursorEnd = bumpedCursorEnd;
          entityStoreMetrics.extractionLogsPerPageDropped.add(1, {
            entity_type: type,
            namespace: this.namespace,
            remote: false,
          });
        } else {
          totalLogs += sliceLogCount;

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
            state,
          });

          totalCount += sliceIngestOutcome.addedToTotalCount;
          pages += sliceIngestOutcome.addedToPageCount;
          state = sliceIngestOutcome.state;
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
      opts?.signal?.removeEventListener('abort', onAbort);
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
    sampleProbability,
    opts,
  }: {
    indexPatterns: string[];
    type: EntityType;
    fromDateISO: string;
    toDateISO: string;
    logsPageCursorStart: LogSlicePaginationParams | undefined;
    maxLogsPerPage: number;
    sampleProbability: number;
    opts?: LogsExtractionOptions;
  }): Promise<LogPaginationCursor> {
    const probeStart = Date.now();
    const logPaginationCursorProbeResponse = await executeEsqlQueryRetryingRemoteResources({
      indexPatterns,
      logger: this.logger,
      execute: (patterns) =>
        executeEsqlQuery({
          esClient: this.esClient,
          query: buildLogPaginationCursorProbeEsql({
            indexPatterns: patterns,
            type,
            fromDateISO,
            toDateISO,
            logsPageCursorStart,
            maxLogsPerPage,
            sampleProbability,
          }),
          signal: opts?.signal,
          telemetry: {
            name: 'probe_query',
            namespace: this.namespace,
            type,
          },
        }),
    });
    entityStoreMetrics.extractionProbeQueryDurationMs.record(Date.now() - probeStart, {
      entity_type: type,
      namespace: this.namespace,
      remote: false,
    });

    const parsedLogPaginationCursor = parseLogPaginationCursorRow(logPaginationCursorProbeResponse);

    const interpretedLogPaginationCursor = interpretLogPaginationCursorRows(
      parsedLogPaginationCursor,
      maxLogsPerPage,
      sampleProbability
    );

    if (parsedLogPaginationCursor) {
      this.logger.debug(
        `Log pagination cursor probe: ${parsedLogPaginationCursor.sliceDocCount} docs in slice, next page ends at ${parsedLogPaginationCursor.logsPaginationCursor.timestampCursor}`
      );
    }

    return interpretedLogPaginationCursor;
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

    do {
      const query = buildLogsExtractionEsqlQuery({
        indexPatterns,
        latestIndex,
        entityDefinition,
        docsLimit,
        fromDateISO,
        toDateISO,
        pagination,
        logsPageCursorStart,
        logsPageCursorEnd,
        extractionMode: this.extractionMode,
      });

      this.logger.debug(
        `Running query to extract logs from ${fromDateISO} to ${toDateISO} ${
          pagination ? `with entity page cursor: ${pagination.idCursor}` : ''
        }`
      );

      const queryStart = Date.now();
      const esqlResponse = await executeEsqlQuery({
        esClient: this.esClient,
        query,
        signal: opts?.signal,
        telemetry: {
          name: 'extraction_query',
          namespace: this.namespace,
          type,
        },
      });
      entityStoreMetrics.extractionQueryDurationMs.record(Date.now() - queryStart, {
        entity_type: type,
        namespace: this.namespace,
        remote: false,
      });

      if (
        esqlResponse._clusters &&
        esqlResponse._clusters.successful !== esqlResponse._clusters.total
      ) {
        const { partial, skipped, successful, total, failed } = esqlResponse._clusters;
        this.logger.warn(
          `Cluster-level partial success during extraction for ${type} in ${this.namespace}: partial=${partial}, failed=${failed}, skipped=${skipped}, successful=${successful}, total=${total}`
        );
      }

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
        targetIndex: latestIndex,
        logger: this.logger,
        signal: opts?.signal,
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
        // Pin both slice bounds alongside the entity cursor: the id cursor is only meaningful
        // together with the exact bounds it was created under. The start is pinned explicitly
        // because on the first slice of a first-ever cycle the persisted checkpoint is null and
        // the fallback window start (now - lookbackPeriod) moves between runs; for later slices
        // this equals the checkpoint already, so it is a no-op.
        state = {
          ...state,
          checkpointTimestamp: logsPageCursorStart?.timestampCursor ?? fromDateISO,
          paginationId: pagination.idCursor,
          sliceEndTimestamp: logsPageCursorEnd.timestampCursor,
        };
        await this.persistMainLogExtractionStateIfNotManualWindow(type, opts, state);
      }
    } while (pagination);

    return { addedToTotalCount, addedToPageCount, state };
  }

  /**
   * After all entity pages for a slice: clear the entity cursor and pinned slice end, and
   * advance the log-slice cursor to the slice end.
   */
  private advanceEngineStateAfterLogPageCompletes(
    state: EngineLogExtractionState,
    logsPageCursorEnd: LogSlicePaginationParams
  ): EngineLogExtractionState {
    return {
      ...state,
      checkpointTimestamp: logsPageCursorEnd.timestampCursor,
      paginationId: null,
      sliceEndTimestamp: null,
    };
  }

  /**
   * Resolves mid-slice resume cursors from persisted state. Both cursors are returned only when
   * the pinned slice end is present: the sampled boundary probe is not deterministic, so resuming
   * an id cursor against a re-drawn slice end would strand the logs of already-paged entities
   * that fall between the old and new boundary.
   */
  private resolveMidSliceResume(
    initialEngineState: EngineLogExtractionState,
    fromDateISO: string
  ): {
    resumeEntityPagination?: PaginationParams;
    resumeSliceEnd?: LogSlicePaginationParams;
  } {
    const { paginationId, sliceEndTimestamp } = initialEngineState;
    if (!paginationId) {
      return {};
    }
    if (!sliceEndTimestamp) {
      // An id cursor is only meaningful together with the exact slice bounds it was created
      // under. Without a pinned slice end those bounds cannot be reproduced (the probe is
      // sampled), so discard the cursor and re-process the slice from the checkpoint; upserts
      // are idempotent, so re-processing is safe.
      this.logger.warn(
        `Found a mid-slice entity cursor (${paginationId}) without a pinned slice end. Discarding the cursor and re-processing the slice from ${fromDateISO}.`
      );
      return {};
    }
    this.logger.warn(
      `Resuming mid-slice with entity cursor ${paginationId} and pinned slice end ${sliceEndTimestamp} (window from ${fromDateISO}).`
    );
    return {
      resumeEntityPagination: { idCursor: paginationId },
      resumeSliceEnd: { timestampCursor: sliceEndTimestamp },
    };
  }

  /**
   * Returns the bumped slice-end cursor when a stall is detected, null otherwise. Logs a
   * warning on stall. `isFullPage` is `true` when the (possibly sampled) probe saturated its
   * limit — i.e. this iteration was not resolved as the last page.
   */
  private detectLogSliceStall(
    sliceStart: LogSlicePaginationParams | undefined,
    sliceEnd: LogSlicePaginationParams,
    isFullPage: boolean,
    effectiveMaxLogsPerPage: number
  ): LogSlicePaginationParams | null {
    if (sliceStart && sliceStart.timestampCursor === sliceEnd.timestampCursor && isFullPage) {
      const bumpedTs = moment(sliceEnd.timestampCursor).add(1, 'ms').toISOString();
      this.logger.warn(
        `Log-slice probe stalled at ${sliceEnd.timestampCursor} with a saturated page; advancing cursor by 1ms. Docs sharing this timestamp beyond the configured per-page limit (${effectiveMaxLogsPerPage}) will be dropped.`
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
    await this.engineDescriptorClient.update(type, this.cursorPatch(logExtractionState as EngineLogExtractionState));
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
   * Returns local and remote index patterns. Both are passed to the main extraction path;
   * coordinator-mode LOOKUP JOIN handles cross-cluster resolution for remote patterns.
   * Cluster-prefixed patterns (`cluster1:logs-*`) are remote (CCS); unqualified patterns are
   * local (CPS reuses local patterns for linked projects via the coordinator).
   */
  public async getLocalAndRemoteIndexPatterns(
    additionalIndexPatterns: string[] = [],
    excludedIndexPatterns: string[] = []
  ): Promise<{ localIndexPatterns: string[]; remoteIndexPatterns: string[] }> {
    const all = await this.getAllIndexPatternsIncludingRemote(additionalIndexPatterns);
    const alertsIndex = getAlertsIndexName(this.namespace);
    const withoutAlertsOrEsqlViews = all
      .filter((index) => index !== alertsIndex)
      .filter((index) => !isPositiveInternalEsqlViewIndexPattern(index));

    const localIndexPatterns: string[] = [];
    const remoteIndexPatterns: string[] = [];

    withoutAlertsOrEsqlViews.forEach((index) => {
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
   * Builds the full list of index patterns (additional, security data view),
   * including cluster-prefixed patterns from the data view, without alerts or
   * local/remote splitting applied.
   */
  private async getAllIndexPatternsIncludingRemote(
    additionalIndexPatterns: string[] = []
  ): Promise<string[]> {
    const indexPatterns: string[] = [...additionalIndexPatterns];

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
