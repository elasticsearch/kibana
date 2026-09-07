/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { userProfileServiceMock } from '@kbn/core-user-profile-server-mocks';
import { rulesClientMock } from '@kbn/alerting-plugin/server/rules_client.mock';
import type { ActionsClient } from '@kbn/actions-plugin/server';

import { getRuleMock } from '../../../routes/__mocks__/request_responses';
import { getMlRuleParams, getQueryRuleParams } from '../../../rule_schema/mocks';
import {
  getCreateMachineLearningRulesSchemaMock,
  getCreateRulesSchemaMock,
  getRulesMlSchemaMock,
  getRulesSchemaMock,
} from '../../../../../../common/api/detection_engine/model/rule_schema/mocks';
import { getRuleByRuleId } from './methods/get_rule_by_rule_id';
import { buildMlAuthz } from '../../../../machine_learning/authz';
import { throwAuthzError } from '../../../../machine_learning/validation';
import { createDetectionRulesClient } from './detection_rules_client';
import type { IDetectionRulesClient } from './detection_rules_client_interface';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import { createProductFeaturesServiceMock } from '../../../../product_features_service/mocks';
import { getMockRulesAuthz } from '../../__mocks__/authz';
import { convertAlertingRuleToRuleResponse } from './converters/convert_alerting_rule_to_rule_response';

jest.mock('../../../../machine_learning/authz');
jest.mock('../../../../machine_learning/validation');

jest.mock('./methods/get_rule_by_rule_id');

describe('DetectionRulesClient.updateRule', () => {
  let rulesClient: ReturnType<typeof rulesClientMock.create>;
  let detectionRulesClient: IDetectionRulesClient;

  const mlAuthz = (buildMlAuthz as jest.Mock)();
  const rulesAuthz = getMockRulesAuthz();
  let actionsClient = {
    isSystemAction: jest.fn((id: string) => id === 'system-connector-.cases'),
  } as unknown as jest.Mocked<ActionsClient>;

  beforeEach(() => {
    actionsClient = {
      isSystemAction: jest.fn((id: string) => id === 'system-connector-.cases'),
    } as unknown as jest.Mocked<ActionsClient>;

    rulesClient = rulesClientMock.create();

    const savedObjectsClient = savedObjectsClientMock.create();
    detectionRulesClient = createDetectionRulesClient({
      actionsClient,
      rulesClient,
      userProfile: userProfileServiceMock.createStart(),
      mlAuthz,
      rulesAuthz,
      savedObjectsClient,
      license: licenseMock.createLicenseMock(),
      productFeaturesService: createProductFeaturesServiceMock(),
    });
  });

  it('calls the rulesClient with expected params', async () => {
    // Mock the existing rule
    const existingRule = getRulesSchemaMock();
    (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

    // Mock the rule update
    const ruleUpdate = getCreateRulesSchemaMock('query-rule-id');
    ruleUpdate.name = 'new name';
    ruleUpdate.description = 'new description';

    // Mock the rule returned after update; not used for this test directly but
    // needed so that the patchRule method does not throw
    rulesClient.update.mockResolvedValue(getRuleMock(getQueryRuleParams()));

    await detectionRulesClient.updateRule({ ruleUpdate });

    expect(rulesClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: ruleUpdate.name,
          params: expect.objectContaining({
            ruleId: ruleUpdate.rule_id,
            description: ruleUpdate.description,
          }),
        }),
      })
    );
  });

  it('calls the rulesClient with actions and system actions', async () => {
    const ruleUpdate = {
      ...getCreateRulesSchemaMock(),
      actions: [
        {
          id: 'system-connector-.cases',
          params: {
            subAction: 'run',
            subActionParams: {
              timeWindow: '7d',
              reopenClosedCases: false,
              groupingBy: ['agent.name'],
            },
          },
          action_type_id: '.cases',
          uuid: 'e62cbe00-a0e1-44d9-9585-c39e5da63d6f',
        },
        {
          id: 'b7da98d0-e1ef-4954-969f-e69c9ef5f65d',
          params: {
            message: 'Rule {{context.rule.name}} generated {{state.signals_count}} alerts',
          },
          action_type_id: '.slack',
          uuid: '4c3601b5-74b9-4330-b2f3-fea4ea3dc046',
          frequency: {
            summary: true,
            notifyWhen: 'onActiveAlert' as 'onActiveAlert', // needed for type check on line 127
            throttle: null,
          },
          group: 'default',
        },
      ],
    };
    const existingRule = getRulesSchemaMock();
    (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);
    rulesClient.update.mockResolvedValue(
      getRuleMock(getQueryRuleParams(), {
        actions: [
          {
            id: 'b7da98d0-e1ef-4954-969f-e69c9ef5f65d',
            params: {
              message: 'Rule {{context.rule.name}} generated {{state.signals_count}} alerts',
            },
            actionTypeId: '.slack',
            uuid: '4c3601b5-74b9-4330-b2f3-fea4ea3dc046',
            frequency: { summary: true, notifyWhen: 'onActiveAlert', throttle: null },
            group: 'default',
          },
        ],
        systemActions: [
          {
            id: 'system-connector-.cases',
            params: {
              subAction: 'run',
              subActionParams: {
                timeWindow: '7d',
                reopenClosedCases: false,
                groupingBy: ['agent.name'],
              },
            },
            actionTypeId: '.cases',
            uuid: 'e62cbe00-a0e1-44d9-9585-c39e5da63d6f',
          },
        ],
      })
    );

    await detectionRulesClient.updateRule({ ruleUpdate });

    expect(rulesClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actions: expect.arrayContaining([
            {
              id: 'b7da98d0-e1ef-4954-969f-e69c9ef5f65d',
              params: {
                message: 'Rule {{context.rule.name}} generated {{state.signals_count}} alerts',
              },
              actionTypeId: '.slack',
              uuid: '4c3601b5-74b9-4330-b2f3-fea4ea3dc046',
              frequency: {
                summary: true,
                notifyWhen: 'onActiveAlert' as 'onActiveAlert', // needed for type check on line 127
                throttle: null,
              },
              group: 'default',
            },
          ]),
          systemActions: expect.arrayContaining([
            {
              id: 'system-connector-.cases',
              params: {
                subAction: 'run',
                subActionParams: {
                  timeWindow: '7d',
                  reopenClosedCases: false,
                  groupingBy: ['agent.name'],
                },
              },
              actionTypeId: '.cases',
              uuid: 'e62cbe00-a0e1-44d9-9585-c39e5da63d6f',
            },
          ]),
        }),
      })
    );
  });

  it('calls the rulesClient when updating a system action groupingBy property from agent.name to agent.type', async () => {
    const ruleUpdate = {
      ...getCreateRulesSchemaMock(),
      actions: [
        {
          id: 'system-connector-.cases',
          params: {
            subAction: 'run',
            subActionParams: {
              timeWindow: '7d',
              reopenClosedCases: false,
              groupingBy: ['agent.type'], // changing this value
            },
          },
          action_type_id: '.cases',
          uuid: 'e62cbe00-a0e1-44d9-9585-c39e5da63d6f',
        },
        {
          id: 'b7da98d0-e1ef-4954-969f-e69c9ef5f65d',
          params: {
            message: 'Rule {{context.rule.name}} generated {{state.signals_count}} alerts',
          },
          action_type_id: '.slack',
          uuid: '4c3601b5-74b9-4330-b2f3-fea4ea3dc046',
          frequency: {
            summary: true,
            notifyWhen: 'onActiveAlert' as 'onActiveAlert', // needed for type check on line 127
            throttle: null,
          },
          group: 'default',
        },
      ],
    };
    const existingRule = getRuleMock(getQueryRuleParams(), {
      systemActions: [
        {
          id: 'system-connector-.cases',
          params: {
            subAction: 'run',
            subActionParams: {
              timeWindow: '7d',
              reopenClosedCases: false,
              groupingBy: ['agent.name'], // changing this value
            },
          },
          actionTypeId: '.cases',
          uuid: 'e62cbe00-a0e1-44d9-9585-c39e5da63d6f',
        },
      ],
      actions: [
        {
          id: 'b7da98d0-e1ef-4954-969f-e69c9ef5f65d',
          params: {
            message: 'Rule {{context.rule.name}} generated {{state.signals_count}} alerts',
          },
          actionTypeId: '.slack',
          uuid: '4c3601b5-74b9-4330-b2f3-fea4ea3dc046',
          frequency: {
            summary: true,
            notifyWhen: 'onActiveAlert' as 'onActiveAlert', // needed for type check on line 127
            throttle: null,
          },
          group: 'default',
        },
      ],
    });
    (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(
      convertAlertingRuleToRuleResponse(existingRule)
    );
    rulesClient.update.mockResolvedValue(
      getRuleMock(getQueryRuleParams(), {
        actions: [
          {
            id: 'b7da98d0-e1ef-4954-969f-e69c9ef5f65d',
            params: {
              message: 'Rule {{context.rule.name}} generated {{state.signals_count}} alerts',
            },
            actionTypeId: '.slack',
            uuid: '4c3601b5-74b9-4330-b2f3-fea4ea3dc046',
            frequency: { summary: true, notifyWhen: 'onActiveAlert', throttle: null },
            group: 'default',
          },
        ],
        systemActions: [
          {
            id: 'system-connector-.cases',
            params: {
              subAction: 'run',
              subActionParams: {
                timeWindow: '7d',
                reopenClosedCases: false,
                groupingBy: ['agent.type'],
              },
            },
            actionTypeId: '.cases',
            uuid: 'e62cbe00-a0e1-44d9-9585-c39e5da63d6f',
          },
        ],
      })
    );

    await detectionRulesClient.updateRule({ ruleUpdate });

    expect(rulesClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actions: expect.arrayContaining([
            {
              id: 'b7da98d0-e1ef-4954-969f-e69c9ef5f65d',
              params: {
                message: 'Rule {{context.rule.name}} generated {{state.signals_count}} alerts',
              },
              actionTypeId: '.slack',
              uuid: '4c3601b5-74b9-4330-b2f3-fea4ea3dc046',
              frequency: {
                summary: true,
                notifyWhen: 'onActiveAlert' as 'onActiveAlert', // needed for type check on line 127
                throttle: null,
              },
              group: 'default',
            },
          ]),
          systemActions: expect.arrayContaining([
            {
              id: 'system-connector-.cases',
              params: {
                subAction: 'run',
                subActionParams: {
                  timeWindow: '7d',
                  reopenClosedCases: false,
                  groupingBy: ['agent.type'],
                },
              },
              actionTypeId: '.cases',
              uuid: 'e62cbe00-a0e1-44d9-9585-c39e5da63d6f',
            },
          ]),
        }),
      })
    );
  });

  it('calls the rulesClient with new ML params', async () => {
    // Mock the existing rule
    const existingRule = getRulesMlSchemaMock();
    (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

    // Mock the rule update
    const ruleUpdate = getCreateMachineLearningRulesSchemaMock();
    ruleUpdate.anomaly_threshold = 42;
    ruleUpdate.machine_learning_job_id = ['new-job-id'];

    // Mock the rule returned after update; not used for this test directly but
    // needed so that the patchRule method does not throw
    rulesClient.update.mockResolvedValue(getRuleMock(getMlRuleParams()));

    await detectionRulesClient.updateRule({ ruleUpdate });

    expect(rulesClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          params: expect.objectContaining({
            anomalyThreshold: ruleUpdate.anomaly_threshold,
            machineLearningJobId: ruleUpdate.machine_learning_job_id,
          }),
        }),
      })
    );
  });

  it('disables rule if the rule was enabled and enabled is false', async () => {
    // Mock the existing rule
    const existingRule = getRulesSchemaMock();
    existingRule.enabled = true;
    (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

    // Mock the rule update
    const ruleUpdate = { ...getCreateRulesSchemaMock(), enabled: false };

    // Mock the rule returned after update; not used for this test directly but
    // needed so that the patchRule method does not throw
    rulesClient.update.mockResolvedValue(getRuleMock(getQueryRuleParams()));

    await detectionRulesClient.updateRule({ ruleUpdate });

    expect(rulesClient.disableRule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existingRule.id,
      })
    );
  });

  it('enables rule if the rule was disabled and enabled is true', async () => {
    // Mock the existing rule
    const existingRule = getRulesSchemaMock();
    existingRule.enabled = false;
    (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

    // Mock the rule update
    const ruleUpdate = { ...getCreateRulesSchemaMock(), enabled: true };

    // Mock the rule returned after update; not used for this test directly but
    // needed so that the patchRule method does not throw
    rulesClient.update.mockResolvedValue(getRuleMock(getQueryRuleParams()));

    await detectionRulesClient.updateRule({ ruleUpdate });

    expect(rulesClient.enableRule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existingRule.id,
      })
    );
  });

  it('throws if mlAuth fails', async () => {
    (throwAuthzError as jest.Mock).mockImplementationOnce(() => {
      throw new Error('mocked MLAuth error');
    });

    const ruleUpdate = {
      ...getCreateRulesSchemaMock(),
      enabled: true,
    };

    await expect(detectionRulesClient.updateRule({ ruleUpdate })).rejects.toThrow(
      'mocked MLAuth error'
    );

    expect(rulesClient.create).not.toHaveBeenCalled();
  });

  describe('actions', () => {
    it("updates the rule's actions if provided", async () => {
      // Mock the existing rule
      const existingRule = getRulesSchemaMock();
      (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

      // Mock the rule update
      const ruleUpdate = {
        ...getCreateRulesSchemaMock(),
        actions: [
          {
            action_type_id: '.slack',
            id: '2933e581-d81c-4fe3-88fe-c57c6b8a5bfd',
            params: {
              message: 'Rule {{context.rule.name}} generated {{state.signals_count}} signals',
            },
            group: 'default',
          },
        ],
      };

      // Mock the rule returned after update; not used for this test directly but
      // needed so that the patchRule method does not throw
      rulesClient.update.mockResolvedValue(getRuleMock(getQueryRuleParams()));

      await detectionRulesClient.updateRule({ ruleUpdate });

      expect(rulesClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actions: [
              {
                actionTypeId: '.slack',
                id: '2933e581-d81c-4fe3-88fe-c57c6b8a5bfd',
                params: {
                  message: 'Rule {{context.rule.name}} generated {{state.signals_count}} signals',
                },
                group: 'default',
                frequency: { summary: true, throttle: null, notifyWhen: 'onActiveAlert' },
              },
            ],
          }),
        })
      );
    });

    it('updates actions to empty if none are specified', async () => {
      // Mock the existing rule
      const existingRule = getRulesSchemaMock();
      (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);
      existingRule.actions = [
        {
          action_type_id: '.slack',
          id: '2933e581-d81c-4fe3-88fe-c57c6b8a5bfd',
          params: {
            message: 'Rule {{context.rule.name}} generated {{state.signals_count}} signals',
          },
          group: 'default',
        },
      ];

      // Mock the rule update
      const ruleUpdate = getCreateRulesSchemaMock();
      delete ruleUpdate.actions;

      // Mock the rule returned after update; not used for this test directly but
      // needed so that the patchRule method does not throw
      rulesClient.update.mockResolvedValue(getRuleMock(getQueryRuleParams()));

      await detectionRulesClient.updateRule({ ruleUpdate });

      expect(rulesClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actions: [],
          }),
        })
      );
    });

    it('throws an error if rule has external rule source and non-customizable fields are changed', async () => {
      // Mock the existing rule
      const existingRule = {
        ...getRulesSchemaMock(),
        rule_source: { type: 'external', is_customized: true },
      };

      (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

      // Mock the rule update
      const ruleUpdate = { ...getCreateRulesSchemaMock(), author: ['new user'] };

      // Mock the rule returned after update; not used for this test directly but
      // needed so that the patchRule method does not throw
      rulesClient.update.mockResolvedValue(getRuleMock(getQueryRuleParams()));

      await expect(detectionRulesClient.updateRule({ ruleUpdate })).rejects.toThrow(
        'Cannot update "author" field for prebuilt rules'
      );
    });
  });

  describe('RBAC', () => {
    const createClientWithReadAuthz = (
      authzOverrides: Partial<ReturnType<typeof getMockRulesAuthz>>
    ) => {
      const savedObjectsClient = savedObjectsClientMock.create();
      return createDetectionRulesClient({
        actionsClient,
        rulesClient,
        userProfile: userProfileServiceMock.createStart(),
        mlAuthz,
        rulesAuthz: {
          ...getMockRulesAuthz(),
          canEditRules: false,
          ...authzOverrides,
        },
        savedObjectsClient,
        license: licenseMock.createLicenseMock(),
        productFeaturesService: createProductFeaturesServiceMock(),
      });
    };

    beforeEach(() => {
      actionsClient = {
        isSystemAction: jest.fn((id: string) => id === 'system-connector-.cases'),
      } as unknown as jest.Mocked<ActionsClient>;
      rulesClient = rulesClientMock.create();
    });

    describe('`note` field', () => {
      describe('with canEditInvestigationGuides permission', () => {
        beforeEach(() => {
          detectionRulesClient = createClientWithReadAuthz({
            canEditInvestigationGuides: true,
          });
        });

        it('uses bulkEditRuleParamsWithReadAuth when only note field changed', async () => {
          const existingRule = getRulesSchemaMock();
          (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

          const ruleUpdate = {
            ...existingRule,
            id: undefined,
            note: 'Updated investigation guide',
          };

          rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
            rules: [getRuleMock(getQueryRuleParams())],
            skipped: [],
            errors: [],
            total: 1,
          });

          await detectionRulesClient.updateRule({ ruleUpdate });

          expect(rulesClient.bulkEditRuleParamsWithReadAuth).toHaveBeenCalled();
          expect(rulesClient.update).not.toHaveBeenCalled();
        });
      });

      describe('without canEditInvestigationGuides permission', () => {
        beforeEach(() => {
          detectionRulesClient = createClientWithReadAuthz({ canEditInvestigationGuides: false });
        });

        it('throws 403 when updating note', async () => {
          const existingRule = getRulesSchemaMock();
          (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

          const ruleUpdate = {
            ...existingRule,
            id: undefined,
            note: 'Updated investigation guide',
          };

          await expect(detectionRulesClient.updateRule({ ruleUpdate })).rejects.toThrow(
            expect.objectContaining({ statusCode: 403 })
          );
        });

        it('throws 403 when unsetting an existing note', async () => {
          const existingRule = getRulesSchemaMock();
          existingRule.note = 'Existing investigation guide';
          (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

          const ruleUpdate = {
            ...existingRule,
            id: undefined,
            note: undefined,
          };

          await expect(detectionRulesClient.updateRule({ ruleUpdate })).rejects.toThrow(
            expect.objectContaining({ statusCode: 403 })
          );

          expect(rulesClient.bulkEditRuleParamsWithReadAuth).not.toHaveBeenCalled();
          expect(rulesClient.update).not.toHaveBeenCalled();
        });
      });
    });

    describe('`investigation_fields` field', () => {
      describe('with canEditCustomHighlightedFields permission', () => {
        beforeEach(() => {
          detectionRulesClient = createClientWithReadAuthz({
            canEditCustomHighlightedFields: true,
          });
        });

        it('allows updating investigation_fields', async () => {
          const existingRule = getRulesSchemaMock();
          (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

          const ruleUpdate = {
            ...existingRule,
            id: undefined,
            investigation_fields: { field_names: ['host.name', 'user.name'] },
          };

          rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
            rules: [getRuleMock(getQueryRuleParams())],
            skipped: [],
            errors: [],
            total: 1,
          });

          await detectionRulesClient.updateRule({ ruleUpdate });

          expect(rulesClient.bulkEditRuleParamsWithReadAuth).toHaveBeenCalledWith(
            expect.objectContaining({
              operations: expect.arrayContaining([
                expect.objectContaining({
                  field: 'investigationFields',
                  operation: 'set',
                }),
              ]),
            })
          );
        });
      });

      describe('without canEditCustomHighlightedFields permission', () => {
        beforeEach(() => {
          detectionRulesClient = createClientWithReadAuthz({
            canEditCustomHighlightedFields: false,
          });
        });

        it('throws 403 when updating investigation_fields', async () => {
          const existingRule = getRulesSchemaMock();
          (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

          const ruleUpdate = {
            ...existingRule,
            id: undefined,
            investigation_fields: { field_names: ['host.name'] },
          };

          await expect(detectionRulesClient.updateRule({ ruleUpdate })).rejects.toThrow(
            expect.objectContaining({ statusCode: 403 })
          );
        });
      });
    });

    describe('`exceptions_list` field', () => {
      describe('with canEditExceptions permission', () => {
        beforeEach(() => {
          detectionRulesClient = createClientWithReadAuthz({
            canEditExceptions: true,
          });
        });

        it('allows updating exceptions_list', async () => {
          const existingRule = getRulesSchemaMock();
          (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

          const ruleUpdate = {
            ...existingRule,
            id: undefined,
            exceptions_list: [
              {
                id: 'new_exception_list_id',
                list_id: 'new_exception_list',
                namespace_type: 'single' as const,
                type: 'detection' as const,
              },
            ],
          };

          rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
            rules: [getRuleMock(getQueryRuleParams())],
            skipped: [],
            errors: [],
            total: 1,
          });

          await detectionRulesClient.updateRule({ ruleUpdate });

          expect(rulesClient.bulkEditRuleParamsWithReadAuth).toHaveBeenCalledWith(
            expect.objectContaining({
              operations: expect.arrayContaining([
                expect.objectContaining({
                  field: 'exceptionsList',
                  operation: 'set',
                }),
              ]),
            })
          );
        });

        it('allows clearing exceptions_list', async () => {
          const existingRule = getRulesSchemaMock();
          (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

          const ruleUpdate = {
            ...existingRule,
            id: undefined,
            exceptions_list: [],
          };

          rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
            rules: [getRuleMock(getQueryRuleParams())],
            skipped: [],
            errors: [],
            total: 1,
          });

          await detectionRulesClient.updateRule({ ruleUpdate });

          expect(rulesClient.bulkEditRuleParamsWithReadAuth).toHaveBeenCalledWith(
            expect.objectContaining({
              operations: expect.arrayContaining([
                expect.objectContaining({
                  field: 'exceptionsList',
                  operation: 'set',
                  value: [],
                }),
              ]),
            })
          );
        });
      });

      describe('without canEditExceptions permission', () => {
        beforeEach(() => {
          detectionRulesClient = createClientWithReadAuthz({
            canEditExceptions: false,
          });
        });

        it('throws 403 when updating exceptions_list', async () => {
          const existingRule = getRulesSchemaMock();
          (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

          const ruleUpdate = {
            ...existingRule,
            id: undefined,
            exceptions_list: [],
          };

          await expect(detectionRulesClient.updateRule({ ruleUpdate })).rejects.toThrow(
            expect.objectContaining({ statusCode: 403 })
          );
        });
      });
    });

    describe('`enabled` field', () => {
      beforeEach(() => {
        detectionRulesClient = createClientWithReadAuthz({
          canEditInvestigationGuides: true,
          canEnableDisableRules: true,
        });
      });

      it('enables a disabled rule when updating with enabled: true', async () => {
        const existingRule = getRulesSchemaMock();
        existingRule.enabled = false;
        (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

        const ruleUpdate = {
          ...existingRule,
          id: undefined,
          note: 'Updated note',
          enabled: true,
        };

        rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
          rules: [getRuleMock(getQueryRuleParams())],
          skipped: [],
          errors: [],
          total: 1,
        });

        const result = await detectionRulesClient.updateRule({ ruleUpdate });

        expect(result.enabled).toBe(true);
        expect(rulesClient.enableRule).toHaveBeenCalledWith(
          expect.objectContaining({ id: existingRule.id })
        );
        expect(rulesClient.disableRule).not.toHaveBeenCalled();
      });

      it('disables an enabled rule when updating with enabled: false', async () => {
        const existingRule = getRulesSchemaMock();
        existingRule.enabled = true;
        (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

        const ruleUpdate = {
          ...existingRule,
          id: undefined,
          note: 'Updated note',
          enabled: false,
        };

        rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
          rules: [getRuleMock(getQueryRuleParams())],
          skipped: [],
          errors: [],
          total: 1,
        });

        const result = await detectionRulesClient.updateRule({ ruleUpdate });

        expect(result.enabled).toBe(false);
        expect(rulesClient.disableRule).toHaveBeenCalledWith(
          expect.objectContaining({ id: existingRule.id })
        );
        expect(rulesClient.enableRule).not.toHaveBeenCalled();
      });

      it('does not toggle enabled state when it has not changed', async () => {
        const existingRule = getRulesSchemaMock();
        existingRule.enabled = true;
        (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

        const ruleUpdate = {
          ...existingRule,
          id: undefined,
          note: 'Updated note',
          enabled: true, // Same as existing
        };

        rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
          rules: [getRuleMock(getQueryRuleParams())],
          skipped: [],
          errors: [],
          total: 1,
        });

        await detectionRulesClient.updateRule({ ruleUpdate });

        expect(rulesClient.enableRule).not.toHaveBeenCalled();
        expect(rulesClient.disableRule).not.toHaveBeenCalled();
      });
    });

    describe('skipped rules', () => {
      beforeEach(() => {
        detectionRulesClient = createClientWithReadAuthz({ canEditInvestigationGuides: true });
      });

      it('returns existing rule when bulkEditRuleParamsWithReadAuth skips the rule', async () => {
        const existingRule = getRulesSchemaMock();
        existingRule.note = 'Original note';
        (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

        const ruleUpdate = {
          ...existingRule,
          id: undefined,
          note: 'Same note that results in no change',
        };

        rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
          rules: [],
          skipped: [{ id: existingRule.id, skip_reason: 'RULE_NOT_MODIFIED' }],
          errors: [],
          total: 1,
        });

        const result = await detectionRulesClient.updateRule({ ruleUpdate });

        expect(result.id).toBe(existingRule.id);
        expect(result.rule_id).toBe(existingRule.rule_id);
        expect(rulesClient.update).not.toHaveBeenCalled();
      });

      it('returns existing rule with updated enabled state when skipped but enabled changed', async () => {
        const existingRule = getRulesSchemaMock();
        existingRule.enabled = false;
        existingRule.note = 'Original note';
        (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

        const ruleUpdate = {
          ...existingRule,
          id: undefined,
          note: 'Same note',
          enabled: true,
        };

        rulesClient.bulkEditRuleParamsWithReadAuth.mockResolvedValue({
          rules: [],
          skipped: [{ id: existingRule.id, skip_reason: 'RULE_NOT_MODIFIED' }],
          errors: [],
          total: 1,
        });

        const result = await detectionRulesClient.updateRule({ ruleUpdate });

        expect(result.enabled).toBe(true);
        expect(rulesClient.enableRule).toHaveBeenCalledWith(
          expect.objectContaining({ id: existingRule.id })
        );
        expect(rulesClient.update).not.toHaveBeenCalled();
      });
    });
  });
});
