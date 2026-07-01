/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from '../../../../../../common/api/detection_engine/model/rule_schema';
import { usePrebuiltRulesInstallReview } from '../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_install_review';
import { useFindInstalledPrebuiltRuleByRuleId } from '../../../../rule_management/logic/use_find_installed_prebuilt_rule_by_rule_id';

export interface UseDeepLinkedPrebuiltRuleParams {
  /** The `rule_id` to resolve, taken from the `/rules/add_rules/:ruleId` deep link. */
  ruleId: string | undefined;
  /** Installable rules already loaded on the current table page — used to skip fetching when
   *  the target rule is already available. */
  currentPageRules: RuleResponse[];
}

export interface UseDeepLinkedPrebuiltRuleResult {
  /**
   * The resolved deep-link target rule.
   */
  deepLinkedRule: RuleResponse | undefined;
  /** `true` when the resolved `deepLinkedRule` is already installed */
  isDeepLinkedRuleInstalled: boolean;
  /** `true` once every applicable lookup has settled and the result is ready. */
  isDeepLinkedRuleResolved: boolean;
}

/**
 * Resolves a single prebuilt rule by `rule_id`.
 * If prebuilt rule is not found in the installable catalog, falls back to the installed rule if possible.
 */
export const useDeepLinkedPrebuiltRule = ({
  ruleId,
  currentPageRules,
}: UseDeepLinkedPrebuiltRuleParams): UseDeepLinkedPrebuiltRuleResult => {
  // Step 1: Check if the rule for this rule_id is already loaded on the current table page. If so,
  // we reuse it and skip fetching.
  const hasRuleId = Boolean(ruleId);
  const loadedRule = hasRuleId
    ? currentPageRules.find((rule) => rule.rule_id === ruleId)
    : undefined;
  const isAlreadyLoaded = Boolean(loadedRule);

  // Step 2: Try to fetch the rule using the "installation review" endpoint. It will succeed if the rule is not yet installed.
  const shouldSearchPrebuiltRuleAssets = hasRuleId && !isAlreadyLoaded;
  const {
    data: deepLinkReviewResponse,
    isFetching: isFetchingInstallable,
    isFetched: isFetchedInstallable,
  } = usePrebuiltRulesInstallReview(
    {
      page: 1,
      perPage: 1,
      ruleIds: ruleId ? [ruleId] : undefined,
    },
    {
      enabled: shouldSearchPrebuiltRuleAssets,
    }
  );
  const installableRule = deepLinkReviewResponse?.rules?.[0];
  const installableSettled = isFetchedInstallable && !isFetchingInstallable;

  // Step 3: If the rule is already installed, we fall back to fetching an already installed rule.
  const shouldSearchInstalledRules =
    shouldSearchPrebuiltRuleAssets && installableSettled && !installableRule;

  const {
    rule: installedFallbackRule,
    isFetching: isFetchingInstalled,
    isFetched: isFetchedInstalled,
  } = useFindInstalledPrebuiltRuleByRuleId(ruleId, {
    enabled: shouldSearchInstalledRules,
  });

  const fallbackSettled = isFetchedInstalled && !isFetchingInstalled;

  // Resolved when there is:
  const isDeepLinkedRuleResolved =
    !hasRuleId || // nothing to fetch (no `ruleId` or already loaded), or
    isAlreadyLoaded || // rule is already fetched, or
    (installableSettled && (!shouldSearchInstalledRules || fallbackSettled)); // either prebuilt rule asset or installed rule is fetched for this rule_id

  const deepLinkedRule = loadedRule ?? installableRule ?? installedFallbackRule;

  return {
    deepLinkedRule,
    isDeepLinkedRuleInstalled: Boolean(deepLinkedRule) && deepLinkedRule === installedFallbackRule,
    isDeepLinkedRuleResolved,
  };
};
