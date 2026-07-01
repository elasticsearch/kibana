/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { TaskAlreadyRunningError } from '@kbn/task-manager-plugin/server/lib/errors';
import {
  CASES_ANALYTICS_V2_RECONCILE_RUN_SOON_URL,
  CASES_ANALYTICS_V2_RESET_URL,
  CASES_ANALYTICS_V2_STATE_URL,
} from '../constants';
import { RECONCILIATION_TASK_ID } from '../reconciliation';
import { deleteAllPerSpaceCasesDataViews, registerCasesAnalyticsV2Routes } from '.';

describe('deleteAllPerSpaceCasesDataViews', () => {
  const logger = loggerMock.create();

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Without an explicit `namespace` arg, the unscoped internal SO
   * client defaults to `'default'`. The SO repository's `delete`
   * preflight (`preflightCheckNamespaces`) returns
   * `found_outside_namespace` and surfaces as a 404 for every data
   * view that lives in a non-default space — even with `force: true`,
   * because `force` only widens the multi-share case and does not
   * bypass the namespace preflight. Passing the SO's own first
   * namespace runs the preflight against a namespace the SO is
   * actually in.
   */
  it("deletes each managed Cases data view against the SO's own namespace with force: true", async () => {
    // Two invariants on the `delete` call site:
    //   1. `force: true` — `index-pattern` is `namespaceType: 'multiple'`,
    //      so a raw `delete` can leave the underlying ES doc behind
    //      and the next `createAndSave` 409s on the deterministic id
    //      with `version_conflict_engine_exception`.
    //   2. `namespace: <SO's first namespace>` — the function
    //      operates against an unscoped internal SO client, whose
    //      default namespace is `'default'`. Without the explicit
    //      namespace, the SO repository's preflight would 404 every
    //      data view that lives in a non-default space.
    const soClient = savedObjectsClientMock.create();
    soClient.find.mockResolvedValueOnce({
      saved_objects: [
        {
          id: 'cases-analytics-managed-default',
          type: 'index-pattern',
          namespaces: ['default'],
          attributes: {},
          references: [],
          score: 0,
        },
        {
          id: 'cases-analytics-managed-team-a',
          type: 'index-pattern',
          namespaces: ['team-a'],
          attributes: {},
          references: [],
          score: 0,
        },
      ],
      total: 2,
      per_page: 100,
      page: 1,
    });
    soClient.find.mockResolvedValue({ saved_objects: [], total: 0, per_page: 100, page: 1 });

    const deleted = await deleteAllPerSpaceCasesDataViews(soClient, logger);

    expect(deleted).toBe(2);
    expect(soClient.delete).toHaveBeenCalledWith(
      'index-pattern',
      'cases-analytics-managed-default',
      { namespace: 'default', force: true }
    );
    expect(soClient.delete).toHaveBeenCalledWith(
      'index-pattern',
      'cases-analytics-managed-team-a',
      { namespace: 'team-a', force: true }
    );
    // The unscoped internal client requires `namespace` on every
    // cross-namespace delete; dropping it would re-introduce the
    // orphan-space bug.
    for (const call of (soClient.delete as jest.Mock).mock.calls) {
      const opts = call[2] as { namespace?: string };
      expect(opts).toHaveProperty('namespace');
      expect(opts.namespace).toBeTruthy();
    }
  });

  it('opens the point-in-time finder with namespaces: ["*"] so the walk crosses every space', async () => {
    // Structural lock — the unscoped internal SO client defaults
    // `options.namespaces` to `[DEFAULT_NAMESPACE_STRING]` when
    // omitted, so dropping the `['*']` arg would silently scope the
    // walk to `default` and miss every other space. The walk uses a
    // point-in-time finder (not page/offset `find`) so it isn't bounded
    // by `index.max_result_window` at 10K-space scale.
    const soClient = savedObjectsClientMock.create();
    soClient.find.mockResolvedValue({ saved_objects: [], total: 0, per_page: 100, page: 1 });

    await deleteAllPerSpaceCasesDataViews(soClient, logger);

    expect(soClient.createPointInTimeFinder).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'index-pattern',
        namespaces: ['*'],
      })
    );
  });

  it('skips data views whose id does not start with the managed prefix', async () => {
    const soClient = savedObjectsClientMock.create();
    soClient.find.mockResolvedValueOnce({
      saved_objects: [
        {
          id: 'user-created-index-pattern',
          type: 'index-pattern',
          namespaces: ['default'],
          attributes: {},
          references: [],
          score: 0,
        },
      ],
      total: 1,
      per_page: 100,
      page: 1,
    });
    soClient.find.mockResolvedValue({ saved_objects: [], total: 0, per_page: 100, page: 1 });

    const deleted = await deleteAllPerSpaceCasesDataViews(soClient, logger);

    expect(deleted).toBe(0);
    expect(soClient.delete).not.toHaveBeenCalled();
  });

  it('walks every page before deleting so page-shift never skips entries', async () => {
    // A single-pass shape that deletes while iterating would shift
    // offsets on every page-fetch — SOs originally at position N
    // would move onto already-walked page N-1 once items in front
    // of them were removed. The two-pass shape (collect every page
    // first, then delete) keeps pagination stable because the index
    // isn't mutated while it's being read.
    //
    // The multi-page path is exercised by returning a full page
    // (length === PAGE_SIZE = 100) on the first call so the loop
    // continues to a second page. A single-pass shape would have
    // dropped the second page's 50 items entirely.
    const soClient = savedObjectsClientMock.create();
    const pageOne = Array.from({ length: 100 }, (_, i) => ({
      id: `cases-analytics-managed-space-p1-${i}`,
      type: 'index-pattern',
      namespaces: [`space-p1-${i}`],
      attributes: {},
      references: [],
      score: 0,
    }));
    const pageTwo = Array.from({ length: 50 }, (_, i) => ({
      id: `cases-analytics-managed-space-p2-${i}`,
      type: 'index-pattern',
      namespaces: [`space-p2-${i}`],
      attributes: {},
      references: [],
      score: 0,
    }));
    soClient.find
      .mockResolvedValueOnce({
        saved_objects: pageOne,
        total: 150,
        per_page: 100,
        page: 1,
      })
      .mockResolvedValueOnce({
        saved_objects: pageTwo,
        total: 150,
        per_page: 100,
        page: 2,
      });

    const deleted = await deleteAllPerSpaceCasesDataViews(soClient, logger);

    expect(deleted).toBe(150);
    expect(soClient.delete).toHaveBeenCalledTimes(150);
    // All page-two ids made it through.
    expect(soClient.delete).toHaveBeenCalledWith(
      'index-pattern',
      'cases-analytics-managed-space-p2-49',
      { namespace: 'space-p2-49', force: true }
    );

    // Find is called exactly twice: page-two returned 50 < PAGE_SIZE
    // so the walk terminates. No find calls happen during the
    // delete phase.
    expect(soClient.find).toHaveBeenCalledTimes(2);

    // No `find` calls were interleaved with `delete` calls — the
    // two-pass invariant means every find happens before any delete.
    const findOrder = (soClient.find as jest.Mock).mock.invocationCallOrder;
    const deleteOrder = (soClient.delete as jest.Mock).mock.invocationCallOrder;
    expect(Math.max(...findOrder)).toBeLessThan(Math.min(...deleteOrder));
  });

  it('continues the walk and logs at WARN when a single delete fails', async () => {
    const soClient = savedObjectsClientMock.create();
    soClient.find.mockResolvedValueOnce({
      saved_objects: [
        {
          id: 'cases-analytics-managed-default',
          type: 'index-pattern',
          namespaces: ['default'],
          attributes: {},
          references: [],
          score: 0,
        },
        {
          id: 'cases-analytics-managed-team-a',
          type: 'index-pattern',
          namespaces: ['team-a'],
          attributes: {},
          references: [],
          score: 0,
        },
      ],
      total: 2,
      per_page: 100,
      page: 1,
    });
    soClient.find.mockResolvedValue({ saved_objects: [], total: 0, per_page: 100, page: 1 });
    soClient.delete
      .mockRejectedValueOnce(new Error('transient ES blip'))
      .mockResolvedValueOnce(undefined as unknown as never);

    const deleted = await deleteAllPerSpaceCasesDataViews(soClient, logger);

    // The second delete still ran.
    expect(deleted).toBe(1);
    const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
    const warnCalls = (childLogger.warn as jest.Mock).mock.calls.map(([msg]: [string]) => msg);
    expect(warnCalls.some((m: string) => m.includes('cases-analytics-managed-default'))).toBe(true);
  });

  /**
   * A 404 on a post-enumeration delete is benign: either an
   * out-of-band Stack Management deletion or a concurrent `/reset`
   * removed the SO between pass 1 and pass 2. The desired end state
   * ("data view gone") is satisfied, so it logs at DEBUG and doesn't
   * count toward the deletion total.
   */
  it('treats a 404 on delete as a benign race outcome (DEBUG, not WARN)', async () => {
    const soClient = savedObjectsClientMock.create();
    soClient.find.mockResolvedValueOnce({
      saved_objects: [
        {
          id: 'cases-analytics-managed-default',
          type: 'index-pattern',
          namespaces: ['default'],
          attributes: {},
          references: [],
          score: 0,
        },
        {
          id: 'cases-analytics-managed-team-a',
          type: 'index-pattern',
          namespaces: ['team-a'],
          attributes: {},
          references: [],
          score: 0,
        },
      ],
      total: 2,
      per_page: 100,
      page: 1,
    });
    soClient.find.mockResolvedValue({ saved_objects: [], total: 0, per_page: 100, page: 1 });
    // First delete races and 404s (matches the real SO API's error
    // shape: a plain Error whose message contains
    // `Saved object ... not found`, plus a numeric statusCode);
    // second delete succeeds. The function must classify the first
    // as a benign race rather than a hard failure.
    const notFoundErr = Object.assign(
      new Error('Saved object [index-pattern/cases-analytics-managed-default] not found'),
      { statusCode: 404 }
    );
    soClient.delete
      .mockRejectedValueOnce(notFoundErr)
      .mockResolvedValueOnce(undefined as unknown as never);

    const deleted = await deleteAllPerSpaceCasesDataViews(soClient, logger);

    // Only the one that actually deleted is counted.
    expect(deleted).toBe(1);
    const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
    // No WARN about the 404 — that's the bug being guarded against.
    const warnCalls = (childLogger.warn as jest.Mock).mock.calls.map(([msg]: [string]) => msg);
    expect(warnCalls.some((m: string) => m.includes('cases-analytics-managed-default'))).toBe(
      false
    );
    // DEBUG is emitted so administrators can correlate the count gap.
    const debugCalls = (childLogger.debug as jest.Mock).mock.calls.map(([msg]: [string]) => msg);
    expect(debugCalls.some((m: string) => m.includes('cases-analytics-managed-default'))).toBe(
      true
    );
  });

  it('still WARNs on non-404 delete failures (cluster blip is not a race)', async () => {
    // Negative case for the 404 tolerance path: a 503 / 500 from ES
    // must still surface so the administrator can investigate. Mirrors
    // the analogous guard on `createAndSave` in
    // `data_view/service.ts`.
    const soClient = savedObjectsClientMock.create();
    soClient.find.mockResolvedValueOnce({
      saved_objects: [
        {
          id: 'cases-analytics-managed-default',
          type: 'index-pattern',
          namespaces: ['default'],
          attributes: {},
          references: [],
          score: 0,
        },
      ],
      total: 1,
      per_page: 100,
      page: 1,
    });
    soClient.find.mockResolvedValue({ saved_objects: [], total: 0, per_page: 100, page: 1 });
    soClient.delete.mockRejectedValueOnce(
      Object.assign(new Error('cluster_block_exception'), { statusCode: 503 })
    );

    const deleted = await deleteAllPerSpaceCasesDataViews(soClient, logger);

    expect(deleted).toBe(0);
    const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
    const warnCalls = (childLogger.warn as jest.Mock).mock.calls.map(([msg]: [string]) => msg);
    expect(warnCalls.some((m: string) => m.includes('cluster_block_exception'))).toBe(true);
  });
});

describe('registerCasesAnalyticsV2Routes — enableAdminRoutes gating', () => {
  /**
   * Builds the minimal RegisterArgs needed to exercise route
   * registration. Handler bodies never execute in these tests — we
   * only assert which routes were registered on the mock router.
   */
  type RegisterArgs = Parameters<typeof registerCasesAnalyticsV2Routes>[0];

  function buildArgs(overrides: Partial<RegisterArgs> = {}): RegisterArgs {
    return {
      core: coreMock.createSetup(),
      logger: loggerMock.create(),
      getTaskManager: () => null,
      getInternalSavedObjectsClient: () => null,
      getWriter: () => null,
      getActivityWriter: () => null,
      clearDataViewBootstrapCache: jest.fn(),
      enabled: true,
      enableAdminRoutes: false,
      ...overrides,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('always registers GET /state regardless of enableAdminRoutes', () => {
    // GET /state is a read-only health surface polled by the Case
    // Settings page — it must be reachable even when the mutating
    // admin routes are disabled.
    const args = buildArgs({ enableAdminRoutes: false });
    registerCasesAnalyticsV2Routes(args);

    const router = (args.core.http.createRouter as jest.Mock).mock.results[0].value;

    expect(router.get).toHaveBeenCalledTimes(1);
    expect(router.get).toHaveBeenCalledWith(
      expect.objectContaining({ path: CASES_ANALYTICS_V2_STATE_URL }),
      expect.any(Function)
    );
  });

  it('does not register POST /reset or POST /reconcile/run_soon when enableAdminRoutes is false', () => {
    // When the flag is off, neither mutating route should be
    // registered. Requests to those paths must return 404 — the
    // registration-time gate is what makes the surface invisible to
    // tenants that have not opted in.
    const args = buildArgs({ enableAdminRoutes: false });
    registerCasesAnalyticsV2Routes(args);

    const router = (args.core.http.createRouter as jest.Mock).mock.results[0].value;

    expect(router.post).not.toHaveBeenCalled();
  });

  it('registers POST /reset and POST /reconcile/run_soon when enableAdminRoutes is true', () => {
    const args = buildArgs({ enableAdminRoutes: true });
    registerCasesAnalyticsV2Routes(args);

    const router = (args.core.http.createRouter as jest.Mock).mock.results[0].value;
    const registeredPaths: string[] = (router.post as jest.Mock).mock.calls.map(
      ([{ path }]: [{ path: string }]) => path
    );

    expect(registeredPaths).toContain(CASES_ANALYTICS_V2_RESET_URL);
    expect(registeredPaths).toContain(CASES_ANALYTICS_V2_RECONCILE_RUN_SOON_URL);
  });

  /**
   * Locks the canonical superuser-only authz shape against three
   * regressions:
   *   1. Dropping `ReservedPrivilegesSet.superuser` for a bare string
   *      (validator accepts it, but the enum form catches typos at
   *      build time).
   *   2. Wrapping in `{ allRequired: [...] }` — works at runtime but
   *      diverges from every other Kibana admin route.
   *   3. Adding a second privilege alongside `superuser`, which the
   *      route security validator rejects ("Combining superuser with
   *      other privileges is redundant", see
   *      `security_route_config_validator.ts`).
   * If any of the three regress, the assertion fails before the
   * server-side validator runs at route registration.
   */
  it('uses ReservedPrivilegesSet.superuser at the top level of requiredPrivileges for every admin route', () => {
    const args = buildArgs({ enableAdminRoutes: true });
    registerCasesAnalyticsV2Routes(args);

    const router = (args.core.http.createRouter as jest.Mock).mock.results[0].value;
    const adminCalls: Array<[{ path: string; security?: unknown }, unknown]> = [
      ...(router.get as jest.Mock).mock.calls,
      ...(router.post as jest.Mock).mock.calls,
    ].filter(([{ path }]) =>
      [
        CASES_ANALYTICS_V2_STATE_URL,
        CASES_ANALYTICS_V2_RESET_URL,
        CASES_ANALYTICS_V2_RECONCILE_RUN_SOON_URL,
      ].includes(path)
    );

    expect(adminCalls).toHaveLength(3);

    for (const [config] of adminCalls) {
      expect(config.security).toEqual({
        authz: { requiredPrivileges: ['superuser'] },
      });
    }
  });
});

describe('POST /reconcile/run_soon handler', () => {
  type RegisterArgs = Parameters<typeof registerCasesAnalyticsV2Routes>[0];

  /** Resolve the runSoon handler from the mock router. */
  function getRunSoonHandler(args: RegisterArgs) {
    registerCasesAnalyticsV2Routes(args);
    const router = (args.core.http.createRouter as jest.Mock).mock.results[0].value;
    const postCalls = (router.post as jest.Mock).mock.calls as Array<
      [{ path: string }, (...handlerArgs: unknown[]) => Promise<unknown>]
    >;
    const match = postCalls.find(
      ([{ path }]) => path === CASES_ANALYTICS_V2_RECONCILE_RUN_SOON_URL
    );
    if (match == null) throw new Error('run_soon route was not registered');
    return match[1];
  }

  function buildArgs(overrides: Partial<RegisterArgs> = {}): RegisterArgs {
    return {
      core: coreMock.createSetup(),
      logger: loggerMock.create(),
      getTaskManager: () => null,
      getInternalSavedObjectsClient: () => null,
      getWriter: () => null,
      getActivityWriter: () => null,
      clearDataViewBootstrapCache: jest.fn(),
      enabled: true,
      enableAdminRoutes: true,
      ...overrides,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Race regression: TM raises `TaskAlreadyRunningError` when the
   * task is `Claiming`/`Running` (prior runSoon in flight, or the
   * periodic tick was just claimed). Route surfaces this as 200 with
   * `already_running: true` rather than 500 — same precedent as
   * `rulesClient.runSoon`. Without this branch, back-to-back
   * `runSoon` calls (and `runSoon` immediately after `/reset`) flake.
   */
  it('returns 200 with already_running when TaskAlreadyRunningError is thrown', async () => {
    const taskManager = {
      runSoon: jest.fn().mockRejectedValue(new TaskAlreadyRunningError(RECONCILIATION_TASK_ID)),
    } as unknown as ReturnType<RegisterArgs['getTaskManager']>;
    const args = buildArgs({ getTaskManager: () => taskManager });
    const handler = getRunSoonHandler(args);

    const response = httpServerMock.createResponseFactory();
    await handler({} as never, httpServerMock.createKibanaRequest(), response as unknown as never);

    expect(response.ok).toHaveBeenCalledWith({
      body: { id: RECONCILIATION_TASK_ID, already_running: true },
    });
    expect(response.customError).not.toHaveBeenCalled();
  });

  it('returns 500 when runSoon throws an unrelated error', async () => {
    // Non-race failures (SO repo blip, etc.) still 500 — the route
    // must not swallow real problems just because the happy and
    // already-running paths look similar to the caller.
    const taskManager = {
      runSoon: jest.fn().mockRejectedValue(new Error('something else')),
    } as unknown as ReturnType<RegisterArgs['getTaskManager']>;
    const args = buildArgs({ getTaskManager: () => taskManager });
    const handler = getRunSoonHandler(args);

    const response = httpServerMock.createResponseFactory();
    await handler({} as never, httpServerMock.createKibanaRequest(), response as unknown as never);

    expect(response.customError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
    expect(response.ok).not.toHaveBeenCalled();
  });

  it('returns 200 with the runSoon result on the happy path', async () => {
    const runSoonResult = { id: RECONCILIATION_TASK_ID, state: { runAt: 'now' } };
    const taskManager = {
      runSoon: jest.fn().mockResolvedValue(runSoonResult),
    } as unknown as ReturnType<RegisterArgs['getTaskManager']>;
    const args = buildArgs({ getTaskManager: () => taskManager });
    const handler = getRunSoonHandler(args);

    const response = httpServerMock.createResponseFactory();
    await handler({} as never, httpServerMock.createKibanaRequest(), response as unknown as never);

    expect(response.ok).toHaveBeenCalledWith({
      body: { id: RECONCILIATION_TASK_ID, result: runSoonResult },
    });
  });

  it('returns 503 when Task Manager is not available', async () => {
    // Optional `taskManager` plugin may be absent. 503 (vs 500/4xx)
    // signals "try again later" rather than a permanent failure.
    const args = buildArgs({ getTaskManager: () => null });
    const handler = getRunSoonHandler(args);

    const response = httpServerMock.createResponseFactory();
    await handler({} as never, httpServerMock.createKibanaRequest(), response as unknown as never);

    expect(response.customError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });
});
