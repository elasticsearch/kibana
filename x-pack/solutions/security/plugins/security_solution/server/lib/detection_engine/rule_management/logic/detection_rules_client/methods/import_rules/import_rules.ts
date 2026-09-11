/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { SecurityRuleChangeTracking } from '../../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { RuleToImport } from '../../../../../../../../common/api/detection_engine';
import type { MlAuthz } from '../../../../../../machine_learning/authz';
import { createRuleImportErrorObject } from './errors';
import { getReferencedExceptionLists } from './gather_referenced_exceptions';
import { fetchPrebuiltImportContext } from './fetch_prebuilt_import_context';
import { findInstalledRulesByRuleIds } from './find_installed_rules_by_rule_ids';
import { createPrebuiltRuleAssetsClient } from '../../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { validateRulesToImport } from './validate_rules_to_import';
import { overwriteRules } from './overwrite_rules';
import { createRules } from './create_rules';
import type {
  ImportableRuleData,
  ImportRuleSuccess,
  ImportRulesResult,
  ImportRuleError,
} from './types';

interface ImportRulesParams {
  rules: RuleToImport[];
  options: ImportRulesOptions;
  deps: ImportRulesDeps;
}

interface ImportRulesOptions {
  overwriteRules: boolean;
  allowMissingConnectorSecrets?: boolean;
  changeTracking?: SecurityRuleChangeTracking;
}

interface ImportRulesDeps {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  savedObjectsClient: SavedObjectsClientContract;
  mlAuthz: MlAuthz;
}

export async function importRules({
  rules,
  options: importOptions,
  deps,
}: ImportRulesParams): Promise<ImportRulesResult> {
  const { actionsClient, rulesClient, savedObjectsClient, mlAuthz } = deps;

  if (rules.length === 0) {
    return { successes: [], errors: [] };
  }

  const successes: ImportRuleSuccess[] = [];
  const errors: ImportRuleError[] = [];

  // Contain any throw so one batch can't reject and abort the multi-batch loop mid-import.
  try {
    // Step 1: Fetch data
    const ruleAssetsClient = createPrebuiltRuleAssetsClient(savedObjectsClient);
    const [existingExceptionLists, prebuiltContext, existingRules] = await Promise.all([
      getReferencedExceptionLists({ rules, savedObjectsClient }),
      fetchPrebuiltImportContext({ rules, ruleAssetsClient }),
      findInstalledRulesByRuleIds({ rulesClient, ruleIds: rules.map((r) => r.rule_id) }),
    ]);

    // Step 2: Validate
    const { importableRules, errors: validationErrors } = await validateRulesToImport({
      rules,
      existingRules,
      existingExceptionLists,
      deps: {
        mlAuthz,
        prebuiltContext,
      },
    });
    errors.push(...validationErrors);

    if (importableRules.length === 0) {
      return { successes, errors };
    }

    // Step 3: Split rules into buckets
    const conflicts: ImportableRuleData[] = [];
    const toCreate: ImportableRuleData[] = [];
    const toOverwrite: ImportableRuleData[] = [];

    for (const item of importableRules) {
      if (!existingRules[item.rule.rule_id]) {
        toCreate.push(item);
      } else if (importOptions.overwriteRules) {
        toOverwrite.push(item);
      } else {
        conflicts.push(item);
      }
    }

    // Step 4: Process each bucket
    for (const { rule } of conflicts) {
      errors.push(
        createRuleImportErrorObject({
          ruleId: rule.rule_id,
          type: 'conflict',
          message: 'Rule with this rule_id already exists',
        })
      );
    }

    if (toOverwrite.length > 0) {
      const overwritten = await overwriteRules({
        rules: toOverwrite,
        existingRules,
        deps: {
          actionsClient,
          rulesClient,
          prebuiltRuleAssetClient: ruleAssetsClient,
          changeTracking: importOptions.changeTracking,
        },
      });
      successes.push(...overwritten.successes);
      errors.push(...overwritten.errors);
    }

    if (toCreate.length > 0) {
      const created = await createRules({
        rules: toCreate,
        options: {
          allowMissingConnectorSecrets: importOptions.allowMissingConnectorSecrets,
          changeTracking: importOptions.changeTracking,
        },
        deps: {
          actionsClient,
          rulesClient,
        },
      });
      successes.push(...created.successes);
      errors.push(...created.errors);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const responded = new Set([
      ...successes.map((item) => item.rule_id),
      ...errors.map((item) => item.error.ruleId),
    ]);

    for (const rule of rules) {
      if (!responded.has(rule.rule_id)) {
        errors.push(createRuleImportErrorObject({ ruleId: rule.rule_id, message }));
      }
    }
  }

  return { successes, errors };
}
