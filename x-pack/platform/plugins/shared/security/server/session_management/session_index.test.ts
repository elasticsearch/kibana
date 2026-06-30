/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type {
  BulkResponse,
  ClosePointInTimeResponse,
  DeleteByQueryResponse,
  MsearchMultiSearchResult,
  OpenPointInTimeResponse,
  SearchResponse,
} from '@elastic/elasticsearch/lib/api/types';

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { AuditLogger } from '@kbn/security-plugin-types-server';
import { type RunContext, TaskStatus } from '@kbn/task-manager-plugin/server';

import {
  getSessionIndexSettings,
  SESSION_INDEX_MAPPINGS_VERSION_META_FIELD_NAME,
  SessionIndex,
} from './session_index';
import { sessionIndexMock } from './session_index.mock';
import { auditLoggerMock } from '../audit/mocks';
import { AnonymousAuthenticationProvider } from '../authentication';
import { ConfigSchema, createConfig } from '../config';
import { securityMock } from '../mocks';

describe('Session index', () => {
  let mockElasticsearchClient: ReturnType<
    typeof elasticsearchServiceMock.createElasticsearchClient
  >;
  let sessionIndex: SessionIndex;
  let auditLogger: AuditLogger;
  const indexName = '.kibana_some_tenant_security_session_1';
  const aliasName = '.kibana_some_tenant_security_session';
  const indexTemplateName = '.kibana_some_tenant_security_session_index_template_1';

  const mockRunContext: RunContext = {
    taskInstance: {
      id: 'TASK_ID',
      taskType: 'TASK_TYPE',
      params: {},
      state: {},
      scheduledAt: new Date(),
      attempts: 0,
      retryAt: new Date(),
      ownerId: 'OWNER_ID',
      startedAt: new Date(),
      runAt: new Date(),
      status: TaskStatus.Idle,
    },
    abortController: new AbortController(),
    executionUuid: 'test-execution-uuid',
  };

  const createSessionIndexOptions = (
    config: Record<string, any> = { session: { idleTimeout: null, lifespan: null } }
  ) => ({
    logger: loggingSystemMock.createLogger(),
    kibanaIndexName: '.kibana_some_tenant',
    config: createConfig(ConfigSchema.validate(config), loggingSystemMock.createLogger(), {
      isTLSEnabled: false,
    }),
    elasticsearchClient: mockElasticsearchClient,
    auditLogger,
  });

  beforeEach(() => {
    mockElasticsearchClient = elasticsearchServiceMock.createElasticsearchClient();
    auditLogger = auditLoggerMock.create();
    sessionIndex = new SessionIndex(createSessionIndexOptions());
  });

  describe('#initialize', () => {
    function assertExistenceChecksPerformed() {
      expect(mockElasticsearchClient.indices.existsTemplate).toHaveBeenCalledWith({
        name: indexTemplateName,
      });
      expect(mockElasticsearchClient.indices.existsIndexTemplate).toHaveBeenCalledWith({
        name: indexTemplateName,
      });
      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledWith({
        index: aliasName,
      });
    }

    it('debounces initialize calls', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockResponse(true);

      await Promise.all([
        sessionIndex.initialize(),
        sessionIndex.initialize(),
        sessionIndex.initialize(),
        sessionIndex.initialize(),
      ]);

      assertExistenceChecksPerformed();
    });

    it('does not delete legacy index template if it does not exist and creates neither index template nor index if they exist', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockResponse(true);

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.putIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();
    });

    it('does not create index if alias exists', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockImplementation(
        async ({ index }) => index === aliasName
      );

      await sessionIndex.initialize();

      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledWith({ index: aliasName });
      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.putAlias).not.toHaveBeenCalled();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.putIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();
    });

    it('does not create index if index exists', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockImplementation(
        async ({ index }) => index === indexName
      );

      await sessionIndex.initialize();

      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledWith({ index: aliasName });
      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledWith({ index: indexName });
      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledTimes(2);

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.putIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();
    });

    it('creates index if neither index or alias exists', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockResponse(false);

      await sessionIndex.initialize();

      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledWith({ index: aliasName });
      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledWith({ index: indexName });
      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.indices.putAlias).not.toHaveBeenCalled();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.putIndexTemplate).not.toHaveBeenCalled();

      expect(mockElasticsearchClient.indices.create).toHaveBeenCalled();
    });

    it('attaches alias if no alias present', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockImplementation(
        async ({ index }) => index === indexName
      );
      mockElasticsearchClient.indices.existsAlias.mockResponse(false);

      await sessionIndex.initialize();

      expect(mockElasticsearchClient.indices.existsAlias).toHaveBeenCalledWith({ name: aliasName });
      expect(mockElasticsearchClient.indices.putAlias).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.putAlias).toHaveBeenCalledWith({
        index: indexName,
        name: aliasName,
      });

      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();
    });

    it('does not attach alias if alias present', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockResponse(true);
      mockElasticsearchClient.indices.existsAlias.mockResponse(true);

      await sessionIndex.initialize();

      expect(mockElasticsearchClient.indices.existsAlias).toHaveBeenCalledWith({ name: aliasName });
      expect(mockElasticsearchClient.indices.putAlias).not.toHaveBeenCalled();

      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();
    });

    it('does not delete legacy index template if the legacy template API is not available (410)', async () => {
      const goneError = new errors.ResponseError(
        securityMock.createApiResponse(
          securityMock.createApiResponse({ body: { type: 'And it is gone!' }, statusCode: 410 })
        )
      );
      mockElasticsearchClient.indices.existsTemplate.mockRejectedValueOnce(goneError);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(false);
      mockElasticsearchClient.indices.exists.mockResponse(false);

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.getMapping).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.putMapping).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledWith(
        getSessionIndexSettings({ indexName, aliasName })
      );
    });

    it('does not delete legacy index template if the legacy template API is not available (404)', async () => {
      const goneError = new errors.ResponseError(
        securityMock.createApiResponse(
          securityMock.createApiResponse({ body: { type: 'And it is gone!' }, statusCode: 404 })
        )
      );
      mockElasticsearchClient.indices.existsTemplate.mockRejectedValueOnce(goneError);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(false);
      mockElasticsearchClient.indices.exists.mockResponse(false);

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.getMapping).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.putMapping).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledWith(
        getSessionIndexSettings({ indexName, aliasName })
      );
    });

    it('deletes legacy index template if needed and creates index if it does not exist', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(true);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(false);
      mockElasticsearchClient.indices.exists.mockResponse(false);

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();
      expect(mockElasticsearchClient.indices.deleteTemplate).toHaveBeenCalledWith({
        name: indexTemplateName,
      });
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledWith(
        getSessionIndexSettings({ indexName, aliasName })
      );
    });

    it('deletes legacy & modern index templates if needed and creates index if it does not exist', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(true);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockResponse(false);

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();
      expect(mockElasticsearchClient.indices.deleteTemplate).toHaveBeenCalledWith({
        name: indexTemplateName,
      });
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).toHaveBeenCalledWith({
        name: indexTemplateName,
      });
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledWith(
        getSessionIndexSettings({ indexName, aliasName })
      );
    });

    it('deletes modern index template if needed and creates index if it does not exist', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockResponse(false);

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();
      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).toHaveBeenCalledWith({
        name: indexTemplateName,
      });

      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledWith(
        getSessionIndexSettings({ indexName, aliasName })
      );
    });

    it('attaches an alias to the index if the index already exists', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(false);
      mockElasticsearchClient.indices.exists.mockResponse(true);

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();
    });

    it('updates mappings for existing index without version in the meta', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(false);
      mockElasticsearchClient.indices.exists.mockResponse(true);
      mockElasticsearchClient.indices.getMapping.mockResolvedValue({
        [indexName]: {
          mappings: { _meta: {} },
        },
      });

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();

      expect(mockElasticsearchClient.indices.getMapping).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.getMapping).toHaveBeenCalledWith({ index: aliasName });
      expect(mockElasticsearchClient.indices.putMapping).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.putMapping).toHaveBeenCalledWith({
        index: aliasName,
        ...getSessionIndexSettings({ indexName, aliasName }).mappings,
      });
    });

    it('updates mappings for existing index if version in meta is lower than the current version', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(false);
      mockElasticsearchClient.indices.exists.mockResponse(true);
      mockElasticsearchClient.indices.getMapping.mockResolvedValue({
        [indexName]: {
          mappings: { _meta: { [SESSION_INDEX_MAPPINGS_VERSION_META_FIELD_NAME]: '8.6.9' } },
        },
      });

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();

      expect(mockElasticsearchClient.indices.getMapping).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.getMapping).toHaveBeenCalledWith({ index: aliasName });
      expect(mockElasticsearchClient.indices.putMapping).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.putMapping).toHaveBeenCalledWith({
        index: aliasName,
        ...getSessionIndexSettings({ indexName, aliasName }).mappings,
      });
    });

    it('does not update mappings for existing index if version in meta is greater or equal to the current version', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(false);
      mockElasticsearchClient.indices.exists.mockResponse(true);
      mockElasticsearchClient.indices.getMapping.mockResolvedValue({
        [indexName]: {
          mappings: { _meta: { [SESSION_INDEX_MAPPINGS_VERSION_META_FIELD_NAME]: '8.7.0' } },
        },
      });

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();

      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();

      expect(mockElasticsearchClient.indices.getMapping).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.getMapping).toHaveBeenCalledWith({ index: aliasName });
      expect(mockElasticsearchClient.indices.putMapping).not.toHaveBeenCalled();
    });

    it('creates index if it does not exist', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(false);
      mockElasticsearchClient.indices.exists.mockResponse(false);

      await sessionIndex.initialize();

      assertExistenceChecksPerformed();
      expect(mockElasticsearchClient.indices.deleteTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.deleteIndexTemplate).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.getMapping).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.putMapping).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledWith(
        getSessionIndexSettings({ indexName, aliasName })
      );
    });

    it('does not fail if tries to create index when it exists already', async () => {
      mockElasticsearchClient.indices.existsTemplate.mockResponse(false);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);
      mockElasticsearchClient.indices.exists.mockResponse(false);
      mockElasticsearchClient.indices.create.mockRejectedValue(
        new errors.ResponseError(
          securityMock.createApiResponse({
            body: { error: { type: 'resource_already_exists_exception' } },
          })
        )
      );

      await sessionIndex.initialize();
    });

    it('works properly after failure', async () => {
      const unexpectedError = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.indices.existsIndexTemplate.mockRejectedValueOnce(unexpectedError);
      mockElasticsearchClient.indices.existsIndexTemplate.mockResponse(true);

      await expect(sessionIndex.initialize()).rejects.toBe(unexpectedError);
      await expect(sessionIndex.initialize()).resolves.toBe(undefined);
    });
  });

  describe('#cleanUp', () => {
    const now = 123456;
    const sessionValue = {
      _id: 'SESSION_ID',
      _source: { usernameHash: 'USERNAME_HASH', provider: { name: 'basic1', type: 'basic' } },
      sort: [0],
    };

    beforeEach(() => {
      mockElasticsearchClient.openPointInTime.mockResponse({
        id: 'PIT_ID',
      } as OpenPointInTimeResponse);
      mockElasticsearchClient.closePointInTime.mockResponse({
        succeeded: true,
        num_freed: 1,
      } as ClosePointInTimeResponse);
      mockElasticsearchClient.search.mockResponse({
        hits: { hits: [sessionValue] },
      } as SearchResponse);
      mockElasticsearchClient.bulk.mockResponse({ items: [{}] } as BulkResponse);
      jest.spyOn(Date, 'now').mockImplementation(() => now);
    });

    it('uses refreshed `pit_id` for subsequent searches and closePointInTime', async () => {
      const firstBatch = Array.from({ length: 10_000 }, () => sessionValue);

      mockElasticsearchClient.search.mockResponseOnce({
        pit_id: 'PIT_ID_2',
        hits: { hits: firstBatch },
      } as SearchResponse);
      mockElasticsearchClient.search.mockResponseOnce({
        pit_id: 'PIT_ID_3',
        hits: { hits: [] },
      } as unknown as SearchResponse);

      // Consume the generator directly to avoid the heavy cleanup flow (bulk deletes + audit logs).
      for await (const _ of (sessionIndex as any).getSessionValuesInBatches()) {
        // no-op
      }

      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.search.mock.calls[0][0]).toEqual(
        expect.objectContaining({ pit: expect.objectContaining({ id: 'PIT_ID' }) })
      );
      expect(mockElasticsearchClient.search.mock.calls[1][0]).toEqual(
        expect.objectContaining({ pit: expect.objectContaining({ id: 'PIT_ID_2' }) })
      );

      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledWith({
        id: 'PIT_ID_3',
      });
    });

    it('throws if search call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.search.mockRejectedValue(failureReason);

      await expect(sessionIndex.cleanUp(mockRunContext)).rejects.toBe(failureReason);
      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.refresh).not.toHaveBeenCalled(); // since the search failed, we don't refresh the index
    });

    it('throws if bulk delete call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.bulk.mockRejectedValue(failureReason);

      await expect(sessionIndex.cleanUp(mockRunContext)).rejects.toBe(failureReason);
      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1); // since we attempted to delete sessions, we still refresh the index
    });

    it('does not throw if index refresh call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.indices.refresh.mockRejectedValue(failureReason);

      await sessionIndex.cleanUp(mockRunContext);
      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1); // since we attempted to delete sessions, we still refresh the index
    });

    it('creates the index/alias if missing', async () => {
      mockElasticsearchClient.indices.exists.mockResponse(false);

      let callCount = 0;
      mockElasticsearchClient.openPointInTime.mockResponseImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { statusCode: 404 };
        }

        return {
          body: {
            id: 'PIT_ID',
          } as OpenPointInTimeResponse,
        };
      });

      await sessionIndex.cleanUp(mockRunContext);
      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.openPointInTime).toHaveBeenNthCalledWith(
        1,
        {
          index: aliasName,
          keep_alive: '5m',
          allow_partial_search_results: true,
        },
        { ignore: [404], meta: true }
      );
      expect(mockElasticsearchClient.openPointInTime).toHaveBeenNthCalledWith(
        2,
        {
          index: aliasName,
          keep_alive: '5m',
          allow_partial_search_results: true,
        },
        { meta: true }
      );

      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1); // since we attempted to delete sessions, we still refresh the index
    });

    it('when neither `lifespan` nor `idleTimeout` is configured', async () => {
      await sessionIndex.cleanUp(mockRunContext);

      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        _source_includes: 'usernameHash,provider',
        sort: '_shard_doc',
        track_total_hits: false,
        search_after: undefined,
        size: 10_000,
        pit: {
          id: 'PIT_ID',
          keep_alive: '5m',
        },
        query: {
          bool: {
            should: [
              // All expired sessions based on the lifespan, no matter which provider they belong to.
              { range: { lifespanExpiration: { lte: now } } },
              // All sessions that belong to the providers that aren't configured.
              {
                bool: {
                  must_not: {
                    bool: {
                      should: [
                        {
                          bool: {
                            must: [
                              { term: { 'provider.type': 'basic' } },
                              { term: { 'provider.name': 'basic' } },
                            ],
                          },
                        },
                      ],
                      minimum_should_match: 1,
                    },
                  },
                },
              },
              // The sessions that belong to a particular provider that are expired based on the idle timeout.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'basic' } },
                    { term: { 'provider.name': 'basic' } },
                  ],
                  should: [{ range: { idleTimeoutExpiration: { lte: now } } }],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
      });
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith(
        {
          index: aliasName,
          operations: [{ delete: { _id: sessionValue._id } }],
          refresh: false,
          require_alias: true,
        },
        {
          ignore: [409, 404],
        }
      );
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1);
    });

    it('when only `lifespan` is configured', async () => {
      sessionIndex = new SessionIndex({
        logger: loggingSystemMock.createLogger(),
        kibanaIndexName: '.kibana_some_tenant',
        config: createConfig(
          ConfigSchema.validate({ session: { idleTimeout: null, lifespan: 456 } }),
          loggingSystemMock.createLogger(),
          { isTLSEnabled: false }
        ),
        elasticsearchClient: mockElasticsearchClient,
        auditLogger,
      });

      await sessionIndex.cleanUp(mockRunContext);

      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        _source_includes: 'usernameHash,provider',
        sort: '_shard_doc',
        track_total_hits: false,
        search_after: undefined,
        size: 10_000,
        pit: {
          id: 'PIT_ID',
          keep_alive: '5m',
        },
        query: {
          bool: {
            should: [
              // All expired sessions based on the lifespan, no matter which provider they belong to.
              { range: { lifespanExpiration: { lte: now } } },
              // All sessions that belong to the providers that aren't configured.
              {
                bool: {
                  must_not: {
                    bool: {
                      should: [
                        {
                          bool: {
                            must: [
                              { term: { 'provider.type': 'basic' } },
                              { term: { 'provider.name': 'basic' } },
                            ],
                          },
                        },
                      ],
                      minimum_should_match: 1,
                    },
                  },
                },
              },
              // The sessions that belong to a particular provider but don't have a configured lifespan.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'basic' } },
                    { term: { 'provider.name': 'basic' } },
                  ],
                  must_not: { exists: { field: 'lifespanExpiration' } },
                },
              },
              // The sessions that belong to a particular provider that are expired based on the idle timeout.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'basic' } },
                    { term: { 'provider.name': 'basic' } },
                  ],
                  should: [{ range: { idleTimeoutExpiration: { lte: now } } }],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
      });
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith(
        {
          index: aliasName,
          operations: [{ delete: { _id: sessionValue._id } }],
          refresh: false,
          require_alias: true,
        },
        {
          ignore: [409, 404],
        }
      );
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
    });

    it('when only `idleTimeout` is configured', async () => {
      const idleTimeout = 123;
      sessionIndex = new SessionIndex({
        logger: loggingSystemMock.createLogger(),
        kibanaIndexName: '.kibana_some_tenant',
        config: createConfig(
          ConfigSchema.validate({ session: { idleTimeout, lifespan: null } }),
          loggingSystemMock.createLogger(),
          { isTLSEnabled: false }
        ),
        elasticsearchClient: mockElasticsearchClient,
        auditLogger,
      });

      await sessionIndex.cleanUp(mockRunContext);

      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        _source_includes: 'usernameHash,provider',
        sort: '_shard_doc',
        track_total_hits: false,
        search_after: undefined,
        size: 10_000,
        pit: {
          id: 'PIT_ID',
          keep_alive: '5m',
        },
        query: {
          bool: {
            should: [
              // All expired sessions based on the lifespan, no matter which provider they belong to.
              { range: { lifespanExpiration: { lte: now } } },
              // All sessions that belong to the providers that aren't configured.
              {
                bool: {
                  must_not: {
                    bool: {
                      should: [
                        {
                          bool: {
                            must: [
                              { term: { 'provider.type': 'basic' } },
                              { term: { 'provider.name': 'basic' } },
                            ],
                          },
                        },
                      ],
                      minimum_should_match: 1,
                    },
                  },
                },
              },
              // The sessions that belong to a particular provider that are either expired based on the idle timeout
              // or don't have it configured at all.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'basic' } },
                    { term: { 'provider.name': 'basic' } },
                  ],
                  should: [
                    { range: { idleTimeoutExpiration: { lte: now - 3 * idleTimeout } } },
                    { bool: { must_not: { exists: { field: 'idleTimeoutExpiration' } } } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
      });
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith(
        {
          index: aliasName,
          operations: [{ delete: { _id: sessionValue._id } }],
          refresh: false,
          require_alias: true,
        },
        {
          ignore: [409, 404],
        }
      );
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
    });

    it('when both `lifespan` and `idleTimeout` are configured', async () => {
      const idleTimeout = 123;
      sessionIndex = new SessionIndex({
        logger: loggingSystemMock.createLogger(),
        kibanaIndexName: '.kibana_some_tenant',
        config: createConfig(
          ConfigSchema.validate({ session: { idleTimeout, lifespan: 456 } }),
          loggingSystemMock.createLogger(),
          { isTLSEnabled: false }
        ),
        elasticsearchClient: mockElasticsearchClient,
        auditLogger,
      });

      await sessionIndex.cleanUp(mockRunContext);

      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        _source_includes: 'usernameHash,provider',
        sort: '_shard_doc',
        track_total_hits: false,
        search_after: undefined,
        size: 10_000,
        pit: {
          id: 'PIT_ID',
          keep_alive: '5m',
        },
        query: {
          bool: {
            should: [
              // All expired sessions based on the lifespan, no matter which provider they belong to.
              { range: { lifespanExpiration: { lte: now } } },
              // All sessions that belong to the providers that aren't configured.
              {
                bool: {
                  must_not: {
                    bool: {
                      should: [
                        {
                          bool: {
                            must: [
                              { term: { 'provider.type': 'basic' } },
                              { term: { 'provider.name': 'basic' } },
                            ],
                          },
                        },
                      ],
                      minimum_should_match: 1,
                    },
                  },
                },
              },
              // The sessions that belong to a particular provider but don't have a configured lifespan.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'basic' } },
                    { term: { 'provider.name': 'basic' } },
                  ],
                  must_not: { exists: { field: 'lifespanExpiration' } },
                },
              },
              // The sessions that belong to a particular provider that are either expired based on the idle timeout
              // or don't have it configured at all.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'basic' } },
                    { term: { 'provider.name': 'basic' } },
                  ],
                  should: [
                    { range: { idleTimeoutExpiration: { lte: now - 3 * idleTimeout } } },
                    { bool: { must_not: { exists: { field: 'idleTimeoutExpiration' } } } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
      });
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith(
        {
          index: aliasName,
          operations: [{ delete: { _id: sessionValue._id } }],
          refresh: false,
          require_alias: true,
        },
        {
          ignore: [409, 404],
        }
      );
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
    });

    it('when both `lifespan` and `idleTimeout` are configured and multiple providers are enabled', async () => {
      const globalIdleTimeout = 123;
      const samlIdleTimeout = 33221;
      sessionIndex = new SessionIndex({
        logger: loggingSystemMock.createLogger(),
        kibanaIndexName: '.kibana_some_tenant',
        config: createConfig(
          ConfigSchema.validate({
            session: { idleTimeout: globalIdleTimeout, lifespan: 456 },
            authc: {
              providers: {
                basic: { basic1: { order: 0 } },
                saml: {
                  saml1: {
                    order: 1,
                    realm: 'saml-realm',
                    session: { idleTimeout: samlIdleTimeout },
                  },
                },
              },
            },
          }),
          loggingSystemMock.createLogger(),
          { isTLSEnabled: false }
        ),
        elasticsearchClient: mockElasticsearchClient,
        auditLogger,
      });

      await sessionIndex.cleanUp(mockRunContext);

      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        _source_includes: 'usernameHash,provider',
        sort: '_shard_doc',
        track_total_hits: false,
        search_after: undefined,
        size: 10_000,
        pit: {
          id: 'PIT_ID',
          keep_alive: '5m',
        },
        query: {
          bool: {
            should: [
              // All expired sessions based on the lifespan, no matter which provider they belong to.
              { range: { lifespanExpiration: { lte: now } } },
              // All sessions that belong to the providers that aren't configured.
              {
                bool: {
                  must_not: {
                    bool: {
                      should: [
                        {
                          bool: {
                            must: [
                              { term: { 'provider.type': 'basic' } },
                              { term: { 'provider.name': 'basic1' } },
                            ],
                          },
                        },
                        {
                          bool: {
                            must: [
                              { term: { 'provider.type': 'saml' } },
                              { term: { 'provider.name': 'saml1' } },
                            ],
                          },
                        },
                      ],
                      minimum_should_match: 1,
                    },
                  },
                },
              },
              // The sessions that belong to a Basic provider but don't have a configured lifespan.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'basic' } },
                    { term: { 'provider.name': 'basic1' } },
                  ],
                  must_not: { exists: { field: 'lifespanExpiration' } },
                },
              },
              // The sessions that belong to a Basic provider that are either expired based on the idle timeout
              // or don't have it configured at all.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'basic' } },
                    { term: { 'provider.name': 'basic1' } },
                  ],
                  should: [
                    { range: { idleTimeoutExpiration: { lte: now - 3 * globalIdleTimeout } } },
                    { bool: { must_not: { exists: { field: 'idleTimeoutExpiration' } } } },
                  ],
                  minimum_should_match: 1,
                },
              },
              // The sessions that belong to a SAML provider but don't have a configured lifespan.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'saml' } },
                    { term: { 'provider.name': 'saml1' } },
                  ],
                  must_not: { exists: { field: 'lifespanExpiration' } },
                },
              },
              // The sessions that belong to a SAML provider that are either expired based on the idle timeout
              // or don't have it configured at all.
              {
                bool: {
                  must: [
                    { term: { 'provider.type': 'saml' } },
                    { term: { 'provider.name': 'saml1' } },
                  ],
                  should: [
                    { range: { idleTimeoutExpiration: { lte: now - 3 * samlIdleTimeout } } },
                    { bool: { must_not: { exists: { field: 'idleTimeoutExpiration' } } } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
      });
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith(
        {
          index: aliasName,
          operations: [{ delete: { _id: sessionValue._id } }],
          refresh: false,
          require_alias: true,
        },
        {
          ignore: [409, 404],
        }
      );
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
    });

    it('should clean up sessions in batches of 10,000', async () => {
      for (const count of [10_000, 1]) {
        mockElasticsearchClient.search.mockResponseOnce({
          hits: { hits: new Array(count).fill(sessionValue, 0) },
        } as SearchResponse);
      }

      await sessionIndex.cleanUp(mockRunContext);

      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
    });

    it('should limit number of batches to 10', async () => {
      mockElasticsearchClient.search.mockResponse({
        hits: { hits: new Array(10_000).fill(sessionValue, 0) },
      } as SearchResponse);

      await sessionIndex.cleanUp(mockRunContext);

      expect(mockElasticsearchClient.openPointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(10);
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(10);
      expect(mockElasticsearchClient.closePointInTime).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
    });

    it('should log audit event', async () => {
      await sessionIndex.cleanUp(mockRunContext);

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: { action: 'session_cleanup', category: ['authentication'], outcome: 'unknown' },
        })
      );
    });

    it('should fail silently if shards are missing', async () => {
      const failureReason = new errors.ResponseError({
        statusCode: 503,
        body: {
          error: {
            type: 'search_phase_execution_exception Root causes: no_shard_available_action_exception',
          },
        },
        warnings: null,
        meta: {} as any,
      });

      mockElasticsearchClient.openPointInTime.mockRejectedValue(failureReason);

      const runResult = await sessionIndex.cleanUp(mockRunContext);

      expect(runResult?.state).toBeTruthy();
      expect(runResult?.state.shardMissingCounter).toBe(1);
    });

    it('should throw error if shards are missing for more than 10 tries', async () => {
      const failureReason = new errors.ResponseError({
        statusCode: 503,
        body: {
          error: {
            type: 'search_phase_execution_exception Root causes: no_shard_available_action_exception',
          },
        },
        warnings: null,
        meta: {} as any,
      });

      mockElasticsearchClient.openPointInTime.mockRejectedValue(failureReason);

      const runContext = {
        taskInstance: {
          ...mockRunContext.taskInstance,
          state: { shardMissingCounter: 9 },
        },
        abortController: new AbortController(),
        executionUuid: 'test-execution-uuid',
      };

      await expect(sessionIndex.cleanUp(runContext)).resolves.toEqual({
        error:
          'Failed to clean up sessions: Shards for session index are missing. Cleanup routine has failed 10 times. {"error":{"type":"search_phase_execution_exception Root causes: no_shard_available_action_exception"}}',
        state: { shardMissingCounter: 0 },
      });
    });

    describe('concurrent session limit', () => {
      const expectedSearchParameters = () => ({
        index: '.kibana_some_tenant_security_session',
        query: {
          bool: {
            filter: [
              { exists: { field: 'usernameHash' } },
              {
                bool: {
                  must_not: [{ term: { 'provider.type': AnonymousAuthenticationProvider.type } }],
                },
              },
            ],
          },
        },
        aggs: {
          sessions_grouped_by_user: {
            multi_terms: {
              size: 10000,
              terms: [
                { field: 'usernameHash' },
                { field: 'provider.type' },
                { field: 'provider.name' },
              ],
              min_doc_count: 3,
            },
          },
        },
        size: 0,
        filter_path: [
          'aggregations.sessions_grouped_by_user.sum_other_doc_count',
          'aggregations.sessions_grouped_by_user.buckets.key',
          'aggregations.sessions_grouped_by_user.buckets.doc_count',
        ],
        track_total_hits: false,
      });

      const expectedMultiSearchParameters = (
        usernameHash: string,
        providerType: string,
        providerName: string
      ) => ({
        query: {
          bool: {
            must: [
              { term: { usernameHash } },
              { term: { 'provider.type': providerType } },
              { term: { 'provider.name': providerName } },
            ],
          },
        },
        sort: [{ createdAt: { order: 'desc' } }],
        from: 2,
        size: 9998,
        _source: false,
        track_total_hits: false,
      });

      beforeEach(() => {
        // The first search call is used by the invalid/expired sessions cleanup routine.
        mockElasticsearchClient.search.mockResolvedValueOnce({
          hits: { hits: [] },
        } as unknown as SearchResponse);

        sessionIndex = new SessionIndex(
          createSessionIndexOptions({
            session: { idleTimeout: null, lifespan: null, concurrentSessions: { maxSessions: 2 } },
          })
        );
      });

      it('when concurrent session limit is not configured', async () => {
        sessionIndex = new SessionIndex(createSessionIndexOptions());

        await sessionIndex.cleanUp(mockRunContext);

        // Only search call for the invalid sessions (use `pit` as marker, since concurrent session limit cleanup
        // routine doesn't rely on PIT).
        expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
        expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
          expect.objectContaining({ pit: { id: 'PIT_ID', keep_alive: '5m' } })
        );
        expect(mockElasticsearchClient.msearch).not.toHaveBeenCalled();
        expect(mockElasticsearchClient.bulk).not.toHaveBeenCalled();
        expect(mockElasticsearchClient.indices.refresh).not.toHaveBeenCalled();
      });

      it('when the concurrent session limit is not exceeded', async () => {
        mockElasticsearchClient.search.mockResolvedValueOnce({
          aggregations: { sessions_grouped_by_user: { sum_other_doc_count: 1 } },
        } as unknown as SearchResponse);

        await sessionIndex.cleanUp(mockRunContext);

        // Only search call for the invalid sessions (use `pit` as marker, since concurrent session limit cleanup
        // routine doesn't rely on PIT).
        expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(2);
        expect(mockElasticsearchClient.search).toHaveBeenNthCalledWith(
          2,
          expectedSearchParameters()
        );
        expect(mockElasticsearchClient.msearch).not.toHaveBeenCalled();
        expect(mockElasticsearchClient.bulk).not.toHaveBeenCalled();
        expect(mockElasticsearchClient.indices.refresh).not.toHaveBeenCalled();
      });

      it('when the concurrent session limit is exceeded', async () => {
        mockElasticsearchClient.search.mockResolvedValueOnce({
          aggregations: {
            sessions_grouped_by_user: {
              sum_other_doc_count: 1,
              buckets: [{ key: ['user-hash-name', 'basic', 'basic1'], doc_count: 10 }],
            },
          },
        } as unknown as SearchResponse);
        mockElasticsearchClient.msearch.mockResolvedValue({
          responses: [{ status: 200, hits: { hits: [{ _id: 'some-id' }, { _id: 'some-id-2' }] } }],
        } as MsearchMultiSearchResult);

        await sessionIndex.cleanUp(mockRunContext);

        // Only search call for the invalid sessions (use `pit` as marker, since concurrent session limit cleanup
        // routine doesn't rely on PIT).
        expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(2);
        expect(mockElasticsearchClient.search).toHaveBeenNthCalledWith(
          2,
          expectedSearchParameters()
        );

        expect(mockElasticsearchClient.msearch).toHaveBeenCalledTimes(1);
        expect(mockElasticsearchClient.msearch).toHaveBeenCalledWith({
          index: '.kibana_some_tenant_security_session',
          searches: [{}, expectedMultiSearchParameters('user-hash-name', 'basic', 'basic1')],
          filter_path: ['responses.status', 'responses.hits.hits._id'],
        });
        expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
        expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith(
          {
            index: '.kibana_some_tenant_security_session',
            operations: [{ delete: { _id: 'some-id' } }, { delete: { _id: 'some-id-2' } }],
            refresh: false,
            require_alias: true,
          },
          { ignore: [409, 404] }
        );
        expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
      });

      it('when the concurrent session limit is exceeded for multiple providers', async () => {
        mockElasticsearchClient.search.mockResolvedValueOnce({
          aggregations: {
            sessions_grouped_by_user: {
              sum_other_doc_count: 1,
              buckets: [
                { key: ['user-hash-name', 'basic', 'basic1'], doc_count: 10 },
                // For this we simulate a race condition, when the limit is exceeded during aggregation, but not during
                // `msearch` query.
                { key: ['user-hash-name-2', 'basic', 'basic1'], doc_count: 1 },
                { key: ['user-hash-name-3', 'saml', 'saml1'], doc_count: 10 },
              ],
            },
          },
        } as unknown as SearchResponse);
        mockElasticsearchClient.msearch.mockResolvedValue({
          responses: [
            { status: 200, hits: { hits: [{ _id: 'some-id' }, { _id: 'some-id-2' }] } },
            { status: 200 },
            { status: 200, hits: { hits: [{ _id: 'some-id-3' }] } },
          ],
        } as MsearchMultiSearchResult);

        await sessionIndex.cleanUp(mockRunContext);

        // Only search call for the invalid sessions (use `pit` as marker, since concurrent session limit cleanup
        // routine doesn't rely on PIT).
        expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(2);
        expect(mockElasticsearchClient.search).toHaveBeenNthCalledWith(
          2,
          expectedSearchParameters()
        );

        expect(mockElasticsearchClient.msearch).toHaveBeenCalledTimes(1);
        expect(mockElasticsearchClient.msearch).toHaveBeenCalledWith({
          index: '.kibana_some_tenant_security_session',
          searches: [
            {},
            expectedMultiSearchParameters('user-hash-name', 'basic', 'basic1'),
            {},
            expectedMultiSearchParameters('user-hash-name-2', 'basic', 'basic1'),
            {},
            expectedMultiSearchParameters('user-hash-name-3', 'saml', 'saml1'),
          ],
          filter_path: ['responses.status', 'responses.hits.hits._id'],
        });
        expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(1);
        expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith(
          {
            index: '.kibana_some_tenant_security_session',
            operations: [
              { delete: { _id: 'some-id' } },
              { delete: { _id: 'some-id-2' } },
              { delete: { _id: 'some-id-3' } },
            ],
            refresh: false,
            require_alias: true,
          },
          { ignore: [409, 404] }
        );
        expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
      });

      it('should call bulk_delete in multiple chunks if total number of session to delete exceeds 10_000', async () => {
        mockElasticsearchClient.search.mockResolvedValueOnce({
          aggregations: {
            sessions_grouped_by_user: {
              sum_other_doc_count: 1,
              buckets: [{ key: ['user-hash-name', 'basic', 'basic1'], doc_count: 10 }],
            },
          },
        } as unknown as SearchResponse);
        mockElasticsearchClient.msearch.mockResolvedValue({
          responses: [
            {
              status: 200,
              hits: {
                hits: Array.from({ length: 10002 }).map((_, index) => ({
                  _id: `some-id-${index}`,
                })),
              },
            },
          ],
        } as MsearchMultiSearchResult);

        await sessionIndex.cleanUp(mockRunContext);

        expect(mockElasticsearchClient.bulk).toHaveBeenCalledTimes(2);
        expect(mockElasticsearchClient.bulk).toHaveBeenNthCalledWith(
          1,
          {
            index: '.kibana_some_tenant_security_session',
            operations: expect.arrayContaining([
              { delete: { _id: 'some-id-0' } },
              { delete: { _id: 'some-id-9999' } },
            ]),
            refresh: false,
            require_alias: true,
          },
          { ignore: [409, 404] }
        );
        expect(mockElasticsearchClient.bulk).toHaveBeenNthCalledWith(
          2,
          {
            index: '.kibana_some_tenant_security_session',
            operations: [
              { delete: { _id: 'some-id-10000' } },
              { delete: { _id: 'some-id-10001' } },
            ],
            refresh: false,
            require_alias: true,
          },
          { ignore: [409, 404] }
        );
        expect(mockElasticsearchClient.indices.refresh).toHaveBeenCalledTimes(1);
      });

      it('should log audit event', async () => {
        mockElasticsearchClient.search.mockResolvedValueOnce({
          aggregations: {
            sessions_grouped_by_user: {
              sum_other_doc_count: 1,
              buckets: [
                { key: ['user-hash-name', 'basic', 'basic1'], doc_count: 3 },
                { key: ['user-hash-name-2', 'saml', 'saml1'], doc_count: 3 },
              ],
            },
          },
        } as unknown as SearchResponse);
        mockElasticsearchClient.msearch.mockResolvedValue({
          responses: [
            { status: 200, hits: { hits: [{ _id: 'some-id' }] } },
            { status: 200, hits: { hits: [{ _id: 'some-id-2' }] } },
          ],
        } as MsearchMultiSearchResult);

        await sessionIndex.cleanUp(mockRunContext);

        expect(auditLogger.log).toHaveBeenCalledTimes(2);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: { action: 'session_cleanup', category: ['authentication'], outcome: 'unknown' },
            user: { hash: 'user-hash-name' },
            kibana: {
              session_id: 'some-id',
              authentication_provider: 'basic1',
              authentication_type: 'basic',
            },
          })
        );
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: { action: 'session_cleanup', category: ['authentication'], outcome: 'unknown' },
            user: { hash: 'user-hash-name-2' },
            kibana: {
              session_id: 'some-id-2',
              authentication_provider: 'saml1',
              authentication_type: 'saml',
            },
          })
        );
      });
    });
  });

  describe('#get', () => {
    it('throws if call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.get.mockRejectedValue(failureReason);

      await expect(sessionIndex.get('some-sid')).rejects.toBe(failureReason);
    });

    it('returns `null` if index is not found', async () => {
      mockElasticsearchClient.get.mockResponse({
        _index: 'my-index',
        // @ts-expect-error incomplete definition
        _type: '_doc',
        _id: '0',
        found: false,
      });

      await expect(sessionIndex.get('some-sid')).resolves.toBeNull();
    });

    it('returns `null` if session index value document is not found', async () => {
      mockElasticsearchClient.get.mockResponse({
        _index: 'my-index',
        // @ts-expect-error incomplete definition
        _type: '_doc',
        _id: '0',
        found: false,
      });

      await expect(sessionIndex.get('some-sid')).resolves.toBeNull();
    });

    it('properly returns session index value', async () => {
      const indexDocumentSource = {
        usernameHash: 'some-username-hash',
        provider: { type: 'basic', name: 'basic1' },
        idleTimeoutExpiration: 123,
        lifespanExpiration: null,
        content: 'some-encrypted-content',
      };

      mockElasticsearchClient.get.mockResponse({
        found: true,
        _index: 'my-index',
        // @ts-expect-error incomplete definition
        _type: '_doc',
        _id: '0',
        _source: indexDocumentSource,
        _primary_term: 1,
        _seq_no: 456,
      });

      await expect(sessionIndex.get('some-sid')).resolves.toEqual({
        ...indexDocumentSource,
        sid: 'some-sid',
        metadata: { primaryTerm: 1, sequenceNumber: 456 },
      });

      expect(mockElasticsearchClient.get).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.get).toHaveBeenCalledWith(
        { id: 'some-sid', index: aliasName },
        { ignore: [404], meta: true }
      );
    });
  });

  describe('#create', () => {
    it('throws if call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.create.mockRejectedValue(failureReason);

      await expect(
        sessionIndex.create({
          sid: 'some-long-sid',
          usernameHash: 'some-username-hash',
          provider: { type: 'basic', name: 'basic1' },
          idleTimeoutExpiration: null,
          lifespanExpiration: null,
          content: 'some-encrypted-content',
        })
      ).rejects.toBe(failureReason);
    });

    it('properly stores session value in the index, creating the index first if it does not exist', async () => {
      mockElasticsearchClient.indices.exists.mockResponse(false);

      let callCount = 0;
      mockElasticsearchClient.create.mockResponseImplementation(() => {
        callCount++;
        // Fail the first create attempt because the index/alias doesn't exist
        if (callCount === 1) {
          return { statusCode: 404 };
        }
        // Pass the second create attempt
        return {
          body: {
            _shards: { total: 1, failed: 0, successful: 1, skipped: 0 },
            _index: 'my-index',
            _id: 'W0tpsmIBdwcYyG50zbta',
            _version: 1,
            _primary_term: 321,
            _seq_no: 654,
            result: 'created',
          },
          statusCode: 201,
        };
      });

      const sid = 'some-long-sid';
      const sessionValue = {
        usernameHash: 'some-username-hash',
        provider: { type: 'basic', name: 'basic1' },
        idleTimeoutExpiration: null,
        lifespanExpiration: null,
        content: 'some-encrypted-content',
      };

      await expect(sessionIndex.create({ sid, ...sessionValue })).resolves.toEqual({
        ...sessionValue,
        sid,
        metadata: { primaryTerm: 321, sequenceNumber: 654 },
      });

      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledTimes(1);

      expect(mockElasticsearchClient.create).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.create).toHaveBeenNthCalledWith(
        1,
        {
          id: sid,
          index: aliasName,
          document: sessionValue,
          refresh: false,
          require_alias: true,
        },
        { ignore: [404], meta: true }
      );
      expect(mockElasticsearchClient.create).toHaveBeenNthCalledWith(
        2,
        {
          id: sid,
          index: aliasName,
          document: sessionValue,
          refresh: false,
          require_alias: true,
        },
        { ignore: [], meta: true }
      );
    });

    it('properly stores session value in the index, skipping index creation if it already exists', async () => {
      mockElasticsearchClient.indices.exists.mockResolvedValue(true);

      mockElasticsearchClient.create.mockResponse({
        _shards: { total: 1, failed: 0, successful: 1, skipped: 0 },
        _index: 'my-index',
        _id: 'W0tpsmIBdwcYyG50zbta',
        _version: 1,
        _primary_term: 321,
        _seq_no: 654,
        result: 'created',
      });

      const sid = 'some-long-sid';
      const sessionValue = {
        usernameHash: 'some-username-hash',
        provider: { type: 'basic', name: 'basic1' },
        idleTimeoutExpiration: null,
        lifespanExpiration: null,
        content: 'some-encrypted-content',
      };

      await expect(sessionIndex.create({ sid, ...sessionValue })).resolves.toEqual({
        ...sessionValue,
        sid,
        metadata: { primaryTerm: 321, sequenceNumber: 654 },
      });

      expect(mockElasticsearchClient.indices.exists).not.toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();

      expect(mockElasticsearchClient.create).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.create).toHaveBeenCalledWith(
        {
          id: sid,
          index: aliasName,
          document: sessionValue,
          refresh: false,
          require_alias: true,
        },
        { meta: true, ignore: [404] }
      );
    });
  });

  describe('#update', () => {
    it('throws if call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.index.mockRejectedValue(failureReason);

      await expect(sessionIndex.update(sessionIndexMock.createValue())).rejects.toBe(failureReason);
    });

    it('re-fetches latest session value if update fails due to conflict', async () => {
      const latestSessionValue = {
        usernameHash: 'some-username-hash',
        provider: { type: 'basic', name: 'basic1' },
        idleTimeoutExpiration: 100,
        lifespanExpiration: 200,
        content: 'some-updated-encrypted-content',
      };

      mockElasticsearchClient.get.mockResponse({
        _index: 'my-index',
        // @ts-expect-error incomplete definition
        _type: '_doc',
        _id: '0',
        _source: latestSessionValue,
        _primary_term: 321,
        _seq_no: 654,
        found: true,
      });
      mockElasticsearchClient.index.mockResponse(
        {
          _shards: { total: 1, failed: 0, successful: 1, skipped: 0 },
          _index: 'my-index',
          _id: 'W0tpsmIBdwcYyG50zbta',
          _version: 1,
          _primary_term: 321,
          _seq_no: 654,
          result: 'updated',
        },
        { statusCode: 409 }
      );

      const sid = 'some-long-sid';
      const metadata = { primaryTerm: 123, sequenceNumber: 456 };
      const sessionValue = {
        usernameHash: 'some-username-hash',
        provider: { type: 'basic', name: 'basic1' },
        idleTimeoutExpiration: null,
        lifespanExpiration: null,
        content: 'some-encrypted-content',
      };

      await expect(sessionIndex.update({ sid, metadata, ...sessionValue })).resolves.toEqual({
        ...latestSessionValue,
        sid,
        metadata: { primaryTerm: 321, sequenceNumber: 654 },
      });

      expect(mockElasticsearchClient.index).toHaveBeenCalledWith(
        {
          id: sid,
          index: aliasName,
          body: sessionValue,
          if_seq_no: 456,
          if_primary_term: 123,
          refresh: false,
          require_alias: true,
        },
        { ignore: [404, 409], meta: true }
      );
    });

    it('properly stores session value in the index', async () => {
      mockElasticsearchClient.index.mockResponse({
        _shards: { total: 1, failed: 0, successful: 1, skipped: 0 },
        _index: 'my-index',
        _id: 'W0tpsmIBdwcYyG50zbta',
        _version: 1,
        _primary_term: 321,
        _seq_no: 654,
        result: 'created',
      });

      const sid = 'some-long-sid';
      const metadata = { primaryTerm: 123, sequenceNumber: 456 };
      const sessionValue = {
        usernameHash: 'some-username-hash',
        provider: { type: 'basic', name: 'basic1' },
        idleTimeoutExpiration: null,
        lifespanExpiration: null,
        content: 'some-encrypted-content',
      };

      await expect(sessionIndex.update({ sid, metadata, ...sessionValue })).resolves.toEqual({
        ...sessionValue,
        sid,
        metadata: { primaryTerm: 321, sequenceNumber: 654 },
      });

      expect(mockElasticsearchClient.index).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.index).toHaveBeenCalledWith(
        {
          id: sid,
          index: aliasName,
          body: sessionValue,
          if_seq_no: 456,
          if_primary_term: 123,
          refresh: false,
          require_alias: true,
        },
        { ignore: [404, 409], meta: true }
      );
    });

    it('properly stores session value in the index, recreating the index/alias if missing', async () => {
      let callCount = 0;
      mockElasticsearchClient.index.mockResponseImplementation(() => {
        callCount++;
        // Fail the first update attempt because the index/alias doesn't exist
        if (callCount === 1) {
          return { statusCode: 404 };
        }
        // Pass the second update attempt
        return {
          body: {
            _shards: { total: 1, failed: 0, successful: 1, skipped: 0 },
            _index: 'my-index',
            _id: 'W0tpsmIBdwcYyG50zbta',
            _version: 1,
            _primary_term: 321,
            _seq_no: 654,
            result: 'created',
          },
          statusCode: 201,
        };
      });

      const sid = 'some-long-sid';
      const metadata = { primaryTerm: 123, sequenceNumber: 456 };
      const sessionValue = {
        usernameHash: 'some-username-hash',
        provider: { type: 'basic', name: 'basic1' },
        idleTimeoutExpiration: null,
        lifespanExpiration: null,
        content: 'some-encrypted-content',
      };

      await expect(sessionIndex.update({ sid, metadata, ...sessionValue })).resolves.toEqual({
        ...sessionValue,
        sid,
        metadata: { primaryTerm: 321, sequenceNumber: 654 },
      });

      expect(mockElasticsearchClient.index).toHaveBeenCalledTimes(2);
      expect(mockElasticsearchClient.index).toHaveBeenNthCalledWith(
        1,
        {
          id: sid,
          index: aliasName,
          body: sessionValue,
          if_seq_no: 456,
          if_primary_term: 123,
          refresh: false,
          require_alias: true,
        },
        { ignore: [404, 409], meta: true }
      );
      expect(mockElasticsearchClient.index).toHaveBeenNthCalledWith(
        2,
        {
          id: sid,
          index: aliasName,
          body: sessionValue,
          if_seq_no: 456,
          if_primary_term: 123,
          refresh: false,
          require_alias: true,
        },
        { ignore: [409], meta: true }
      );
    });
  });

  describe('#invalidate', () => {
    beforeEach(() => {
      mockElasticsearchClient.deleteByQuery.mockResponse({ deleted: 10 } as DeleteByQueryResponse);
    });

    it('[match=sid] throws if call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.delete.mockRejectedValue(failureReason);

      await expect(sessionIndex.invalidate({ match: 'sid', sid: 'some-long-sid' })).rejects.toBe(
        failureReason
      );
    });

    it('[match=sid] properly removes session value from the index', async () => {
      await sessionIndex.invalidate({ match: 'sid', sid: 'some-long-sid' });

      expect(mockElasticsearchClient.delete).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.delete).toHaveBeenCalledWith(
        { id: 'some-long-sid', index: aliasName, refresh: false },
        { ignore: [404], meta: true }
      );
    });

    it('[match=all] throws if call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.deleteByQuery.mockRejectedValue(failureReason);

      await expect(sessionIndex.invalidate({ match: 'all' })).rejects.toBe(failureReason);
    });

    it('[match=all] properly constructs query', async () => {
      await expect(sessionIndex.invalidate({ match: 'all' })).resolves.toBe(10);

      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledWith({
        index: aliasName,
        refresh: false,
        query: { match_all: {} },
      });
    });

    it('[match=query] throws if call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.deleteByQuery.mockRejectedValue(failureReason);

      await expect(
        sessionIndex.invalidate({ match: 'query', query: { provider: { type: 'basic' } } })
      ).rejects.toBe(failureReason);
    });

    it('[match=query] when only provider type is specified', async () => {
      await expect(
        sessionIndex.invalidate({ match: 'query', query: { provider: { type: 'basic' } } })
      ).resolves.toBe(10);

      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledWith({
        index: aliasName,
        refresh: false,
        query: { bool: { must: [{ term: { 'provider.type': 'basic' } }] } },
      });
    });

    it('[match=query] when both provider type and provider name are specified', async () => {
      await expect(
        sessionIndex.invalidate({
          match: 'query',
          query: { provider: { type: 'basic', name: 'basic1' } },
        })
      ).resolves.toBe(10);

      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledWith({
        index: aliasName,
        refresh: false,
        query: {
          bool: {
            must: [{ term: { 'provider.type': 'basic' } }, { term: { 'provider.name': 'basic1' } }],
          },
        },
      });
    });

    it('[match=query] when both provider type and username hash are specified', async () => {
      await expect(
        sessionIndex.invalidate({
          match: 'query',
          query: { provider: { type: 'basic' }, usernameHash: 'some-hash' },
        })
      ).resolves.toBe(10);

      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledWith({
        index: aliasName,
        refresh: false,
        query: {
          bool: {
            must: [{ term: { 'provider.type': 'basic' } }, { term: { usernameHash: 'some-hash' } }],
          },
        },
      });
    });

    it('[match=query] when provider type, provider name, and username hash are specified', async () => {
      await expect(
        sessionIndex.invalidate({
          match: 'query',
          query: { provider: { type: 'basic', name: 'basic1' }, usernameHash: 'some-hash' },
        })
      ).resolves.toBe(10);

      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledWith({
        index: aliasName,
        refresh: false,
        query: {
          bool: {
            must: [
              { term: { 'provider.type': 'basic' } },
              { term: { 'provider.name': 'basic1' } },
              { term: { usernameHash: 'some-hash' } },
            ],
          },
        },
      });
    });
  });

  describe('#isWithinConcurrentSessionLimit', () => {
    const expectedSearchParameters = () => ({
      index: '.kibana_some_tenant_security_session',
      query: {
        bool: {
          filter: [
            { term: { usernameHash: 'some-username-hash' } },
            { term: { 'provider.type': 'basic' } },
            { term: { 'provider.name': 'basic1' } },
          ],
        },
      },
      sort: [{ createdAt: { order: 'desc' } }],
      _source_includes: 'createdAt',
      filter_path: 'hits.hits._source',
      from: 2,
      size: 1,
      track_total_hits: false,
    });

    beforeEach(() => {
      sessionIndex = new SessionIndex(
        createSessionIndexOptions({
          session: { idleTimeout: null, lifespan: null, concurrentSessions: { maxSessions: 2 } },
        })
      );
    });

    it('throws if call to Elasticsearch fails', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse(securityMock.createApiResponse({ body: { type: 'Uh oh.' } }))
      );
      mockElasticsearchClient.search.mockRejectedValue(failureReason);

      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(sessionIndexMock.createValue())
      ).rejects.toBe(failureReason);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(expectedSearchParameters());
    });

    it('returns `true` if concurrent session limit is not configured', async () => {
      sessionIndex = new SessionIndex(createSessionIndexOptions());

      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(sessionIndexMock.createValue())
      ).resolves.toBe(true);
      expect(mockElasticsearchClient.search).not.toHaveBeenCalled();
    });

    it('returns `true` for unauthenticated sessions', async () => {
      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(
          sessionIndexMock.createValue({ usernameHash: undefined })
        )
      ).resolves.toBe(true);
      expect(mockElasticsearchClient.search).not.toHaveBeenCalled();
    });

    it('returns `true` if session belongs to the anonymous user', async () => {
      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(
          sessionIndexMock.createValue({
            createdAt: 100,
            provider: { type: AnonymousAuthenticationProvider.type, name: 'anonymous1' },
          })
        )
      ).resolves.toBe(true);
      expect(mockElasticsearchClient.search).not.toHaveBeenCalled();
    });

    it('returns `true` if session is within limit', async () => {
      for (const value of [
        {} as SearchResponse,
        { hits: { hits: [] } } as unknown as SearchResponse,
      ]) {
        mockElasticsearchClient.search.mockResolvedValue(value);

        await expect(
          sessionIndex.isWithinConcurrentSessionLimit(sessionIndexMock.createValue())
        ).resolves.toBe(true);

        expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
        expect(mockElasticsearchClient.search).toHaveBeenCalledWith(expectedSearchParameters());

        mockElasticsearchClient.search.mockClear();
      }
    });

    it('returns `true` if the specified session is not a legacy session, but the first session that is outside the limit is a legacy one', async () => {
      mockElasticsearchClient.search.mockResolvedValue({
        hits: { hits: [{ _source: {} }] },
      } as SearchResponse);

      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(sessionIndexMock.createValue())
      ).resolves.toBe(true);

      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(expectedSearchParameters());
    });

    it('returns `true` if the first session that is outside the limit is older than the specified session', async () => {
      mockElasticsearchClient.search.mockResolvedValue({
        hits: { hits: [{ _source: { createdAt: 100 } }] },
      } as SearchResponse);

      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(
          sessionIndexMock.createValue({ createdAt: 200 })
        )
      ).resolves.toBe(true);

      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(expectedSearchParameters());
    });

    it('returns `false` if the limit is exceeded and specified session is a legacy session', async () => {
      mockElasticsearchClient.search.mockResolvedValue({
        hits: { hits: [{ _source: { createdAt: 100 } }] },
      } as SearchResponse);

      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(
          sessionIndexMock.createValue({ createdAt: undefined })
        )
      ).resolves.toBe(false);

      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(expectedSearchParameters());
    });

    it('returns `false` if the first session that is outside the limit was created at the same time as the specified session', async () => {
      mockElasticsearchClient.search.mockResolvedValue({
        hits: { hits: [{ _source: { createdAt: 100 } }] },
      } as SearchResponse);

      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(
          sessionIndexMock.createValue({ createdAt: 100 })
        )
      ).resolves.toBe(false);

      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(expectedSearchParameters());
    });

    it('returns `false` if the specified session is older than the first session that is outside the limit', async () => {
      mockElasticsearchClient.search.mockResolvedValue({
        hits: { hits: [{ _source: { createdAt: 200 } }] },
      } as SearchResponse);

      await expect(
        sessionIndex.isWithinConcurrentSessionLimit(
          sessionIndexMock.createValue({ createdAt: 100 })
        )
      ).resolves.toBe(false);

      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(expectedSearchParameters());
    });
  });
});
