/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { pick } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import type { Logger, KibanaRequest, KibanaResponseFactory } from '@kbn/core/server';
import { transformError } from '@kbn/securitysolution-es-utils';
import { isRuleCustomized } from '../../../../../../common/detection_engine/rule_management/utils';
import { convertRulesFilterToKQL } from '../../../../../../common/detection_engine/rule_management/rule_filtering';
import type {
  FullThreeWayRuleDiff,
  PerformRuleUpgradeRequestBody,
  PerformRuleUpgradeResponseBody,
  RuleUpgradeSpecifier,
  SkippedRuleUpgrade,
  ThreeWayDiff,
  UpgradedRuleBasicInfo,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import {
  ModeEnum,
  PickVersionValuesEnum,
  SkipRuleUpgradeReasonEnum,
  ThreeWayDiffConflict,
  UpgradeConflictResolutionEnum,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import { buildSiemResponse } from '../../../routes/utils';
import {
  aggregatePrebuiltRuleErrors,
  type PrebuiltRulesUpgradeError,
} from '../../logic/aggregate_prebuilt_rule_errors';
import { performTimelinesInstallation } from '../../logic/perform_timelines_installation';
import { createPrebuiltRuleAssetsClient } from '../../logic/rule_assets/prebuilt_rule_assets_client';
import { PREBUILT_RULES_UPGRADE_BATCH_SIZE } from '../../constants';
import { createPrebuiltRuleObjectsClient } from '../../logic/rule_objects/prebuilt_rule_objects_client';
import { upgradePrebuiltRules } from '../../logic/rule_objects/upgrade_prebuilt_rules';
import { createModifiedPrebuiltRuleAssets } from './create_upgradeable_rules_payload';
import { getRuleTypeChange } from './get_rule_type_change';
import { validatePerformRuleUpgradeRequest } from './validate_perform_rule_upgrade_request';
import type { RuleSignatureId, RuleVersion } from '../../../../../../common/api/detection_engine';
import { zipRuleVersions } from '../../logic/rule_versions/zip_rule_versions';
import { calculateRuleDiff } from '../../logic/diff/calculate_rule_diff';
import type { RuleTriad } from '../../model/rule_groups/get_rule_groups';
import { getPossibleUpgrades } from '../../logic/utils';
import type { RuleUpgradeContext } from './update_rule_telemetry';
import {
  sendRuleBulkUpgradeTelemetryEvent,
  sendRuleUpdateTelemetryEvents,
} from './update_rule_telemetry';

export const performRuleUpgradeHandler = async (
  context: SecuritySolutionRequestHandlerContext,
  request: KibanaRequest<unknown, unknown, PerformRuleUpgradeRequestBody>,
  response: KibanaResponseFactory,
  logger: Logger
) => {
  const siemResponse = buildSiemResponse(response);

  try {
    const ctx = await context.resolve(['core', 'alerting', 'securitySolution']);
    const soClient = ctx.core.savedObjects.client;
    const rulesClient = await ctx.alerting.getRulesClient();
    const detectionRulesClient = ctx.securitySolution.getDetectionRulesClient();
    const ruleAssetsClient = createPrebuiltRuleAssetsClient(soClient);
    const ruleObjectsClient = createPrebuiltRuleObjectsClient(rulesClient);
    const mlAuthz = ctx.securitySolution.getMlAuthz();
    const analyticsService = ctx.securitySolution.getAnalytics();

    const { isRulesCustomizationEnabled } = detectionRulesClient.getRuleCustomizationStatus();
    const defaultPickVersion = isRulesCustomizationEnabled
      ? PickVersionValuesEnum.MERGED
      : PickVersionValuesEnum.TARGET;

    validatePerformRuleUpgradeRequest({
      isRulesCustomizationEnabled,
      payload: request.body,
      defaultPickVersion,
    });

    const { mode, dry_run: isDryRun, on_conflict: onConflict } = request.body;

    const filter = mode === ModeEnum.ALL_RULES ? request.body.filter : undefined;

    const skippedRules: SkippedRuleUpgrade[] = [];
    const updatedRules: UpgradedRuleBasicInfo[] = [];
    const ruleErrors: PrebuiltRulesUpgradeError[] = [];
    const allErrors: PerformRuleUpgradeResponseBody['errors'] = [];
    const ruleUpgradeContextsMap = new Map<string, RuleUpgradeContext>();

    const ruleUpgradeQueue: Array<{
      rule_id: RuleSignatureId;
      version: RuleVersion;
      revision?: number;
    }> = [];

    if (mode === ModeEnum.ALL_RULES) {
      const allLatestVersions = await ruleAssetsClient.fetchLatestVersions();
      const latestVersionsMap = new Map(
        allLatestVersions.map((version) => [version.rule_id, version])
      );
      const kqlFilter = filter
        ? convertRulesFilterToKQL({
            filter: filter.name,
            tags: filter.tags,
            customizationStatus: filter.customization_status,
          })
        : undefined;
      const allCurrentVersions = await ruleObjectsClient.fetchInstalledRuleVersions({
        kqlFilter,
      });

      const upgradableRules = await getPossibleUpgrades(
        allCurrentVersions,
        latestVersionsMap,
        mlAuthz
      );

      ruleUpgradeQueue.push(...upgradableRules);
    } else if (mode === ModeEnum.SPECIFIC_RULES) {
      ruleUpgradeQueue.push(...request.body.rules);
    }

    while (ruleUpgradeQueue.length > 0) {
      const targetRulesForUpgrade = ruleUpgradeQueue.splice(0, PREBUILT_RULES_UPGRADE_BATCH_SIZE);

      const [currentRules, latestRulesResult] = await Promise.all([
        ruleObjectsClient.fetchInstalledRulesByIds({
          ruleIds: targetRulesForUpgrade.map(({ rule_id: ruleId }) => ruleId),
        }),
        ruleAssetsClient.fetchAssetsByVersion(targetRulesForUpgrade),
      ]);
      const baseRulesResult = await ruleAssetsClient.fetchAssetsByVersion(currentRules);
      const ruleVersionsMap = zipRuleVersions(
        currentRules,
        baseRulesResult.assets,
        latestRulesResult.assets
      );

      const upgradeableRules: RuleTriad[] = [];
      targetRulesForUpgrade.forEach((targetRule) => {
        const ruleVersions = ruleVersionsMap.get(targetRule.rule_id);

        const currentVersion = ruleVersions?.current;
        const baseVersion = ruleVersions?.base;
        const targetVersion = ruleVersions?.target;

        // Check that the requested rule was found
        if (!currentVersion) {
          ruleErrors.push({
            error: new Error(
              `Rule with rule_id "${targetRule.rule_id}" and version "${targetRule.version}" not found`
            ),
            item: targetRule,
          });
          return;
        }

        // Check that the requested rule is upgradeable
        if (!targetVersion || targetVersion.version <= currentVersion.version) {
          skippedRules.push({
            rule_id: targetRule.rule_id,
            reason: SkipRuleUpgradeReasonEnum.RULE_UP_TO_DATE,
          });
          return;
        }

        // Check that rule revisions match (no update slipped in since the user reviewed the list)
        if (targetRule.revision != null && targetRule.revision !== currentVersion.revision) {
          ruleErrors.push({
            error: new Error(
              `Revision mismatch for rule_id ${targetRule.rule_id}: expected ${currentVersion.revision}, got ${targetRule.revision}`
            ),
            item: targetRule,
          });
          return;
        }

        // Check there's no conflicts
        if (onConflict === UpgradeConflictResolutionEnum.SKIP) {
          const ruleUpgradeSpecifier =
            request.body.mode === ModeEnum.SPECIFIC_RULES
              ? request.body.rules.find((x) => x.rule_id === targetRule.rule_id)
              : undefined;

          const { ruleDiff } = calculateRuleDiff(ruleVersions);
          const conflict = getRuleUpgradeConflictState(ruleDiff, ruleUpgradeSpecifier);

          if (conflict !== ThreeWayDiffConflict.NONE) {
            skippedRules.push({
              rule_id: targetRule.rule_id,
              reason: SkipRuleUpgradeReasonEnum.CONFLICT,
              conflict,
              rule_type_change: getRuleTypeChange(ruleDiff.fields),
            });

            ruleUpgradeContextsMap.set(targetRule.rule_id, {
              ruleId: targetRule.rule_id,
              ruleName: currentVersion.name,
              hasBaseVersion: !!baseVersion,
              isCustomized: isRuleCustomized(currentVersion),
              fieldsDiff: ruleDiff.fields,
            });
            return;
          }
        }

        // All checks passed, add to the list of rules to upgrade
        upgradeableRules.push({
          current: currentVersion,
          base: baseVersion,
          target: targetVersion,
        });
      });

      const { modifiedPrebuiltRuleAssets, processingErrors, ruleUpgradeContexts } =
        createModifiedPrebuiltRuleAssets({
          upgradeableRules,
          requestBody: request.body,
          defaultPickVersion,
        });
      ruleErrors.push(...processingErrors);

      ruleUpgradeContexts.forEach((ruleUpgradeContext) => {
        ruleUpgradeContextsMap.set(ruleUpgradeContext.ruleId, ruleUpgradeContext);
      });

      if (isDryRun) {
        updatedRules.push(
          ...modifiedPrebuiltRuleAssets.map((rule) => ({
            id: uuidv4(),
            rule_id: rule.rule_id,
            version: rule.version,
          }))
        );
      } else {
        const changeTracking = {
          metadata: {
            bulkCount: modifiedPrebuiltRuleAssets.length,
          },
        };

        const { results: upgradeResults, errors: installationErrors } = await upgradePrebuiltRules(
          detectionRulesClient,
          modifiedPrebuiltRuleAssets,
          changeTracking,
          logger
        );
        ruleErrors.push(...installationErrors);
        updatedRules.push(
          ...upgradeResults.map(({ result: rule }) => pick(rule, ['id', 'rule_id', 'version']))
        );
      }
    }

    allErrors.push(...aggregatePrebuiltRuleErrors(ruleErrors));

    if (!isDryRun) {
      const { error: timelineInstallationError } = await performTimelinesInstallation(
        ctx.securitySolution
      );

      if (timelineInstallationError) {
        allErrors.push({
          message: timelineInstallationError,
          rules: [],
        });
      }

      sendRuleUpdateTelemetryEvents(
        analyticsService,
        ruleUpgradeContextsMap,
        updatedRules,
        ruleErrors,
        skippedRules,
        logger
      );

      if (mode === ModeEnum.ALL_RULES) {
        sendRuleBulkUpgradeTelemetryEvent(
          analyticsService,
          ruleUpgradeContextsMap,
          updatedRules,
          ruleErrors,
          skippedRules,
          logger
        );
      }
    }

    const body: PerformRuleUpgradeResponseBody = {
      summary: {
        total: updatedRules.length + skippedRules.length + ruleErrors.length,
        skipped: skippedRules.length,
        succeeded: updatedRules.length,
        failed: ruleErrors.length,
      },
      results: {
        updated: updatedRules,
        skipped: skippedRules,
      },
      errors: allErrors,
    };

    return response.ok({ body });
  } catch (err) {
    const error = transformError(err);
    return siemResponse.error({
      body: error.message,
      statusCode: error.statusCode,
    });
  }
};

function getRuleUpgradeConflictState(
  ruleDiff: FullThreeWayRuleDiff,
  ruleUpgradeSpecifier?: RuleUpgradeSpecifier
): ThreeWayDiffConflict {
  if (ruleDiff.num_fields_with_conflicts === 0) {
    return ThreeWayDiffConflict.NONE;
  }

  if (!ruleUpgradeSpecifier) {
    return ruleDiff.num_fields_with_non_solvable_conflicts > 0
      ? ThreeWayDiffConflict.NON_SOLVABLE
      : ThreeWayDiffConflict.SOLVABLE;
  }

  let result = ThreeWayDiffConflict.NONE;

  // filter out resolved fields
  for (const [fieldName, fieldThreeWayDiff] of Object.entries<ThreeWayDiff<unknown>>(
    ruleDiff.fields
  )) {
    const hasResolvedValue =
      ruleUpgradeSpecifier.fields?.[fieldName as keyof typeof ruleUpgradeSpecifier.fields]
        ?.pick_version === 'RESOLVED';

    if (fieldThreeWayDiff.conflict === ThreeWayDiffConflict.NON_SOLVABLE && !hasResolvedValue) {
      return ThreeWayDiffConflict.NON_SOLVABLE;
    } else if (fieldThreeWayDiff.conflict === ThreeWayDiffConflict.SOLVABLE && !hasResolvedValue) {
      result = ThreeWayDiffConflict.SOLVABLE;
    }
  }

  return result;
}
