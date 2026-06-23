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
import { setSignalsStatusRoute } from './open_close_signals_route';
import type { SecuritySolutionRequestHandlerContextMock } from '../__mocks__/request_context';

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
});
