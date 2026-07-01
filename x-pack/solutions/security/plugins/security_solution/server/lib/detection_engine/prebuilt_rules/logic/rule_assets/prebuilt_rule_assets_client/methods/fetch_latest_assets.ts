/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AggregationsMultiBucketAggregateBase,
  AggregationsTopHitsAggregate,
} from '@elastic/elasticsearch/lib/api/types';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import { MAX_PREBUILT_RULES_COUNT } from '../../../../../rule_management/logic/search/get_existing_prepackaged_rules';
import type { PrebuiltRuleAsset } from '../../../../model/rule_assets/prebuilt_rule_asset';
import { PREBUILT_RULE_ASSETS_SO_TYPE } from '../../prebuilt_rule_assets_type';
import { validatePrebuiltRuleAssets } from '../../prebuilt_rule_assets_validation';
import { invariant } from '../../../../../../../../common/utils/invariant';
import { fetchDeprecatedRules } from './fetch_deprecated_rules';

export interface FetchLatestAssetsOptions {
  size: number;
}

/**
 * Fetches the latest version of each prebuilt rule asset.
 *
 * Rule_ids that have any deprecated asset are excluded from the search
 * via a `NOT (rule_id: ...)` KQL filter that is built from the result of
 * `fetchDeprecatedRules`. Deprecation is monotonic per rule_id, so the
 * presence of a deprecated stub means the whole rule_id is deprecated
 * and must not flow into `validatePrebuiltRuleAssets` (the deprecated
 * stub schema is a strict subset of `PrebuiltRuleAsset` and would fail
 * validation). The deprecated rule_id lookup runs first so its result
 * can scope the main aggregation.
 *
 * @param savedObjectsClient - The saved objects client used to query the saved objects store
 * @returns A promise that resolves to an array of prebuilt rule assets.
 */
export async function fetchLatestAssets(
  savedObjectsClient: SavedObjectsClientContract,
  options: FetchLatestAssetsOptions = {
    size: MAX_PREBUILT_RULES_COUNT,
  }
): Promise<PrebuiltRuleAsset[]> {
  const deprecatedRuleAssets = await fetchDeprecatedRules(savedObjectsClient);
  const deprecatedRuleIds = deprecatedRuleAssets.map((asset) => asset.rule_id);

  const findResult = await savedObjectsClient.find<
    PrebuiltRuleAsset,
    {
      rules: AggregationsMultiBucketAggregateBase<{
        latest_version: AggregationsTopHitsAggregate;
      }>;
    }
  >({
    type: PREBUILT_RULE_ASSETS_SO_TYPE,
    ...(deprecatedRuleIds.length > 0 && {
      filter: `NOT (${deprecatedRuleIds
        .map((id) => `${PREBUILT_RULE_ASSETS_SO_TYPE}.attributes.rule_id: "${id}"`)
        .join(' OR ')})`,
    }),
    aggs: {
      rules: {
        terms: {
          field: `${PREBUILT_RULE_ASSETS_SO_TYPE}.attributes.rule_id`,
          size: options.size,
        },
        aggs: {
          latest_version: {
            top_hits: {
              size: 1,
              sort: {
                [`${PREBUILT_RULE_ASSETS_SO_TYPE}.version`]: 'desc',
              },
            },
          },
        },
      },
    },
  });

  const buckets = findResult.aggregations?.rules?.buckets ?? [];
  invariant(Array.isArray(buckets), 'fetchLatestAssets: expected buckets to be an array');

  const ruleAssets = buckets.map((bucket) => {
    const hit = bucket.latest_version.hits.hits[0];
    return hit._source[PREBUILT_RULE_ASSETS_SO_TYPE];
  });

  return validatePrebuiltRuleAssets(ruleAssets);
}
