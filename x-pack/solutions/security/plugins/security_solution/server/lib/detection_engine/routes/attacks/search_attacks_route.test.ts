/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX,
  ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX,
} from '@kbn/elastic-assistant-common';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';

import { DETECTION_ENGINE_ATTACKS_SEARCH_URL } from '../../../../../common/constants';
import {
  getEmptySignalsResponse,
  typicalSignalsQuery,
  typicalSignalsQueryAggs,
} from '../__mocks__/request_responses';
import type { SecuritySolutionRequestHandlerContextMock } from '../__mocks__/request_context';
import { requestContextMock, serverMock, requestMock } from '../__mocks__';
import { searchAttacksRoute } from './search_attacks_route';

const getAttacksSearchQueryRequest = () =>
  requestMock.create({
    method: 'post',
    path: DETECTION_ENGINE_ATTACKS_SEARCH_URL,
    body: typicalSignalsQuery(),
  });

const getAttacksSearchAggsRequest = () =>
  requestMock.create({
    method: 'post',
    path: DETECTION_ENGINE_ATTACKS_SEARCH_URL,
    body: typicalSignalsQueryAggs(),
  });

describe('search for attacks', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: SecuritySolutionRequestHandlerContextMock;

  beforeEach(() => {
    jest.clearAllMocks();
    server = serverMock.create();
    ({ context } = requestContextMock.createTools());
    context.core.elasticsearch.client.asCurrentUser.search.mockResolvedValue(
      elasticsearchClientMock.createSuccessTransportRequestPromise(getEmptySignalsResponse())
    );
    context.core.elasticsearch.client.asCurrentUser.search.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getEmptySignalsResponse() as any
    );

    searchAttacksRoute(server.router);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('search and agg on attack indices only', () => {
    test('returns 200 when using single search', async () => {
      const response = await server.inject(
        getAttacksSearchQueryRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
      expect(context.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
        expect.objectContaining(typicalSignalsQuery())
      );
    });

    test('searches scheduled and adhoc attack indices for the active space', async () => {
      const response = await server.inject(
        getAttacksSearchQueryRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
      expect(context.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: [
            `${ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX}-default`,
            `${ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX}-default`,
          ],
          ignore_unavailable: true,
        })
      );
    });

    test('uses attack index names suffixed with the active Kibana space', async () => {
      context.securitySolution.getSpaceId.mockReturnValue('custom-space');

      const response = await server.inject(
        getAttacksSearchQueryRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
      expect(context.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: [
            `${ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX}-custom-space`,
            `${ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX}-custom-space`,
          ],
        })
      );
    });

    test('returns 200 when using aggregations only', async () => {
      const response = await server.inject(
        getAttacksSearchAggsRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
      expect(context.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
        expect.objectContaining({ ...typicalSignalsQueryAggs(), ignore_unavailable: true })
      );
    });

    test('catches error if search throws error', async () => {
      context.core.elasticsearch.client.asCurrentUser.search.mockRejectedValue(
        new Error('Test error')
      );
      const response = await server.inject(
        getAttacksSearchAggsRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        message: 'Test error',
        status_code: 500,
      });
    });
  });

  describe('request validation', () => {
    test('rejects when missing aggs and search', async () => {
      const request = requestMock.create({
        method: 'post',
        path: DETECTION_ENGINE_ATTACKS_SEARCH_URL,
        body: {},
      });
      const response = await server.inject(request, requestContextMock.convertContext(context));
      expect(response.status).toEqual(400);
      expect(response.body).toEqual({
        message: '"value" must have at least 1 children',
        status_code: 400,
      });
    });
  });
});
