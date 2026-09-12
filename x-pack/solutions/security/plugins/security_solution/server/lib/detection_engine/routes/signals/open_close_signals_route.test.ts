/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';

import { DETECTION_ENGINE_SIGNALS_STATUS_URL } from '../../../../../common/constants';
import { AlertDefaultClosingReasonValues } from '../../../../../common/types';
import {
  getSetSignalStatusByIdsRequest,
  getSetSignalStatusByQueryRequest,
  typicalSetStatusSignalByIdsPayload,
  typicalSetStatusSignalByQueryPayload,
  setStatusSignalMissingIdsAndQueryPayload,
  getSuccessfulSignalUpdateResponse,
} from '../__mocks__/request_responses';
import { requestContextMock, serverMock, requestMock } from '../__mocks__';
import { createMockTelemetryEventsSender } from '../../../telemetry/__mocks__';
import { RuntimeFieldTypeEnum } from '../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';
import { MAX_RUNTIME_FIELDS_PER_REQUEST } from './bulk_close_runtime_mappings';
import { setSignalsStatusRoute } from './open_close_signals_route';
import type { SecuritySolutionRequestHandlerContextMock } from '../__mocks__/request_context';
import type { SecuritySolutionEventBus } from '../../../../events/event_bus';

describe('set signal status', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: SecuritySolutionRequestHandlerContextMock;
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    server = serverMock.create();
    logger = loggingSystemMock.createLogger();
    ({ context } = requestContextMock.createTools());

    context.core.uiSettings.client.get.mockResolvedValue([]);
    context.core.elasticsearch.client.asCurrentUser.updateByQuery.mockResponse(
      getSuccessfulSignalUpdateResponse()
    );
    const telemetrySenderMock = createMockTelemetryEventsSender();
    setSignalsStatusRoute(server.router, logger, telemetrySenderMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('status on signal', () => {
    test('returns 200 when setting a status on a signal by ids', async () => {
      const response = await server.inject(
        getSetSignalStatusByIdsRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(200);
    });

    test('returns 200 when setting a status on a signal by query', async () => {
      const response = await server.inject(
        getSetSignalStatusByQueryRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(200);
    });

    it('returns 404 if siem client is unavailable', async () => {
      const { securitySolution, ...contextWithoutSecuritySolution } = context;
      const response = await server.inject(
        getSetSignalStatusByQueryRequest(),
        // @ts-expect-error
        contextWithoutSecuritySolution
      );
      expect(response.status).toEqual(404);
      expect(response.body).toEqual({ message: 'Not Found', status_code: 404 });
    });

    test('catches error if asCurrentUser throws error', async () => {
      context.core.elasticsearch.client.asCurrentUser.updateByQuery.mockRejectedValue(
        new Error('Test error')
      );
      const response = await server.inject(
        getSetSignalStatusByQueryRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        message: 'Test error',
        status_code: 500,
      });
    });

    test('calls "esClient.updateByQuery" with queryId when query is defined', async () => {
      await server.inject(
        getSetSignalStatusByQueryRequest(),
        requestContextMock.convertContext(context)
      );
      expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: { filter: typicalSetStatusSignalByQueryPayload().query },
          }),
        })
      );
    });

    test('calls "esClient.updateByQuery" with signalIds when ids are defined', async () => {
      await server.inject(
        getSetSignalStatusByIdsRequest(),
        requestContextMock.convertContext(context)
      );
      expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { bool: { filter: { terms: { _id: ['somefakeid1', 'somefakeid2'] } } } },
        })
      );
    });

    test('returns 400 when runtime_fields exceeds the per-request entry limit', async () => {
      const runtimeFields = Object.fromEntries(
        Array.from({ length: MAX_RUNTIME_FIELDS_PER_REQUEST + 1 }, (_, i) => [
          `custom.field_${i}`,
          RuntimeFieldTypeEnum.keyword,
        ])
      );

      const response = await server.inject(
        requestMock.create({
          method: 'post',
          path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
          body: {
            ...typicalSetStatusSignalByQueryPayload(),
            runtime_fields: runtimeFields,
          },
        }),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(400);
      expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).not.toHaveBeenCalled();
    });

    test('returns 200 when runtime_fields is at the per-request entry limit', async () => {
      const runtimeFields = Object.fromEntries(
        Array.from({ length: MAX_RUNTIME_FIELDS_PER_REQUEST }, (_, i) => [
          `custom.field_${i}`,
          RuntimeFieldTypeEnum.keyword,
        ])
      );

      const response = await server.inject(
        requestMock.create({
          method: 'post',
          path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
          body: {
            ...typicalSetStatusSignalByQueryPayload(),
            runtime_fields: runtimeFields,
          },
        }),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
      expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalled();
    });

    test('returns 400 when runtime_mappings alone exceeds the per-request entry limit', async () => {
      const runtimeMappings = Object.fromEntries(
        Array.from({ length: MAX_RUNTIME_FIELDS_PER_REQUEST + 1 }, (_, i) => [
          `custom.field_${i}`,
          { type: RuntimeFieldTypeEnum.keyword },
        ])
      );

      const response = await server.inject(
        requestMock.create({
          method: 'post',
          path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
          body: {
            ...typicalSetStatusSignalByQueryPayload(),
            runtime_mappings: runtimeMappings,
          },
        }),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(400);
      expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).not.toHaveBeenCalled();
    });

    test('returns 400 when runtime_fields + runtime_mappings union exceeds the limit (even with overlap)', async () => {
      // 50 fields in runtime_fields, 51 in runtime_mappings, 0 overlap = 101 unique → over limit.
      const runtimeFields = Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`rf_field_${i}`, RuntimeFieldTypeEnum.keyword])
      );
      const runtimeMappings = Object.fromEntries(
        Array.from({ length: 51 }, (_, i) => [
          `rm_field_${i}`,
          { type: RuntimeFieldTypeEnum.keyword },
        ])
      );

      const response = await server.inject(
        requestMock.create({
          method: 'post',
          path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
          body: {
            ...typicalSetStatusSignalByQueryPayload(),
            runtime_fields: runtimeFields,
            runtime_mappings: runtimeMappings,
          },
        }),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(400);
      expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).not.toHaveBeenCalled();
    });

    test('returns 200 when runtime_fields + runtime_mappings share a key (union counts it once, staying at the limit)', async () => {
      // 99 unique fields in runtime_fields, 1 field in runtime_mappings that overlaps with a
      // runtime_fields entry → union size is 99, not 100. Well within the limit.
      const sharedKey = 'custom.shared_field';
      const runtimeFields = Object.fromEntries([
        ...Array.from({ length: 99 }, (_, i) => [`rf_field_${i}`, RuntimeFieldTypeEnum.keyword]),
        [sharedKey, RuntimeFieldTypeEnum.keyword],
      ]);
      const runtimeMappings = {
        [sharedKey]: {
          type: RuntimeFieldTypeEnum.keyword,
          script: { source: "emit(doc['process.name'].value)" },
        },
      };

      const response = await server.inject(
        requestMock.create({
          method: 'post',
          path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
          body: {
            ...typicalSetStatusSignalByQueryPayload(),
            runtime_fields: runtimeFields,
            runtime_mappings: runtimeMappings,
          },
        }),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
      expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalled();
    });

    test('returns 400 when closing reason is invalid', async () => {
      const response = await server.inject(
        requestMock.create({
          method: 'post',
          path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
          body: {
            ...typicalSetStatusSignalByIdsPayload(),
            reason: 'invalid_reason',
          },
        }),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(400);
      expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).not.toHaveBeenCalled();
    });

    test('returns 200 when closing reason is in configured custom reasons', async () => {
      context.core.uiSettings.client.get.mockResolvedValue(['configured_custom_reason']);

      const response = await server.inject(
        requestMock.create({
          method: 'post',
          path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
          body: {
            ...typicalSetStatusSignalByIdsPayload(),
            reason: 'configured_custom_reason',
          },
        }),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
    });

    test('returns 200 when closing reason is in default reasons', async () => {
      const response = await server.inject(
        requestMock.create({
          method: 'post',
          path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
          body: {
            ...typicalSetStatusSignalByQueryPayload(),
            reason: AlertDefaultClosingReasonValues.true_positive,
          },
        }),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
    });
  });

  describe('request validation', () => {
    test('allows signal_ids and status', async () => {
      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
        body: typicalSetStatusSignalByIdsPayload(),
      });
      const result = server.validate(request);

      expect(result.ok).toHaveBeenCalled();
    });

    test('allows query and status', async () => {
      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
        body: typicalSetStatusSignalByQueryPayload(),
      });
      const result = server.validate(request);

      expect(result.ok).toHaveBeenCalled();
    });

    test('rejects if neither signal_ids nor query', async () => {
      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
        body: setStatusSignalMissingIdsAndQueryPayload(),
      });

      const result = server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });

    test('rejects if signal_ids but no status', async () => {
      const { status, ...body } = typicalSetStatusSignalByIdsPayload();
      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
        body,
      });
      const result = server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });

    test('rejects if query but no status', async () => {
      const { status, ...body } = typicalSetStatusSignalByIdsPayload();
      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
        body,
      });
      const result = server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });

    test('rejects if query and signal_ids but no status', async () => {
      const allTogether = {
        ...typicalSetStatusSignalByIdsPayload(),
        ...typicalSetStatusSignalByQueryPayload(),
      };
      const { status, ...body } = allTogether;
      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_SIGNALS_STATUS_URL,
        body,
      });
      const result = server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });
  });

  describe('workflow trigger emission', () => {
    let mockEventBus: { emitAlertStatusChanged: jest.Mock };

    beforeEach(() => {
      server = serverMock.create();
      mockEventBus = { emitAlertStatusChanged: jest.fn() };
      setSignalsStatusRoute(
        server.router,
        logger,
        createMockTelemetryEventsSender(),
        mockEventBus as unknown as SecuritySolutionEventBus
      );
    });

    describe('by-ids path', () => {
      beforeEach(() => {
        // prefetchAllPreviousStatusesByIds uses esClient.search internally
        context.core.elasticsearch.client.asCurrentUser.search.mockResponse({
          took: 1,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: {
            hits: [
              {
                _id: 'somefakeid1',
                _index: '.siem-signals-default',
                _source: { 'kibana.alert.workflow_status': 'open' },
              },
              {
                _id: 'somefakeid2',
                _index: '.siem-signals-default',
                _source: { 'kibana.alert.workflow_status': 'open' },
              },
            ],
            total: { value: 2, relation: 'eq' },
            max_score: 0,
          },
        });
      });

      test('emits alertStatusChanged with the updated ids and status', async () => {
        await server.inject(
          getSetSignalStatusByIdsRequest(),
          requestContextMock.convertContext(context)
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(mockEventBus.emitAlertStatusChanged).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            alertIds: ['somefakeid1', 'somefakeid2'],
            status: 'closed',
            truncated: false,
          })
        );
      });

      test('does not emit when all signal ids already have the target status', async () => {
        context.core.elasticsearch.client.asCurrentUser.search.mockResponse({
          took: 1,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: {
            hits: [
              {
                _id: 'somefakeid1',
                _index: '.siem-signals-default',
                _source: { 'kibana.alert.workflow_status': 'closed' },
              },
              {
                _id: 'somefakeid2',
                _index: '.siem-signals-default',
                _source: { 'kibana.alert.workflow_status': 'closed' },
              },
            ],
            total: { value: 2, relation: 'eq' },
            max_score: 0,
          },
        });
        await server.inject(
          getSetSignalStatusByIdsRequest(),
          requestContextMock.convertContext(context)
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(mockEventBus.emitAlertStatusChanged).not.toHaveBeenCalled();
      });
    });

    describe('by-query path', () => {
      beforeEach(() => {
        context.core.elasticsearch.client.asCurrentUser.search.mockResponse({
          took: 1,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: {
            hits: [
              {
                _id: 'query-alert-1',
                _index: '.siem-signals-default',
                _source: { 'kibana.alert.workflow_status': 'open' },
              },
            ],
            total: { value: 1, relation: 'eq' },
            max_score: 0,
          },
        });
      });

      test('emits alertStatusChanged with prefetched alert ids', async () => {
        await server.inject(
          getSetSignalStatusByQueryRequest(),
          requestContextMock.convertContext(context)
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(mockEventBus.emitAlertStatusChanged).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            alertIds: ['query-alert-1'],
            status: 'closed',
          })
        );
      });

      test('does not emit when prefetch returns no results (all pre-filtered by excludeStatus)', async () => {
        // With excludeStatus passed to prefetchPreviousStatusesByQuery, ES filters out docs
        // already at the target status via must_not. An empty result means nothing is transitioning.
        context.core.elasticsearch.client.asCurrentUser.search.mockResponse({
          took: 1,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: {
            hits: [],
            total: { value: 0, relation: 'eq' },
            max_score: 0,
          },
        });
        await server.inject(
          getSetSignalStatusByQueryRequest(),
          requestContextMock.convertContext(context)
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(mockEventBus.emitAlertStatusChanged).not.toHaveBeenCalled();
      });

      test('does not emit for hits with no workflow status field', async () => {
        // The update script only assigns when a status field is non-null, so a status-less
        // hit is an Elasticsearch no-op and must not start a workflow.
        context.core.elasticsearch.client.asCurrentUser.search.mockResponse({
          took: 1,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: {
            hits: [
              {
                _id: 'status-less',
                _index: '.siem-signals-default',
                _source: { 'some.other.field': 'value' },
              },
            ],
            total: { value: 1, relation: 'eq' },
            max_score: 0,
          },
        });
        await server.inject(
          getSetSignalStatusByQueryRequest(),
          requestContextMock.convertContext(context)
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(mockEventBus.emitAlertStatusChanged).not.toHaveBeenCalled();
      });

      test('still emits a hit whose stored status is non-null but unrecognized', async () => {
        // "triaged" is overwritten by the update script, so the ID transitions even though
        // it produces no previousStatuses row.
        context.core.elasticsearch.client.asCurrentUser.search.mockResponse({
          took: 1,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: {
            hits: [
              {
                _id: 'unrecognized',
                _index: '.siem-signals-default',
                _source: { 'kibana.alert.workflow_status': 'triaged' },
              },
            ],
            total: { value: 1, relation: 'eq' },
            max_score: 0,
          },
        });
        await server.inject(
          getSetSignalStatusByQueryRequest(),
          requestContextMock.convertContext(context)
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(mockEventBus.emitAlertStatusChanged).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ alertIds: ['unrecognized'], previousStatuses: [] })
        );
      });

      test('does not report truncation for a large all-status-less query', async () => {
        // ES now excludes status-less docs from the prefetch, so hits.total reflects only
        // documents that can actually transition. Without that, `truncated` stayed true after
        // every hit was filtered out and fired the trigger with an empty alertIds list.
        context.core.elasticsearch.client.asCurrentUser.search.mockResponse({
          took: 1,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: { hits: [], total: { value: 0, relation: 'eq' }, max_score: 0 },
        });
        await server.inject(
          getSetSignalStatusByQueryRequest(),
          requestContextMock.convertContext(context)
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(mockEventBus.emitAlertStatusChanged).not.toHaveBeenCalled();
      });

      test('requires a non-null status field in the prefetch query', async () => {
        await server.inject(
          getSetSignalStatusByQueryRequest(),
          requestContextMock.convertContext(context)
        );
        const call = context.core.elasticsearch.client.asCurrentUser.search.mock.calls[0][0] as {
          query: { bool: { must_not: unknown[] } };
        };
        expect(call.query.bool.must_not).toContainEqual({
          bool: {
            must_not: [
              { exists: { field: 'kibana.alert.workflow_status' } },
              { exists: { field: 'signal.status' } },
            ],
          },
        });
      });

      test('does not emit when prefetch fails', async () => {
        context.core.elasticsearch.client.asCurrentUser.search.mockRejectedValue(
          new Error('ES search error')
        );
        await server.inject(
          getSetSignalStatusByQueryRequest(),
          requestContextMock.convertContext(context)
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(mockEventBus.emitAlertStatusChanged).not.toHaveBeenCalled();
      });
    });
  });
});
