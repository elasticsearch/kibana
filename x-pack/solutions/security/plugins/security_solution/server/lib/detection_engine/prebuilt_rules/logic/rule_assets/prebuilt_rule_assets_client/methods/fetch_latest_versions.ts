/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AggregationsMultiBucketAggregateBase,
  SearchHitsMetadata,
} from '@elastic/elasticsearch/lib/api/types';
import type { SavedObjectsClientContract, SavedObjectsRawDocSource } from '@kbn/core/server';
import type { PrebuiltRuleAssetsSort } from '../../../../../../../../common/api/detection_engine/prebuilt_rules/review_rule_installation/review_rule_installation_route.gen';
import { invariant } from '../../../../../../../../common/utils/invariant';
import { MAX_PREBUILT_RULES_COUNT } from '../../../../../rule_management/logic/search/get_existing_prepackaged_rules';
import type { BasicRuleInfo } from '../../../basic_rule_info';
import type { RuleVersionSpecifier } from '../../../rule_versions/rule_version_specifier';
import { PREBUILT_RULE_ASSETS_SO_TYPE } from '../../prebuilt_rule_assets_type';
import {
  PREBUILT_RULE_ASSETS_RUNTIME_MAPPINGS,
  prepareQueryDslFilter,
  prepareQueryDslSort,
  getPrebuiltRuleAssetSoId,
  getPrebuiltRuleAssetsSearchNamespace,
} from '../utils';
import { fetchDeprecatedRules } from './fetch_deprecated_rules';

/**
 * Fetches the BasicRuleInfo for prebuilt rule assets: rule_id, version and type.
 * By default, fetches BasicRuleInfo for all prebuilt rule assets.
 * If ruleIds are provided, only fetches for the provided ruleIds.
 *
 * @param savedObjectsClient - Saved Objects client
 * @param queryParameters - Optional arguments object
 * @param queryParameters.ruleIds - Optional array of rule IDs to query for
 * @param queryParameters.filter - Optional filter configuration
 * @param queryParameters.sort - Optional sort configuration
 * @returns A promise that resolves to an array of BasicRuleInfo objects (rule_id, version, type).
 */
export async function fetchLatestVersions(
  savedObjectsClient: SavedObjectsClientContract,
  queryParameters?: {
    ruleIds?: string[];
    sort?: PrebuiltRuleAssetsSort;
    filter?: string;
  }
): Promise<BasicRuleInfo[]> {
  const { ruleIds, sort, filter } = queryParameters || {};

  if (ruleIds && ruleIds.length === 0) {
    return [];
  }

  // First, fetch the latest version numbers for each rule_id.
  const latestVersionSpecifiers: RuleVersionSpecifier[] = await fetchLatestVersionSpecifiers(
    savedObjectsClient,
    ruleIds,
    filter
  );

  // Then, fetch the rule type for each latest version and sort the result.
  const soIds = latestVersionSpecifiers.map((rule) =>
    getPrebuiltRuleAssetSoId(rule.rule_id, rule.version)
  );
  const latestVersions = await fetchVersionsBySoIds(savedObjectsClient, soIds, sort);

  return latestVersions;
}

async function fetchLatestVersionSpecifiers(
  savedObjectsClient: SavedObjectsClientContract,
  ruleIds?: string[],
  filter?: string
) {
  /**
   * Fetches deprecated rule assets in order to filter out all versions of the deprecated rules
   * in the latest version query. Since we fetch the most recent version of the asset, if we filter
   * out assets using the `type` field, the query would still return the deprecated asset, just one
   * version older. This filter ensures all rule assets fetched will not contain any rule ids that
   * have been labeled as deprecated.
   */
  const deprecatedRuleAssets = await fetchDeprecatedRules(savedObjectsClient, ruleIds);
  const deprecatedRuleIds = deprecatedRuleAssets.map((asset) => asset.rule_id);

  const latestVersionSpecifiersResult = await savedObjectsClient.search<
    SavedObjectsRawDocSource,
    {
      rules: AggregationsMultiBucketAggregateBase<{
        latest_version: {
          hits: SearchHitsMetadata<{
            [PREBUILT_RULE_ASSETS_SO_TYPE]: RuleVersionSpecifier;
          }>;
        };
      }>;
    }
  >({
    type: PREBUILT_RULE_ASSETS_SO_TYPE,
    namespaces: [savedObjectsClient.getCurrentNamespace() ?? 'default'],
    _source: false,
    size: 0,
    query: {
      bool: prepareQueryDslFilter({ ruleIds, excludeRuleIds: deprecatedRuleIds, filter }),
    },
    aggs: {
      rules: {
        terms: {
          field: `${PREBUILT_RULE_ASSETS_SO_TYPE}.rule_id`,
          size: MAX_PREBUILT_RULES_COUNT,
        },
        aggs: {
          latest_version: {
            top_hits: {
              size: 1,
              sort: [
                {
                  [`${PREBUILT_RULE_ASSETS_SO_TYPE}.version`]: 'desc',
                },
              ],
              _source: [
                `${PREBUILT_RULE_ASSETS_SO_TYPE}.rule_id`,
                `${PREBUILT_RULE_ASSETS_SO_TYPE}.version`,
              ],
            },
          },
        },
      },
    },
  });

  const buckets = latestVersionSpecifiersResult.aggregations?.rules?.buckets;

  invariant(
    Array.isArray(buckets),
    'fetchLatestVersionSpecifiers: expected buckets to be an array'
  );

  const latestVersionSpecifiers: RuleVersionSpecifier[] = buckets.map((bucket) => {
    const hit = bucket.latest_version.hits.hits[0];
    const hitSource = hit?._source;

    invariant(hitSource, 'fetchLatestVersionSpecifiers: expected hit source to be defined');

    const soAttributes = hitSource[PREBUILT_RULE_ASSETS_SO_TYPE];

    return {
      rule_id: soAttributes.rule_id,
      version: soAttributes.version,
    };
  });
  return latestVersionSpecifiers;
}

async function fetchVersionsBySoIds(
  savedObjectsClient: SavedObjectsClientContract,
  soIds: string[],
  sort?: PrebuiltRuleAssetsSort
) {
  const searchResult = await savedObjectsClient.search<
    SavedObjectsRawDocSource & {
      [PREBUILT_RULE_ASSETS_SO_TYPE]: BasicRuleInfo;
    }
  >({
    type: PREBUILT_RULE_ASSETS_SO_TYPE,
    namespaces: getPrebuiltRuleAssetsSearchNamespace(savedObjectsClient),
    size: MAX_PREBUILT_RULES_COUNT,
    runtime_mappings: PREBUILT_RULE_ASSETS_RUNTIME_MAPPINGS,
    query: {
      terms: {
        _id: soIds,
      },
    },
    sort: prepareQueryDslSort(sort),
    _source: [
      `${PREBUILT_RULE_ASSETS_SO_TYPE}.rule_id`,
      `${PREBUILT_RULE_ASSETS_SO_TYPE}.version`,
      `${PREBUILT_RULE_ASSETS_SO_TYPE}.type`,
    ],
  });

  const latestVersions = searchResult.hits.hits.map((hit) => {
    const hitSource = hit?._source;
    invariant(hitSource, 'Expected hit source to be defined');

    const soAttributes = hitSource[PREBUILT_RULE_ASSETS_SO_TYPE];
    const versionInfo: BasicRuleInfo = {
      rule_id: soAttributes.rule_id,
      version: soAttributes.version,
      type: soAttributes.type,
    };
    return versionInfo;
  });

  return latestVersions;
}
