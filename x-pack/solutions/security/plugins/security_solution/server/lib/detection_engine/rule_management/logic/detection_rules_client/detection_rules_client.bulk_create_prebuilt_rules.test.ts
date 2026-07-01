/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { rulesClientMock } from '@kbn/alerting-plugin/server/mocks';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import { SecurityRuleChangeTrackingAction } from '../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';

import { getCreateRulesSchemaMock } from '../../../../../../common/api/detection_engine/model/rule_schema/mocks';
import { buildMlAuthz } from '../../../../machine_learning/authz';
import { throwAuthzError } from '../../../../machine_learning/validation';
import { createDetectionRulesClient } from './detection_rules_client';
import type { IDetectionRulesClient } from './detection_rules_client_interface';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import { createProductFeaturesServiceMock } from '../../../../product_features_service/mocks';
import { getMockRulesAuthz } from '../../__mocks__/authz';
import { convertRuleResponseToAlertingRule } from './converters/convert_rule_response_to_alerting_rule';

jest.mock('uuid', () => ({
  ...jest.requireActual('uuid'),
  v4: jest.fn(() => jest.requireActual('uuid').v4()),
}));
jest.mock('../../../../machine_learning/authz');
jest.mock('../../../../machine_learning/validation');
jest.mock('../../../prebuilt_rules/constants', () => ({
  ...jest.requireActual('../../../prebuilt_rules/constants'),
  PREBUILT_RULES_BULK_CREATE_BATCH_SIZE: 2,
}));
jest.mock('./converters/convert_rule_response_to_alerting_rule', () => ({
  ...jest.requireActual('./converters/convert_rule_response_to_alerting_rule'),
  convertRuleResponseToAlertingRule: jest.fn(
    jest.requireActual('./converters/convert_rule_response_to_alerting_rule')
      .convertRuleResponseToAlertingRule
  ),
}));

describe('DetectionRulesClient.bulkCreatePrebuiltRules', () => {
  let rulesClient: ReturnType<typeof rulesClientMock.create>;
  let detectionRulesClient: IDetectionRulesClient;

  const mlAuthz = (buildMlAuthz as jest.Mock)();
  const rulesAuthz = getMockRulesAuthz();
  const actionsClient: jest.Mocked<ActionsClient> = {} as unknown as jest.Mocked<ActionsClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    rulesClient = rulesClientMock.create();
    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [],
      errors: [],
      total: 0,
    });

    const savedObjectsClient = savedObjectsClientMock.create();
    detectionRulesClient = createDetectionRulesClient({
      actionsClient,
      rulesClient,
      mlAuthz,
      rulesAuthz,
      savedObjectsClient,
      license: licenseMock.createLicenseMock(),
      productFeaturesService: createProductFeaturesServiceMock(),
    });
  });

  it('returns empty results for empty input', async () => {
    const result = await detectionRulesClient.bulkCreatePrebuiltRules({ rules: [] });

    expect(result.results).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(rulesClient.bulkCreateRules).not.toHaveBeenCalled();
  });

  it('calls bulkCreateRules with correct parameters', async () => {
    const params = { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'rule-1' };

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [expect.any(String)],
      errors: [],
      total: 1,
    });

    await detectionRulesClient.bulkCreatePrebuiltRules({ rules: [params] });

    expect(rulesClient.bulkCreateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: [
          expect.objectContaining({
            data: expect.objectContaining({
              enabled: false,
              name: params.name,
              params: expect.objectContaining({
                ruleId: params.rule_id,
                immutable: true,
              }),
            }),
            options: expect.objectContaining({
              id: expect.any(String),
            }),
          }),
        ],
        changeTracking: expect.objectContaining({
          action: SecurityRuleChangeTrackingAction.ruleInstall,
          metadata: expect.objectContaining({
            bulkCount: 1,
          }),
        }),
      })
    );
  });

  it('maps successfulIds to result items with rule_id and version', async () => {
    const preAssignedId = 'test-uuid-123';
    (uuidv4 as jest.Mock).mockReturnValueOnce(preAssignedId);

    const params = { ...getCreateRulesSchemaMock(), version: 3, rule_id: 'my-rule' };

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [preAssignedId],
      errors: [],
      total: 1,
    });

    const result = await detectionRulesClient.bulkCreatePrebuiltRules({ rules: [params] });

    expect(result.results).toEqual([
      {
        id: preAssignedId,
        rule_id: 'my-rule',
        version: 3,
      },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('returns ML auth failures as errors and excludes them from bulk call', async () => {
    const queryRule = { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'query-rule' };
    const mlRule = {
      ...getCreateRulesSchemaMock(),
      type: 'machine_learning' as const,
      anomaly_threshold: 50,
      machine_learning_job_id: 'job-1',
      version: 1,
      rule_id: 'ml-rule',
    };

    (throwAuthzError as jest.Mock).mockImplementation((validationResult) => {
      if (validationResult && !validationResult.valid) {
        throw new Error('ML auth error');
      }
    });
    (mlAuthz as jest.Mocked<typeof mlAuthz>).validateRuleType = jest
      .fn()
      .mockImplementation(async (type: string) => ({
        valid: type !== 'machine_learning',
      }));

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [expect.any(String)],
      errors: [],
      total: 1,
    });

    const result = await detectionRulesClient.bulkCreatePrebuiltRules({
      rules: [queryRule, mlRule],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item.rule_id).toBe('ml-rule');
    expect(result.errors[0].error.message).toBe('ML auth error');

    const bulkCall = rulesClient.bulkCreateRules.mock.calls[0][0];
    expect(bulkCall.rules).toHaveLength(1);
  });

  it('maps BulkOperationErrors back with statusCode', async () => {
    const params = { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'rule-1' };
    const preAssignedId = 'fail-uuid';
    (uuidv4 as jest.Mock).mockReturnValueOnce(preAssignedId);

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [],
      errors: [
        {
          message: 'Conflict: rule already exists',
          status: 409,
          rule: { id: preAssignedId, name: params.name },
        },
      ],
      total: 1,
    });

    const result = await detectionRulesClient.bulkCreatePrebuiltRules({ rules: [params] });

    expect(result.results).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item.rule_id).toBe('rule-1');
    expect(result.errors[0].error.message).toBe('Conflict: rule already exists');
    expect((result.errors[0].error as Error & { statusCode?: number }).statusCode).toBe(409);
  });

  it('skips bulkCreateRules when all rules fail ML auth', async () => {
    const mlRule = {
      ...getCreateRulesSchemaMock(),
      type: 'machine_learning' as const,
      anomaly_threshold: 50,
      machine_learning_job_id: 'job-1',
      version: 1,
      rule_id: 'ml-rule',
    };

    (throwAuthzError as jest.Mock).mockImplementation(() => {
      throw new Error('ML not allowed');
    });

    const result = await detectionRulesClient.bulkCreatePrebuiltRules({ rules: [mlRule] });

    expect(result.errors).toHaveLength(1);
    expect(result.results).toEqual([]);
    expect(rulesClient.bulkCreateRules).not.toHaveBeenCalled();
  });

  it('returns structured errors when bulkCreateRules rejects', async () => {
    (throwAuthzError as jest.Mock).mockImplementation(() => {});

    const rules = [
      { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'rule-1' },
      { ...getCreateRulesSchemaMock(), version: 2, rule_id: 'rule-2' },
    ];

    rulesClient.bulkCreateRules.mockRejectedValue(new Error('bulk authorization failure'));

    const result = await detectionRulesClient.bulkCreatePrebuiltRules({ rules });

    expect(result.results).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].error.message).toBe('bulk authorization failure');
    expect(result.errors[1].error.message).toBe('bulk authorization failure');
  });

  it('returns error for unsupported rule type', async () => {
    const validRule = { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'valid-rule' };
    const badRule = {
      ...getCreateRulesSchemaMock(),
      type: 'not_a_real_type' as never,
      version: 1,
      rule_id: 'bad-rule',
    };

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [expect.any(String)],
      errors: [],
      total: 1,
    });

    const result = await detectionRulesClient.bulkCreatePrebuiltRules({
      rules: [validRule, badRule],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item.rule_id).toBe('bad-rule');
    expect(result.errors[0].error.message).toBe('Unsupported rule type: not_a_real_type');
    expect(rulesClient.bulkCreateRules).toHaveBeenCalledTimes(1);
    expect(rulesClient.bulkCreateRules.mock.calls[0][0].rules).toHaveLength(1);
  });

  it('processes rules in chunks based on PREBUILT_RULES_BULK_CREATE_BATCH_SIZE', async () => {
    const rules = [
      { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'rule-1' },
      { ...getCreateRulesSchemaMock(), version: 2, rule_id: 'rule-2' },
      { ...getCreateRulesSchemaMock(), version: 3, rule_id: 'rule-3' },
    ];

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [],
      errors: [],
      total: 0,
    });

    await detectionRulesClient.bulkCreatePrebuiltRules({ rules });

    expect(rulesClient.bulkCreateRules).toHaveBeenCalledTimes(2);
    expect(rulesClient.bulkCreateRules.mock.calls[0][0].rules).toHaveLength(2);
    expect(rulesClient.bulkCreateRules.mock.calls[1][0].rules).toHaveLength(1);
  });

  it('isolates per-rule conversion errors without failing the entire batch', async () => {
    const goodRule = { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'good-rule' };
    const badRule = { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'bad-rule' };

    const realImpl = jest.requireActual(
      './converters/convert_rule_response_to_alerting_rule'
    ).convertRuleResponseToAlertingRule;
    let callCount = 0;
    (convertRuleResponseToAlertingRule as jest.Mock).mockImplementation((...args: unknown[]) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('conversion failed');
      }
      return realImpl(...args);
    });

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [expect.any(String)],
      errors: [],
      total: 1,
    });

    const result = await detectionRulesClient.bulkCreatePrebuiltRules({
      rules: [goodRule, badRule],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item.rule_id).toBe('bad-rule');
    expect(result.errors[0].error.message).toBe('conversion failed');
    expect(rulesClient.bulkCreateRules).toHaveBeenCalledTimes(1);
    expect(rulesClient.bulkCreateRules.mock.calls[0][0].rules).toHaveLength(1);
  });

  it('handles mixed success and failure in the same bulk response', async () => {
    const rule1 = { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'success-rule' };
    const rule2 = { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'fail-rule' };

    const successId = 'success-uuid';
    const failId = 'fail-uuid';
    (uuidv4 as jest.Mock).mockReturnValueOnce(successId).mockReturnValueOnce(failId);

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [successId],
      errors: [
        {
          message: 'Conflict',
          status: 409,
          rule: { id: failId, name: rule2.name },
        },
      ],
      total: 2,
    });

    const result = await detectionRulesClient.bulkCreatePrebuiltRules({ rules: [rule1, rule2] });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      id: successId,
      rule_id: 'success-rule',
      version: 1,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item.rule_id).toBe('fail-rule');
    expect(result.errors[0].error.message).toBe('Conflict');
  });

  it('includes bulkCount in changeTracking metadata', async () => {
    (throwAuthzError as jest.Mock).mockImplementation(() => {});

    const rules = [
      { ...getCreateRulesSchemaMock(), version: 1, rule_id: 'rule-1' },
      { ...getCreateRulesSchemaMock(), version: 2, rule_id: 'rule-2' },
      { ...getCreateRulesSchemaMock(), version: 3, rule_id: 'rule-3' },
    ];

    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [],
      errors: [],
      total: 3,
    });

    await detectionRulesClient.bulkCreatePrebuiltRules({ rules });

    expect(rulesClient.bulkCreateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        changeTracking: expect.objectContaining({
          metadata: { bulkCount: 3 },
        }),
      })
    );
  });
});
