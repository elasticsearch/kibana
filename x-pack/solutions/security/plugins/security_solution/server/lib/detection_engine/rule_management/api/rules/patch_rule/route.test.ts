/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DETECTION_ENGINE_RULES_URL } from '../../../../../../../common/constants';
import { getPatchRulesSchemaMock } from '../../../../../../../common/api/detection_engine/rule_management/mocks';

import { requestContextMock, serverMock, requestMock } from '../../../../routes/__mocks__';
import {
  getEmptyFindResult,
  getRuleMock,
  getPatchRequest,
  getFindResultWithSingleHit,
  nonRuleFindResult,
  typicalMlRulePayload,
} from '../../../../routes/__mocks__/request_responses';

import { getMlRuleParams, getQueryRuleParams } from '../../../../rule_schema/mocks';

import {
  getRulesSchemaMock,
  getRulesMlSchemaMock,
} from '../../../../../../../common/api/detection_engine/model/rule_schema/rule_response_schema.mock';

import { patchRuleRoute } from './route';
import { HttpAuthzError } from '../../../../../machine_learning/validation';
import type {
  MockClients,
  SecuritySolutionRequestHandlerContextMock,
} from '../../../../routes/__mocks__/request_context';
import { createMockEndpointAppContextService } from '../../../../../../endpoint/mocks';

describe('Patch rule route', () => {
  let server: ReturnType<typeof serverMock.create>;
  let clients: MockClients;
  let context: SecuritySolutionRequestHandlerContextMock;

  beforeEach(() => {
    jest.clearAllMocks();
    server = serverMock.create();
    ({ clients, context } = requestContextMock.createTools());

    clients.rulesClient.get.mockResolvedValue(getRuleMock(getQueryRuleParams())); // existing rule
    clients.rulesClient.find.mockResolvedValue(getFindResultWithSingleHit()); // existing rule
    clients.rulesClient.update.mockResolvedValue(getRuleMock(getQueryRuleParams())); // successful update
    clients.detectionRulesClient.patchRule.mockResolvedValue(getRulesSchemaMock());

    context.securitySolution.getEndpointService.mockReturnValue(
      createMockEndpointAppContextService()
    );

    patchRuleRoute(server.router);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('status codes', () => {
    test('returns 200', async () => {
      const response = await server.inject(
        getPatchRequest(),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
    });

    test('returns 404 when updating a single rule that does not exist', async () => {
      clients.rulesClient.find.mockResolvedValue(getEmptyFindResult());
      const response = await server.inject(
        getPatchRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(404);
      expect(response.body).toEqual({
        message: 'rule_id: "rule-1" not found',
        status_code: 404,
      });
    });

    test('returns error if requesting a non-rule', async () => {
      clients.rulesClient.find.mockResolvedValue(nonRuleFindResult());
      const response = await server.inject(
        getPatchRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(404);
      expect(response.body).toEqual({
        message: expect.stringContaining('not found'),
        status_code: 404,
      });
    });

    test('catches error if update throws error', async () => {
      clients.detectionRulesClient.patchRule.mockImplementation(async () => {
        throw new Error('Test error');
      });
      const response = await server.inject(
        getPatchRequest(),
        requestContextMock.convertContext(context)
      );
      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        message: 'Test error',
        status_code: 500,
      });
    });

    test('allows ML Params to be patched', async () => {
      clients.rulesClient.get.mockResolvedValueOnce(getRuleMock(getMlRuleParams()));
      clients.rulesClient.find.mockResolvedValueOnce({
        ...getFindResultWithSingleHit(),
        data: [getRuleMock(getMlRuleParams())],
      });

      const anomalyThreshold = 4;
      const machineLearningJobId = 'some_job_id';
      clients.detectionRulesClient.patchRule.mockResolvedValueOnce({
        ...getRulesMlSchemaMock(),
        anomaly_threshold: anomalyThreshold,
        machine_learning_job_id: [machineLearningJobId],
      });

      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_URL,
        body: {
          type: 'machine_learning',
          rule_id: 'my-rule-id',
          anomaly_threshold: anomalyThreshold,
          machine_learning_job_id: machineLearningJobId,
        },
      });
      const response = await server.inject(request, requestContextMock.convertContext(context));
      expect(response.status).toEqual(200);
      expect(response.body.machine_learning_job_id).toEqual([machineLearningJobId]);
      expect(response.body.anomaly_threshold).toEqual(anomalyThreshold);
    });

    it('rejects patching a rule to ML if mlAuthz fails', async () => {
      clients.detectionRulesClient.patchRule.mockImplementationOnce(async () => {
        throw new HttpAuthzError('mocked validation message');
      });

      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_URL,
        body: typicalMlRulePayload(),
      });
      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(403);
      expect(response.body).toEqual({
        message: 'mocked validation message',
        status_code: 403,
      });
    });

    it('rejects patching an ML rule if mlAuthz fails', async () => {
      clients.detectionRulesClient.patchRule.mockImplementationOnce(async () => {
        throw new HttpAuthzError('mocked validation message');
      });

      const { type, ...payloadWithoutType } = typicalMlRulePayload();
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_URL,
        body: payloadWithoutType,
      });
      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(403);
      expect(response.body).toEqual({
        message: 'mocked validation message',
        status_code: 403,
      });
    });
  });

  describe('request validation', () => {
    test('rejects payloads with no ID', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_URL,
        body: { ...getPatchRulesSchemaMock(), rule_id: undefined },
      });
      const response = await server.inject(request, requestContextMock.convertContext(context));
      expect(response.body).toEqual({
        message: ['either "id" or "rule_id" must be set'],
        status_code: 400,
      });
    });

    test('allows query rule type', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_URL,
        body: { ...getPatchRulesSchemaMock(), type: 'query' },
      });
      const result = server.validate(request);

      expect(result.ok).toHaveBeenCalled();
    });

    test('preserves type-specific fields when "type" is omitted', async () => {
      const threshold = { field: ['host.name'], value: 200 };
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_URL,
        body: { rule_id: 'rule-1', threshold },
      });
      const response = await server.inject(request, requestContextMock.convertContext(context));

      expect(response.status).toEqual(200);
      expect(clients.detectionRulesClient.patchRule).toHaveBeenCalledWith(
        expect.objectContaining({ rulePatch: expect.objectContaining({ threshold }) })
      );
    });

    test('allows rule type of query and custom from and interval', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_URL,
        body: { from: 'now-7m', interval: '5m', ...getPatchRulesSchemaMock() },
      });
      const result = server.validate(request);

      expect(result.ok).toHaveBeenCalled();
    });

    test('disallows invalid "from" param on rule', async () => {
      const request = requestMock.create({
        method: 'patch',
        path: DETECTION_ENGINE_RULES_URL,
        body: {
          from: 'now-3755555555555555.67s',
          interval: '5m',
          ...getPatchRulesSchemaMock(),
        },
      });
      const result = server.validate(request);
      expect(result.badRequest).toHaveBeenCalledWith(
        expect.stringContaining('from: Failed to parse date-math expression')
      );
    });
  });
});
