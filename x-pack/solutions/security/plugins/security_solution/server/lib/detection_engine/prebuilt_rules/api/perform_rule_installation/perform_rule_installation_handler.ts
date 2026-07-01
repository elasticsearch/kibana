/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { transformError } from '@kbn/securitysolution-es-utils';
import type { Logger, KibanaRequest, KibanaResponseFactory } from '@kbn/core/server';
import { SkipRuleInstallReason } from '../../../../../../common/api/detection_engine/prebuilt_rules';
import type {
  PerformRuleInstallationResponseBody,
  SkippedRuleInstall,
  PerformRuleInstallationRequestBody,
  InstalledRuleBasicInfo,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import { buildSiemResponse } from '../../../routes/utils';
import { aggregatePrebuiltRuleErrors } from '../../logic/aggregate_prebuilt_rule_errors';
import { ensureLatestRulesPackageInstalled } from '../../logic/integrations/ensure_latest_rules_package_installed';
import { createPrebuiltRuleAssetsClient } from '../../logic/rule_assets/prebuilt_rule_assets_client';
import { createPrebuiltRuleObjectsClient } from '../../logic/rule_objects/prebuilt_rule_objects_client';
import { performTimelinesInstallation } from '../../logic/perform_timelines_installation';
import type { RuleSignatureId, RuleVersion } from '../../../../../../common/api/detection_engine';
import { excludeLicenseRestrictedRules } from '../../logic/utils';

export const performRuleInstallationHandler = async (
  context: SecuritySolutionRequestHandlerContext,
  request: KibanaRequest<unknown, unknown, PerformRuleInstallationRequestBody>,
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
    const exceptionsListClient = ctx.securitySolution.getExceptionListClient();
    const mlAuthz = ctx.securitySolution.getMlAuthz();

    const { mode } = request.body;

    // This will create the endpoint list if it does not exist yet
    await exceptionsListClient?.createEndpointList();

    // If this API is used directly without hitting any detection engine
    // pages first, the rules package might be missing.
    await ensureLatestRulesPackageInstalled(ruleAssetsClient, ctx.securitySolution, logger);

    const ruleInstallQueue: Array<{
      rule_id: RuleSignatureId;
      version: RuleVersion;
    }> = [];
    const ruleErrors = [];
    const installedRules: InstalledRuleBasicInfo[] = [];
    const skippedRules: SkippedRuleInstall[] = [];

    // Perform all the checks we can before we start the upgrade process
    if (mode === 'SPECIFIC_RULES') {
      const requestedRuleIds = request.body.rules.map((rule) => rule.rule_id);
      const [latestVersions, installedVersions] = await Promise.all([
        ruleAssetsClient.fetchLatestVersions({ ruleIds: requestedRuleIds }),
        ruleObjectsClient.fetchInstalledRuleVersionsByIds({ ruleIds: requestedRuleIds }),
      ]);
      const installedRuleIds = new Set(installedVersions.map((version) => version.rule_id));
      const installableRuleIds = new Set(
        latestVersions
          .filter((version) => !installedRuleIds.has(version.rule_id))
          .map((version) => version.rule_id)
      );

      request.body.rules.forEach((rule) => {
        // Check that the requested rule is not installed yet
        if (installedRuleIds.has(rule.rule_id)) {
          skippedRules.push({
            rule_id: rule.rule_id,
            reason: SkipRuleInstallReason.ALREADY_INSTALLED,
          });
          return;
        }

        // Check that the requested rule is installable
        if (!installableRuleIds.has(rule.rule_id)) {
          ruleErrors.push({
            error: new Error(
              `Rule with ID "${rule.rule_id}" and version "${rule.version}" not found`
            ),
            item: rule,
          });
          return;
        }

        ruleInstallQueue.push(rule);
      });
    } else if (mode === 'ALL_RULES') {
      const allLatestVersions = await ruleAssetsClient.fetchLatestVersions();
      const currentRuleVersions = await ruleObjectsClient.fetchInstalledRuleVersions();
      const currentRuleVersionsMap = new Map(
        currentRuleVersions.map((version) => [version.rule_id, version])
      );
      const allInstallableRules = allLatestVersions.filter(
        (latestVersion) => !currentRuleVersionsMap.has(latestVersion.rule_id)
      );
      ruleInstallQueue.push(...(await excludeLicenseRestrictedRules(allInstallableRules, mlAuthz)));
    }

    const { assets: ruleAssets } = await ruleAssetsClient.fetchAssetsByVersion(ruleInstallQueue);
    const { results, errors } = await detectionRulesClient.bulkCreatePrebuiltRules({
      rules: ruleAssets,
    });
    installedRules.push(...results);
    ruleErrors.push(...errors);
    logger.debug(
      `bulkCreatePrebuiltRules: ${results.length} created, ${errors.length} failed out of ${ruleAssets.length} total`
    );

    const { error: timelineInstallationError } = await performTimelinesInstallation(
      ctx.securitySolution
    );

    const allErrors = aggregatePrebuiltRuleErrors(ruleErrors);
    if (timelineInstallationError) {
      allErrors.push({
        message: timelineInstallationError,
        rules: [],
      });
    }

    const body: PerformRuleInstallationResponseBody = {
      summary: {
        total: installedRules.length + skippedRules.length + ruleErrors.length,
        succeeded: installedRules.length,
        skipped: skippedRules.length,
        failed: ruleErrors.length,
      },
      results: {
        created: installedRules,
        skipped: skippedRules,
      },
      errors: allErrors,
    };

    return response.ok({ body });
  } catch (err) {
    logger.error(`performRuleInstallationHandler: Caught error:`, err);
    const error = transformError(err);
    return siemResponse.error({
      body: error.message,
      statusCode: error.statusCode,
    });
  }
};
