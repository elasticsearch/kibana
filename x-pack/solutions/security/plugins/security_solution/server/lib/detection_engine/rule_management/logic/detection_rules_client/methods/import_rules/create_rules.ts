/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { BulkCreateRulesParams, RulesClient } from '@kbn/alerting-plugin/server';
import { ruleTypeMappings } from '@kbn/securitysolution-rules';
import { SERVER_APP_ID } from '../../../../../../../../common';
import type { SecurityRuleChangeTracking } from '../../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { RuleObjectId } from '../../../../../../../../common/api/detection_engine';
import type { RuleParams } from '../../../../../rule_schema';
import { convertRuleResponseToAlertingRule } from '../../converters/convert_rule_response_to_alerting_rule';
import { applyRuleDefaults } from '../../mergers/apply_rule_defaults';
import { createRuleImportErrorObject } from './errors';
import { RULE_IMPORT_BULK_CREATE_BATCH_SIZE } from '../../../../api/constants';
import type {
  ImportRuleSuccess,
  ImportRuleError,
  ImportableRuleData,
  ImportRulesResult,
} from './types';

interface CreateRulesParams {
  rules: ImportableRuleData[];
  options: CreateRulesOptions;
  deps: CreateRulesDeps;
}

interface CreateRulesOptions {
  allowMissingConnectorSecrets?: boolean;
  changeTracking?: SecurityRuleChangeTracking;
}

interface CreateRulesDeps {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
}

export async function createRules({
  rules,
  options,
  deps,
}: CreateRulesParams): Promise<ImportRulesResult> {
  const { actionsClient, rulesClient } = deps;

  const bulkInputs: BulkCreateRulesParams<RuleParams>['rules'] = [];
  const pending = new Map<RuleObjectId, ImportRuleSuccess>();
  const successes: ImportRuleSuccess[] = [];
  const errors: ImportRuleError[] = [];

  for (const { rule, immutable, ruleSource, exceptionsList } of rules) {
    const id = uuidv4();

    try {
      const ruleResponse = applyRuleDefaults({
        ...rule,
        exceptions_list: [...(exceptionsList ?? [])],
        immutable,
        rule_source: ruleSource,
      });
      const data = {
        ...convertRuleResponseToAlertingRule(ruleResponse, actionsClient),
        alertTypeId: ruleTypeMappings[rule.type],
        consumer: SERVER_APP_ID,
        // Alerting mints the API key and schedules the task inline for enabled rules.
        enabled: rule.enabled ?? false,
      };

      bulkInputs.push({
        data,
        options: { id },
        allowMissingConnectorSecrets: options.allowMissingConnectorSecrets,
      });
      pending.set(id, {
        rule_id: rule.rule_id,
        telemetry: {
          id,
          type: rule.type,
          rule_source: ruleSource,
        },
      });
    } catch (e) {
      errors.push(
        createRuleImportErrorObject({
          ruleId: rule.rule_id,
          message: e instanceof Error ? e.message : String(e),
        })
      );
    }
  }

  if (bulkInputs.length === 0) {
    return { successes, errors };
  }

  const { successfulIds, errors: bulkErrors } = await rulesClient.bulkCreateRules<RuleParams>({
    rules: bulkInputs,
    batchSize: RULE_IMPORT_BULK_CREATE_BATCH_SIZE,
    changeTracking: options.changeTracking,
  });

  for (const id of successfulIds) {
    const created = pending.get(id);

    if (created != null) {
      successes.push(created);
    }
  }

  for (const err of bulkErrors) {
    const failed = pending.get(err.rule.id);

    if (failed != null) {
      errors.push(
        createRuleImportErrorObject({
          ruleId: failed.rule_id,
          message: err.message,
        })
      );
    }
  }

  return { successes, errors };
}
