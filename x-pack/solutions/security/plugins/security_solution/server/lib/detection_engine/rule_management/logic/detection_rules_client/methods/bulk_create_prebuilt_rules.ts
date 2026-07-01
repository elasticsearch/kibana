/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import { ruleTypeMappings } from '@kbn/securitysolution-rules';
import { SERVER_APP_ID } from '../../../../../../../common';
import { SecurityRuleChangeTrackingAction } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { PrebuiltRuleAsset } from '../../../../prebuilt_rules';
import type { MlAuthz } from '../../../../../machine_learning/authz';
import type { RuleParams } from '../../../../rule_schema';
import { convertRuleResponseToAlertingRule } from '../converters/convert_rule_response_to_alerting_rule';
import { applyRuleDefaults } from '../mergers/apply_rule_defaults';
import { validateMlAuth } from '../utils';
import { PREBUILT_RULES_BULK_CREATE_BATCH_SIZE } from '../../../../prebuilt_rules/constants';
import type {
  BulkCreatePrebuiltRulesArgs,
  BulkCreatePrebuiltRulesResult,
} from '../detection_rules_client_interface';

interface BulkCreatePrebuiltRulesOptions {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  mlAuthz: MlAuthz;
  args: BulkCreatePrebuiltRulesArgs;
}

export const bulkCreatePrebuiltRules = async ({
  actionsClient,
  rulesClient,
  mlAuthz,
  args,
}: BulkCreatePrebuiltRulesOptions): Promise<BulkCreatePrebuiltRulesResult> => {
  const { rules } = args;
  const results: BulkCreatePrebuiltRulesResult['results'] = [];
  const errors: BulkCreatePrebuiltRulesResult['errors'] = [];

  if (rules.length === 0) return { results, errors };

  const checkedTypes = new Set<string>();
  const mlAuthErrorByType = new Map<string, Error>();
  for (const rule of rules) {
    if (!checkedTypes.has(rule.type)) {
      checkedTypes.add(rule.type);
      try {
        await validateMlAuth(mlAuthz, rule.type);
      } catch (e) {
        mlAuthErrorByType.set(rule.type, e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  const validRules: PrebuiltRuleAsset[] = [];
  for (const rule of rules) {
    const mlError = mlAuthErrorByType.get(rule.type);
    if (mlError) {
      errors.push({ item: rule, error: mlError });
    } else if (!(rule.type in ruleTypeMappings)) {
      errors.push({
        item: rule,
        error: new Error(`Unsupported rule type: ${rule.type}`),
      });
    } else {
      validRules.push(rule);
    }
  }

  for (let i = 0; i < validRules.length; i += PREBUILT_RULES_BULK_CREATE_BATCH_SIZE) {
    const chunk = validRules.slice(i, i + PREBUILT_RULES_BULK_CREATE_BATCH_SIZE);
    const itemById = new Map<string, PrebuiltRuleAsset>();
    const bulkInputs: Array<{
      data: ReturnType<typeof convertRuleResponseToAlertingRule> & {
        alertTypeId: string;
        consumer: string;
        enabled: boolean;
      };
      options: { id: string };
    }> = [];

    for (const rule of chunk) {
      const id = uuidv4();
      try {
        const alertTypeId = ruleTypeMappings[rule.type as keyof typeof ruleTypeMappings];
        const ruleWithDefaults = applyRuleDefaults({ ...rule, immutable: true });
        const data = {
          ...convertRuleResponseToAlertingRule(ruleWithDefaults, actionsClient),
          alertTypeId,
          consumer: SERVER_APP_ID,
          enabled: false,
        };
        itemById.set(id, rule);
        bulkInputs.push({ data, options: { id } });
      } catch (e) {
        errors.push({ item: rule, error: e instanceof Error ? e : new Error(String(e)) });
      }
    }

    try {
      const { successfulIds, errors: bulkErrors } = await rulesClient.bulkCreateRules<RuleParams>({
        rules: bulkInputs,
        changeTracking: {
          action: SecurityRuleChangeTrackingAction.ruleInstall,
          metadata: { bulkCount: rules.length },
        },
      });

      for (const id of successfulIds) {
        const asset = itemById.get(id);
        if (asset) {
          results.push({ id, rule_id: asset.rule_id, version: asset.version });
        }
      }

      for (const err of bulkErrors) {
        const item = itemById.get(err.rule.id);
        if (item) {
          errors.push({
            item,
            error: Object.assign(new Error(err.message), { statusCode: err.status }),
          });
        }
      }
    } catch (err) {
      const wrappedError = err instanceof Error ? err : new Error(String(err));
      for (const asset of itemById.values()) {
        errors.push({ item: asset, error: wrappedError });
      }
    }
  }

  return { results, errors };
};
