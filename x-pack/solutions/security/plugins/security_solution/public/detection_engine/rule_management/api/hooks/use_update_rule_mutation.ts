/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseMutationOptions } from '@kbn/react-query';
import { useMutation } from '@kbn/react-query';
import type {
  RuleResponse,
  RuleUpdateProps,
} from '../../../../../common/api/detection_engine/model/rule_schema';
import { transformOutput } from '../../../common/transforms';
import { DETECTION_ENGINE_RULES_URL } from '../../../../../common/constants';
import { updateRule } from '../api';
import { useInvalidateFindRulesQuery } from './use_find_rules_query';
import { useUpdateRuleByIdCache } from './use_fetch_rule_by_id_query';
import { useInvalidateFetchRuleManagementFiltersQuery } from './use_fetch_rule_management_filters_query';
import { useInvalidateFetchCoverageOverviewQuery } from './use_fetch_coverage_overview_query';
import { useInvalidateFetchPrebuiltRulesUpgradeReviewQuery } from './prebuilt_rules/use_fetch_prebuilt_rules_upgrade_review_query';
import { useInvalidateFetchPrebuiltRuleBaseVersionQuery } from './prebuilt_rules/use_fetch_prebuilt_rule_base_version_query';
import { useInvalidateChangeHistory } from './use_infinite_change_history';

export const UPDATE_RULE_MUTATION_KEY = ['PUT', DETECTION_ENGINE_RULES_URL];

export const useUpdateRuleMutation = (
  options?: UseMutationOptions<RuleResponse, Error, RuleUpdateProps>
) => {
  const invalidateFindRulesQuery = useInvalidateFindRulesQuery();
  const invalidateFetchRuleManagementFilters = useInvalidateFetchRuleManagementFiltersQuery();
  const invalidateFetchCoverageOverviewQuery = useInvalidateFetchCoverageOverviewQuery();
  const invalidatePrebuiltRulesUpdateReview = useInvalidateFetchPrebuiltRulesUpgradeReviewQuery();
  const invalidateFetchPrebuiltRuleBaseVerison = useInvalidateFetchPrebuiltRuleBaseVersionQuery();
  const updateRuleCache = useUpdateRuleByIdCache();
  const invalidateChangeHistory = useInvalidateChangeHistory();

  return useMutation<RuleResponse, Error, RuleUpdateProps>(
    (rule: RuleUpdateProps) => updateRule({ rule: transformOutput(rule) }),
    {
      ...options,
      mutationKey: UPDATE_RULE_MUTATION_KEY,
      onSettled: (...args) => {
        invalidateFindRulesQuery();
        invalidateFetchRuleManagementFilters();
        invalidateFetchCoverageOverviewQuery();
        invalidatePrebuiltRulesUpdateReview();
        invalidateFetchPrebuiltRuleBaseVerison();
        invalidateChangeHistory();

        const [response] = args;

        if (response) {
          updateRuleCache(response);
        }

        options?.onSettled?.(...args);
      },
    }
  );
};
