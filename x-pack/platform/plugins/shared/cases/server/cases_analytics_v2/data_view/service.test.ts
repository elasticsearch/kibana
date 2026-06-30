/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, KibanaRequest, SavedObject } from '@kbn/core/server';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import type { RuntimeFieldSpec } from '@kbn/data-views-plugin/common';
import { CASE_TEMPLATE_SAVED_OBJECT } from '../../../common/constants';
import {
  asDataView,
  makeDataViewsPluginStart,
  makeDataViewWithRuntime,
  makeMockDvService,
  makeTemplate,
  stubFindOnePage,
  stubFindWithPages,
  type MockDvService,
  type TemplateLike,
} from '../__test_helpers__';
import { CasesAnalyticsV2DataViewService } from './service';
import { getCaseDataViewId } from './data_view_specs';

describe('CasesAnalyticsV2DataViewService', () => {
  const spaceId = 'default';
  const dataViewId = getCaseDataViewId(spaceId);

  /**
   * Single setup helper used by every describe block — wires the mock
   * internal SO client (with templates the test cares about) and a mock
   * data views service into a real `CasesAnalyticsV2DataViewService`,
   * and returns the deps any test needs to call `ensureForSpace` /
   * `refreshForSpace`.
   */
  const setup = (
    templates: Array<SavedObject<TemplateLike>> = [],
    { templatesEnabled = true }: { templatesEnabled?: boolean } = {}
  ) => {
    const internalSoClient = savedObjectsClientMock.create();
    stubFindOnePage(internalSoClient, templates);

    const dvService = makeMockDvService();
    const dataViewsService = makeDataViewsPluginStart(dvService);
    const logger = loggerMock.create();

    const service = new CasesAnalyticsV2DataViewService({
      logger,
      dataViewsService,
      internalSavedObjectsClient: internalSoClient,
      templatesEnabled,
    });

    return {
      service,
      dvService,
      logger,
      internalSoClient,
      deps: {
        spaceId,
        savedObjectsClient: savedObjectsClientMock.create(),
        esClient: {} as unknown as ElasticsearchClient,
        request: {} as unknown as KibanaRequest,
      },
    };
  };

  /** Pre-seed `dvService.get` to throw the canonical 404 the production code handles. */
  const stubMissingDataView = (dvService: MockDvService) => {
    dvService.get.mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }));
  };

  describe('ensureForSpace', () => {
    it('reads template field metadata from attributes.fieldNames (not the YAML definition string)', async () => {
      // The persisted contract is `attributes.fieldNames`; reaching for
      // `attributes.definition.fields` would be `undefined` (definition
      // is a YAML string), silently emptying the runtime field map.
      const { service, dvService, deps } = setup([
        makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }]),
      ]);
      stubMissingDataView(dvService);

      await service.ensureForSpace(deps);

      expect(dvService.createAndSave).toHaveBeenCalledTimes(1);
      const [spec] = dvService.createAndSave.mock.calls[0];
      expect(Object.keys(spec.runtimeFieldMap ?? {})).toEqual(['cases.risk_as_long']);
    });

    it('creates the data view with the freshly-computed runtime fields when it does not exist', async () => {
      const { service, dvService, deps } = setup([
        makeTemplate('tpl-1', [{ name: 'score', type: 'double', control: 'INPUT_NUMBER' }]),
      ]);
      stubMissingDataView(dvService);

      await service.ensureForSpace(deps);

      expect(dvService.createAndSave).toHaveBeenCalledTimes(1);
      const [spec, overwrite, skipFetchFields] = dvService.createAndSave.mock.calls[0];
      expect(spec.id).toBe(dataViewId);
      expect(spec.runtimeFieldMap).toMatchObject({ 'cases.score_as_double': { type: 'double' } });
      expect(overwrite).toBe(false);
      expect(skipFetchFields).toBe(true);
      expect(dvService.updateSavedObject).not.toHaveBeenCalled();
    });

    it('updates the existing data view when the runtime field map has drifted', async () => {
      const { service, dvService, deps } = setup([
        makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }]),
      ]);
      // Fixture: existing data view holds `risk_as_double`; live template
      // declares `risk_as_long`. Diff must detect drift and update.
      const existing = makeDataViewWithRuntime(dataViewId, {
        'cases.risk_as_double': {
          type: 'double',
          script: { source: 'emit(0)' },
        } as unknown as RuntimeFieldSpec,
      });
      dvService.get.mockResolvedValueOnce(asDataView(existing));

      await service.ensureForSpace(deps);

      expect(existing.replaceAllRuntimeFields).toHaveBeenCalledTimes(1);
      const [newMap] = existing.replaceAllRuntimeFields.mock.calls[0];
      expect(Object.keys(newMap)).toEqual(['cases.risk_as_long']);
      expect(dvService.updateSavedObject).toHaveBeenCalledWith(existing);
      expect(dvService.createAndSave).not.toHaveBeenCalled();
    });

    it('short-circuits subsequent same-process calls for the same space (in-memory cache)', async () => {
      const { service, dvService, deps } = setup([]);
      stubMissingDataView(dvService);

      await service.ensureForSpace(deps);
      await service.ensureForSpace(deps);

      // Only one round of work, even though ensure was called twice.
      expect(dvService.get).toHaveBeenCalledTimes(1);
      expect(dvService.createAndSave).toHaveBeenCalledTimes(1);
    });

    it('does not throw past the service boundary on internal failures', async () => {
      const { service, dvService, deps, logger } = setup([]);
      dvService.get.mockRejectedValueOnce(new Error('cluster unavailable'));

      await expect(service.ensureForSpace(deps)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('cluster unavailable'));
    });

    /**
     * Regression guard for the "templates off → cases-templates SO type
     * not registered" path. When `xpack.cases.templates.enabled` is
     * false, `caseTemplateSavedObjectType` is not registered with core
     * (see `saved_object_types/index.ts`), so the internal SO client
     * would throw "Missing mappings for saved objects types:
     * 'cases-templates'" on any `find({ type: CASE_TEMPLATE_SAVED_OBJECT })`
     * call. The service must skip the template walk entirely in that
     * configuration — never touching the SO client for templates — and
     * bootstrap the per-space data view with an empty runtime field
     * overlay (the base data view is still useful for ES|QL against
     * the analytics index; only the extended-field projections are
     * absent).
     */
    it('skips the cases-templates SO walk when templates feature flag is off', async () => {
      const { service, dvService, internalSoClient, deps } = setup(
        [makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }])],
        { templatesEnabled: false }
      );
      stubMissingDataView(dvService);

      await service.ensureForSpace(deps);

      expect(internalSoClient.find).not.toHaveBeenCalled();
      expect(dvService.createAndSave).toHaveBeenCalledTimes(1);
      const [spec] = dvService.createAndSave.mock.calls[0];
      expect(Object.keys(spec.runtimeFieldMap ?? {})).toEqual([]);
    });

    /**
     * Two parallel cases requests in a fresh-cache space both pass the
     * cache check, both see `dvService.get` return 404, and both call
     * `createAndSave`. Without dedupe, the loser surfaces
     * `version_conflict_engine_exception` via the WARN log path even
     * though the doc landed fine. In-flight dedupe collapses the two
     * ensures onto a single promise.
     */
    it('collapses concurrent ensures for the same space onto a single in-flight promise', async () => {
      const { service, dvService, deps } = setup([]);
      stubMissingDataView(dvService);
      // Stretch `createAndSave` so the second `ensureForSpace` lands
      // while the first is mid-flight. The deferred is created
      // up-front (rather than captured inside the mock) so the
      // resolver is always the real one. The first `await` in the
      // production path happens before `createAndSave` (template
      // page-read, runtime field map compute), so the test waits
      // until `createAndSave` is actually invoked before resolving.
      let resolveCreate!: () => void;
      const createPromise = new Promise<void>((resolve) => {
        resolveCreate = resolve;
      });
      dvService.createAndSave.mockReturnValue(createPromise);

      const first = service.ensureForSpace(deps);
      const second = service.ensureForSpace(deps);
      while (dvService.createAndSave.mock.calls.length === 0) {
        await new Promise((r) => setImmediate(r));
      }
      resolveCreate();
      await Promise.all([first, second]);

      expect(dvService.get).toHaveBeenCalledTimes(1);
      expect(dvService.createAndSave).toHaveBeenCalledTimes(1);
    });

    it('dedupe slot frees up so a later ensure (post-cache-eviction or refresh) re-runs work', async () => {
      // The in-flight map must be cleared in the finally block,
      // otherwise the next ensure after eviction / refresh would
      // silently no-op forever.
      //
      // The test models the lifecycle-hook flow that drives
      // `refreshForSpace`:
      //   - first ensure runs against an empty templates set;
      //   - a template is then created in the same space, changing
      //     the snake-key fingerprint;
      //   - `refreshForSpace` must not await the stale/resolved
      //     inflight promise and must reach `dvService.get` to diff
      //     against the persisted data view.
      // Using identical templates on both calls would hit the
      // fingerprint shortcut by design, so the second page differs.
      const { service, dvService, internalSoClient, deps } = setup([]);
      stubMissingDataView(dvService);
      await service.ensureForSpace(deps);

      // Stage a freshly-created template so the fingerprint differs
      // from the cached one and the refresh path does work.
      internalSoClient.find.mockReset();
      stubFindOnePage(internalSoClient, [
        makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }]),
      ]);
      // Force-refresh bypasses the cache short-circuit; if the
      // inflight map wasn't cleared, this would await a resolved
      // promise and never re-invoke the data views service.
      stubMissingDataView(dvService);
      await service.refreshForSpace(deps);

      expect(dvService.get).toHaveBeenCalledTimes(2);
    });

    /**
     * Two Kibana nodes can bootstrap the same space concurrently;
     * per-process dedupe doesn't help across processes. The loser's
     * `createAndSave` returns a `version_conflict_engine_exception`,
     * but both nodes computed the runtime field map from the same
     * persisted templates view, so the winning doc carries the same
     * fields. The 409 is treated as a benign success and the
     * in-process cache is populated as if the local node had written.
     */
    it('treats a cross-node version_conflict on createAndSave as a benign bootstrap success', async () => {
      const { service, dvService, deps, logger } = setup([]);
      stubMissingDataView(dvService);
      // Mirror ES's wire shape — `version_conflict_engine_exception`
      // text plus a 409 statusCode. Both are checked in
      // `isVersionConflictError`, so the test pins both paths.
      const conflictErr = Object.assign(
        new Error(
          '[index-pattern:cases-analytics-managed-default]: version conflict, document already exists (current version [1])'
        ),
        { statusCode: 409 }
      );
      dvService.createAndSave.mockRejectedValueOnce(conflictErr);

      await expect(service.ensureForSpace(deps)).resolves.toBeUndefined();

      // No WARN on the data view ensure path — the conflict is benign.
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('version conflict'));
      // The cache slot was populated; the next ensure short-circuits.
      dvService.get.mockClear();
      dvService.createAndSave.mockClear();
      await service.ensureForSpace(deps);
      expect(dvService.get).not.toHaveBeenCalled();
      expect(dvService.createAndSave).not.toHaveBeenCalled();
    });

    it('still surfaces non-conflict createAndSave failures via the WARN path', async () => {
      // Negative case for the conflict-tolerance path: a 503 / 500
      // from ES must not be swallowed; the administrator needs to see
      // them and the next request should re-attempt.
      const { service, dvService, deps, logger } = setup([]);
      stubMissingDataView(dvService);
      dvService.createAndSave.mockRejectedValueOnce(
        Object.assign(new Error('cluster_block_exception'), { statusCode: 503 })
      );

      await service.ensureForSpace(deps);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('cluster_block_exception'));
    });

    /**
     * Templates use soft-delete and versioning, so a naive `find()`
     * keeps returning old/deleted template rows. Without the
     * `isLatest: true AND deletedAt: null` filter, a renamed template
     * (`score_as_long` → `priority_as_keyword`) would publish both
     * runtime fields forever and the data view would accumulate
     * ghost fields silently.
     */
    it('filters templates by isLatest=true AND deletedAt=null and only requests the fieldNames attribute', async () => {
      const { service, dvService, deps, internalSoClient } = setup([]);
      stubMissingDataView(dvService);

      await service.ensureForSpace(deps);

      expect(internalSoClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CASE_TEMPLATE_SAVED_OBJECT,
          namespaces: [spaceId],
          fields: ['fieldNames'],
          filter: expect.stringContaining('isLatest: true'),
        })
      );
      const findArgs = internalSoClient.find.mock.calls[0]?.[0] as { filter: string };
      expect(findArgs.filter).toContain('NOT');
      expect(findArgs.filter).toContain('deletedAt');
    });
  });

  describe('refreshForSpace', () => {
    it('always re-fetches templates so template lifecycle changes propagate', async () => {
      // ensureForSpace would short-circuit on a fresh cache entry;
      // refresh must not. Refresh callers (template create / update /
      // delete hooks) rely on "I just changed something, look again".
      const { service, dvService, deps, internalSoClient } = setup([
        makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }]),
      ]);
      stubMissingDataView(dvService);

      await service.ensureForSpace(deps);
      const fetchesAfterEnsure = (internalSoClient.find as jest.Mock).mock.calls.length;

      await service.refreshForSpace(deps);

      expect((internalSoClient.find as jest.Mock).mock.calls.length).toBeGreaterThan(
        fetchesAfterEnsure
      );
    });

    it('runs the data view update when the recomputed snake-key set differs from the cached one', async () => {
      const { service, dvService, deps, internalSoClient } = setup([]);
      // Page 1: one template (ensure). Page 2: a different template
      // (refresh). The fingerprint differs, so the diff branch
      // fires on refresh.
      stubFindWithPages(internalSoClient, [
        [makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }])],
        [makeTemplate('tpl-1', [{ name: 'priority', type: 'keyword', control: 'INPUT_TEXT' }])],
      ]);
      stubMissingDataView(dvService);
      await service.ensureForSpace(deps);
      dvService.createAndSave.mockClear();

      const existing = makeDataViewWithRuntime(dataViewId, {
        'cases.risk_as_long': {
          type: 'long',
          script: { source: 'emit(0)' },
        } as unknown as RuntimeFieldSpec,
      });
      dvService.get.mockResolvedValueOnce(asDataView(existing));

      await service.refreshForSpace(deps);

      expect(existing.replaceAllRuntimeFields).toHaveBeenCalledTimes(1);
      const [newMap] = existing.replaceAllRuntimeFields.mock.calls[0];
      expect(Object.keys(newMap)).toEqual(['cases.priority_as_keyword']);
      expect(dvService.updateSavedObject).toHaveBeenCalledWith(existing);
    });

    it('skips the data view fetch and update when the recomputed fingerprint matches the cached one', async () => {
      // Same templates on both calls → same fingerprint → no work
      // past the templates fetch. Most template edits (rename, tags,
      // validation) don't change snake-keys at all.
      const { service, dvService, deps, internalSoClient } = setup([]);
      stubFindWithPages(internalSoClient, [
        [makeTemplate('tpl-1', [{ name: 'score', type: 'long', control: 'INPUT_NUMBER' }])],
        [makeTemplate('tpl-1', [{ name: 'score', type: 'long', control: 'INPUT_NUMBER' }])],
      ]);
      stubMissingDataView(dvService);
      await service.ensureForSpace(deps);
      dvService.get.mockClear();
      dvService.createAndSave.mockClear();
      dvService.updateSavedObject.mockClear();

      await service.refreshForSpace(deps);

      // Fingerprint short-circuit kicked in: no DV fetch, no DV update.
      expect(dvService.get).not.toHaveBeenCalled();
      expect(dvService.createAndSave).not.toHaveBeenCalled();
      expect(dvService.updateSavedObject).not.toHaveBeenCalled();
    });
  });

  describe('clearBootstrapCache', () => {
    it('forces the next ensureForSpace call to re-run', async () => {
      const { service, dvService, deps } = setup([]);
      stubMissingDataView(dvService);

      await service.ensureForSpace(deps);
      service.clearBootstrapCache();

      stubMissingDataView(dvService);
      await service.ensureForSpace(deps);

      expect(dvService.createAndSave).toHaveBeenCalledTimes(2);
    });
  });

  describe('fingerprint cache', () => {
    /**
     * Without a fingerprint cache, every cases request that touches
     * the data view service would incur an SO `get` plus a deep
     * `isEqual` over the runtime field map — silent CPU and I/O
     * burn at thousands-of-spaces scale, since most edits don't
     * change the snake-key set. The fingerprint cache short-circuits
     * the diff path on hit.
     */
    it('skips the data view fetch on a within-TTL fingerprint hit', async () => {
      // Two refreshForSpace calls with identical templates. The first
      // primes the fingerprint cache; the second must skip the DV fetch.
      const { service, dvService, deps, internalSoClient } = setup([]);
      stubFindWithPages(internalSoClient, [
        [makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }])],
        [makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }])],
      ]);
      stubMissingDataView(dvService);

      await service.refreshForSpace(deps);
      const dvGetsAfterFirst = dvService.get.mock.calls.length;

      await service.refreshForSpace(deps);

      expect(dvService.get).toHaveBeenCalledTimes(dvGetsAfterFirst);
    });

    it('runs the diff path when the fingerprint changes (template field added)', async () => {
      // Page 1: 1 snake-key. Page 2: 2 snake-keys. Fingerprints differ.
      const { service, dvService, deps, internalSoClient } = setup([]);
      stubFindWithPages(internalSoClient, [
        [makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }])],
        [
          makeTemplate('tpl-1', [
            { name: 'risk', type: 'long', control: 'INPUT_NUMBER' },
            { name: 'priority', type: 'keyword', control: 'INPUT_TEXT' },
          ]),
        ],
      ]);
      stubMissingDataView(dvService);
      await service.refreshForSpace(deps);
      dvService.createAndSave.mockClear();

      const existing = makeDataViewWithRuntime(dataViewId, {
        'cases.risk_as_long': {
          type: 'long',
          script: { source: 'emit(0)' },
        } as unknown as RuntimeFieldSpec,
      });
      dvService.get.mockResolvedValueOnce(asDataView(existing));

      await service.refreshForSpace(deps);

      expect(existing.replaceAllRuntimeFields).toHaveBeenCalledTimes(1);
      const [newMap] = existing.replaceAllRuntimeFields.mock.calls[0];
      expect(new Set(Object.keys(newMap))).toEqual(
        new Set(['cases.risk_as_long', 'cases.priority_as_keyword'])
      );
    });

    it('does not cache the fingerprint when the ensure path throws', async () => {
      // A failure inside ensureOrRefreshForSpace must not poison the
      // cache — otherwise the next request would short-circuit on a
      // fingerprint that was never applied to a data view.
      const { service, dvService, deps } = setup([
        makeTemplate('tpl-1', [{ name: 'risk', type: 'long', control: 'INPUT_NUMBER' }]),
      ]);
      dvService.get.mockRejectedValueOnce(new Error('cluster unavailable'));

      await service.ensureForSpace(deps);

      // The second call must do real work — the failed call must
      // not have populated the fingerprint cache.
      stubMissingDataView(dvService);
      await service.ensureForSpace(deps);

      expect(dvService.createAndSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('bootstrap cache TTL', () => {
    /**
     * If an administrator deletes a per-space cases data view via
     * Stack Management (not via `/reset`, which clears the cache),
     * the in-memory cache still claims "bootstrapped" and
     * `ensureForSpace` short-circuits forever. The TTL re-check
     * self-heals at the next request after `BOOTSTRAP_CACHE_TTL_MS`
     * elapses; faster recovery requires hitting `/reset`, which
     * calls `clearBootstrapCache` directly.
     */
    it('re-runs the ensure path after the TTL elapses, recreating a missing data view', async () => {
      // Bespoke wiring: the test owns the wall clock via a `now()`
      // override, so it can't share `setup()`'s real-time service
      // instance.
      const internalSoClient = savedObjectsClientMock.create();
      stubFindOnePage(internalSoClient, []);
      const dvService = makeMockDvService();

      let nowMs = 1_700_000_000_000;
      class TtlControlledService extends CasesAnalyticsV2DataViewService {
        protected now(): number {
          return nowMs;
        }
      }
      const parentLogger = loggerMock.create();
      const service = new TtlControlledService({
        logger: parentLogger,
        dataViewsService: makeDataViewsPluginStart(dvService),
        internalSavedObjectsClient: internalSoClient,
        templatesEnabled: true,
      });
      // `logger.get('dataView')` is what the service holds for its
      // own log calls; the parent mock's `.get` returns a child mock
      // by default, so the test resolves the actual instance for
      // assertions.
      const childLogger = (parentLogger.get as jest.Mock).mock.results[0]?.value as ReturnType<
        typeof loggerMock.create
      >;
      const deps = {
        spaceId,
        savedObjectsClient: savedObjectsClientMock.create(),
        esClient: {} as unknown as ElasticsearchClient,
        request: {} as unknown as KibanaRequest,
      };

      // First ensure creates the data view and adds a fresh cache entry.
      stubMissingDataView(dvService);
      await service.ensureForSpace(deps);
      expect(dvService.createAndSave).toHaveBeenCalledTimes(1);

      // Within TTL: cache short-circuits, no extra get/create.
      dvService.get.mockClear();
      dvService.createAndSave.mockClear();
      nowMs += 60_000; // +1 minute
      await service.ensureForSpace(deps);
      expect(dvService.get).not.toHaveBeenCalled();
      expect(dvService.createAndSave).not.toHaveBeenCalled();

      // Past TTL, with the data view deleted out-of-band: ensure
      // re-runs and recreates. The post-TTL re-check logs at DEBUG
      // so support cases ("user reports no data view") can confirm
      // the next request re-checked instead of trusting a stale cache.
      nowMs += 6 * 60_000; // +6 more minutes (well past 5-minute TTL)
      stubMissingDataView(dvService);
      childLogger?.debug.mockClear?.();
      await service.ensureForSpace(deps);
      expect(dvService.get).toHaveBeenCalledTimes(1);
      expect(dvService.createAndSave).toHaveBeenCalledTimes(1);
      if (childLogger) {
        const debugCalls = (childLogger.debug as jest.Mock).mock.calls.map(
          ([msg]: [string]) => msg
        );
        expect(
          debugCalls.some((m) => m.includes('bootstrap cache expired') && m.includes(spaceId))
        ).toBe(true);
      }
    });
  });
});
