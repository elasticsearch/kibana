/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { requestMock, requestContextMock, serverMock } from '../../../../routes/__mocks__';
import type {
  MockClients,
  SecuritySolutionRequestHandlerContextMock,
} from '../../../../routes/__mocks__/request_context';
import { RULE_HISTORY_URL } from '../../../../../../../common/api/detection_engine/rule_management';
import { ruleHistoryRoute } from './route';

const buildHistoryRequest = ({
  params = {},
  query = {},
}: {
  params: Record<string, string>;
  query: Record<string, string>;
}) =>
  requestMock.create({
    method: 'get',
    path: RULE_HISTORY_URL,
    params,
    query,
  });

describe('Rule changes history route', () => {
  let server: ReturnType<typeof serverMock.create>;
  let clients: MockClients;
  let context: SecuritySolutionRequestHandlerContextMock;

  beforeEach(() => {
    jest.clearAllMocks();
    server = serverMock.create();
    ({ clients, context } = requestContextMock.createTools());
    ruleHistoryRoute(server.router);
  });

  test('returns 200 with the response from the detection rules client', async () => {
    const responseBody = {
      page: 1,
      per_page: 20,
      total: 5,
      items: [],
    };
    clients.detectionRulesClient.getHistoryForRule.mockResolvedValueOnce(responseBody);

    const response = await server.inject(
      buildHistoryRequest({
        params: { ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd' },
        query: {},
      }),
      requestContextMock.convertContext(context)
    );

    expect(response.status).toEqual(200);
    expect(response.body).toEqual(responseBody);
    expect(clients.detectionRulesClient.getHistoryForRule).toHaveBeenCalledWith({
      ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd',
      page: 1,
      perPage: 20,
    });
  });

  test('forwards page and per_page from the query', async () => {
    clients.detectionRulesClient.getHistoryForRule.mockResolvedValueOnce({
      page: 3,
      per_page: 50,
      total: 0,
      items: [],
    });

    await server.inject(
      buildHistoryRequest({
        params: { ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd' },
        query: {
          page: '3',
          per_page: '50',
        },
      }),
      requestContextMock.convertContext(context)
    );

    expect(clients.detectionRulesClient.getHistoryForRule).toHaveBeenCalledWith({
      ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd',
      page: 3,
      perPage: 50,
    });
  });

  test('rejects requests with missing id at validation', () => {
    const result = server.validate(buildHistoryRequest({ params: {}, query: {} }));
    expect(result.badRequest).toHaveBeenCalled();
  });

  test('rejects per_page above the upper bound at validation', () => {
    const result = server.validate(
      buildHistoryRequest({
        params: { ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd' },
        query: { per_page: '101' },
      })
    );
    expect(result.badRequest).toHaveBeenCalled();
  });

  test('catches errors thrown by the detection rules client', async () => {
    clients.detectionRulesClient.getHistoryForRule.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    const response = await server.inject(
      buildHistoryRequest({
        params: { ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd' },
        query: {},
      }),
      requestContextMock.convertContext(context)
    );

    expect(response.status).toEqual(500);
    expect(response.body).toEqual({ message: 'boom', status_code: 500 });
  });
});
