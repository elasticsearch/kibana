/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { UseMutationOptions } from '@kbn/react-query';
import { useMutation } from '@kbn/react-query';
import type { HTTPError } from '../../../../../../common/detection_engine/types';
import type {
  RevertPrebuiltRulesResponseBody,
  RevertPrebuiltRulesRequest,
} from '../../../../../../common/api/detection_engine';
import { REVERT_PREBUILT_RULES_URL } from '../../../../../../common/api/detection_engine/prebuilt_rules/urls';
import { revertPrebuiltRule } from '../../api';
import { useInvalidateFetchCoverageOverviewQuery } from '../use_fetch_coverage_overview_query';
import { useInvalidateFetchRuleManagementFiltersQuery } from '../use_fetch_rule_management_filters_query';
import { useInvalidateFindRulesQuery } from '../use_find_rules_query';
import { useInvalidateFetchPrebuiltRulesStatusQuery } from './use_fetch_prebuilt_rules_status_query';
import { useInvalidateFetchPrebuiltRulesUpgradeReviewQuery } from './use_fetch_prebuilt_rules_upgrade_review_query';
import { retryOnRateLimitedError } from './retry_on_rate_limited_error';
import { cappedExponentialBackoff } from './capped_exponential_backoff';
import { useInvalidateFetchPrebuiltRuleBaseVersionQuery } from './use_fetch_prebuilt_rule_base_version_query';
import { useInvalidateFetchRuleByIdQuery } from '../use_fetch_rule_by_id_query';
import { useInvalidateChangeHistory } from '../use_infinite_change_history';

export const REVERT_PREBUILT_RULE_KEY = ['POST', REVERT_PREBUILT_RULES_URL];

export const useRevertPrebuiltRuleMutation = (
  options?: UseMutationOptions<
    RevertPrebuiltRulesResponseBody,
    HTTPError,
    RevertPrebuiltRulesRequest
  >
) => {
  const invalidateFindRulesQuery = useInvalidateFindRulesQuery();
  const invalidatePrePackagedRulesStatus = useInvalidateFetchPrebuiltRulesStatusQuery();
  const invalidateFetchRuleManagementFilters = useInvalidateFetchRuleManagementFiltersQuery();
  const invalidateFetchPrebuiltRulesUpgradeReview =
    useInvalidateFetchPrebuiltRulesUpgradeReviewQuery();
  const invalidateRuleStatus = useInvalidateFetchPrebuiltRulesStatusQuery();
  const invalidateFetchCoverageOverviewQuery = useInvalidateFetchCoverageOverviewQuery();
  const invalidateFetchPrebuiltRuleBaseVerison = useInvalidateFetchPrebuiltRuleBaseVersionQuery();
  const invalidateFetchRuleByIdQuery = useInvalidateFetchRuleByIdQuery();
  const invalidateChangeHistory = useInvalidateChangeHistory();

  return useMutation<RevertPrebuiltRulesResponseBody, HTTPError, RevertPrebuiltRulesRequest>(
    (args: RevertPrebuiltRulesRequest) => {
      return revertPrebuiltRule(args);
    },
    {
      ...options,
      mutationKey: REVERT_PREBUILT_RULE_KEY,
      onSettled: (...args) => {
        invalidatePrePackagedRulesStatus();
        invalidateFindRulesQuery();
        invalidateFetchRuleManagementFilters();

        invalidateFetchPrebuiltRulesUpgradeReview();
        invalidateRuleStatus();
        invalidateFetchCoverageOverviewQuery();
        invalidateFetchRuleByIdQuery();
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
