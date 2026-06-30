/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import {
  BulkActionEditTypeEnum,
  type BulkActionEditPayload,
} from '../../common/api/detection_engine/rule_management';
import type { DetectionRulesAuthz } from '../../common/detection_engine/rule_management/authz';
import type { PrebuiltRulesCustomizationStatus } from '../../common/detection_engine/prebuilt_rules/prebuilt_rule_customization_status';
import type { MlAuthz } from '../lib/machine_learning/authz';
import type { RuleAlertType } from '../lib/detection_engine/rule_schema';
import type { IPrebuiltRuleAssetsClient } from '../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import type { bulkEditRules } from '../lib/detection_engine/rule_management/logic/bulk_actions/bulk_edit_rules';
import {
  ALERT_VALIDATION_WORKFLOW_SYSTEM_CONNECTOR_ID,
  createAlertValidationWorkflowRuleAttachmentService,
  hasAlertValidationWorkflowAction,
} from './alert_validation_workflow_rule_attachments';

const WORKFLOW_ID = 'system-security-alert-validation-default';

const createWorkflowAction = (workflowId = WORKFLOW_ID): RuleAlertType['actions'][number] =>
  ({
    actionTypeId: '.workflows',
    group: 'default',
    id: ALERT_VALIDATION_WORKFLOW_SYSTEM_CONNECTOR_ID,
    params: {
      subAction: 'run',
      subActionParams: {
        workflowId,
        summaryMode: false,
      },
    },
  } as RuleAlertType['actions'][number]);

const createWorkflowSystemAction = (
  workflowId = WORKFLOW_ID
): NonNullable<RuleAlertType['systemActions']>[number] =>
  ({
    actionTypeId: '.workflows',
    id: ALERT_VALIDATION_WORKFLOW_SYSTEM_CONNECTOR_ID,
    params: {
      subAction: 'run',
      subActionParams: {
        workflowId,
        summaryMode: false,
      },
    },
  } as NonNullable<RuleAlertType['systemActions']>[number]);

const createConnectorAction = (): RuleAlertType['actions'][number] =>
  ({
    actionTypeId: '.server-log',
    group: 'default',
    id: 'connector-id',
    params: {
      message: 'Rule {{rule.name}} matched',
    },
    frequency: {
      summary: false,
      notifyWhen: 'onActiveAlert',
      throttle: null,
    },
  } as RuleAlertType['actions'][number]);

const createRule = ({
  id,
  actions = [],
  systemActions = [],
  enabled = true,
}: {
  id: string;
  actions?: RuleAlertType['actions'];
  systemActions?: RuleAlertType['systemActions'];
  enabled?: boolean;
}): RuleAlertType =>
  ({
    id,
    name: `Rule ${id}`,
    enabled,
    actions,
    systemActions,
    params: {
      immutable: false,
    },
  } as RuleAlertType);

const createRulesClient = (rules: RuleAlertType[]): jest.Mocked<RulesClient> =>
  ({
    find: jest.fn().mockResolvedValue({
      data: rules,
      total: rules.length,
      page: 1,
      perPage: 2000,
    }),
  } as Partial<jest.Mocked<RulesClient>> as jest.Mocked<RulesClient>);

const createBulkEditDependencies = () => ({
  actionsClient: {} as ActionsClient,
  prebuiltRuleAssetClient: {} as IPrebuiltRuleAssetsClient,
  mlAuthz: {} as MlAuthz,
  rulesAuthz: {} as DetectionRulesAuthz,
  ruleCustomizationStatus: {} as PrebuiltRulesCustomizationStatus,
});

describe('alert analysis workflow rule attachments', () => {
  it('detects the exact workflow action on a rule', () => {
    expect(
      hasAlertValidationWorkflowAction(
        createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
        WORKFLOW_ID
      )
    ).toBe(true);
    expect(
      hasAlertValidationWorkflowAction(
        createRule({ id: 'rule-1', actions: [createWorkflowAction('other-workflow')] }),
        WORKFLOW_ID
      )
    ).toBe(false);
  });

  it('detects the workflow action when stored as a system action', () => {
    expect(
      hasAlertValidationWorkflowAction(
        createRule({ id: 'rule-1', systemActions: [createWorkflowSystemAction()] }),
        WORKFLOW_ID
      )
    ).toBe(true);
  });

  it('returns total and attached counts for matching rules', async () => {
    const rulesClient = createRulesClient([
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
      createRule({ id: 'rule-2' }),
    ]);
    const service = createAlertValidationWorkflowRuleAttachmentService({
      rulesClient,
      workflowId: WORKFLOW_ID,
    });

    await expect(service.getRuleAttachmentStats({ search: '' })).resolves.toEqual({
      total: 2,
      attached: 1,
    });
    expect(rulesClient.find).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          fields: undefined,
        }),
      })
    );
  });

  it('returns paginated rule attachment summaries', async () => {
    const rulesClient = createRulesClient([
      createRule({ id: 'rule-3' }),
      createRule({ id: 'rule-2', enabled: false }),
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
    ]);
    const service = createAlertValidationWorkflowRuleAttachmentService({
      rulesClient,
      workflowId: WORKFLOW_ID,
    });

    await expect(service.getRuleAttachments({ search: '', page: 2, perPage: 1 })).resolves.toEqual({
      total: 3,
      attached: 1,
      page: 2,
      perPage: 1,
      rules: [
        {
          id: 'rule-3',
          name: 'Rule rule-3',
          enabled: true,
          attached: false,
        },
      ],
    });
  });

  it('sorts rules deterministically by enabled state, name, and id before paginating', async () => {
    const rulesClient = createRulesClient([
      createRule({ id: 'rule-3', enabled: false }),
      createRule({ id: 'rule-2' }),
      createRule({ id: 'rule-1' }),
    ]);
    const service = createAlertValidationWorkflowRuleAttachmentService({
      rulesClient,
      workflowId: WORKFLOW_ID,
    });

    await expect(service.getRuleAttachments({ search: '', page: 1, perPage: 3 })).resolves.toEqual(
      expect.objectContaining({
        rules: [
          expect.objectContaining({ id: 'rule-1' }),
          expect.objectContaining({ id: 'rule-2' }),
          expect.objectContaining({ id: 'rule-3' }),
        ],
      })
    );
  });

  it('returns selectable rule ids for all matching rules missing the workflow action', async () => {
    const rulesClient = createRulesClient([
      createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
      createRule({ id: 'rule-2' }),
      createRule({ id: 'rule-3' }),
    ]);
    const service = createAlertValidationWorkflowRuleAttachmentService({
      rulesClient,
      workflowId: WORKFLOW_ID,
    });

    await expect(service.getRuleAttachmentSelection({ search: '' })).resolves.toEqual({
      total: 3,
      attached: 1,
      selectable: 2,
      attachedRuleIds: ['rule-1'],
      ruleIds: ['rule-2', 'rule-3'],
    });
  });

  it('bulk edits only selected rules that need attachment changes', async () => {
    const missingWorkflowRule = createRule({ id: 'rule-2' });
    const attachedWorkflowRule = createRule({
      id: 'rule-3',
      actions: [createConnectorAction()],
      systemActions: [createWorkflowSystemAction()],
    });
    const bulkEditRulesFn = jest.fn().mockResolvedValue({
      rules: [missingWorkflowRule],
      skipped: [],
      errors: [],
      total: 1,
    }) as jest.MockedFunction<typeof bulkEditRules>;
    const service = createAlertValidationWorkflowRuleAttachmentService({
      rulesClient: createRulesClient([
        createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
        missingWorkflowRule,
        attachedWorkflowRule,
      ]),
      workflowId: WORKFLOW_ID,
      bulkEditDependencies: createBulkEditDependencies(),
      bulkEditRulesFn,
    });

    bulkEditRulesFn
      .mockResolvedValueOnce({
        rules: [missingWorkflowRule],
        skipped: [],
        errors: [],
        total: 1,
      })
      .mockResolvedValueOnce({
        rules: [attachedWorkflowRule],
        skipped: [],
        errors: [],
        total: 1,
      });

    await expect(
      service.updateRuleAttachments({
        attachRuleIds: ['rule-1', 'rule-2'],
        detachRuleIds: ['rule-3'],
      })
    ).resolves.toEqual({
      matched: 3,
      updated: 2,
    });
    expect(bulkEditRulesFn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        rules: [missingWorkflowRule],
        actions: [
          expect.objectContaining({
            type: BulkActionEditTypeEnum.add_rule_actions,
          }) as BulkActionEditPayload,
        ],
      })
    );
    expect(bulkEditRulesFn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        rules: [attachedWorkflowRule],
        actions: [
          expect.objectContaining({
            type: BulkActionEditTypeEnum.set_rule_actions,
            value: {
              actions: [
                expect.objectContaining({
                  id: 'connector-id',
                }),
              ],
            },
          }) as BulkActionEditPayload,
        ],
      })
    );
  });

  it('does not bulk edit rules during dry run', async () => {
    const bulkEditRulesFn = jest.fn() as jest.MockedFunction<typeof bulkEditRules>;
    const service = createAlertValidationWorkflowRuleAttachmentService({
      rulesClient: createRulesClient([
        createRule({ id: 'rule-1', actions: [createWorkflowAction()] }),
        createRule({ id: 'rule-2' }),
      ]),
      workflowId: WORKFLOW_ID,
      bulkEditDependencies: createBulkEditDependencies(),
      bulkEditRulesFn,
    });

    await expect(
      service.updateRuleAttachments({
        attachRuleIds: ['rule-1', 'rule-2'],
        detachRuleIds: [],
        dryRun: true,
      })
    ).resolves.toEqual({
      matched: 2,
      updated: 1,
    });
    expect(bulkEditRulesFn).not.toHaveBeenCalled();
  });

  it('does not bulk edit selected rules that already have the workflow action', async () => {
    const bulkEditRulesFn = jest.fn() as jest.MockedFunction<typeof bulkEditRules>;
    const service = createAlertValidationWorkflowRuleAttachmentService({
      rulesClient: createRulesClient([
        createRule({ id: 'rule-1', systemActions: [createWorkflowSystemAction()] }),
      ]),
      workflowId: WORKFLOW_ID,
      bulkEditDependencies: createBulkEditDependencies(),
      bulkEditRulesFn,
    });

    await expect(
      service.updateRuleAttachments({ attachRuleIds: ['rule-1'], detachRuleIds: [] })
    ).resolves.toEqual({
      matched: 1,
      updated: 0,
    });
    expect(bulkEditRulesFn).not.toHaveBeenCalled();
  });

  it('rejects rules that are both attached and detached in the same request', async () => {
    const service = createAlertValidationWorkflowRuleAttachmentService({
      rulesClient: createRulesClient([createRule({ id: 'rule-1' })]),
      workflowId: WORKFLOW_ID,
      bulkEditDependencies: createBulkEditDependencies(),
    });

    await expect(
      service.updateRuleAttachments({ attachRuleIds: ['rule-1'], detachRuleIds: ['rule-1'] })
    ).rejects.toThrow('Rules cannot be both attached and detached in the same request');
  });
});
