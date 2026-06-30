/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual } from 'lodash';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { SanitizedRule } from '@kbn/alerting-types';
import { ruleTypeMappings } from '@kbn/securitysolution-rules';
import { SecurityRuleChangeTrackingAction } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { DetectionRulesAuthz } from '../../../../../../../common/detection_engine/rule_management/authz';
import type {
  RuleResponse,
  RuleObjectId,
} from '../../../../../../../common/api/detection_engine/model/rule_schema';
import type { MlAuthz } from '../../../../../machine_learning/authz';
import type { IPrebuiltRuleAssetsClient } from '../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import type { RuleParams } from '../../../../rule_schema';
import { SERVER_APP_ID } from '../../../../../../../common';
import { convertAlertingRuleToRuleResponse } from '../converters/convert_alerting_rule_to_rule_response';
import { convertRuleResponseToAlertingRule } from '../converters/convert_rule_response_to_alerting_rule';
import { applyRuleUpdate } from '../mergers/apply_rule_update';
import {
  ClientError,
  RuleConcurrencyError,
  validateFieldWritePermissions,
  validateMlAuth,
} from '../utils';
import { getRuleById } from './get_rule_by_id';
import { getRuleByRuleId } from './get_rule_by_rule_id';

interface RestoreRuleFromHistoryParams {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  prebuiltRuleAssetClient: IPrebuiltRuleAssetsClient;
  mlAuthz: MlAuthz;
  rulesAuthz: DetectionRulesAuthz;
  ruleId: RuleObjectId;
  changeId: string;
  currentRuleRevision?: number;
}

interface RestoreRuleFromHistoryResult {
  rule: RuleResponse;
  no_change?: true;
}

export const restoreRuleFromHistory = async (
  params: RestoreRuleFromHistoryParams
): Promise<RestoreRuleFromHistoryResult> => {
  const { rulesClient, ruleId, changeId, currentRuleRevision } = params;

  const existingRule = await getRuleById({ rulesClient, id: ruleId });

  if (existingRule == null && currentRuleRevision != null) {
    throw new ClientError(
      'Someone has restored this deleted rule already. Please provide the latest rule revision.',
      409
    );
  }

  if (existingRule != null && existingRule.revision !== currentRuleRevision) {
    throw new RuleConcurrencyError(
      'Someone has updated the rule already. Please provide the latest rule revision.',
      existingRule.revision
    );
  }

  // `from` is intentionally omitted: the event.id term-filter makes the target
  // document the first (and only) hit; ES default of 0 is correct here.
  const historyResult = await rulesClient.getHistory({
    module: 'security',
    ruleId,
    size: 1,
    filters: [{ term: { 'event.id': changeId } }],
  });

  if (historyResult.items.length === 0) {
    throw new ClientError(`changeId: "${changeId}" not found`, 404);
  }

  const item = historyResult.items[0];

  if (!item.rule) {
    throw new Error(`Snapshot for changeId: "${changeId}" could not be hydrated`);
  }

  const snapshotRule = convertAlertingRuleToRuleResponse(item.rule as SanitizedRule<RuleParams>);

  if (existingRule == null) {
    return restoreDeletedRule({
      ...params,
      snapshotRule,
    });
  }

  return restoreRuleState({
    ...params,
    existingRule,
    snapshotRule,
  });
};

interface RestoreRuleStateParams extends RestoreRuleFromHistoryParams {
  existingRule: RuleResponse;
  snapshotRule: RuleResponse;
}

async function restoreRuleState({
  actionsClient,
  rulesClient,
  prebuiltRuleAssetClient,
  mlAuthz,
  rulesAuthz,
  changeId,
  existingRule,
  snapshotRule,
}: RestoreRuleStateParams): Promise<RestoreRuleFromHistoryResult> {
  await validateMlAuth(mlAuthz, existingRule.type);

  const ruleWithUpdates = await applyRuleUpdate({
    prebuiltRuleAssetClient,
    existingRule,
    ruleUpdate: snapshotRule,
  });

  const ruleToSave = { ...ruleWithUpdates, enabled: existingRule.enabled };

  const existingAlertingRule = convertRuleResponseToAlertingRule(existingRule, actionsClient);
  const newAlertingRule = convertRuleResponseToAlertingRule(ruleToSave, actionsClient);

  if (isEqual(existingAlertingRule, newAlertingRule)) {
    return { rule: existingRule, no_change: true };
  }

  validateFieldWritePermissions(
    {
      exceptions_list: ruleToSave.exceptions_list,
      note: ruleToSave.note,
      investigation_fields: ruleToSave.investigation_fields,
      enabled: ruleToSave.enabled,
    },
    rulesAuthz
  );

  const updatedRule = await rulesClient.update({
    id: existingRule.id,
    data: newAlertingRule,
    changeTracking: {
      action: SecurityRuleChangeTrackingAction.ruleRestore,
      metadata: { restoredFromChangeId: changeId, restoredFromRevision: snapshotRule.revision },
      refresh: 'wait_for',
    },
  });

  return { rule: convertAlertingRuleToRuleResponse(updatedRule) };
}

interface RestoreDeletedRuleParams extends RestoreRuleFromHistoryParams {
  snapshotRule: RuleResponse;
}

async function restoreDeletedRule({
  actionsClient,
  rulesClient,
  mlAuthz,
  rulesAuthz,
  ruleId,
  changeId,
  snapshotRule,
}: RestoreDeletedRuleParams): Promise<RestoreRuleFromHistoryResult> {
  const conflictingRule = await getRuleByRuleId({ rulesClient, ruleId: snapshotRule.rule_id });

  if (conflictingRule != null) {
    throw new ClientError(
      `Cannot restore rule: a rule with rule_id "${snapshotRule.rule_id}" already exists (id: "${conflictingRule.id}"). The rule may have been reinstalled after deletion. Delete the existing rule first, or restore from its own history instead.`,
      409
    );
  }

  await validateMlAuth(mlAuthz, snapshotRule.type);

  validateFieldWritePermissions(
    {
      exceptions_list: snapshotRule.exceptions_list,
      note: snapshotRule.note,
      investigation_fields: snapshotRule.investigation_fields,
      enabled: false,
    },
    rulesAuthz
  );

  const createdRule = await rulesClient.create<RuleParams>({
    data: {
      ...convertRuleResponseToAlertingRule(snapshotRule, actionsClient),
      alertTypeId: ruleTypeMappings[snapshotRule.type],
      consumer: SERVER_APP_ID,
      enabled: false,
    },
    options: { id: ruleId, initialRevision: snapshotRule.revision + 1 },
    changeTracking: {
      action: SecurityRuleChangeTrackingAction.ruleRestore,
      metadata: { restoredFromChangeId: changeId, restoredFromRevision: snapshotRule.revision },
      refresh: 'wait_for',
    },
  });

  return { rule: convertAlertingRuleToRuleResponse(createdRule) };
}
