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
import { RULE_RESTORE_FROM_HISTORY_URL } from '../../../../../../../common/api/detection_engine/rule_management';
import { getRulesSchemaMock } from '../../../../../../../common/api/detection_engine/model/rule_schema/rule_response_schema.mock';
import { ClientError } from '../../../logic/detection_rules_client/utils';
import { restoreRuleFromHistoryRoute } from './route';

const buildRestoreRequest = ({ params = {} }: { params: Record<string, string> }) =>
  requestMock.create({
    method: 'post',
    path: RULE_RESTORE_FROM_HISTORY_URL,
    params,
  });

describe('Restore rule from history route', () => {
  let server: ReturnType<typeof serverMock.create>;
  let clients: MockClients;
  let context: SecuritySolutionRequestHandlerContextMock;

  beforeEach(() => {
    jest.clearAllMocks();
    server = serverMock.create();
    ({ clients, context } = requestContextMock.createTools());
    restoreRuleFromHistoryRoute(server.router);
  });

  test('returns 200 with the response from the detection rules client', async () => {
    const rule = getRulesSchemaMock();
    const responseBody = { rule };

    clients.detectionRulesClient.restoreRuleFromHistory.mockResolvedValueOnce(responseBody);

    const response = await server.inject(
      buildRestoreRequest({
        params: {
          ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd',
          changeId: '7b3e4f52-1a2b-4c5d-8e9f-0a1b2c3d4e5f',
        },
      }),
      requestContextMock.convertContext(context)
    );

    expect(response.status).toEqual(200);
    expect(response.body).toEqual(responseBody);
    expect(clients.detectionRulesClient.restoreRuleFromHistory).toHaveBeenCalledWith({
      ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd',
      changeId: '7b3e4f52-1a2b-4c5d-8e9f-0a1b2c3d4e5f',
    });
  });

  test('rejects requests with missing ruleId at validation', () => {
    const result = server.validate(
      buildRestoreRequest({ params: { changeId: '7b3e4f52-1a2b-4c5d-8e9f-0a1b2c3d4e5f' } })
    );
    expect(result.badRequest).toHaveBeenCalled();
  });

  test('rejects requests with missing changeId at validation', () => {
    const result = server.validate(
      buildRestoreRequest({
        params: { ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd' },
      })
    );
    expect(result.badRequest).toHaveBeenCalled();
  });

  test('catches errors thrown by the detection rules client', async () => {
    clients.detectionRulesClient.restoreRuleFromHistory.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    const response = await server.inject(
      buildRestoreRequest({
        params: {
          ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd',
          changeId: '7b3e4f52-1a2b-4c5d-8e9f-0a1b2c3d4e5f',
        },
      }),
      requestContextMock.convertContext(context)
    );

    expect(response.status).toEqual(500);
    expect(response.body).toEqual({ message: 'boom', status_code: 500 });
  });

  test('returns 409 when the detection rules client throws a conflict error', async () => {
    clients.detectionRulesClient.restoreRuleFromHistory.mockImplementationOnce(async () => {
      throw new ClientError('Rule was modified concurrently', 409);
    });

    const response = await server.inject(
      buildRestoreRequest({
        params: {
          ruleId: '6399a03a-9ec2-4c42-8e2a-9e622683cfcd',
          changeId: '7b3e4f52-1a2b-4c5d-8e9f-0a1b2c3d4e5f',
        },
      }),
      requestContextMock.convertContext(context)
    );

    expect(response.status).toEqual(409);
    expect(response.body).toEqual({ message: 'Rule was modified concurrently', status_code: 409 });
  });
});
