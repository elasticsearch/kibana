/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { ExceptionListSchema } from '@kbn/securitysolution-io-ts-list-types';
import type {
  RuleResponse,
  RuleToImport,
} from '../../../../../../../../common/api/detection_engine';
import { ruleToImportHasVersion } from '../../../../../../../../common/api/detection_engine/rule_management';
import type { MlAuthz } from '../../../../../../machine_learning/authz';
import type { PrebuiltImportContext } from './fetch_prebuilt_import_context';
import { createRuleImportErrorObject } from './errors';
import { calculateRuleSourceForImport } from './calculate_rule_source_for_import';
import { checkRuleExceptionReferences } from './check_rule_exception_references';
import { validateMlAuth } from '../../utils';
import type { ImportableRuleData, ImportRuleError } from './types';

interface ValidateRulesToImportParams {
  rules: RuleToImport[];
  existingRules: Record<string, RuleResponse>;
  existingExceptionLists: Record<string, ExceptionListSchema>;
  deps: ValidateRulesToImportDeps;
}

interface ValidateRulesToImportDeps {
  mlAuthz: MlAuthz;
  prebuiltContext: PrebuiltImportContext;
}

interface ValidateRulesToImportResult {
  importableRules: ImportableRuleData[];
  errors: ImportRuleError[];
}

export async function validateRulesToImport({
  rules,
  existingRules,
  existingExceptionLists,
  deps,
}: ValidateRulesToImportParams): Promise<ValidateRulesToImportResult> {
  const { prebuiltContext, mlAuthz } = deps;

  const importableRules: ImportableRuleData[] = [];
  const errors: ImportRuleError[] = [];

  for (const rule of rules) {
    const isKnownPrebuiltRule = prebuiltContext.availableRuleAssetIds.has(rule.rule_id);

    if (isKnownPrebuiltRule && !ruleToImportHasVersion(rule)) {
      // Prebuilt rules without version are invalid
      errors.push(missingVersionError(rule.rule_id));
    } else {
      try {
        await validateMlAuth(mlAuthz, rule.type);

        const [exceptionErrors, exceptionsList] = checkRuleExceptionReferences({
          rule,
          existingLists: existingExceptionLists,
        });
        errors.push(...exceptionErrors);

        // For backwards compatibility, rules without a version default to version 1.
        // The normalized copy is what proceeds to creation or overwrite.
        const normalizedRule = { ...rule, version: rule.version ?? 1 };
        const { immutable, ruleSource } = calculateRuleSourceForImport({
          importedRule: normalizedRule,
          currentRule: existingRules[rule.rule_id],
          prebuiltRuleAssetsByRuleId: prebuiltContext.matchingAssetsByRuleId,
          isKnownPrebuiltRule,
        });

        importableRules.push({ rule: normalizedRule, immutable, ruleSource, exceptionsList });
      } catch (e) {
        errors.push(
          createRuleImportErrorObject({
            ruleId: rule.rule_id,
            message: e instanceof Error ? e.message : String(e),
          })
        );
      }
    }
  }

  return { importableRules, errors };
}

function missingVersionError(ruleId: string): ImportRuleError {
  return createRuleImportErrorObject({
    ruleId,
    message: i18n.translate(
      'xpack.securitySolution.detectionEngine.rules.cannotImportPrebuiltRuleWithoutVersion',
      {
        defaultMessage:
          'Prebuilt rules must specify a "version" to be imported. [rule_id: {ruleId}]',
        values: { ruleId },
      }
    ),
  });
}
