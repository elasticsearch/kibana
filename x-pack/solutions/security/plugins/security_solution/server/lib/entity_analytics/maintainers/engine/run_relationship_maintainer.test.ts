/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors as esErrors } from '@elastic/elasticsearch';

import type { ElasticsearchClient } from '@kbn/core/server';
import type { EntityUpdateClient, EntityMetadataClient } from '@kbn/entity-store/server';
import { loggerMock } from '@kbn/logging-mocks';

import {
  runRelationshipMaintainer,
  type RelationshipMaintainerTelemetryCollector,
} from './run_relationship_maintainer';
import { hashEntityId } from './update_entities';
import { COMPOSITE_PAGE_SIZE, MAX_ITERATIONS, LOOKBACK_WINDOW } from './constants';
import type { RelationshipIntegrationConfig } from './types';

interface SearchResponse {
  aggregations?: {
    users: {
      buckets: Array<{ key: Record<string, string | null>; doc_count: number }>;
      after_key?: Record<string, string | null>;
    };
  };
}

interface EsqlResponse {
  columns: Array<{ name: string; type: string }>;
  values: unknown[][];
}

const makeEsClient = (): {
  esClient: ElasticsearchClient;
  search: jest.Mock<Promise<SearchResponse>>;
  esql: jest.Mock<Promise<EsqlResponse>>;
} => {
  const search = jest.fn<Promise<SearchResponse>, unknown[]>();
  const esql = jest.fn<Promise<EsqlResponse>, unknown[]>();
  const esClient = {
    search,
    esql: { query: esql },
  } as unknown as ElasticsearchClient;
  return { esClient, search, esql };
};

const makeClients = (
  errors: Array<{ status: number }> = []
): {
  crudClient: EntityUpdateClient;
  entityMetadataClient: EntityMetadataClient;
  bulkUpdate: jest.Mock;
  bulkAppend: jest.Mock;
} => {
  const bulkUpdate = jest.fn().mockResolvedValue(errors);
  // After writeEntityIds, runIntegration calls the metadata append path on
  // the EntityMetadataClient. Mocked here so tests can assert on the second write.
  const bulkAppend = jest
    .fn()
    .mockImplementation(async (docs: unknown[]) => ({ successful: docs.length, failed: 0 }));
  const crudClient = {
    bulkUpdateEntity: bulkUpdate,
  } as unknown as EntityUpdateClient;
  const entityMetadataClient = {
    bulkAppendMetadata: bulkAppend,
  } as unknown as EntityMetadataClient;
  return { crudClient, entityMetadataClient, bulkUpdate, bulkAppend };
};

const baseConfig: RelationshipIntegrationConfig = {
  kind: 'bucketed',
  id: 'elastic_defend',
  name: 'Elastic Defend',
  indexPattern: (ns) => `logs-endpoint.events.security-${ns}`,
  targetEntityType: 'host',
  bucketTargetByThreshold: {
    threshold: 4,
    aboveThresholdRelationship: 'accesses_frequently',
    belowThresholdRelationship: 'accesses_infrequently',
  },
  requireTargetEntityIdExists: true,
  esqlWhereClause: 'event.action == "log_on" AND event.outcome == "success"',
};

const oktaConfig: RelationshipIntegrationConfig = {
  kind: 'standard',
  id: 'okta',
  name: 'Okta',
  indexPattern: (ns) => `logs-okta.system-${ns}`,
  relationshipKey: 'communicates_with',
  targetEntityType: 'user',
  esqlWhereClause: 'user.target.email IS NOT NULL',
  targetEvalOverride: 'CONCAT("user:", user.target.email, "@okta")',
};

const successResponse = (
  buckets: Array<{ key: Record<string, string | null>; doc_count: number }>,
  afterKey?: Record<string, string | null>
): SearchResponse => ({
  aggregations: { users: { buckets, after_key: afterKey } },
});

const indexNotFoundError = () =>
  new esErrors.ResponseError({
    statusCode: 404,
    body: { error: { type: 'index_not_found_exception' } },
    warnings: null,
    headers: {},
    meta: {} as never,
  });

const responseErrorWithType = (type: string) =>
  new esErrors.ResponseError({
    statusCode: 400,
    body: { error: { type } },
    warnings: null,
    headers: {},
    meta: {} as never,
  });

const realEsError = () => new Error('cluster_block_exception: index read-only');

const aborted = () => {
  const ac = new AbortController();
  ac.abort();
  return ac;
};

describe('runRelationshipMaintainer', () => {
  describe('namespace boundary validation (defense-in-depth)', () => {
    it('throws InvalidNamespaceError before issuing any ES request when namespace is malformed', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      await expect(
        runRelationshipMaintainer({
          esClient,
          logger: loggerMock.create(),
          namespace: 'bad/value',
          crudClient,
          entityMetadataClient,
          integrations: [baseConfig],
        })
      ).rejects.toThrow(/Invalid namespace/);
      // Engine never reached Step 1 / Step 2 / write — precondition guard ran first.
      expect(search).not.toHaveBeenCalled();
      expect(esql).not.toHaveBeenCalled();
      expect(bulkUpdate).not.toHaveBeenCalled();
    });

    it('accepts the conventional "default" namespace', async () => {
      const { esClient, search } = makeEsClient();
      search.mockResolvedValue(successResponse([]));
      const { crudClient, entityMetadataClient } = makeClients();
      await expect(
        runRelationshipMaintainer({
          esClient,
          logger: loggerMock.create(),
          namespace: 'default',
          crudClient,
          entityMetadataClient,
          integrations: [baseConfig],
        })
      ).resolves.toBeDefined();
    });
  });

  describe('run summary surfaces 404 / write-error counts (F.1)', () => {
    it('returns totalNotFound and totalWriteErrors in the summary when bulkUpdate reports them', async () => {
      const { esClient, search, esql } = makeEsClient();
      // Step 1: 1 actor bucket, no after_key (single page).
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice', 'user.email': null }, doc_count: 1 }])
      );
      // Step 2: 1 row produced.
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [['user:alice@corp', 'host:1', null]],
      });
      // bulkUpdate returns one 404 and one 500.
      const { crudClient, entityMetadataClient } = makeClients([{ status: 404 }, { status: 500 }]);
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalNotFound).toBe(1);
      expect(result.totalWriteErrors).toBe(1);
    });

    it('returns zero totalNotFound and zero totalWriteErrors when no records are written (early return path)', async () => {
      const { esClient, search } = makeEsClient();
      search.mockResolvedValue(successResponse([]));
      const { crudClient, entityMetadataClient } = makeClients();
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalNotFound).toBe(0);
      expect(result.totalWriteErrors).toBe(0);
    });

    it('returns zero totalNotFound and zero totalWriteErrors when the abort signal is set before the write', async () => {
      const ac = new AbortController();
      const { esClient, search } = makeEsClient();
      search.mockImplementationOnce(async () => {
        ac.abort();
        return successResponse([]);
      });
      const { crudClient, entityMetadataClient } = makeClients();
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
        abortController: ac,
      });
      expect(result.totalNotFound).toBe(0);
      expect(result.totalWriteErrors).toBe(0);
    });
  });

  it('returns zeros when no integrations are provided', async () => {
    const { esClient } = makeEsClient();
    const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
    const result = await runRelationshipMaintainer({
      esClient,
      logger: loggerMock.create(),
      namespace: 'default',
      crudClient,
      entityMetadataClient,
      integrations: [],
    });
    expect(result.totalBuckets).toBe(0);
    expect(result.totalRecords).toBe(0);
    expect(result.totalWritten).toBe(0);
    expect(result.totalIterations).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.lastRunTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bulkUpdate).not.toHaveBeenCalled();
  });

  it('returns an ISO 8601 lastRunTimestamp', async () => {
    const { esClient } = makeEsClient();
    const { crudClient, entityMetadataClient } = makeClients();
    const before = new Date().toISOString();
    const { lastRunTimestamp } = await runRelationshipMaintainer({
      esClient,
      logger: loggerMock.create(),
      namespace: 'default',
      crudClient,
      entityMetadataClient,
      integrations: [],
    });
    const after = new Date().toISOString();
    expect(lastRunTimestamp >= before).toBe(true);
    expect(lastRunTimestamp <= after).toBe(true);
  });

  describe('composite-agg pagination loop', () => {
    it('terminates when buckets is empty', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockResolvedValueOnce(successResponse([]));
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalBuckets).toBe(0);
      expect(esql).not.toHaveBeenCalled();
    });

    it('iterates pages until after_key is missing (canonical composite-agg termination)', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      const firstPage = Array.from({ length: COMPOSITE_PAGE_SIZE }, (_, i) => ({
        key: { 'user.name': `alice${i}` },
        doc_count: 1,
      }));
      // Last page omits after_key — that's the contract that terminates the loop.
      const lastPage = [{ key: { 'user.name': 'bob' }, doc_count: 1 }];
      search
        .mockResolvedValueOnce(successResponse(firstPage, { 'user.name': 'after' }))
        .mockResolvedValueOnce(successResponse(lastPage /* no after_key */));
      esql.mockResolvedValue({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [],
      });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(search).toHaveBeenCalledTimes(2);
      expect(esql).toHaveBeenCalledTimes(2);
    });

    it('continues paginating when after_key is still present on a partial-size page', async () => {
      // Composite agg can return a partial-size page with after_key still set
      // (e.g. when a sub-aggregation filter drops bucket candidates). The
      // engine must trust after_key, not infer termination from page size.
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      const partialWithAfterKey = [
        { key: { 'user.name': 'alice' }, doc_count: 1 },
        { key: { 'user.name': 'bob' }, doc_count: 1 },
      ];
      const finalPage = [{ key: { 'user.name': 'carol' }, doc_count: 1 }];
      search
        .mockResolvedValueOnce(successResponse(partialWithAfterKey, { 'user.name': 'after' }))
        .mockResolvedValueOnce(successResponse(finalPage /* no after_key */));
      esql.mockResolvedValue({
        columns: [{ name: 'actorUserId', type: 'keyword' }],
        values: [],
      });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      // Two search calls because after_key was still set on the partial page.
      // (Old heuristic would have stopped after one because length < page size.)
      expect(search).toHaveBeenCalledTimes(2);
    });

    it('stops at MAX_ITERATIONS even when after_key keeps coming back', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      const fullPage = Array.from({ length: COMPOSITE_PAGE_SIZE }, (_, i) => ({
        key: { 'user.name': `alice${i}` },
        doc_count: 1,
      }));
      search.mockResolvedValue(successResponse(fullPage, { 'user.name': 'never-ends' }));
      esql.mockResolvedValue({ columns: [], values: [] });
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      // search may have been called MAX_ITERATIONS or MAX_ITERATIONS+1 times
      // depending on the loop's stop point; the contract is that we stopped
      // somewhere around the limit and warned about it.
      expect(search.mock.calls.length).toBeGreaterThanOrEqual(MAX_ITERATIONS);
      expect(search.mock.calls.length).toBeLessThanOrEqual(MAX_ITERATIONS + 1);
      const warns = logger.warn.mock.calls.map((c) => c[0] as string);
      expect(warns.some((m) => m.includes(`MAX_ITERATIONS`))).toBe(true);
      expect(result.totalBuckets).toBeGreaterThanOrEqual(COMPOSITE_PAGE_SIZE * MAX_ITERATIONS);
      expect(result.truncated).toBe(true);
      expect(result.totalIterations).toBe(MAX_ITERATIONS);
    });
  });

  describe('error handling — composite agg (Step 1)', () => {
    it('detects index_not_found_exception via instanceof errors.ResponseError + body.error.type and skips integration without throwing', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      search.mockRejectedValueOnce(indexNotFoundError());
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalBuckets).toBe(0);
      expect(esql).not.toHaveBeenCalled();
      expect(bulkUpdate).not.toHaveBeenCalled();
      const infos = logger.info.mock.calls.map((c) => c[0] as string);
      expect(infos.some((m) => m.includes('not found, skipping'))).toBe(true);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('absorbs a ResponseError with a different error.type — run continues rather than throwing (e.g. cluster_block_exception)', async () => {
      // runIntegration catches all non-abort, non-index-not-found errors and
      // returns outcome: 'error' so the outer loop can continue to other integrations.
      const { esClient, search } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockRejectedValueOnce(responseErrorWithType('cluster_block_exception'));
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalBuckets).toBe(0);
      expect(result.totalWritten).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('absorbs a duck-typed plain object that resembles an index_not_found error — run continues', async () => {
      // Previously re-threw; now runIntegration catches all throws so the outer
      // loop continues. Duck-typed objects still trigger the error path (not
      // recoverable as index_missing) but the run itself does not crash.
      const { esClient, search } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      const duckTyped = { body: { error: { type: 'index_not_found_exception' } } };
      search.mockRejectedValueOnce(duckTyped);
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalBuckets).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns null (does not throw) when the abort signal fires during composite agg', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      const ac = new AbortController();
      search.mockImplementationOnce(async () => {
        ac.abort();
        throw new Error('aborted');
      });
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
        abortController: ac,
      });
      expect(result.totalBuckets).toBe(0);
      expect(esql).not.toHaveBeenCalled();
      expect(bulkUpdate).not.toHaveBeenCalled();
      const infos = logger.info.mock.calls.map((c) => c[0] as string);
      expect(infos.some((m) => m.includes('Aborted during composite aggregation'))).toBe(true);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('absorbs a real (non-aborted, non-index-not-found) ES error — run continues, error is logged', async () => {
      // runIntegration now catches all exceptions and returns outcome: 'error'.
      // The outer loop skips that integration's totals and continues.
      const { esClient, search } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockRejectedValueOnce(realEsError());
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalBuckets).toBe(0);
      expect(result.totalWritten).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('error handling — ES|QL (Step 2)', () => {
    it('returns null when the abort signal fires during ES|QL', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      const ac = new AbortController();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockImplementationOnce(async () => {
        ac.abort();
        throw new Error('aborted');
      });
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
        abortController: ac,
      });
      expect(result.totalBuckets).toBe(1);
      expect(result.totalRecords).toBe(0);
      expect(bulkUpdate).not.toHaveBeenCalled();
      const infos = logger.info.mock.calls.map((c) => c[0] as string);
      expect(infos.some((m) => m.includes('Aborted during ES|QL query'))).toBe(true);
    });

    it('absorbs a real ES|QL error — run continues without writing, error is logged', async () => {
      // runIntegration catches the ES|QL throw, returns outcome: 'error' with
      // partial counts (scanned > 0, qualified = 0). No bulk write occurs.
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockRejectedValueOnce(new Error('parsing_exception: line 1, column 5'));
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalBuckets).toBe(0); // error integration excluded from totals
      expect(result.totalRecords).toBe(0);
      expect(result.totalWritten).toBe(0);
      expect(bulkUpdate).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });

    // Defense in depth: ES|QL responses are typed loosely on the client. A
    // partial-success response or future protocol change could omit the
    // `columns` / `values` arrays. Without a guard, parseTargetsPerActorRows
    // would crash in `.map` with a misleading TypeError.
    describe('response shape guard', () => {
      it('warns and skips the page when columns is not an array', async () => {
        const { esClient, search, esql } = makeEsClient();
        const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
        search.mockResolvedValueOnce(
          successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
        );
        esql.mockResolvedValueOnce({ values: [['user:alice@corp']] } as unknown as EsqlResponse);
        const logger = loggerMock.create();
        const result = await runRelationshipMaintainer({
          esClient,
          logger,
          namespace: 'default',
          crudClient,
          entityMetadataClient,
          integrations: [baseConfig],
        });
        expect(result.totalRecords).toBe(0);
        expect(bulkUpdate).not.toHaveBeenCalled();
        const warns = logger.warn.mock.calls.map((c) => c[0] as string);
        expect(warns.some((m) => m.includes('unexpected response shape'))).toBe(true);
      });

      it('warns and skips the page when values is not an array', async () => {
        const { esClient, search, esql } = makeEsClient();
        const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
        search.mockResolvedValueOnce(
          successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
        );
        esql.mockResolvedValueOnce({
          columns: [{ name: 'actorUserId', type: 'keyword' }],
        } as unknown as EsqlResponse);
        const logger = loggerMock.create();
        const result = await runRelationshipMaintainer({
          esClient,
          logger,
          namespace: 'default',
          crudClient,
          entityMetadataClient,
          integrations: [baseConfig],
        });
        expect(result.totalRecords).toBe(0);
        expect(bulkUpdate).not.toHaveBeenCalled();
        const warns = logger.warn.mock.calls.map((c) => c[0] as string);
        expect(warns.some((m) => m.includes('unexpected response shape'))).toBe(true);
      });

      it('does NOT throw when both columns and values are missing (the original crash mode)', async () => {
        const { esClient, search, esql } = makeEsClient();
        const { crudClient, entityMetadataClient } = makeClients();
        search.mockResolvedValueOnce(
          successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
        );
        esql.mockResolvedValueOnce({} as unknown as EsqlResponse);
        await expect(
          runRelationshipMaintainer({
            esClient,
            logger: loggerMock.create(),
            namespace: 'default',
            crudClient,
            entityMetadataClient,
            integrations: [baseConfig],
          })
        ).resolves.toBeDefined();
      });
    });
  });

  describe('abort handling — outer integration loop', () => {
    it('does not call any ES API when aborted before the first integration', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
        abortController: aborted(),
      });
      expect(search).not.toHaveBeenCalled();
      expect(esql).not.toHaveBeenCalled();
      expect(bulkUpdate).not.toHaveBeenCalled();
      expect(result.totalWritten).toBe(0);
    });

    it('skips remaining integrations once aborted during the first one', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      const ac = new AbortController();
      // Integration #1: search returns a bucket, then ES|QL aborts the controller.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockImplementationOnce(async () => {
        ac.abort();
        throw new Error('aborted');
      });
      // Integration #2 should never reach the ES client. If it does, this
      // unmocked call would return undefined and the test would crash with
      // a TypeError — making the regression highly visible.
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
        abortController: ac,
      });
      expect(search).toHaveBeenCalledTimes(1); // only integration #1 ran
      expect(esql).toHaveBeenCalledTimes(1);
      expect(result.totalBuckets).toBe(1);
      expect(result.totalRecords).toBe(0);
      expect(bulkUpdate).not.toHaveBeenCalled();
    });

    it('does not call bulkUpdateEntity when aborted during an integration that produced zero records', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      const ac = new AbortController();
      // Integration completes one page, then aborts during esql with zero records collected.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockImplementationOnce(async () => {
        ac.abort();
        throw new Error('aborted');
      });
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
        abortController: ac,
      });
      // With streamed per-integration write (C.3): the integration produced
      // zero records so `writeEntityIds` early-returns without ever calling
      // `bulkUpdateEntity`. There is no separate "skip the final write" path
      // because there is no longer a final write — writes are streamed.
      expect(result.totalWritten).toBe(0);
      expect(bulkUpdate).not.toHaveBeenCalled();
    });
  });

  describe('aggregation across integrations and pages (streamed per-integration write — C.3)', () => {
    it('sums totalBuckets and totalRecords across all integrations and writes per-integration (one bulkUpdate per integration, not one global)', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      // baseConfig: 2 buckets, 1 esql record.
      search.mockResolvedValueOnce(
        successResponse([
          { key: { 'user.name': 'alice' }, doc_count: 1 },
          { key: { 'user.name': 'bob' }, doc_count: 1 },
        ])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [['user:alice@corp', ['host:H1'], null]],
      });
      // oktaConfig: 1 bucket, 1 esql record.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'carol' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'communicates_with', type: 'keyword' },
        ],
        values: [['user:carol@okta', ['user:dave@okta']]],
      });
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
      });
      expect(result.totalBuckets).toBe(3);
      expect(result.totalRecords).toBe(2);
      // Streamed writes: one bulkUpdate per integration that produced records.
      // Memory is bounded by one integration's records, not the cross-integration sum.
      expect(bulkUpdate).toHaveBeenCalledTimes(2);
      expect(result.totalWritten).toBe(2);
    });

    it('does not call bulkUpdateEntity for an integration that produced zero records (skip-empty optimization)', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      // baseConfig: 1 bucket, 1 esql record.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [['user:alice@corp', ['host:H1'], null]],
      });
      // oktaConfig: 0 buckets — no records produced.
      search.mockResolvedValueOnce(successResponse([]));
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
      });
      expect(result.totalRecords).toBe(1);
      expect(bulkUpdate).toHaveBeenCalledTimes(1);
    });

    it('persists already-completed integrations even if a later integration aborts (best-effort streaming)', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate } = makeClients();
      const ac = new AbortController();
      // baseConfig: completes normally.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [['user:alice@corp', ['host:H1'], null]],
      });
      // After baseConfig writes, abort. oktaConfig should be skipped entirely.
      bulkUpdate.mockImplementationOnce(async () => {
        ac.abort();
        return [];
      });
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
        abortController: ac,
      });
      // baseConfig wrote 1 entity before the abort fired.
      expect(result.totalWritten).toBe(1);
      // oktaConfig was skipped entirely.
      expect(search).toHaveBeenCalledTimes(1);
      expect(esql).toHaveBeenCalledTimes(1);
      // Exactly one bulkUpdate (baseConfig); oktaConfig never reached the write.
      expect(bulkUpdate).toHaveBeenCalledTimes(1);
    });

    it('uses the configured indexPattern per integration', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockResolvedValue(successResponse([]));
      esql.mockResolvedValue({ columns: [], values: [] });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'prod',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
      });
      const indexes = search.mock.calls.map((c) => (c[0] as { index: string }).index);
      expect(indexes).toEqual(['logs-endpoint.events.security-prod', 'logs-okta.system-prod']);
    });
  });

  describe('transport options', () => {
    it('does not pass an AbortSignal to the ES client when no abortController is provided', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({ columns: [], values: [] });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(search.mock.calls[0][1]).toBeUndefined();
      expect(esql.mock.calls[0][1]).toBeUndefined();
    });

    it('passes the AbortSignal to both search and esql.query when abortController is provided', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({ columns: [], values: [] });
      const ac = new AbortController();
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
        abortController: ac,
      });
      expect((search.mock.calls[0][1] as { signal: AbortSignal }).signal).toBe(ac.signal);
      expect((esql.mock.calls[0][1] as { signal: AbortSignal }).signal).toBe(ac.signal);
    });
  });

  describe('ES|QL request shape', () => {
    it('passes the @timestamp range and bucket-derived terms filter to esql.query', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({ columns: [], values: [] });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      const [esqlArg] = esql.mock.calls[0] as [
        { query: string; filter: { bool: { filter: unknown[] } } }
      ];
      const filterStr = JSON.stringify(esqlArg.filter);
      expect(filterStr).toContain('@timestamp');
      expect(filterStr).toContain('alice');
      expect(esqlArg.query).toContain('FROM logs-endpoint.events.security-default');
    });

    it('omits the @timestamp range from the esql.query filter when disableLookbackWindow is true', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({ columns: [], values: [] });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [{ ...baseConfig, disableLookbackWindow: true }],
      });
      const [esqlArg] = esql.mock.calls[0] as [
        { query: string; filter: { bool: { filter: unknown[] } } }
      ];
      const filterStr = JSON.stringify(esqlArg.filter);
      // No lookback range, but the bucket-derived actor terms filter remains.
      expect(filterStr).not.toContain('@timestamp');
      expect(filterStr).toContain('alice');
    });
  });

  describe('write-path wiring (bulkAppendMetadata)', () => {
    const oneActorOneTarget = (esql: jest.Mock) => {
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [['user:alice@corp', ['host:H1'], null]],
      });
    };

    it('calls bulkAppendMetadata after writeEntityIds for each integration that produced records', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkUpdate, bulkAppend } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      oneActorOneTarget(esql);
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(bulkUpdate).toHaveBeenCalledTimes(1);
      expect(bulkAppend).toHaveBeenCalledTimes(1);
      // writeEntityIds (latest index) must precede the metadata append so the
      // entity exists when an external reader joins on entity.id.
      const updateOrder = bulkUpdate.mock.invocationCallOrder[0];
      const appendOrder = bulkAppend.mock.invocationCallOrder[0];
      expect(appendOrder).toBeGreaterThan(updateOrder);
    });

    it('does NOT call bulkAppendMetadata when no records were produced', async () => {
      const { esClient, search } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkAppend } = makeClients();
      search.mockResolvedValueOnce(successResponse([]));
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(bulkAppend).not.toHaveBeenCalled();
    });

    it('does not write metadata for actors whose entity update returned a non-success status (404/500)', async () => {
      // alice gets a 404 (entity not yet in store), bob succeeds.
      // Metadata should only contain docs for bob, never alice.
      const { esClient, search, esql } = makeEsClient();
      const aliceHash = hashEntityId('user:alice@corp');
      const { entityMetadataClient, bulkAppend } = makeClients();
      const crudClient = {
        bulkUpdateEntity: jest
          .fn()
          .mockResolvedValue([{ _id: aliceHash, status: 404, type: 'not_found', reason: '' }]),
      } as unknown as EntityUpdateClient;
      search.mockResolvedValueOnce(
        successResponse([
          { key: { 'user.name': 'alice' }, doc_count: 2 },
          { key: { 'user.name': 'bob' }, doc_count: 1 },
        ])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [
          ['user:alice@corp', ['host:H1'], null],
          ['user:bob@corp', ['host:H2'], null],
        ],
      });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      const [docs] = bulkAppend.mock.calls[0] as [Array<Record<string, unknown>>];
      const actorIds = docs.map((d) => d['entity.id']);
      expect(actorIds).not.toContain('user:alice@corp');
      expect(actorIds).toContain('user:bob@corp');
    });

    it('reuses one scanId across every integration in a single run', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkAppend } = makeClients();
      // baseConfig produces a record.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      oneActorOneTarget(esql);
      // oktaConfig produces a record.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'carol' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'communicates_with', type: 'keyword' },
        ],
        values: [['user:carol@okta', ['user:dave@okta']]],
      });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
      });
      expect(bulkAppend).toHaveBeenCalledTimes(2);
      const scanIds = bulkAppend.mock.calls.flatMap(([docs]) =>
        (docs as Array<{ Maintainer: { scan_id: string } }>).map((d) => d.Maintainer.scan_id)
      );
      expect(new Set(scanIds).size).toBe(1);
      expect(scanIds[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('reuses one observedAt timestamp across every integration in a single run', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkAppend } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      oneActorOneTarget(esql);
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'carol' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'communicates_with', type: 'keyword' },
        ],
        values: [['user:carol@okta', ['user:dave@okta']]],
      });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
      });
      const timestamps = bulkAppend.mock.calls.flatMap(([docs]) =>
        (docs as Array<{ '@timestamp': string }>).map((d) => d['@timestamp'])
      );
      expect(new Set(timestamps).size).toBe(1);
    });

    it('passes entity.source = config.id per integration', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkAppend } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      oneActorOneTarget(esql);
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'carol' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'communicates_with', type: 'keyword' },
        ],
        values: [['user:carol@okta', ['user:dave@okta']]],
      });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
      });
      const sourcesPerCall = bulkAppend.mock.calls.map(([docs]) => {
        const set = new Set(
          (docs as Array<{ 'entity.source': string }>).map((d) => d['entity.source'])
        );
        return [...set];
      });
      expect(sourcesPerCall).toEqual([['elastic_defend'], ['okta']]);
    });

    it('fans one record with multiple targets into one metadata doc per target', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkAppend } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [['user:alice@corp', ['host:H1', 'host:H2', 'host:H3'], null]],
      });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      const [docs] = bulkAppend.mock.calls[0] as [Array<Record<string, unknown>>];
      expect(docs).toHaveLength(3);
    });

    it('absorbs bulkAppendMetadata transport errors without crashing the run (outcome: error logged)', async () => {
      // runIntegration wraps writes in try/catch — a metadata transport failure
      // sets outcome: 'error' for that integration rather than propagating.
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkAppend } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      oneActorOneTarget(esql);
      bulkAppend.mockRejectedValueOnce(new Error('metadata transport failure'));
      const logger = loggerMock.create();
      const result = await runRelationshipMaintainer({
        esClient,
        logger,
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(result.totalWritten).toBe(0); // error integration excluded from totals
      expect(logger.error).toHaveBeenCalled();
    });

    it('sets Maintainer.kind to the relationship kind and Maintainer.lookback_window to LOOKBACK_WINDOW on every emitted doc', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkAppend } = makeClients();
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      oneActorOneTarget(esql);
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      const [docs] = bulkAppend.mock.calls[0] as [
        Array<{ Maintainer: { kind: string; lookback_window: string } }>
      ];
      expect(docs.length).toBeGreaterThan(0);
      for (const d of docs) {
        // Maintainer.kind mirrors the relationship kind written (relType), not
        // the maintainer engine name. baseConfig emits 'accesses_frequently' docs.
        expect(d.Maintainer.kind).toBe('accesses_frequently');
        // Lookback window mirrors the engine constant LOOKBACK_WINDOW
        // (`engine/constants.ts:8`) — assert against the imported constant so
        // this test stays correct if the engine's lookback period changes.
        expect(d.Maintainer.lookback_window).toBe(LOOKBACK_WINDOW);
      }
    });

    it('produces a fresh scan_id on each runRelationshipMaintainer invocation (different runs → different ids)', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient, bulkAppend } = makeClients();
      // First run.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      oneActorOneTarget(esql);
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      // Second run.
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'bob' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [['user:bob@corp', ['host:H2'], null]],
      });
      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });
      expect(bulkAppend).toHaveBeenCalledTimes(2);
      const [run1Docs] = bulkAppend.mock.calls[0] as [Array<{ Maintainer: { scan_id: string } }>];
      const [run2Docs] = bulkAppend.mock.calls[1] as [Array<{ Maintainer: { scan_id: string } }>];
      expect(run1Docs[0].Maintainer.scan_id).not.toBe(run2Docs[0].Maintainer.scan_id);
    });
  });

  describe('telemetryCollector', () => {
    it('populates telemetryCollector.sources with one entry per integration', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();

      // elastic_defend: 1 actor bucket, 0 records (esql empty)
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 5 }])
      );
      esql.mockResolvedValueOnce({ columns: [], values: [] });
      // okta: empty (no actor buckets)
      search.mockResolvedValueOnce(successResponse([]));

      const collector: RelationshipMaintainerTelemetryCollector = {
        sources: [],
        relationshipTypeApplied: {},
      };

      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
        telemetryCollector: collector,
      });

      expect(collector.sources).toHaveLength(2);
      expect(collector.sources[0]).toMatchObject({
        id: 'elastic_defend',
        scanned: 1,
        qualified: 0,
        outcome: 'producing',
      });
      expect(collector.sources[1]).toMatchObject({
        id: 'okta',
        scanned: 0,
        qualified: 0,
        outcome: 'empty',
      });
    });

    it('records outcome: error and partial counts when integration throws', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();

      // elastic_defend: 1 actor bucket succeeds, esql throws → error
      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 5 }])
      );
      esql.mockRejectedValueOnce(new Error('boom'));

      const collector: RelationshipMaintainerTelemetryCollector = {
        sources: [],
        relationshipTypeApplied: {},
      };

      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
        telemetryCollector: collector,
      });

      expect(collector.sources).toHaveLength(1);
      expect(collector.sources[0]).toMatchObject({
        id: 'elastic_defend',
        scanned: 1, // partial: composite agg succeeded before esql failed
        qualified: 0, // no records parsed
        outcome: 'error',
      });
    });

    it('records outcome: index_missing when actor index does not exist', async () => {
      const { esClient, search } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockRejectedValueOnce(indexNotFoundError());

      const collector: RelationshipMaintainerTelemetryCollector = {
        sources: [],
        relationshipTypeApplied: {},
      };

      await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
        telemetryCollector: collector,
      });

      expect(collector.sources[0]).toMatchObject({
        id: 'elastic_defend',
        scanned: 0,
        qualified: 0,
        outcome: 'index_missing',
      });
    });

    it('continues to remaining integrations when one integration throws', async () => {
      const { esClient, search } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();

      // First integration throws on search; second succeeds with empty results.
      search
        .mockRejectedValueOnce(new Error('boom')) // elastic_defend search fails
        .mockResolvedValueOnce(successResponse([])); // okta search returns empty

      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig, oktaConfig],
      });

      // The first integration's failure should NOT throw; the loop should continue.
      // Totals reflect ONLY the successful (empty) second integration.
      expect(result.totalBuckets).toBe(0);
      expect(result.totalRecords).toBe(0);
      expect(search).toHaveBeenCalledTimes(2);
    });

    it('does not populate collector when telemetryCollector is not provided', async () => {
      const { esClient, search } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      search.mockResolvedValueOnce(successResponse([]));

      // No error expected — the function just doesn't populate a collector
      const result = await runRelationshipMaintainer({
        esClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });

      expect(result.totalBuckets).toBe(0);
    });
  });

  describe('CPS read client routing', () => {
    it('uses cpsEsClient for both search and esql.query when provided, leaving esClient untouched', async () => {
      const { esClient, search: localSearch, esql: localEsql } = makeEsClient();
      const { esClient: cpsEsClient, search: cpsSearch, esql: cpsEsql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();
      const collector: RelationshipMaintainerTelemetryCollector = {
        sources: [],
        relationshipTypeApplied: {},
      };

      cpsSearch.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      cpsEsql.mockResolvedValueOnce({
        columns: [
          { name: 'actorUserId', type: 'keyword' },
          { name: 'accesses_frequently', type: 'keyword' },
          { name: 'accesses_infrequently', type: 'keyword' },
        ],
        values: [['user:alice@corp', ['host:H1'], null]],
      });

      await runRelationshipMaintainer({
        esClient,
        cpsEsClient,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
        telemetryCollector: collector,
      });

      expect(cpsSearch).toHaveBeenCalledTimes(1);
      expect(cpsEsql).toHaveBeenCalledTimes(1);
      expect(localSearch).not.toHaveBeenCalled();
      expect(localEsql).not.toHaveBeenCalled();
    });

    it('falls back to esClient for reads when cpsEsClient is undefined', async () => {
      const { esClient, search, esql } = makeEsClient();
      const { crudClient, entityMetadataClient } = makeClients();

      search.mockResolvedValueOnce(
        successResponse([{ key: { 'user.name': 'alice' }, doc_count: 1 }])
      );
      esql.mockResolvedValueOnce({ columns: [], values: [] });

      await runRelationshipMaintainer({
        esClient,
        cpsEsClient: undefined,
        logger: loggerMock.create(),
        namespace: 'default',
        crudClient,
        entityMetadataClient,
        integrations: [baseConfig],
      });

      expect(search).toHaveBeenCalledTimes(1);
      expect(esql).toHaveBeenCalledTimes(1);
    });
  });
});
