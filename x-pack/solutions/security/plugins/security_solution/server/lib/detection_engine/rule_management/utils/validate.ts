/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PartialRule } from '@kbn/alerting-plugin/server';
import { isEqual } from 'lodash';
import { stringifyZodError } from '@kbn/zod-helpers/v4';
import {
  RuleResponse,
  type RuleUpdateProps,
  type UnresolvedRulePatchProps,
} from '../../../../../common/api/detection_engine';
import { hasValidRuleType, type RuleParams } from '../../rule_schema';
import { type BulkError, createBulkErrorObject } from '../../routes/utils';
import { internalRuleToAPIResponse } from '../logic/detection_rules_client/converters/internal_rule_to_api_response';
import { ClientError } from '../logic/detection_rules_client/utils';

export const transformValidateBulkError = (
  ruleId: string,
  rule: PartialRule<RuleParams>
): RuleResponse | BulkError => {
  if (hasValidRuleType(rule)) {
    const transformed = internalRuleToAPIResponse(rule);
    const result = RuleResponse.safeParse(transformed);
    if (!result.success) {
      return createBulkErrorObject({
        ruleId,
        statusCode: 500,
        message: stringifyZodError(result.error),
      });
    }
    return result.data;
  } else {
    return createBulkErrorObject({
      ruleId,
      statusCode: 500,
      message: 'Internal error transforming',
    });
  }
};

export const validateNonCustomizableUpdateFields = (
  ruleUpdate: RuleUpdateProps,
  existingRule: RuleResponse
) => {
  // We don't allow non-customizable fields to be changed for prebuilt rules
  if (existingRule.rule_source && existingRule.rule_source.type === 'external') {
    if (!isEqual(ruleUpdate.author, existingRule.author)) {
      throw new ClientError(`Cannot update "author" field for prebuilt rules`, 400);
    } else if (ruleUpdate.license !== existingRule.license) {
      throw new ClientError(`Cannot update "license" field for prebuilt rules`, 400);
    }
  }
};

export const validateNonCustomizablePatchFields = (
  rulePatch: UnresolvedRulePatchProps,
  existingRule: RuleResponse
) => {
  // We don't allow non-customizable fields to be changed for prebuilt rules
  if (existingRule.rule_source && existingRule.rule_source.type === 'external') {
    if (rulePatch.author && !isEqual(rulePatch.author, existingRule.author)) {
      throw new ClientError(`Cannot update "author" field for prebuilt rules`, 400);
    } else if (rulePatch.license != null && rulePatch.license !== existingRule.license) {
      throw new ClientError(`Cannot update "license" field for prebuilt rules`, 400);
    }
  }
};
