/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  ElasticsearchClient,
  KibanaRequest,
  Logger,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import { CasesAnalyticsV2DataViewService } from './data_view/service';
import { ensureCaseIndex } from './ensure_indices/case';
import { ensureActivityIndex } from './ensure_indices/activity';
import { registerReconciliationTask, scheduleReconciliationTask } from './reconciliation';
import { registerResetTask } from './reconciliation/reset_task';
import { registerCasesAnalyticsV2Routes } from './routes';
import {
  CasesAnalyticsV2Writer,
  V2_NOOP_WRITER,
  type CasesAnalyticsV2WriterContract,
} from './writer';
import {
  CasesActivityV2Writer,
  V2_NOOP_ACTIVITY_WRITER,
  type CasesActivityV2WriterContract,
} from './writer/activity';

interface CasesAnalyticsV2ServiceDeps {
  logger: Logger;
  /** Resolved value of `xpack.cases.analyticsV2.enabled`. When false, every method is a no-op. */
  enabled: boolean;
  /**
   * Resolved value of `xpack.cases.analyticsV2.reconciliationIntervalMinutes`.
   * Drives Task Manager's schedule for the durability-backstop walk.
   * The config schema enforces `min: 5`; the default is 30.
   */
  reconciliationIntervalMinutes: number;
  /**
   * Resolved value of `xpack.cases.analyticsV2.enableAdminRoutes`. Gates
   * the mutating administrator routes (`/reset` and
   * `/reconcile/run_soon`) at registration time — when false, those
   * routes are not registered at all (HTTP 404 instead of 403, so health
   * probes can't fingerprint the subsystem). `/state` is always
   * registered when the v2 feature flag itself is on.
   */
  enableAdminRoutes: boolean;
  /**
   * Resolved value of `xpack.cases.analyticsV2.resetTaskTimeoutMinutes`.
   * Threaded into the `cases.analyticsV2.fullReset` task type's
   * `timeout` at registration so larger tenants can raise it via
   * `kibana.yml`. See the config schema for tuning guidance.
   */
  resetTaskTimeoutMinutes: number;
  /**
   * Resolved value of `xpack.cases.analyticsV2.resetPageDelayMs`. Passed
   * to the reconciliation runner only when invoked from the reset task;
   * periodic ticks always use 0 (no throttle).
   */
  resetPageDelayMs: number;
  /**
   * Resolved value of `xpack.cases.templates.enabled`. When false, the
   * `cases-templates` SO type is not registered with core, so the data
   * view sub-service must skip its per-space template read (otherwise
   * the internal SO client throws "Missing mappings for saved objects
   * types: 'cases-templates'"). Threaded through to the data view
   * sub-service at `start()` time; per-space data views are still
   * bootstrapped with an empty runtime field overlay when templates is
   * off, which is the correct shape (no templates → no extended-field
   * projections).
   */
  templatesEnabled: boolean;
}

/**
 * Dependencies the service needs at plugin `setup()` time. Setup runs before
 * Kibana is accepting requests; only contracts available in setup are valid
 * here (Task Manager setup, logger, etc.).
 */
interface CasesAnalyticsV2SetupDeps {
  /** Core setup contract — needed by the administrator-route registration. */
  core: CoreSetup;
  taskManager: TaskManagerSetupContract;
}

/**
 * Dependencies the service needs at plugin `start()` time. Start runs once
 * core has finished booting, providing real Elasticsearch + Task Manager
 * start contracts and an internal SO client suitable for scheduled
 * background work.
 */
interface CasesAnalyticsV2StartDeps {
  esClient: ElasticsearchClient;
  taskManager: TaskManagerStartContract;
  /** Internal (no request) SO client used by the reconciliation runner. */
  internalSavedObjectsClient: SavedObjectsClientContract;
  /** Data views plugin start contract — needed to create managed Cases data views. */
  dataViewsService: DataViewsServerPluginStart;
}

/**
 * Per-request inputs for the data view ensure / refresh hooks. The
 * request-scoped SO client lands the data view in the request's space
 * without manual namespace handling — handing the data views API a
 * client already scoped to space X creates the data view in space X.
 */
interface EnsureDataViewForSpaceDeps {
  spaceId: string;
  request: KibanaRequest;
  savedObjectsClient: SavedObjectsClientContract;
}

/**
 * Callback handed to consumers (today: the templates service) so they
 * can ask the v2 subsystem to recompute and persist a space's runtime
 * field map after a template change. Fire-and-forget — the caller
 * never awaits and never sees errors.
 */
export type CasesAnalyticsV2DataViewRefresher = (deps: EnsureDataViewForSpaceDeps) => void;

/** No-op refresher used when v2 is disabled. */
export const V2_NOOP_DATA_VIEW_REFRESHER: CasesAnalyticsV2DataViewRefresher = () => {};

/**
 * Top-level orchestrator for cases-analytics v2: owns index bootstrap,
 * writer lifecycle, reconciliation task registration, per-space
 * data-view ensure, and administrator route registration.
 *
 * Gated by `xpack.cases.analyticsV2.enabled`. When disabled, every
 * method is a no-op; v1 (`server/cases_analytics`) is independent.
 *
 * `getWriter()`, `getActivityWriter()`, and `getDataViewRefresher()`
 * return stable references that consumers capture once at plugin
 * `setup()`. Each delegates to a current implementation that is
 * swapped from no-op to real during `start()`, so calls before start
 * (or while the feature flag is off) silently no-op.
 */
export class CasesAnalyticsV2Service {
  private readonly logger: Logger;
  private readonly enabled: boolean;
  private readonly reconciliationIntervalMinutes: number;
  private readonly enableAdminRoutes: boolean;
  private readonly resetTaskTimeoutMinutes: number;
  private readonly resetPageDelayMs: number;
  private readonly templatesEnabled: boolean;
  /**
   * Active writer. Starts as `V2_NOOP_WRITER` so calls before `start()`
   * (or when v2 is disabled) silently no-op. Replaced with a real
   * `CasesAnalyticsV2Writer` instance once start runs.
   */
  private writer: CasesAnalyticsV2WriterContract = V2_NOOP_WRITER;
  /** Same lifecycle as `writer`, for the activity surface. */
  private activityWriter: CasesActivityV2WriterContract = V2_NOOP_ACTIVITY_WRITER;
  /**
   * Stable proxy returned to consumers. Methods delegate to the current
   * `this.writer` at call time, so swapping `writer` from no-op to real
   * after SO services have already captured the proxy works correctly.
   */
  private readonly writerProxy: CasesAnalyticsV2WriterContract = {
    upsertCase: (so) => this.writer.upsertCase(so),
    deleteCase: (id) => this.writer.deleteCase(id),
    bulkUpsertCases: (sos) => this.writer.bulkUpsertCases(sos),
    bulkDeleteCases: (ids) => this.writer.bulkDeleteCases(ids),
    bulkUpsertCasesAwait: (sos) => this.writer.bulkUpsertCasesAwait(sos),
  };
  /**
   * Stable proxy for the activity writer. Same lifecycle and semantics
   * as `writerProxy` — the user-actions service captures this once at
   * factory time and the proxy delegates to the current implementation.
   */
  private readonly activityWriterProxy: CasesActivityV2WriterContract = {
    upsertAction: (so) => this.activityWriter.upsertAction(so),
    bulkUpsertActions: (sos) => this.activityWriter.bulkUpsertActions(sos),
    bulkDeleteActionsByCaseIds: (ids) => this.activityWriter.bulkDeleteActionsByCaseIds(ids),
    bulkUpsertActionsAwait: (sos) => this.activityWriter.bulkUpsertActionsAwait(sos),
  };
  /**
   * Stable refresher returned to consumers. Captured by the cases
   * client factory at initialize time, bound per-request, and handed to
   * the templates service so template create / update / delete can
   * refresh the per-space runtime field map without taking a hard dep
   * on the v2 service. No-op when v2 is disabled or before `start()`
   * runs.
   */
  private readonly dataViewRefresherProxy: CasesAnalyticsV2DataViewRefresher = (deps) =>
    this.refreshDataViewForSpace(deps);
  /**
   * Internal SO client captured at start, used by the reconciliation
   * task runner (it needs an SO client without a request context).
   */
  private internalSavedObjectsClient: SavedObjectsClientContract | undefined;
  /**
   * Captured at start so the per-space data view ensure can pass the
   * right ES client to the data views service factory.
   */
  private esClient: ElasticsearchClient | undefined;
  /**
   * Per-space data view sub-service. Constructed at start. `undefined`
   * until start runs (or forever if v2 is disabled).
   */
  private dataViewService: CasesAnalyticsV2DataViewService | undefined;
  /**
   * Task Manager start contract captured at start. Administrator routes
   * registered in `setup()` close over a callback that reads this — they
   * need the start contract, but registration happens in setup where
   * only the setup contract is available.
   */
  private taskManager: TaskManagerStartContract | undefined;

  constructor(deps: CasesAnalyticsV2ServiceDeps) {
    this.logger = deps.logger.get('cases.analyticsV2');
    this.enabled = deps.enabled;
    this.reconciliationIntervalMinutes = deps.reconciliationIntervalMinutes;
    this.enableAdminRoutes = deps.enableAdminRoutes;
    this.resetTaskTimeoutMinutes = deps.resetTaskTimeoutMinutes;
    this.resetPageDelayMs = deps.resetPageDelayMs;
    this.templatesEnabled = deps.templatesEnabled;
  }

  /**
   * Plugin setup hook. Registers the reconciliation task type with Task
   * Manager and the administrator routes with the router. Task
   * definitions and route handlers must exist before any node accepts
   * requests, so this runs in `setup()`.
   *
   * Runtime deps (SO client, writer, TM start contract) aren't
   * available yet; the registered closures resolve them at call time,
   * by which point `start()` has populated them.
   */
  public setup(deps: CasesAnalyticsV2SetupDeps): void {
    if (!this.enabled) {
      this.logger.debug(
        'cases-analytics v2 disabled (xpack.cases.analyticsV2.enabled=false); skipping setup'
      );
      // Administrator routes are not registered when the flag is off so
      // `/state` returns 404 — health tooling reads that as "feature
      // not present here".
      return;
    }
    registerReconciliationTask({
      taskManager: deps.taskManager,
      logger: this.logger,
      getRunnerDeps: async () => {
        // Resolved at task-run time. If reconciliation fires before
        // `start()` has populated `internalSavedObjectsClient`
        // (unlikely; Task Manager waits for start), throwing here gets
        // logged and retried on the next tick.
        if (this.internalSavedObjectsClient == null) {
          throw new Error('cases-analyticsV2: reconciliation fired before service start completed');
        }
        return {
          savedObjectsClient: this.internalSavedObjectsClient,
          writer: this.writerProxy,
          activityWriter: this.activityWriterProxy,
        };
      },
    });

    // Register the one-shot reset task type. Scheduling an instance
    // happens on demand from the `/reset` route; this just makes the
    // task type known to Task Manager so future schedule calls succeed.
    registerResetTask({
      taskManager: deps.taskManager,
      logger: this.logger,
      timeoutMinutes: this.resetTaskTimeoutMinutes,
      pageDelayMs: this.resetPageDelayMs,
      reconciliationIntervalMinutes: this.reconciliationIntervalMinutes,
      getRunnerDeps: async () => {
        if (
          this.internalSavedObjectsClient == null ||
          this.taskManager == null ||
          this.writer === V2_NOOP_WRITER ||
          this.activityWriter === V2_NOOP_ACTIVITY_WRITER
        ) {
          // The reset task should never be scheduled before start
          // completes (the route handler gates on the same writers
          // being non-noop), but if a task SO from a previous boot
          // somehow fires before start has finished, surface it as a
          // clear failure rather than walking against noop writers and
          // reporting success with zero actual ES writes.
          throw new Error(
            'cases-analyticsV2: reset task fired before service start completed; writers, SO client, or task manager are not yet available'
          );
        }
        return {
          savedObjectsClient: this.internalSavedObjectsClient,
          writer: this.writerProxy,
          activityWriter: this.activityWriterProxy,
          taskManager: this.taskManager,
        };
      },
    });

    // Register administrator routes. Late-bound deps (TM start
    // contract, internal SO client, writer) are resolved at call time
    // via the closures below. The internal SO client is used by
    // `/reset` to delete per-space data views across namespaces — the
    // spaces extension scopes the request-scoped client's `delete` to
    // the requester's namespace, which 404s on any data view that
    // doesn't live there. `/reset` also closes over
    // `clearDataViewBootstrapCache` to wipe the in-memory ensure cache
    // after dropping per-space data views.
    registerCasesAnalyticsV2Routes({
      core: deps.core,
      logger: this.logger,
      getTaskManager: () => this.taskManager ?? null,
      getInternalSavedObjectsClient: () => this.internalSavedObjectsClient ?? null,
      // The closure returns the proxy only after `start()` has swapped
      // the underlying writer from `V2_NOOP_WRITER` to the real
      // `CasesAnalyticsV2Writer`; before that, it returns null so the
      // reset handler 503s instead of walking against a noop writer
      // and reporting "processed=N" with zero actual ES writes.
      getWriter: () => (this.writer === V2_NOOP_WRITER ? null : this.writerProxy),
      getActivityWriter: () =>
        this.activityWriter === V2_NOOP_ACTIVITY_WRITER ? null : this.activityWriterProxy,
      clearDataViewBootstrapCache: () => this.dataViewService?.clearBootstrapCache(),
      enabled: this.enabled,
      enableAdminRoutes: this.enableAdminRoutes,
    });
  }

  /**
   * Plugin start hook. When the flag is off, no-ops at debug level.
   *
   * When on: bootstraps `.cases` and `.cases-activity`, swaps the
   * no-op writers for the real ones, captures lifecycle references,
   * and schedules the singleton reconciliation task. `ensure*Index`
   * throw on unexpected errors (e.g. a shard-limit cluster); the
   * try/catch here logs and swallows them so the cases plugin keeps
   * starting even when analytics fails to bootstrap — analytics is a
   * downstream feature, and administrators can re-bootstrap via
   * `/reset`. Per-space data views are bootstrapped lazily on the first
   * cases request per space, via `ensureDataViewForSpace`.
   */
  public async start(deps: CasesAnalyticsV2StartDeps): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(
        'cases-analytics v2 disabled (xpack.cases.analyticsV2.enabled=false); skipping start'
      );
      return;
    }
    this.logger.info('cases-analytics v2 starting');

    // Bootstrap the cases + activity indices. Idempotent and
    // independent; running them in parallel halves first-start latency
    // on a fresh cluster. Errors are caught here (not inside ensure*)
    // so the plugin still starts even when ES is temporarily at the
    // shard limit — analytics is a downstream feature, not core.
    // Administrators can trigger a re-bootstrap via the /reset route.
    try {
      await Promise.all([
        ensureCaseIndex({ esClient: deps.esClient, logger: this.logger }),
        ensureActivityIndex({ esClient: deps.esClient, logger: this.logger }),
      ]);
    } catch (err) {
      this.logger.error(
        `cases-analyticsV2: index bootstrap failed at plugin start: ${err?.message ?? err}`,
        { error: err }
      );
    }

    // Swap the no-op writers for the real ones. From this point, every
    // call through `writerProxy` / `activityWriterProxy` reaches
    // Elasticsearch.
    this.writer = new CasesAnalyticsV2Writer({
      esClient: deps.esClient,
      logger: this.logger,
    });
    this.activityWriter = new CasesActivityV2Writer({
      esClient: deps.esClient,
      logger: this.logger,
    });

    // Capture lifecycle deps used after start by the reconciliation
    // task, administrator routes, and the per-request data-view ensure
    // hook.
    this.internalSavedObjectsClient = deps.internalSavedObjectsClient;
    this.esClient = deps.esClient;
    this.taskManager = deps.taskManager;

    // Construct the per-space data view sub-service. No data views are
    // created here; bootstrap is lazy per-request via
    // `ensureDataViewForSpace` below.
    this.dataViewService = new CasesAnalyticsV2DataViewService({
      logger: this.logger,
      dataViewsService: deps.dataViewsService,
      internalSavedObjectsClient: deps.internalSavedObjectsClient,
      templatesEnabled: this.templatesEnabled,
    });

    // Schedule the singleton reconciliation task. Idempotent and safe
    // under concurrent node starts (Task Manager dedupes by id).
    // Interval is configurable via
    // `xpack.cases.analyticsV2.reconciliationIntervalMinutes`.
    await scheduleReconciliationTask({
      taskManager: deps.taskManager,
      logger: this.logger,
      intervalMinutes: this.reconciliationIntervalMinutes,
    });
  }

  /** Plugin stop hook. Fast-return when disabled. */
  public stop(): void {
    if (!this.enabled) return;
    this.logger.info('cases-analytics v2 stopping');
  }

  /**
   * Stable writer reference for the cases SO services to capture once
   * at plugin setup. Delegates to `V2_NOOP_WRITER` until `start()` swaps
   * in the real writer (and forever, if the feature flag is off).
   */
  public getWriter(): CasesAnalyticsV2WriterContract {
    return this.writerProxy;
  }

  /**
   * Stable writer reference for the user-actions SO service to capture
   * once at plugin setup. Same lifecycle as `getWriter()`.
   */
  public getActivityWriter(): CasesActivityV2WriterContract {
    return this.activityWriterProxy;
  }

  /**
   * Fire-and-forget hook invoked by the cases request handler context
   * on every cases request. Ensures the managed Cases data view exists
   * in the request's space. Idempotent and cached in-process; after the
   * first successful ensure per space, the cost is a single map lookup.
   *
   * Safe to call when v2 is disabled or before start completes — the
   * underlying service is `undefined` and the call short-circuits.
   * Errors are swallowed inside the data view service; nothing
   * propagates to the request handler.
   */
  public ensureDataViewForSpace(deps: EnsureDataViewForSpaceDeps): void {
    if (!this.enabled || this.dataViewService == null || this.esClient == null) return;
    void this.dataViewService.ensureForSpace({
      spaceId: deps.spaceId,
      savedObjectsClient: deps.savedObjectsClient,
      esClient: this.esClient,
      request: deps.request,
    });
  }

  /**
   * Fire-and-forget hook invoked by the templates service after a
   * template create / update / delete. Bypasses the bootstrap cache so
   * the new runtime field map propagates to the per-space data view
   * immediately. Without this, a template change wouldn't surface in
   * Discover or Lens until process restart or `/reset`.
   *
   * Safe to call when v2 is disabled or before start completes — same
   * short-circuit semantics as `ensureDataViewForSpace`.
   */
  public refreshDataViewForSpace(deps: EnsureDataViewForSpaceDeps): void {
    if (!this.enabled || this.dataViewService == null || this.esClient == null) return;
    void this.dataViewService.refreshForSpace({
      spaceId: deps.spaceId,
      savedObjectsClient: deps.savedObjectsClient,
      esClient: this.esClient,
      request: deps.request,
    });
  }

  /**
   * Stable refresher reference for the cases client factory to capture
   * at initialize time. Mirrors `getWriter()` — same lifetime, same
   * "always resolvable, may no-op" guarantees.
   */
  public getDataViewRefresher(): CasesAnalyticsV2DataViewRefresher {
    return this.dataViewRefresherProxy;
  }
}
