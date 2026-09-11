/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ListArray, ExceptionListSchema } from '@kbn/securitysolution-io-ts-list-types';

import type { RuleToImport } from '../../../../../../../../common/api/detection_engine/rule_management';
import { createRuleImportErrorObject } from './errors';
import type { ImportRuleError } from './types';

/**
 * Helper to check if all the exception lists referenced on a
 * rule exist. Returns updated exception lists reference array.
 * This helper assumes that the search for existing exception lists
 * has been batched and is simply checking if it's within the param
 * that contains existing lists. This is to avoid doing one call per
 * rule for this check.
 * @param rule {object} - rule whose exception references are being checked
 * @param existingLists {object} - a dictionary of sorts that uses list_id as key
 * @returns {array} tuple of updated exception references and reported errors
 */
export const checkRuleExceptionReferences = ({
  rule,
  existingLists,
}: {
  rule: RuleToImport;
  existingLists: Record<string, ExceptionListSchema>;
}): [ImportRuleError[], ListArray] => {
  let ruleExceptions: ListArray = [];
  let errors: ImportRuleError[] = [];
  const { rule_id: ruleId } = rule;
  const exceptionLists = rule.exceptions_list ?? [];

  if (!exceptionLists.length) {
    return [[], []];
  }

  for (const exceptionList of exceptionLists) {
    const matchingList = existingLists[exceptionList.list_id];

    if (
      matchingList &&
      matchingList.namespace_type === exceptionList.namespace_type &&
      matchingList.type === exceptionList.type
    ) {
      ruleExceptions = [
        ...ruleExceptions,
        { ...exceptionList, id: existingLists[exceptionList.list_id].id },
      ];
    } else {
      // If exception is not found remove link. Also returns
      // this error to notify a user of the action taken.
      errors = [
        ...errors,
        createRuleImportErrorObject({
          ruleId,
          message: `Rule with rule_id: "${ruleId}" references a non existent exception list of list_id: "${exceptionList.list_id}". Reference has been removed.`,
        }),
      ];
    }
  }

  return [errors, ruleExceptions];
};
