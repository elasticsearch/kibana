/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { userProfileServiceMock } from '@kbn/core-user-profile-server-mocks';
import { rulesClientMock } from '@kbn/alerting-plugin/server/mocks';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { RuleChangeHistoryDocument } from '@kbn/alerting-plugin/server';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import { generateChangeHistoryDocument } from '@kbn/change-history/test_utils';

import { SecurityRuleChangeTrackingAction } from '../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import {
  getCreateEqlRuleSchemaMock,
  getCreateRulesSchemaMock,
  getRulesSchemaMock,
  getRulesEqlSchemaMock,
} from '../../../../../../common/api/detection_engine/model/rule_schema/mocks';
import {
  getImportRulesSchemaMock,
  getValidatedRuleToImportMock,
} from '../../../../../../common/api/detection_engine/rule_management/mocks';
import type { PrebuiltRuleAsset } from '../../../prebuilt_rules';
import { getRuleMock, resolveRuleMock } from '../../../routes/__mocks__/request_responses';
import type { RuleParams } from '../../../rule_schema';
import { getQueryRuleParams, getEqlRuleParams } from '../../../rule_schema/mocks';
import { buildMlAuthz } from '../../../../machine_learning/authz';
import { createProductFeaturesServiceMock } from '../../../../product_features_service/mocks';
import { createDetectionRulesClient } from './detection_rules_client';
import type { IDetectionRulesClient } from './detection_rules_client_interface';
import { getRuleByRuleId } from './methods/get_rule_by_rule_id';
import { checkRuleExceptionReferences } from './methods/import_rules/check_rule_exception_references';
import { fetchPrebuiltImportContext } from './methods/import_rules/fetch_prebuilt_import_context';
import { findInstalledRulesByRuleIds } from './methods/import_rules/find_installed_rules_by_rule_ids';
import { getMockRulesAuthz } from '../../__mocks__/authz';

jest.mock('../../../../machine_learning/authz');
jest.mock('../../../../machine_learning/validation');
jest.mock('./methods/get_rule_by_rule_id');
jest.mock('./methods/import_rules/check_rule_exception_references');
jest.mock('./methods/import_rules/fetch_prebuilt_import_context');
jest.mock('./methods/import_rules/find_installed_rules_by_rule_ids');

describe('DetectionRulesClient change tracking', () => {
  let rulesClient: ReturnType<typeof rulesClientMock.create>;
  let detectionRulesClient: IDetectionRulesClient;

  const mlAuthz = (buildMlAuthz as jest.Mock)();
  const rulesAuthz = getMockRulesAuthz();
  const actionsClient = {
    isSystemAction: jest.fn((id: string) => id === 'system-connector-.cases'),
  } as unknown as jest.Mocked<ActionsClient>;

  beforeEach(() => {
    rulesClient = rulesClientMock.create();
    rulesClient.create.mockResolvedValue(getRuleMock(getQueryRuleParams()));
    rulesClient.update.mockResolvedValue(getRuleMock(getQueryRuleParams()));
    rulesClient.bulkDeleteRules.mockResolvedValue({
      rules: [],
      errors: [],
      total: 1,
      taskIdsFailedToBeDeleted: [],
    });

    (getRuleByRuleId as jest.Mock).mockResolvedValue(null);
    (checkRuleExceptionReferences as jest.Mock).mockReturnValue([[], []]);
    (fetchPrebuiltImportContext as jest.Mock).mockResolvedValue({
      matchingAssetsByRuleId: {},
      availableRuleAssetIds: new Set<string>(),
    });
    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValue({});
    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [],
      errors: [],
      total: 0,
    });

    detectionRulesClient = createDetectionRulesClient({
      actionsClient,
      rulesClient,
      userProfile: userProfileServiceMock.createStart(),
      mlAuthz,
      rulesAuthz,
      savedObjectsClient: savedObjectsClientMock.create(),
      license: licenseMock.createLicenseMock(),
      productFeaturesService: createProductFeaturesServiceMock(),
    });
  });

  describe('changeTracking.action', () => {
    it('createCustomRule forwards caller-provided action to rulesClient.create', async () => {
      await detectionRulesClient.createCustomRule({
        params: getCreateRulesSchemaMock(),
        changeTracking: { action: SecurityRuleChangeTrackingAction.ruleDuplicate },
      });

      expect(rulesClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          changeTracking: expect.objectContaining({
            action: SecurityRuleChangeTrackingAction.ruleDuplicate,
          }),
        })
      );
    });

    it('updateRule forwards caller-provided action to rulesClient.update', async () => {
      (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(getRulesSchemaMock());

      const ruleUpdate = getCreateRulesSchemaMock('query-rule-id');
      ruleUpdate.name = 'updated name';

      await detectionRulesClient.updateRule({
        ruleUpdate,
        changeTracking: { action: SecurityRuleChangeTrackingAction.ruleDuplicate },
      });

      expect(rulesClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          changeTracking: expect.objectContaining({
            action: SecurityRuleChangeTrackingAction.ruleDuplicate,
          }),
        })
      );
    });

    it('patchRule forwards caller-provided action to rulesClient.update', async () => {
      const existingRule = getRulesSchemaMock();
      (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(existingRule);

      await detectionRulesClient.patchRule({
        rulePatch: { rule_id: existingRule.rule_id, name: 'patched name' },
        changeTracking: { action: SecurityRuleChangeTrackingAction.ruleDuplicate },
      });

      expect(rulesClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          changeTracking: expect.objectContaining({
            action: SecurityRuleChangeTrackingAction.ruleDuplicate,
          }),
        })
      );
    });

    describe('importRules', () => {
      it('forwards caller-supplied changeTracking when overwriting an existing rule', async () => {
        const existingRule = getRulesSchemaMock();
        (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
          [existingRule.rule_id]: existingRule,
        });

        await detectionRulesClient.importRules({
          rules: [{ ...getValidatedRuleToImportMock(), rule_id: existingRule.rule_id }],
          overwriteRules: true,
          changeTracking: {
            action: SecurityRuleChangeTrackingAction.ruleImport,
            metadata: { bulkCount: 5 },
          },
        });

        expect(rulesClient.update).toHaveBeenCalledWith(
          expect.objectContaining({
            changeTracking: {
              action: SecurityRuleChangeTrackingAction.ruleImport,
              metadata: { bulkCount: 5 },
            },
          })
        );
      });
    });

    describe('upgradePrebuiltRule', () => {
      it('uses ruleUpgrade action when upgrading a same-type rule', async () => {
        const installedRule = getRulesEqlSchemaMock();
        (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(installedRule);
        rulesClient.update.mockResolvedValue(getRuleMock(getEqlRuleParams()));

        const ruleAsset: PrebuiltRuleAsset = {
          ...getCreateEqlRuleSchemaMock(),
          type: 'eql',
          version: 1,
          rule_id: installedRule.rule_id,
        };

        await detectionRulesClient.upgradePrebuiltRule({ ruleAsset });

        expect(rulesClient.update).toHaveBeenCalledWith(
          expect.objectContaining({
            changeTracking: expect.objectContaining({
              action: SecurityRuleChangeTrackingAction.ruleUpgrade,
            }),
          })
        );
      });

      it('uses ruleUpgrade action when upgrading a rule with a type change', async () => {
        const installedRule = getRulesSchemaMock(); // query type
        installedRule.rule_id = 'rule-id';
        (getRuleByRuleId as jest.Mock).mockResolvedValueOnce(installedRule);

        const ruleAsset: PrebuiltRuleAsset = {
          ...getCreateEqlRuleSchemaMock(), // eql type
          type: 'eql',
          version: 1,
          rule_id: 'rule-id',
        };

        await detectionRulesClient.upgradePrebuiltRule({ ruleAsset });

        expect(rulesClient.create).toHaveBeenCalledWith(
          expect.objectContaining({
            changeTracking: expect.objectContaining({
              action: SecurityRuleChangeTrackingAction.ruleUpgrade,
            }),
          })
        );
      });
    });

    it('revertPrebuiltRule uses ruleRevert action', async () => {
      const existingRule = getRulesEqlSchemaMock();
      const ruleAsset: PrebuiltRuleAsset = {
        ...getCreateEqlRuleSchemaMock(),
        type: 'eql',
        version: 1,
        rule_id: existingRule.rule_id,
      };
      rulesClient.update.mockResolvedValue(getRuleMock(getEqlRuleParams()));

      await detectionRulesClient.revertPrebuiltRule({ ruleAsset, existingRule });

      expect(rulesClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          changeTracking: expect.objectContaining({
            action: SecurityRuleChangeTrackingAction.ruleRevert,
          }),
        })
      );
    });

    it('restoreRuleFromHistory records ruleRestore action with restoredFromChangeId metadata', async () => {
      const CHANGE_ID = 'restore-change-abc-123';
      const RULE_ID = '04128c15-0d1b-4716-a4c5-46997ac7f3bd';

      const liveRule = resolveRuleMock(getQueryRuleParams());
      const snapshotRule = getRuleMock(getQueryRuleParams({ description: 'snapshot description' }));

      const historyItem = {
        ...generateChangeHistoryDocument({
          event: {
            id: CHANGE_ID,
            action: 'rule_update',
            type: 'change',
            module: 'security',
            dataset: 'alerting-rules',
          },
        }),
        rule: snapshotRule,
      } as unknown as RuleChangeHistoryDocument<RuleParams>;

      rulesClient.resolve.mockResolvedValue(liveRule);
      rulesClient.getHistory.mockResolvedValue({ total: 1, items: [historyItem] });

      await detectionRulesClient.restoreRuleFromHistory({
        ruleId: RULE_ID,
        changeId: CHANGE_ID,
        currentRuleRevision: 0,
      });

      expect(rulesClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          changeTracking: expect.objectContaining({
            action: SecurityRuleChangeTrackingAction.ruleRestore,
            metadata: expect.objectContaining({ restoredFromChangeId: CHANGE_ID }),
          }),
        })
      );
    });
  });

  describe('changeTracking.bulkCount', () => {
    it('bulkDeleteRules uses caller-provided bulkCount', async () => {
      const ruleIds = ['id-1', 'id-2', 'id-3'];

      await detectionRulesClient.bulkDeleteRules({
        ruleIds,
        changeTracking: { metadata: { bulkCount: 10 } },
      });

      expect(rulesClient.bulkDeleteRules).toHaveBeenCalledWith(
        expect.objectContaining({
          changeTracking: expect.objectContaining({ metadata: { bulkCount: 10 } }),
        })
      );
    });

    it('bulkDeleteRules defaults bulkCount to ruleIds.length when not provided', async () => {
      const ruleIds = ['id-1', 'id-2', 'id-3'];

      await detectionRulesClient.bulkDeleteRules({ ruleIds });

      expect(rulesClient.bulkDeleteRules).toHaveBeenCalledWith(
        expect.objectContaining({
          changeTracking: expect.objectContaining({ metadata: { bulkCount: ruleIds.length } }),
        })
      );
    });

    it('importRules forwards caller-supplied changeTracking to rulesClient.bulkCreateRules verbatim', async () => {
      await detectionRulesClient.importRules({
        rules: [getImportRulesSchemaMock()],
        overwriteRules: false,
        changeTracking: {
          action: SecurityRuleChangeTrackingAction.ruleImport,
          metadata: { bulkCount: 5 },
        },
      });

      expect(rulesClient.bulkCreateRules).toHaveBeenCalledWith(
        expect.objectContaining({
          changeTracking: {
            action: SecurityRuleChangeTrackingAction.ruleImport,
            metadata: { bulkCount: 5 },
          },
        })
      );
    });
  });
});
