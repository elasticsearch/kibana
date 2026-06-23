/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import { getErrorMessage } from '../../../../../utils/error_helpers';
import type { UpdateRuleMigrationRule } from '../../../../../../common/siem_migrations/model/rule_migration.gen';
import { initPromisePool } from '../../../../../utils/promise_pool';
import type { SecuritySolutionApiRequestHandlerContext } from '../../../../..';
import { performTimelinesInstallation } from '../../../../detection_engine/prebuilt_rules/logic/perform_timelines_installation';
import { createPrebuiltRules } from '../../../../detection_engine/prebuilt_rules/logic/rule_objects/create_prebuilt_rules';
import type { IDetectionRulesClient } from '../../../../detection_engine/rule_management/logic/detection_rules_client/detection_rules_client_interface';
import type { RuleResponse } from '../../../../../../common/api/detection_engine';
import type { StoredRuleMigrationRule } from '../../types';
import { getPrebuiltRules, getUniquePrebuiltRuleIds } from './prebuilt_rules';
import {
  convertMigrationCustomRuleToSecurityRulePayload,
  getTranslationFieldsFromAnnotations,
  isMigrationCustomRule,
} from '../../../../../../common/siem_migrations/rules/utils';
import { getVendorTag } from '../../../common/api/util/tags';

const MAX_CUSTOM_RULES_TO_CREATE_IN_PARALLEL = 50;

const installPrebuiltRules = async (
  rulesToInstall: StoredRuleMigrationRule[],
  enabled: boolean,
  securitySolutionContext: SecuritySolutionApiRequestHandlerContext,
  rulesClient: RulesClient,
  savedObjectsClient: SavedObjectsClientContract,
  detectionRulesClient: IDetectionRulesClient
): Promise<{ rulesToUpdate: UpdateRuleMigrationRule[]; errors: Error[] }> => {
  // Get required prebuilt rules
  const prebuiltRulesIds = getUniquePrebuiltRuleIds(rulesToInstall);
  const prebuiltRules = await getPrebuiltRules(rulesClient, savedObjectsClient, prebuiltRulesIds);

  const { installed: alreadyInstalledRules, installable } = Object.values(prebuiltRules).reduce(
    (acc, item) => {
      if (item.current) {
        acc.installed.push(item.current);
      } else {
        acc.installable.push({ ...item.target, enabled });
      }
      return acc;
    },
    { installed: [], installable: [] } as {
      installed: RuleResponse[];
      installable: RuleResponse[];
    }
  );

  const errors: Error[] = [];

  // Install prebuilt rules
  const { results: newlyInstalledRules, errors: installPrebuiltRulesErrors } =
    await createPrebuiltRules(detectionRulesClient, installable);
  errors.push(
    ...installPrebuiltRulesErrors.map(
      (err) => new Error(`Error installing prebuilt rule: ${getErrorMessage(err)}`)
    )
  );

  const installedRules = [
    ...alreadyInstalledRules,
    ...newlyInstalledRules.map((value) => value.result),
  ];

  // Create migration rules updates templates
  const rulesToUpdate: UpdateRuleMigrationRule[] = [];
  installedRules.forEach((installedRule) => {
    const filteredRules = rulesToInstall.filter(
      (rule) => rule.elastic_rule?.prebuilt_rule_id === installedRule.rule_id
    );
    rulesToUpdate.push(
      ...filteredRules.map(({ id }) => ({
        id,
        elastic_rule: {
          id: installedRule.id,
        },
      }))
    );
  });

  return { rulesToUpdate, errors };
};

export const installCustomRules = async (
  rulesToInstall: StoredRuleMigrationRule[],
  enabled: boolean,
  detectionRulesClient: IDetectionRulesClient
): Promise<{
  rulesToUpdate: UpdateRuleMigrationRule[];
  errors: Error[];
}> => {
  const errors: Error[] = [];
  const rulesToUpdate: UpdateRuleMigrationRule[] = [];
  const createCustomRulesOutcome = await initPromisePool({
    concurrency: MAX_CUSTOM_RULES_TO_CREATE_IN_PARALLEL,
    items: rulesToInstall,
    executor: async (rule) => {
      if (!isMigrationCustomRule(rule.elastic_rule)) {
        return;
      }
      const payloadRule = convertMigrationCustomRuleToSecurityRulePayload(
        rule.elastic_rule,
        enabled,
        getTranslationFieldsFromAnnotations(rule.original_rule)
      );
      const tags = [getVendorTag(rule.original_rule.vendor)];
      const createdRule = await detectionRulesClient.createCustomRule({
        params: {
          ...payloadRule,
          tags,
        },
      });
      rulesToUpdate.push({
        id: rule.id,
        elastic_rule: {
          id: createdRule.id,
        },
      });
    },
  });
  errors.push(
    ...createCustomRulesOutcome.errors.map(
      (err) => new Error(`Error installing custom rule: ${getErrorMessage(err)}`)
    )
  );
  return { rulesToUpdate, errors };
};

interface InstallTranslatedProps {
  /**
   * The migration id
   */
  migrationId: string;

  /**
   * If specified, then installable translated rules in theThe list will be installed,
   * otherwise all installable translated rules will be installed.
   */
  ids?: string[];

  /**
   * Indicates whether the installed migration rules should be enabled
   */
  enabled: boolean;

  /**
   * The security solution context
   */
  securitySolutionContext: SecuritySolutionApiRequestHandlerContext;

  /**
   * The rules client to create rules
   */
  rulesClient: RulesClient;

  /**
   * The saved objects client
   */
  savedObjectsClient: SavedObjectsClientContract;
}

export const installTranslated = async ({
  migrationId,
  ids,
  enabled,
  securitySolutionContext,
  rulesClient,
  savedObjectsClient,
}: InstallTranslatedProps): Promise<number> => {
  const detectionRulesClient = securitySolutionContext.getDetectionRulesClient();
  const ruleMigrationsClient = securitySolutionContext.siemMigrations.getRulesClient();

  let installedCount = 0;
  const installationErrors: Error[] = [];

  // Install rules that matched Elastic prebuilt rules
  const prebuiltRuleBatches = ruleMigrationsClient.data.items.searchBatches(migrationId, {
    filters: { ids, installable: true, prebuilt: true },
  });
  let prebuiltRulesToInstall = await prebuiltRuleBatches.next();
  while (prebuiltRulesToInstall.length) {
    const { rulesToUpdate, errors } = await installPrebuiltRules(
      prebuiltRulesToInstall,
      enabled,
      securitySolutionContext,
      rulesClient,
      savedObjectsClient,
      detectionRulesClient
    );
    installedCount += rulesToUpdate.length;
    installationErrors.push(...errors);
    await ruleMigrationsClient.data.items.update(rulesToUpdate);
    prebuiltRulesToInstall = await prebuiltRuleBatches.next();
  }

  let installTimelinesError: string | undefined;
  if (installedCount > 0) {
    const { error } = await performTimelinesInstallation(securitySolutionContext);
    installTimelinesError = error;
  }

  // Install rules with custom translation
  const customRuleBatches = ruleMigrationsClient.data.items.searchBatches(migrationId, {
    filters: { ids, installable: true, prebuilt: false },
  });
  let customRulesToInstall = await customRuleBatches.next();
  while (customRulesToInstall.length) {
    const { rulesToUpdate, errors } = await installCustomRules(
      customRulesToInstall,
      enabled,
      detectionRulesClient
    );
    installedCount += rulesToUpdate.length;
    installationErrors.push(...errors);
    await ruleMigrationsClient.data.items.update(rulesToUpdate);
    customRulesToInstall = await customRuleBatches.next();
  }

  // Throw an error if needed
  if (installTimelinesError) {
    throw new Error(`Error installing prepackaged timelines: ${installTimelinesError}`);
  }
  if (installationErrors.length) {
    throw new Error(installationErrors.map((err) => err.message).join());
  }

  return installedCount;
};
