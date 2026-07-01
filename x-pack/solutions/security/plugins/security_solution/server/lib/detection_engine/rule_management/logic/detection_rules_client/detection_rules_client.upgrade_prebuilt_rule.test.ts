/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rulesClientMock } from '@kbn/alerting-plugin/server/mocks';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import { SecurityRuleChangeTrackingAction } from '../../../../../../common/detection_engine/rule_management/rule_change_tracking';

import {
  getCreateEqlRuleSchemaMock,
  getCreateRulesSchemaMock,
  getRulesEqlSchemaMock,
  getRulesSchemaMock,
} from '../../../../../../common/api/detection_engine/model/rule_schema/mocks';
import type { PrebuiltRuleAsset } from '../../../prebuilt_rules';
import { getRuleByRuleId } from './methods/get_rule_by_rule_id';
import { getRuleMock } from '../../../routes/__mocks__/request_responses';
import { getEqlRuleParams, getQueryRuleParams } from '../../../rule_schema/mocks';
import { buildMlAuthz } from '../../../../machine_learning/authz';
import { throwAuthzError } from '../../../../machine_learning/validation';
import { createDetectionRulesClient } from './detection_rules_client';
import type { IDetectionRulesClient } from './detection_rules_client_interface';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import { createProductFeaturesServiceMock } from '../../../../product_features_service/mocks';
import { getMockRulesAuthz } from '../../__mocks__/authz';

jest.mock('../../../../machine_learning/authz');
jest.mock('../../../../machine_learning/validation');
jest.mock('./methods/get_rule_by_rule_id');

describe('DetectionRulesClient.upgradePrebuiltRule', () => {
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
      mlAuthz,
      rulesAuthz,
      savedObjectsClient,
      license: licenseMock.createLicenseMock(),
      productFeaturesService: createProductFeaturesServiceMock(),
    });
  });

  it('throws if no matching rule_id is found', async () => {
    const ruleAsset: PrebuiltRuleAsset = {
      ...getCreateRulesSchemaMock(),
      version: 1,
      rule_id: 'rule-id',
    };

    (getRuleByRuleId as jest.Mock).mockResolvedValue(null);
    await expect(detectionRulesClient.upgradePrebuiltRule({ ruleAsset })).rejects.toThrow(
      `Failed to find rule ${ruleAsset.rule_id}`
    );
  });

  it('throws if mlAuth fails', async () => {
    (throwAuthzError as jest.Mock).mockImplementationOnce(() => {
      throw new Error('mocked MLAuth error');
    });

    const ruleAsset: PrebuiltRuleAsset = {
      ...getCreateRulesSchemaMock(),
      version: 1,
      rule_id: 'rule-id',
    };

    await expect(detectionRulesClient.upgradePrebuiltRule({ ruleAsset })).rejects.toThrow(
      'mocked MLAuth error'
    );

    expect(rulesClient.create).not.toHaveBeenCalled();
    expect(rulesClient.delete).not.toHaveBeenCalled();
    expect(rulesClient.update).not.toHaveBeenCalled();
  });

  describe('if the new version has a different type than the existing version', () => {
    // New version is "eql"
    const ruleAsset: PrebuiltRuleAsset = {
      ...getCreateEqlRuleSchemaMock(),
      tags: ['test'],
      type: 'eql',
      version: 1,
      rule_id: 'rule-id',
    };
    // Installed version is "query"
    const installedRule = getRulesSchemaMock();
    installedRule.exceptions_list = [
      { id: 'test_id', list_id: 'hi', type: 'detection', namespace_type: 'agnostic' },
    ];
    installedRule.actions = [
      {
        group: 'default',
        id: 'test_id',
        action_type_id: '.index',
        params: {},
      },
    ];
    installedRule.rule_id = 'rule-id';

    beforeEach(() => {
      rulesClient.create.mockResolvedValue(getRuleMock(getQueryRuleParams()));
      (getRuleByRuleId as jest.Mock).mockResolvedValue(installedRule);
    });

    it('deletes the old rule', async () => {
      await detectionRulesClient.upgradePrebuiltRule({ ruleAsset });
      expect(rulesClient.delete).toHaveBeenCalled();
    });

    it('creates a new rule with the new type and expected params of the original rules', async () => {
      await detectionRulesClient.upgradePrebuiltRule({ ruleAsset });
      expect(rulesClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: ruleAsset.name,
            tags: ruleAsset.tags,
            // enabled and actions are kept from original rule
            actions: [
              expect.objectContaining({
                actionTypeId: '.index',
                group: 'default',
                id: 'test_id',
                params: {},
              }),
            ],
            enabled: installedRule.enabled,
            params: expect.objectContaining({
              index: ruleAsset.index,
              description: ruleAsset.description,
              immutable: true,
              // exceptions_lists, actions, timeline_id and timeline_title are maintained
              timelineTitle: installedRule.timeline_title,
              timelineId: installedRule.timeline_id,
              exceptionsList: installedRule.exceptions_list,
            }),
          }),
          options: expect.objectContaining({
            id: installedRule.id, // id is maintained
          }),
          changeTracking: expect.objectContaining({
            action: SecurityRuleChangeTrackingAction.ruleUpgrade,
          }),
        })
      );
    });

    it('creates a new rule with initialRevision bumped by 1 from the existing rule revision', async () => {
      await detectionRulesClient.upgradePrebuiltRule({ ruleAsset });

      expect(rulesClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            initialRevision: installedRule.revision + 1,
          }),
        })
      );
    });
  });

  describe('if the new version has the same type than the existing version', () => {
    // New version is "eql"
    const ruleAsset: PrebuiltRuleAsset = {
      ...getCreateEqlRuleSchemaMock(),
      tags: ['test'],
      type: 'eql',
      version: 1,
      rule_id: 'rule-id',
    };
    // Installed version is "eql"
    const installedRule = getRulesEqlSchemaMock();
    installedRule.actions = [
      {
        group: 'default',
        id: 'test_id',
        action_type_id: '.index',
        params: {},
      },
    ];
    installedRule.exceptions_list = [
      {
        id: 'exception_list',
        list_id: 'some-id',
        namespace_type: 'single',
        type: 'detection',
      },
    ];

    beforeEach(() => {
      (getRuleByRuleId as jest.Mock).mockResolvedValue(installedRule);
    });

    it('does not pass shouldIncrementRevision to rulesClient.update, relying on alerting default', async () => {
      rulesClient.update.mockResolvedValue(getRuleMock(getEqlRuleParams()));

      await detectionRulesClient.upgradePrebuiltRule({ ruleAsset });

      expect(rulesClient.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ shouldIncrementRevision: expect.anything() })
      );
    });

    it('patches the existing rule with the new params from the rule asset', async () => {
      rulesClient.update.mockResolvedValue(getRuleMock(getEqlRuleParams()));

      await detectionRulesClient.upgradePrebuiltRule({ ruleAsset });
      expect(rulesClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: ruleAsset.name,
            tags: ruleAsset.tags,
            // actions are kept from original rule
            actions: [
              expect.objectContaining({
                actionTypeId: '.index',
                group: 'default',
                id: 'test_id',
                params: {},
              }),
            ],
            params: expect.objectContaining({
              index: ruleAsset.index,
              description: ruleAsset.description,
              exceptionsList: [
                {
                  id: 'exception_list',
                  list_id: 'some-id',
                  namespace_type: 'single',
                  type: 'detection',
                },
              ],
            }),
          }),
          id: installedRule.id,
          changeTracking: expect.objectContaining({
            action: SecurityRuleChangeTrackingAction.ruleUpgrade,
          }),
        })
      );
    });

    it('merges exceptions lists for existing rule and new rule asset', async () => {
      rulesClient.update.mockResolvedValue(getRuleMock(getEqlRuleParams()));
      ruleAsset.exceptions_list = [
        {
          id: 'exception_list',
          list_id: 'some-id',
          namespace_type: 'single',
          type: 'detection',
        },
        {
          id: 'second_exception_list',
          list_id: 'some-other-id',
          namespace_type: 'single',
          type: 'detection',
        },
      ];

      await detectionRulesClient.upgradePrebuiltRule({ ruleAsset });
      expect(rulesClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: ruleAsset.name,
            tags: ruleAsset.tags,
            params: expect.objectContaining({
              index: ruleAsset.index,
              description: ruleAsset.description,
              exceptionsList: [
                {
                  id: 'second_exception_list',
                  list_id: 'some-other-id',
                  namespace_type: 'single',
                  type: 'detection',
                },
                {
                  id: 'exception_list',
                  list_id: 'some-id',
                  namespace_type: 'single',
                  type: 'detection',
                },
              ],
            }),
          }),
          id: installedRule.id,
        })
      );
    });
  });
});
