/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { UseMutationOptions } from '@kbn/react-query';
import { useMutation } from '@kbn/react-query';
import type {
  PerformRuleUpgradeRequestBody,
  PerformRuleUpgradeResponseBody,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import { PERFORM_RULE_UPGRADE_URL } from '../../../../../../common/api/detection_engine/prebuilt_rules/urls';
import { performUpgradeRules } from '../../api';
import { useInvalidateFetchCoverageOverviewQuery } from '../use_fetch_coverage_overview_query';
import { useInvalidateFetchRuleManagementFiltersQuery } from '../use_fetch_rule_management_filters_query';
import { useInvalidateFetchRulesSnoozeSettingsQuery } from '../use_fetch_rules_snooze_settings_query';
import { useInvalidateFindRulesQuery } from '../use_find_rules_query';
import { useInvalidateFetchPrebuiltRulesStatusQuery } from './use_fetch_prebuilt_rules_status_query';
import { useInvalidateFetchPrebuiltRulesUpgradeReviewQuery } from './use_fetch_prebuilt_rules_upgrade_review_query';
import { retryOnRateLimitedError } from './retry_on_rate_limited_error';
import { cappedExponentialBackoff } from './capped_exponential_backoff';
import { useInvalidateFetchPrebuiltRuleBaseVersionQuery } from './use_fetch_prebuilt_rule_base_version_query';
import { useInvalidateChangeHistory } from '../use_infinite_change_history';

export const PERFORM_RULES_UPGRADE_KEY = ['POST', PERFORM_RULE_UPGRADE_URL];

export const usePerformRulesUpgradeMutation = (
  options?: UseMutationOptions<
    PerformRuleUpgradeResponseBody,
    unknown,
    PerformRuleUpgradeRequestBody
  >
) => {
  const invalidateFindRulesQuery = useInvalidateFindRulesQuery();
  const invalidateFetchRulesSnoozeSettings = useInvalidateFetchRulesSnoozeSettingsQuery();
  const invalidatePrePackagedRulesStatus = useInvalidateFetchPrebuiltRulesStatusQuery();
  const invalidateFetchRuleManagementFilters = useInvalidateFetchRuleManagementFiltersQuery();
  const invalidateFetchPrebuiltRulesUpgradeReview =
    useInvalidateFetchPrebuiltRulesUpgradeReviewQuery();
  const invalidateRuleStatus = useInvalidateFetchPrebuiltRulesStatusQuery();
  const invalidateFetchCoverageOverviewQuery = useInvalidateFetchCoverageOverviewQuery();
  const invalidateFetchPrebuiltRuleBaseVerison = useInvalidateFetchPrebuiltRuleBaseVersionQuery();
  const invalidateChangeHistory = useInvalidateChangeHistory();

  return useMutation<PerformRuleUpgradeResponseBody, unknown, PerformRuleUpgradeRequestBody>(
    (args: PerformRuleUpgradeRequestBody) => {
      return performUpgradeRules(args);
    },
    {
      ...options,
      mutationKey: PERFORM_RULES_UPGRADE_KEY,
      onSettled: (...args) => {
        invalidatePrePackagedRulesStatus();
        invalidateFindRulesQuery();
        invalidateFetchRulesSnoozeSettings();
        invalidateFetchRuleManagementFilters();

        invalidateFetchPrebuiltRulesUpgradeReview();
        invalidateRuleStatus();
        invalidateFetchCoverageOverviewQuery();
        invalidateFetchPrebuiltRuleBaseVerison();
        invalidateChangeHistory();

        if (options?.onSettled) {
          options.onSettled(...args);
        }
      },
      retry: retryOnRateLimitedError,
      retryDelay: cappedExponentialBackoff,
    }
  );
};
