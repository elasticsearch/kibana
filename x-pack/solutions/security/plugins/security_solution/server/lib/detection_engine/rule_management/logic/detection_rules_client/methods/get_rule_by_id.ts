/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RulesClient } from '@kbn/alerting-plugin/server';
import type {
  RuleObjectId,
  RuleResponse,
} from '../../../../../../../common/api/detection_engine/model/rule_schema';
import type { RuleParams } from '../../../../rule_schema';
import { convertAlertingRuleToRuleResponse } from '../converters/convert_alerting_rule_to_rule_response';

interface GetRuleByIdOptions {
  rulesClient: RulesClient;
  id: RuleObjectId;
}

export const getRuleById = async ({
  rulesClient,
  id,
}: GetRuleByIdOptions): Promise<RuleResponse | null> => {
  try {
    const rule = await rulesClient.resolve<RuleParams>({ id });
    return convertAlertingRuleToRuleResponse(rule);
  } catch (err) {
    if (err?.output?.statusCode === 404) {
      return null;
    }
    throw err;
  }
};
