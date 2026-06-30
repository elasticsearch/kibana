/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, KibanaResponseFactory, Logger } from '@kbn/core/server';
import type { AggregationsAggregationContainer } from '@elastic/elasticsearch/lib/api/types';
import { transformError } from '@kbn/securitysolution-es-utils';
import type { PrebuiltRuleAssetsFacetCategory } from '../../../../../../common/api/detection_engine/prebuilt_rules/review_rule_installation/review_rule_installation_route.gen';
import type { RuleSummary } from '../../logic/rule_objects/prebuilt_rule_objects_client';
import type {
  ReviewRuleInstallationRequestBody,
  ReviewRuleInstallationResponseBody,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import { buildSiemResponse } from '../../../routes/utils';
import type { IPrebuiltRuleAssetsClient } from '../../logic/rule_assets/prebuilt_rule_assets_client';
import { createPrebuiltRuleAssetsClient } from '../../logic/rule_assets/prebuilt_rule_assets_client';
import type { MlAuthz } from '../../../../machine_learning/authz';
import { buildPrebuiltRuleInstallationKql } from '../../logic/build_prebuilt_rule_installation_kql';
import { expandRawAggregationResult } from '../../../rule_management/logic/search/granular_facet_aggregations';
import { PREBUILT_RULE_ASSETS_SO_TYPE } from '../../logic/rule_assets/prebuilt_rule_assets_type';
import {
  getInstallableRulesForReview,
  getInstallableRuleVersions,
} from '../../logic/get_installable_rules_for_review';
import { createPrebuiltRuleObjectsClient } from '../../logic/rule_objects/prebuilt_rule_objects_client';

const PREBUILT_RULE_INSTALLATION_FACET_AGG_SIZE = 200;

const buildPrebuiltRuleInstallationAggregations = (
  categories: PrebuiltRuleAssetsFacetCategory[]
): Record<string, AggregationsAggregationContainer> => {
  const fieldByCategory: Record<PrebuiltRuleAssetsFacetCategory, string> = {
    tags: `${PREBUILT_RULE_ASSETS_SO_TYPE}.tags`,
    severity: `${PREBUILT_RULE_ASSETS_SO_TYPE}.severity`,
  };

  return Object.fromEntries(
    categories.map((category) => [
      `facet_${category}`,
      {
        terms: {
          field: fieldByCategory[category],
          size: PREBUILT_RULE_INSTALLATION_FACET_AGG_SIZE,
        },
      },
    ])
  ) as Record<string, AggregationsAggregationContainer>;
};

export const reviewRuleInstallationHandler = async (
  context: SecuritySolutionRequestHandlerContext,
  request: KibanaRequest<unknown, unknown, ReviewRuleInstallationRequestBody>,
  response: KibanaResponseFactory,
  logger: Logger
) => {
  const siemResponse = buildSiemResponse(response);
  const { page, per_page: perPage, filter, search, aggregations, sort, fields } = request.body;

  logger.debug(
    () =>
      `reviewRuleInstallationHandler: Executing handler with params: page=${page}, perPage=${perPage}`
  );

  try {
    const ctx = await context.resolve(['core', 'alerting', 'securitySolution']);
    const soClient = ctx.core.savedObjects.client;
    const rulesClient = await ctx.alerting.getRulesClient();
    const mlAuthz = ctx.securitySolution.getMlAuthz();

    const ruleAssetsClient = createPrebuiltRuleAssetsClient(soClient);
    const ruleObjectsClient = createPrebuiltRuleObjectsClient(rulesClient);

    const installedRuleVersions = await ruleObjectsClient.fetchInstalledRuleVersions();
    logger.debug(
      `reviewRuleInstallationHandler: Found ${installedRuleVersions.length} currently installed prebuilt rules`
    );
    const installedRuleVersionsMap = new Map(
      installedRuleVersions.map((version) => [version.rule_id, version])
    );

    const combinedKql = buildPrebuiltRuleInstallationKql({
      filter,
      search,
    });

    const categoryCounts = aggregations?.counts ?? [];
    const aggs =
      categoryCounts.length > 0
        ? buildPrebuiltRuleInstallationAggregations(categoryCounts)
        : undefined;

    // Run sequentially rather than concurrently to avoid memory spikes on small clusters.
    const rulesResult = await getInstallableRulesForReview({
      ruleAssetsClient,
      logger,
      mlAuthz,
      installedRuleVersionsMap,
      filter: combinedKql,
      sort,
      page,
      perPage,
      aggs,
      fields,
    });
    const stats = await fetchStats({ ruleAssetsClient, logger, mlAuthz, installedRuleVersionsMap });

    const counts = rulesResult.aggregations
      ? expandRawAggregationResult(rulesResult.aggregations, categoryCounts)
      : undefined;

    const body: ReviewRuleInstallationResponseBody = {
      page,
      per_page: perPage,
      rules: rulesResult.rules,
      total: rulesResult.total,
      stats: {
        tags: stats.tags,
        num_rules_to_install: stats.numRulesToInstall,
      },
      ...(counts ? { counts } : {}),
    };

    logger.debug(
      `reviewRuleInstallationHandler: Returning response with total=${body.total}, num_rules_to_install=${body.stats.num_rules_to_install}`
    );

    return response.ok({ body });
  } catch (err) {
    logger.error(`reviewRuleInstallationHandler: Caught error`, err);
    const error = transformError(err);
    return siemResponse.error({
      body: error.message,
      statusCode: error.statusCode,
    });
  }
};

async function fetchStats({
  ruleAssetsClient,
  logger,
  mlAuthz,
  installedRuleVersionsMap,
}: {
  ruleAssetsClient: IPrebuiltRuleAssetsClient;
  logger: Logger;
  mlAuthz: MlAuthz;
  installedRuleVersionsMap: Map<string, RuleSummary>;
}): Promise<{ tags: string[]; numRulesToInstall: number }> {
  const installableVersionsWithoutFilter = await getInstallableRuleVersions(
    ruleAssetsClient,
    logger,
    mlAuthz,
    installedRuleVersionsMap
  );

  const tags = await ruleAssetsClient.fetchTagsByVersion(installableVersionsWithoutFilter);

  return {
    tags,
    numRulesToInstall: installableVersionsWithoutFilter.length,
  };
}
