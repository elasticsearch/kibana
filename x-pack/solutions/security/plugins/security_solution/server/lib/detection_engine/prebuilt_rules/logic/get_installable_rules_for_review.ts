/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type {
  AggregationsAggregate,
  AggregationsAggregationContainer,
} from '@elastic/elasticsearch/lib/api/types';
import type { PrebuiltRuleAssetsSort } from '../../../../../common/api/detection_engine/prebuilt_rules/review_rule_installation/review_rule_installation_route.gen';
import type { RuleResponse } from '../../../../../common/api/detection_engine';
import { convertPrebuiltRuleAssetToRuleResponse } from '../../rule_management/logic/detection_rules_client/converters/convert_prebuilt_rule_asset_to_rule_response';
import type { IPrebuiltRuleAssetsClient } from './rule_assets/prebuilt_rule_assets_client';
import type { RuleSummary } from './rule_objects/prebuilt_rule_objects_client';
import { excludeLicenseRestrictedRules } from './utils';
import type { BasicRuleInfo } from './basic_rule_info';
import type { MlAuthz } from '../../../machine_learning/authz';
import { prepareQueryDslSort } from './rule_assets/prebuilt_rule_assets_client/utils';
import { narrowRuleResponseFields } from '../api/narrow_rule_response_fields';

export interface GetInstallableRulesForReviewParams {
  ruleAssetsClient: IPrebuiltRuleAssetsClient;
  logger: Logger;
  mlAuthz: MlAuthz;
  installedRuleVersionsMap: Map<string, RuleSummary>;
  /** KQL filter string applied to the installable `security-rule` assets. */
  filter?: string;
  sort?: PrebuiltRuleAssetsSort;
  page: number;
  perPage: number;
  aggs?: Record<string, AggregationsAggregationContainer>;
  /** Top-level `security-rule` attribute keys to project from ES. */
  fields?: string[];
}

export interface GetInstallableRulesForReviewResult {
  rules: RuleResponse[];
  total: number;
  aggregations?: Record<string, AggregationsAggregate>;
}

/**
 * Fetches a page of installable (not-yet-installed, non-deprecated, license-allowed)
 * prebuilt rules, optionally filtered/sorted/aggregated and projected to a subset of
 * fields. This is the reusable core previously inlined as `fetchRules` in the
 * `installation/_review` HTTP handler; it is now callable directly (e.g. from Agent
 * Builder tools) without going through HTTP.
 */
export async function getInstallableRulesForReview({
  ruleAssetsClient,
  logger,
  mlAuthz,
  installedRuleVersionsMap,
  filter,
  sort,
  page,
  perPage,
  aggs,
  fields,
}: GetInstallableRulesForReviewParams): Promise<GetInstallableRulesForReviewResult> {
  const installableVersions = await getInstallableRuleVersions(
    ruleAssetsClient,
    logger,
    mlAuthz,
    installedRuleVersionsMap,
    sort,
    filter
  );

  // All installable SO IDs are passed so ES handles paging/sorting in one round trip.
  // If aggregations are never needed, this could be optimised to pass only the page IDs.
  const installableRuleAssetsPage = await ruleAssetsClient.fetchAssetsByVersion(
    installableVersions,
    {
      page,
      perPage,
      sort: prepareQueryDslSort(sort),
      aggs,
      fields,
    }
  );

  const convertedRules = installableRuleAssetsPage.assets.map((prebuiltRuleAsset) =>
    convertPrebuiltRuleAssetToRuleResponse(prebuiltRuleAsset)
  );

  return {
    // Cast is safe: the response is immediately serialised to JSON; the OpenAPI
    // schema types this as RuleResponse but the `fields` parameter makes it a
    // projection — only the requested fields plus REVIEW_RULE_BASELINE_FIELDS
    // are guaranteed to be present.
    rules: convertedRules.map((rule) => narrowRuleResponseFields(rule, fields) as RuleResponse),
    total: installableVersions.length,
    aggregations: installableRuleAssetsPage.aggregations,
  };
}

export async function getInstallableRuleVersions(
  ruleAssetsClient: IPrebuiltRuleAssetsClient,
  logger: Logger,
  mlAuthz: MlAuthz,
  installedRuleVersionsMap: Map<string, RuleSummary>,
  sort?: PrebuiltRuleAssetsSort,
  filter?: string
): Promise<BasicRuleInfo[]> {
  const latestRuleVersions = await ruleAssetsClient.fetchLatestVersions({
    sort,
    filter,
  });

  logger.debug(
    `getInstallableRuleVersions: Fetched ${latestRuleVersions.length} latest rule versions from assets`
  );

  const nonInstalledLatestRuleVersions = latestRuleVersions.filter(
    (latestVersion) => !installedRuleVersionsMap.has(latestVersion.rule_id)
  );

  logger.debug(
    `getInstallableRuleVersions: ${nonInstalledLatestRuleVersions.length} rules remaining after filtering installed rules`
  );

  const installableRuleVersions = await excludeLicenseRestrictedRules(
    nonInstalledLatestRuleVersions,
    mlAuthz
  );

  logger.debug(
    `getInstallableRuleVersions: ${installableRuleVersions.length} rules remaining after checking license restrictions`
  );

  return installableRuleVersions;
}
