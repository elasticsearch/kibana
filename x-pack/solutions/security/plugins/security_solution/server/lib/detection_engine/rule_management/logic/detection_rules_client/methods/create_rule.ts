/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import { ruleTypeMappings } from '@kbn/securitysolution-rules';
import type { SecurityRuleChangeTracking } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import { SERVER_APP_ID } from '../../../../../../../common';
import type {
  RuleCreateProps,
  RuleResponse,
} from '../../../../../../../common/api/detection_engine/model/rule_schema';
import type { MlAuthz } from '../../../../../machine_learning/authz';
import type { RuleParams } from '../../../../rule_schema';
import { convertAlertingRuleToRuleResponse } from '../converters/convert_alerting_rule_to_rule_response';
import { convertRuleResponseToAlertingRule } from '../converters/convert_rule_response_to_alerting_rule';
import { applyRuleDefaults } from '../mergers/apply_rule_defaults';
import { validateMlAuth } from '../utils';

interface CreateRuleOptions {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  mlAuthz: MlAuthz;
  rule: RuleCreateProps & { immutable: boolean };
  id?: string;
  initialRevision?: number;
  allowMissingConnectorSecrets?: boolean;
  changeTracking?: SecurityRuleChangeTracking;
}

export const createRule = async ({
  actionsClient,
  rulesClient,
  mlAuthz,
  rule,
  id,
  initialRevision,
  allowMissingConnectorSecrets,
  changeTracking,
}: CreateRuleOptions): Promise<RuleResponse> => {
  await validateMlAuth(mlAuthz, rule.type);

  const ruleWithDefaults = applyRuleDefaults(rule);

  const payload = {
    ...convertRuleResponseToAlertingRule(ruleWithDefaults, actionsClient),
    alertTypeId: ruleTypeMappings[rule.type],
    consumer: SERVER_APP_ID,
    enabled: rule.enabled ?? false,
  };

  const createdRule = await rulesClient.create<RuleParams>({
    data: payload,
    options: {
      id,
      initialRevision,
    },
    changeTracking,
    allowMissingConnectorSecrets,
  });

  return convertAlertingRuleToRuleResponse(createdRule);
};
