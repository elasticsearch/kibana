/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { userProfileServiceMock } from '@kbn/core-user-profile-server-mocks';
import type { ListArray } from '@kbn/securitysolution-io-ts-list-types';
import { rulesClientMock } from '@kbn/alerting-plugin/server/mocks';
import { actionsClientMock } from '@kbn/actions-plugin/server/actions_client/actions_client.mock';
import type { AnalyticsServiceSetup } from '@kbn/core/server';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';

import { buildMlAuthz } from '../../../../machine_learning/__mocks__/authz';
import { SecurityRuleChangeTrackingAction } from '../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import { getImportRulesSchemaMock } from '../../../../../../common/api/detection_engine/rule_management/mocks';
import { getRulesSchemaMock } from '../../../../../../common/api/detection_engine/model/rule_schema/mocks';
import { getRuleMock } from '../../../routes/__mocks__/request_responses';
import { getQueryRuleParams } from '../../../rule_schema/mocks';
import { createDetectionRulesClient } from './detection_rules_client';
import { checkRuleExceptionReferences } from './methods/import_rules/check_rule_exception_references';
import { fetchPrebuiltImportContext } from './methods/import_rules/fetch_prebuilt_import_context';
import { findInstalledRulesByRuleIds } from './methods/import_rules/find_installed_rules_by_rule_ids';
import { createProductFeaturesServiceMock } from '../../../../product_features_service/mocks';
import { getMockRulesAuthz } from '../../__mocks__/authz';
import { createRuleImportErrorObject } from './methods/import_rules/errors';
import { DETECTION_RULE_IMPORT_EVENT } from '../../../../telemetry/event_based/events';

jest.mock('./methods/import_rules/check_rule_exception_references');
jest.mock('./methods/import_rules/fetch_prebuilt_import_context');
jest.mock('./methods/import_rules/find_installed_rules_by_rule_ids');

const emptyPrebuiltContext = () => ({
  matchingAssetsByRuleId: {},
  availableRuleAssetIds: new Set<string>(),
});

describe('detectionRulesClient.importRules', () => {
  let rulesClient: ReturnType<typeof rulesClientMock.create>;
  let subject: ReturnType<typeof createDetectionRulesClient>;
  let analytics: AnalyticsServiceSetup;
  const rulesAuthz = getMockRulesAuthz();

  beforeEach(() => {
    jest.clearAllMocks();
    (checkRuleExceptionReferences as jest.Mock).mockReturnValue([[], []]);
    (fetchPrebuiltImportContext as jest.Mock).mockResolvedValue(emptyPrebuiltContext());
    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValue({});

    rulesClient = rulesClientMock.create();
    rulesClient.bulkCreateRules.mockResolvedValue({
      successfulIds: [],
      errors: [],
      total: 0,
    });
    analytics = { reportEvent: jest.fn() } as unknown as AnalyticsServiceSetup;

    const savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.find.mockResolvedValue({
      saved_objects: [],
      total: 0,
      per_page: 20,
      page: 1,
    });

    subject = createDetectionRulesClient({
      actionsClient: actionsClientMock.create(),
      rulesClient,
      userProfile: userProfileServiceMock.createStart(),
      mlAuthz: buildMlAuthz(),
      rulesAuthz,
      savedObjectsClient,
      license: licenseMock.createLicenseMock(),
      productFeaturesService: createProductFeaturesServiceMock(),
      analytics,
    });
  });

  it('all-new disabled rules: single bulkCreateRules call, no conflicts', async () => {
    const ruleToImport = { ...getImportRulesSchemaMock(), enabled: false };
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => ({
      successfulIds: args.rules.map((r) => (r.options as { id: string }).id),
      errors: [],
      total: args.rules.length,
    }));

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [ruleToImport],
    });

    expect(rulesClient.bulkCreateRules).toHaveBeenCalledTimes(1);
    const args = rulesClient.bulkCreateRules.mock.calls[0][0];
    expect(args.rules[0].data.enabled).toBe(false);
    expect(rulesClient.update).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    expect(successes).toEqual([
      expect.objectContaining({
        rule_id: ruleToImport.rule_id,
        telemetry: expect.objectContaining({
          type: 'query',
          rule_source: { type: 'internal' },
        }),
      }),
    ]);
  });

  it('all-new enabled rules: preserves enabled flag in single bulk call', async () => {
    const ruleToImport = { ...getImportRulesSchemaMock(), enabled: true };
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => ({
      successfulIds: args.rules.map((r) => (r.options as { id: string }).id),
      errors: [],
      total: args.rules.length,
    }));

    await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [ruleToImport],
    });

    const args = rulesClient.bulkCreateRules.mock.calls[0][0];
    expect(args.rules[0].data.enabled).toBe(true);
  });

  it('issues a single bulkCreateRules call regardless of input size (alerting batches internally)', async () => {
    const rules = Array.from({ length: 250 }, (_, i) => ({
      ...getImportRulesSchemaMock(),
      rule_id: `rule-${i}`,
    }));
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => ({
      successfulIds: args.rules.map((r) => (r.options as { id: string }).id),
      errors: [],
      total: args.rules.length,
    }));

    const { successes } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules,
    });

    expect(rulesClient.bulkCreateRules).toHaveBeenCalledTimes(1);
    expect(successes).toHaveLength(250);
  });

  it('mixed new+existing with overwriteRules:false reports conflict for existing', async () => {
    const r1 = { ...getImportRulesSchemaMock(), rule_id: 'new-rule' };
    const r2 = { ...getImportRulesSchemaMock(), rule_id: 'existing-rule' };

    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
      'existing-rule': getRulesSchemaMock(),
    });
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => ({
      successfulIds: args.rules.map((r) => (r.options as { id: string }).id),
      errors: [],
      total: args.rules.length,
    }));

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [r1, r2],
    });

    const conflicts = errors.filter((error) => error.error.type === 'conflict');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].error.ruleId).toBe('existing-rule');
    expect(successes).toEqual([expect.objectContaining({ rule_id: 'new-rule' })]);
    expect(rulesClient.bulkCreateRules.mock.calls[0][0].rules).toHaveLength(1);
    expect(rulesClient.update).not.toHaveBeenCalled();
  });

  it('mixed new+existing with overwriteRules:true: existing rules are updated in place and surface as { rule_id }', async () => {
    const r1 = { ...getImportRulesSchemaMock(), rule_id: 'new-rule' };
    const r2 = { ...getImportRulesSchemaMock(), rule_id: 'existing-rule' };
    const existingRule = { ...getRulesSchemaMock(), rule_id: 'existing-rule' };

    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
      'existing-rule': existingRule,
    });
    rulesClient.update.mockResolvedValueOnce(
      getRuleMock({ ...getQueryRuleParams(), ruleId: 'existing-rule' })
    );
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => ({
      successfulIds: args.rules.map((r) => (r.options as { id: string }).id),
      errors: [],
      total: args.rules.length,
    }));

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: true,
      rules: [r1, r2],
    });

    expect(rulesClient.update).toHaveBeenCalledTimes(1);
    expect(rulesClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: existingRule.id })
    );
    expect(rulesClient.bulkCreateRules.mock.calls[0][0].rules).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(successes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule_id: 'existing-rule' }),
        expect.objectContaining({ rule_id: 'new-rule' }),
      ])
    );
  });

  it('per-row bulk error is re-paired to its source rule_id via uuid', async () => {
    const ruleToImport = getImportRulesSchemaMock();
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => {
      const id = (args.rules[0].options as { id: string }).id;
      return {
        successfulIds: [],
        errors: [{ message: 'boom', status: 500, rule: { id, name: ruleToImport.name } }],
        total: 1,
      };
    });

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [ruleToImport],
    });

    expect(successes).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].error.ruleId).toBe(ruleToImport.rule_id);
    expect(errors[0].error.message).toBe('boom');
  });

  it('a thrown bulkCreateRules (whole-batch pre-check) surfaces as per-rule errors, not a rejection', async () => {
    const rules = [
      { ...getImportRulesSchemaMock(), rule_id: 'rule-1' },
      { ...getImportRulesSchemaMock(), rule_id: 'rule-2' },
    ];
    rulesClient.bulkCreateRules.mockRejectedValueOnce(new Error('unauthorized'));

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules,
    });

    expect(successes).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.error.ruleId).sort()).toEqual(['rule-1', 'rule-2']);
    expect(errors.every((e) => e.error.message === 'unauthorized')).toBe(true);
  });

  it('forwards caller changeTracking to rulesClient.update verbatim on overwrite', async () => {
    const existingRule = { ...getRulesSchemaMock(), rule_id: 'existing-rule' };
    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
      'existing-rule': existingRule,
    });
    rulesClient.update.mockResolvedValueOnce(
      getRuleMock({ ...getQueryRuleParams(), ruleId: 'existing-rule' })
    );

    await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: true,
      rules: [{ ...getImportRulesSchemaMock(), rule_id: 'existing-rule' }],
      changeTracking: {
        action: SecurityRuleChangeTrackingAction.ruleImport,
        metadata: { bulkCount: 4200 },
      },
    });

    expect(rulesClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        changeTracking: {
          action: SecurityRuleChangeTrackingAction.ruleImport,
          metadata: { bulkCount: 4200 },
        },
      })
    );
  });

  it('forwards caller changeTracking to rulesClient.bulkCreateRules verbatim', async () => {
    const rules = [
      { ...getImportRulesSchemaMock(), rule_id: 'rule-1' },
      { ...getImportRulesSchemaMock(), rule_id: 'rule-2' },
    ];
    rulesClient.bulkCreateRules.mockResolvedValueOnce({
      successfulIds: [],
      errors: [],
      total: 0,
    });

    await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules,
      changeTracking: {
        action: SecurityRuleChangeTrackingAction.ruleImport,
        metadata: { bulkCount: 4200 },
      },
    });

    expect(rulesClient.bulkCreateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        changeTracking: {
          action: SecurityRuleChangeTrackingAction.ruleImport,
          metadata: { bulkCount: 4200 },
        },
      })
    );
  });

  it('prebuilt rule without a version is rejected before any lookup', async () => {
    (fetchPrebuiltImportContext as jest.Mock).mockResolvedValueOnce({
      ...emptyPrebuiltContext(),
      availableRuleAssetIds: new Set([getImportRulesSchemaMock().rule_id]),
    });
    const ruleToImport = { ...getImportRulesSchemaMock(), version: undefined };

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [ruleToImport],
    });

    expect(successes).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].error.ruleId).toBe(ruleToImport.rule_id);
    expect(errors[0].error.message).toContain('version');
    expect(rulesClient.bulkCreateRules).not.toHaveBeenCalled();
  });

  it('surfaces an ML authz failure as a per-rule error and skips the rule', async () => {
    (buildMlAuthz().validateRuleType as jest.Mock).mockResolvedValueOnce({
      valid: false,
      message: 'ML auth failed',
    });

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [getImportRulesSchemaMock()],
    });

    expect(successes).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe('ML auth failed');
    expect(rulesClient.bulkCreateRules).not.toHaveBeenCalled();
  });

  it('surfaces exception reference errors while still creating the rule', async () => {
    const ruleToImport = getImportRulesSchemaMock();
    (checkRuleExceptionReferences as jest.Mock).mockReturnValueOnce([
      [
        createRuleImportErrorObject({
          ruleId: ruleToImport.rule_id,
          message: 'missing exception list',
        }),
      ],
      [],
    ]);
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => ({
      successfulIds: args.rules.map((r) => (r.options as { id: string }).id),
      errors: [],
      total: args.rules.length,
    }));

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [ruleToImport],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toBe('missing exception list');
    expect(successes).toEqual([expect.objectContaining({ rule_id: ruleToImport.rule_id })]);
  });

  it('overwrite branch: a thrown rulesClient.update error is re-paired to the rule_id', async () => {
    const ruleToImport = { ...getImportRulesSchemaMock(), rule_id: 'existing-rule' };
    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
      'existing-rule': { ...getRulesSchemaMock(), rule_id: 'existing-rule' },
    });
    rulesClient.update.mockRejectedValueOnce(new Error('kaboom'));

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: true,
      rules: [ruleToImport],
    });

    expect(successes).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].error.ruleId).toBe('existing-rule');
    expect(errors[0].error.message).toBe('kaboom');
  });

  it('overwrite branch: persists the checked exceptions list, not the imported one', async () => {
    const danglingExceptionsList: ListArray = [
      { id: 'stale-id', list_id: 'missing-list', type: 'detection', namespace_type: 'single' },
    ];
    const checkedExceptionsList: ListArray = [
      { id: 'local-id', list_id: 'existing-list', type: 'detection', namespace_type: 'single' },
    ];
    const ruleToImport = {
      ...getImportRulesSchemaMock(),
      rule_id: 'existing-rule',
      exceptions_list: danglingExceptionsList,
    };

    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
      'existing-rule': { ...getRulesSchemaMock(), rule_id: 'existing-rule' },
    });
    (checkRuleExceptionReferences as jest.Mock).mockReturnValueOnce([[], checkedExceptionsList]);
    rulesClient.update.mockResolvedValueOnce(
      getRuleMock({ ...getQueryRuleParams(), ruleId: 'existing-rule' })
    );

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: true,
      rules: [ruleToImport],
    });

    expect(errors).toEqual([]);
    expect(successes).toEqual([
      expect.objectContaining({
        rule_id: 'existing-rule',
        telemetry: {
          id: getRulesSchemaMock().id,
          type: 'query',
          rule_source: { type: 'internal' },
        },
      }),
    ]);
    expect(rulesClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          params: expect.objectContaining({ exceptionsList: checkedExceptionsList }),
        }),
      })
    );
  });

  it('a thrown prebuilt context fetch surfaces as per-rule errors, not a rejection', async () => {
    const rules = [
      { ...getImportRulesSchemaMock(), rule_id: 'rule-1' },
      { ...getImportRulesSchemaMock(), rule_id: 'rule-2' },
    ];
    (fetchPrebuiltImportContext as jest.Mock).mockRejectedValueOnce(new Error('search exploded'));

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules,
    });

    expect(successes).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.error.ruleId).sort()).toEqual(['rule-1', 'rule-2']);
    expect(errors.every((e) => e.error.message === 'search exploded')).toBe(true);
    expect(rulesClient.bulkCreateRules).not.toHaveBeenCalled();
  });

  it('a thrown findInstalledRulesByRuleIds surfaces as per-rule errors, not a rejection', async () => {
    const rules = [
      { ...getImportRulesSchemaMock(), rule_id: 'rule-1' },
      { ...getImportRulesSchemaMock(), rule_id: 'rule-2' },
    ];
    (findInstalledRulesByRuleIds as jest.Mock).mockRejectedValueOnce(new Error('find exploded'));

    const { successes, errors } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules,
    });

    expect(successes).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.error.ruleId).sort()).toEqual(['rule-1', 'rule-2']);
    expect(errors.every((e) => e.error.message === 'find exploded')).toBe(true);
    expect(rulesClient.bulkCreateRules).not.toHaveBeenCalled();
  });

  it('returns empty result for empty input without calling alerting/prebuilt context', async () => {
    const result = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [],
    });

    expect(result).toEqual({ successes: [], errors: [] });
    expect(rulesClient.bulkCreateRules).not.toHaveBeenCalled();
    expect(fetchPrebuiltImportContext).not.toHaveBeenCalled();
    expect(findInstalledRulesByRuleIds).not.toHaveBeenCalled();
    expect(analytics.reportEvent).not.toHaveBeenCalled();
  });

  it('emits detection_rule_import for a successful create', async () => {
    const ruleToImport = { ...getImportRulesSchemaMock(), enabled: false };
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => ({
      successfulIds: args.rules.map((r) => (r.options as { id: string }).id),
      errors: [],
      total: args.rules.length,
    }));

    const { successes } = await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [ruleToImport],
    });

    expect(successes).toHaveLength(1);
    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    expect(analytics.reportEvent).toHaveBeenCalledWith(DETECTION_RULE_IMPORT_EVENT.eventType, {
      ruleId: successes[0].telemetry.id,
      ruleType: 'query',
      isPrebuilt: false,
      isCustomized: false,
    });
  });

  it('emits detection_rule_import for a successful overwrite', async () => {
    const existingRule = { ...getRulesSchemaMock(), rule_id: 'existing-rule' };
    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
      'existing-rule': existingRule,
    });
    rulesClient.update.mockResolvedValueOnce(
      getRuleMock({ ...getQueryRuleParams(), ruleId: 'existing-rule' })
    );

    await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: true,
      rules: [{ ...getImportRulesSchemaMock(), rule_id: 'existing-rule' }],
    });

    expect(analytics.reportEvent).toHaveBeenCalledTimes(1);
    expect(analytics.reportEvent).toHaveBeenCalledWith(DETECTION_RULE_IMPORT_EVENT.eventType, {
      ruleId: existingRule.id,
      ruleType: 'query',
      isPrebuilt: false,
      isCustomized: false,
    });
  });

  it('does not emit for conflicts or failed creates', async () => {
    const existingRule = { ...getRulesSchemaMock(), rule_id: 'existing-rule' };
    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
      'existing-rule': existingRule,
    });
    rulesClient.bulkCreateRules.mockImplementationOnce(async (args) => {
      const id = (args.rules[0].options as { id: string }).id;
      return {
        successfulIds: [],
        errors: [{ message: 'boom', status: 500, rule: { id, name: 'new-rule' } }],
        total: 1,
      };
    });

    await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [
        { ...getImportRulesSchemaMock(), rule_id: 'new-rule' },
        { ...getImportRulesSchemaMock(), rule_id: 'existing-rule' },
      ],
    });

    expect(analytics.reportEvent).not.toHaveBeenCalled();
  });

  it('does not emit when bulkCreateRules throws or overwrite update throws', async () => {
    rulesClient.bulkCreateRules.mockRejectedValueOnce(new Error('unauthorized'));

    await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: false,
      rules: [{ ...getImportRulesSchemaMock(), rule_id: 'rule-1' }],
    });

    expect(analytics.reportEvent).not.toHaveBeenCalled();

    (findInstalledRulesByRuleIds as jest.Mock).mockResolvedValueOnce({
      'existing-rule': { ...getRulesSchemaMock(), rule_id: 'existing-rule' },
    });
    rulesClient.update.mockRejectedValueOnce(new Error('kaboom'));

    await subject.importRules({
      allowMissingConnectorSecrets: false,
      overwriteRules: true,
      rules: [{ ...getImportRulesSchemaMock(), rule_id: 'existing-rule' }],
    });

    expect(analytics.reportEvent).not.toHaveBeenCalled();
  });
});
