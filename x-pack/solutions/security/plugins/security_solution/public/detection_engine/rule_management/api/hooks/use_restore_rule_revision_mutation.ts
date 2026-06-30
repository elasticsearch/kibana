/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseMutationOptions } from '@kbn/react-query';
import { useMutation } from '@kbn/react-query';
import type { RestoreRuleFromHistoryResponse } from '../../../../../common/api/detection_engine/rule_management';
import type { RestoreRuleFromHistoryProps } from '../../logic/types';
import { fetchRestoreRuleRevision } from '../api';
import { useInvalidateFindRulesQuery } from './use_find_rules_query';
import { useUpdateRuleByIdCache } from './use_fetch_rule_by_id_query';
import { useInvalidateFetchRuleManagementFiltersQuery } from './use_fetch_rule_management_filters_query';
import { useInvalidateFetchCoverageOverviewQuery } from './use_fetch_coverage_overview_query';
import { useInvalidateFetchPrebuiltRulesUpgradeReviewQuery } from './prebuilt_rules/use_fetch_prebuilt_rules_upgrade_review_query';
import { useInvalidateFetchPrebuiltRuleBaseVersionQuery } from './prebuilt_rules/use_fetch_prebuilt_rule_base_version_query';
import { useInvalidateChangeHistory } from './use_infinite_change_history';

export const useRestoreRuleFromHistoryMutation = (
  options?: UseMutationOptions<RestoreRuleFromHistoryResponse, Error, RestoreRuleFromHistoryProps>
) => {
  const invalidateFindRulesQuery = useInvalidateFindRulesQuery();
  const invalidateFetchRuleManagementFilters = useInvalidateFetchRuleManagementFiltersQuery();
  const invalidateFetchCoverageOverviewQuery = useInvalidateFetchCoverageOverviewQuery();
  const invalidatePrebuiltRulesUpdateReview = useInvalidateFetchPrebuiltRulesUpgradeReviewQuery();
  const invalidateFetchPrebuiltRuleBaseVersion = useInvalidateFetchPrebuiltRuleBaseVersionQuery();
  const updateRuleCache = useUpdateRuleByIdCache();
  const invalidateChangeHistory = useInvalidateChangeHistory();

  return useMutation<RestoreRuleFromHistoryResponse, Error, RestoreRuleFromHistoryProps>(
    (params: RestoreRuleFromHistoryProps) => fetchRestoreRuleRevision(params),
    {
      ...options,
      onSuccess: (response, ...rest) => {
        invalidateFindRulesQuery();
        invalidateFetchRuleManagementFilters();
        invalidateFetchCoverageOverviewQuery();
        invalidatePrebuiltRulesUpdateReview();
        invalidateFetchPrebuiltRuleBaseVersion();
        invalidateChangeHistory();
        updateRuleCache(response.rule);
        options?.onSuccess?.(response, ...rest);
      },
      onSettled: (...args) => {
        options?.onSettled?.(...args);
      },
    }
  );
};
