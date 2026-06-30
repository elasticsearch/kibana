/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable max-classes-per-file */

import type { RulesClient } from '@kbn/alerting-plugin/server';

import type { Type } from '@kbn/securitysolution-io-ts-alerting-types';
import { camelCase, isEmpty, isEqual, omit } from 'lodash';
import { validFields } from '@kbn/alerting-plugin/common/constants';
import type { BulkEditResult } from '@kbn/alerting-plugin/server/rules_client/common/bulk_edit/types';

import { normalizeRuleResponse } from '../../../../../../common/detection_engine/prebuilt_rules/diff/normalize_rule_response';
import type { DetectionRulesAuthz } from '../../../../../../common/detection_engine/rule_management/authz';
import { convertObjectKeysToCamelCase } from '../../../../../utils/object_case_converters';
import type { MlAuthz } from '../../../../machine_learning/authz';

import type { RuleSignatureId } from '../../../../../../common/api/detection_engine/model/rule_schema/common_attributes.gen';
import { throwAuthzError } from '../../../../machine_learning/validation';
import {
  READ_AUTH_EDIT_FIELDS,
  type ReadAuthRuleUpdateProps,
  type ReadAuthRuleUpdateWithRuleSource,
  type RuleResponse,
} from '../../../../../../common/api/detection_engine';
import type { RuleParams } from '../../../rule_schema';

export const toggleRuleEnabledOnUpdate = async (
  rulesClient: RulesClient,
  existingRule: RuleResponse,
  updatedRule: RuleResponse
): Promise<{ enabled: boolean }> => {
  if (existingRule.enabled && !updatedRule.enabled) {
    await rulesClient.disableRule({ id: existingRule.id });
    return { enabled: false };
  }

  if (!existingRule.enabled && updatedRule.enabled) {
    await rulesClient.enableRule({ id: existingRule.id });
    return { enabled: true };
  }

  return { enabled: existingRule.enabled };
};

export const validateMlAuth = async (mlAuthz: MlAuthz, ruleType: Type) => {
  throwAuthzError(await mlAuthz.validateRuleType(ruleType));
};

/**
 * Validates that the user has the required permissions to edit the specified fields.
 * Throws a 403 ClientError if the user lacks permissions for any field they're trying to update.
 */
export const validateFieldWritePermissions = (
  ruleUpdate: Partial<ReadAuthRuleUpdateProps>,
  rulesAuthz: DetectionRulesAuthz
) => {
  const errors = [];
  if (ruleUpdate.exceptions_list != null && !rulesAuthz.canEditExceptions) {
    errors.push('exceptions_list');
  }

  if (ruleUpdate.investigation_fields != null && !rulesAuthz.canEditCustomHighlightedFields) {
    errors.push('investigation_fields');
  }

  if (ruleUpdate.note != null && !rulesAuthz.canEditInvestigationGuides) {
    errors.push('note');
  }

  if (ruleUpdate.enabled != null && !rulesAuthz.canEnableDisableRules) {
    errors.push('enabled');
  }

  if (errors.length > 0) {
    throw new ClientError(
      `The current user does not have the permissions to edit the following fields: ${errors.join(
        ','
      )}`,
      403
    );
  }
};

export class ClientError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when a rule operation is rejected due to a concurrent modification. Use this instead of
 * {@link ClientError} with status 409 when the caller needs the current rule revision to retry.
 */
export class RuleConcurrencyError extends Error {
  public readonly statusCode = 409;
  constructor(message: string, public readonly currentRevision: number) {
    super(message);
  }
}

/**
 * Represents an error that occurred while validating a RuleResponse object.
 * Includes the ruleId (rule signature id) of the rule that failed validation.
 * Thrown when a rule does not match the RuleResponse schema.
 * @param message - The error message
 * @param ruleId - The rule signature id of the rule that failed validation
 * @extends Error
 */
export class RuleResponseValidationError extends Error {
  public readonly ruleId: RuleSignatureId;
  constructor({ message, ruleId }: { message: string; ruleId: RuleSignatureId }) {
    super(message);
    this.ruleId = ruleId;
  }
}

/**
 * Given a rule from the file system and the set of installed rules this will merge the exception lists
 * from the installed rules onto the rules from the file system.
 * @param latestPrebuiltRule The latest prepackaged rule version that might have exceptions_lists
 * @param existingRule The installed rules which might have user driven exceptions_lists
 */
export const mergeExceptionLists = (
  latestPrebuiltRule: RuleResponse,
  existingRule: RuleResponse
): RuleResponse => {
  if (latestPrebuiltRule.exceptions_list != null) {
    if (existingRule.exceptions_list != null) {
      const uniqueExceptionsLists = latestPrebuiltRule.exceptions_list.filter(
        (potentialDuplicateList) =>
          existingRule.exceptions_list.every(
            (list) => list.list_id !== potentialDuplicateList.list_id
          )
      );
      return {
        ...latestPrebuiltRule,
        exceptions_list: [...uniqueExceptionsLists, ...existingRule.exceptions_list],
      };
    } else {
      return latestPrebuiltRule;
    }
  } else {
    // Carry over the previous version's exception list
    latestPrebuiltRule.exceptions_list = existingRule.exceptions_list;
    return latestPrebuiltRule;
  }
};

export const formatBulkEditResultErrors = (
  appliedPatchWithReadPrivs: BulkEditResult<RuleParams>
) => {
  if (!isEmpty(appliedPatchWithReadPrivs.errors)) {
    return appliedPatchWithReadPrivs.errors.reduce((acc, error) => `${acc}\n${error.message}`, '');
  }
};

/**
 * Retrieves the value for a field that can be edited with read-only authorization.
 */
export const getReadAuthFieldValue = (
  field: string,
  ruleUpdate: ReadAuthRuleUpdateWithRuleSource
) => {
  switch (camelCase(field)) {
    case validFields.EXCEPTIONS_LIST:
      return ruleUpdate.exceptions_list;

    case validFields.NOTE:
      return ruleUpdate.note;

    case validFields.INVESTIGATION_FIELDS:
      return ruleUpdate.investigation_fields;

    case validFields.RULE_SOURCE:
      return convertObjectKeysToCamelCase(ruleUpdate.rule_source);
  }
};

/**
 * Type guard to check if a field name is one of the fields editable with read-only authorization.
 * Uses the READ_AUTH_EDIT_FIELDS constant to ensure type safety with ReadAuthRuleUpdateProps.
 */
export const isReadAuthEditField = (key: string): key is keyof ReadAuthRuleUpdateProps =>
  key in READ_AUTH_EDIT_FIELDS;

/**
 * Determines if a rule update contains only changes to fields that can be edited
 * with read-only authorization (e.g. exceptions_list, note, investigation_fields).
 *
 * This is used to decide whether the update can be performed via the
 * `bulkEditRuleParamsWithReadAuth` method (which requires only read permissions)
 * or if it needs the standard update flow (which requires write permissions).
 *
 * @param ruleUpdate - The updated rule state being proposed
 * @param existingRule - The current rule state stored in the system
 * @returns true if only read-auth editable fields have changed, false otherwise
 */
export const hasOnlyReadAuthEditableChanges = (
  ruleUpdate: RuleResponse,
  existingRule: RuleResponse
): boolean => {
  // Normalize rules and omit response fields
  const normalizedRuleUpdate = omit(normalizeRuleResponse(ruleUpdate), 'execution_summary');
  const normalizedExistingRule = omit(normalizeRuleResponse(existingRule), 'execution_summary');

  // Find all keys that exist in either object
  const allKeys = new Set([
    ...Object.keys(normalizedRuleUpdate),
    ...Object.keys(normalizedExistingRule),
  ]);

  for (const key of allKeys) {
    const updateValue = normalizedRuleUpdate[key as keyof typeof normalizedRuleUpdate];
    const existingValue = normalizedExistingRule[key as keyof typeof normalizedExistingRule];

    // If values are different, check if this field is read auth editable
    if (!isEqual(existingValue, updateValue) && !isReadAuthEditField(key)) {
      return false;
    }
  }

  return true;
};

/**
 * Extracts only the read-auth editable fields that have actually changed between
 * the proposed update and the existing rule. Fields that haven't changed are
 * omitted from the returned object entirely (rather than being set to undefined)
 * to distinguish between "no change" and "intentionally unsetting".
 *
 * This is used to build the minimal payload for `bulkEditRuleParamsWithReadAuth`,
 * ensuring only changed fields are included in the update operation.
 *
 * @param ruleUpdate - The updated rule state being proposed
 * @param existingRule - The current rule state stored in the system
 * @returns An object containing only the changed read-auth editable fields and rule_source
 */
export const extractChangedUpdatableFields = (
  ruleUpdate: RuleResponse,
  existingRule: RuleResponse
): ReadAuthRuleUpdateWithRuleSource => {
  // rule_source will always be in the updated fields
  const result: ReadAuthRuleUpdateWithRuleSource = {
    rule_source: ruleUpdate.rule_source,
  };

  if (!isEqual(ruleUpdate.exceptions_list, existingRule.exceptions_list)) {
    result.exceptions_list = ruleUpdate.exceptions_list;
  }

  if (!isEqual(ruleUpdate.note, existingRule.note)) {
    result.note = ruleUpdate.note;
  }

  if (!isEqual(ruleUpdate.investigation_fields, existingRule.investigation_fields)) {
    result.investigation_fields = ruleUpdate.investigation_fields;
  }

  return result;
};
