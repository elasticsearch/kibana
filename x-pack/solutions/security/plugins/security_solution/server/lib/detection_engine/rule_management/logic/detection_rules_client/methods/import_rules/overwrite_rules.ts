/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { SecurityRuleChangeTracking } from '../../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { RuleResponse } from '../../../../../../../../common/api/detection_engine';
import { convertRuleResponseToAlertingRule } from '../../converters/convert_rule_response_to_alerting_rule';
import { applyRuleUpdate } from '../../mergers/apply_rule_update';
import { toggleRuleEnabledOnUpdate } from '../../utils';
import { createRuleImportErrorObject, isRuleImportError } from './errors';
import type { IPrebuiltRuleAssetsClient } from '../../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { RULE_IMPORT_BULK_UPDATE_CONCURRENCY } from '../../../../api/constants';
import type {
  ImportRuleSuccess,
  ImportRuleError,
  ImportableRuleData,
  ImportRulesResult,
} from './types';

interface OverwriteRulesParams {
  rules: ImportableRuleData[];
  existingRules: Record<string, RuleResponse>;
  deps: OverwriteRulesDeps;
}

interface OverwriteRulesDeps {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  prebuiltRuleAssetClient: IPrebuiltRuleAssetsClient;
  changeTracking?: SecurityRuleChangeTracking;
}

export async function overwriteRules({
  rules,
  existingRules,
  deps,
}: OverwriteRulesParams): Promise<ImportRulesResult> {
  const { actionsClient, rulesClient, prebuiltRuleAssetClient, changeTracking } = deps;
  const successes: ImportRuleSuccess[] = [];
  const errors: ImportRuleError[] = [];

  await pMap(
    rules,
    async ({ rule, immutable, ruleSource, exceptionsList }) => {
      try {
        const existingRule = existingRules[rule.rule_id];
        let ruleWithUpdates = await applyRuleUpdate({
          prebuiltRuleAssetClient,
          existingRule,
          // The rule must carry the checked exceptions list with references to
          // non-existent exception lists removed and `id` fields pointing at
          // the lists installed in this cluster.
          ruleUpdate: { ...rule, exceptions_list: [...(exceptionsList ?? [])] },
        });
        // applyRuleUpdate prefers the existing rule's values for `rule_source` and `immutable`, but we want to use the importing rule's calculated values
        ruleWithUpdates = { ...ruleWithUpdates, rule_source: ruleSource, immutable };

        const updatedRule = await rulesClient.update({
          id: existingRule.id,
          data: convertRuleResponseToAlertingRule(ruleWithUpdates, actionsClient),
          changeTracking,
        });

        await toggleRuleEnabledOnUpdate(rulesClient, existingRule, ruleWithUpdates);

        successes.push({
          rule_id: updatedRule.params.ruleId,
          telemetry: {
            id: existingRule.id,
            type: rule.type,
            rule_source: ruleSource,
          },
        });
      } catch (err) {
        errors.push(
          isRuleImportError(err)
            ? err
            : createRuleImportErrorObject({
                ruleId: rule.rule_id,
                message: err?.message ?? 'unknown error',
              })
        );
      }
    },
    { concurrency: RULE_IMPORT_BULK_UPDATE_CONCURRENCY }
  );

  return { successes, errors };
}
