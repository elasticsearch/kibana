/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Dispatch, SetStateAction } from 'react';
import React, { createContext, useContext, useMemo, useState } from 'react';
import type {
  FindRulesSortField,
  PrebuiltRulesFilter,
  SortOrder,
} from '../../../../../../common/api/detection_engine';
import type {
  RuleUpgradeCustomizationCounts,
  RuleUpgradeState,
} from '../../../../rule_management/model/prebuilt_rule_upgrade';
import type { RuleSignatureId } from '../../../../../../common/api/detection_engine/model/rule_schema';
import { invariant } from '../../../../../../common/utils/invariant';
import { RULES_TABLE_INITIAL_PAGE_SIZE } from '../constants';
import type { PaginationOptions } from '../../../../rule_management/logic';
import { usePrebuiltRulesStatus } from '../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_status';
import { usePrebuiltRulesUpgrade } from '../../../../rule_management/hooks/use_prebuilt_rules_upgrade';

export interface UpgradePrebuiltRulesSortingOptions {
  field:
    | 'current_rule.name'
    | 'current_rule.risk_score'
    | 'current_rule.severity'
    | 'current_rule.last_updated';
  order: SortOrder;
}

export interface UpgradePrebuiltRulesSortingOptions {
  field:
    | 'current_rule.name'
    | 'current_rule.risk_score'
    | 'current_rule.severity'
    | 'current_rule.last_updated';
  order: SortOrder;
}

export interface UpgradePrebuiltRulesTableState {
  /**
   * Rule upgrade state after applying `filterOptions`
   */
  ruleUpgradeStates: RuleUpgradeState[];
  /**
   * Currently selected table filter
   */
  filterOptions: PrebuiltRulesFilter;
  /**
   * All unique tags for all rules
   */
  tags: string[];
  /**
   * Indicates whether there are rules (without filters applied) to upgrade.
   */
  hasRulesToUpgrade: boolean;
  /**
   * Is true then there is no cached data and the query is currently fetching.
   */
  isLoading: boolean;
  /**
   * Is true whenever a request is in-flight, which includes initial loading as well as background refetches.
   */
  isFetching: boolean;
  /**
   * Will be true if the query has been fetched.
   */
  isFetched: boolean;
  /**
   * Is true whenever a background refetch is in-flight, which does not include initial loading
   */
  isRefetching: boolean;
  /**
   * Is true while the `security_detection_engine` Fleet package is being
   * initialized (installed or upgraded) in the background.
   */
  isInitializingPrebuiltRulesPackage: boolean;
  /**
   * List of rule IDs that are currently being upgraded
   */
  loadingRules: RuleSignatureId[];
  /**
   * The timestamp for when the rules were successfully fetched
   */
  lastUpdated: number;
  /**
   * Current pagination state
   */
  pagination: PaginationOptions;
  /**
   * Currently selected table sorting
   */
  sortingOptions: UpgradePrebuiltRulesSortingOptions;
  /**
   * Customized-rule counts for the full filtered set of upgradeable rules.
   */
  allRulesCustomizationCounts: RuleUpgradeCustomizationCounts;
}

export interface UpgradePrebuiltRulesTableActions {
  reFetchRules: () => void;
  upgradeRules: (ruleIds: RuleSignatureId[]) => void;
  upgradeAllRules: () => void;
  upgradeRulesToTarget: (ruleIds: RuleSignatureId[]) => void;
  upgradeAllRulesToTarget: () => void;
  getSelectedRulesCustomizationCounts: (
    ruleIds: RuleSignatureId[]
  ) => RuleUpgradeCustomizationCounts;
  setFilterOptions: Dispatch<SetStateAction<PrebuiltRulesFilter>>;
  setPagination: Dispatch<SetStateAction<{ page: number; perPage: number }>>;
  setSortingOptions: Dispatch<SetStateAction<UpgradePrebuiltRulesSortingOptions>>;
  openRulePreview: (ruleId: string) => void;
}

export interface UpgradePrebuiltRulesContextType {
  state: UpgradePrebuiltRulesTableState;
  actions: UpgradePrebuiltRulesTableActions;
}

const UpgradePrebuiltRulesTableContext = createContext<UpgradePrebuiltRulesContextType | null>(
  null
);

interface UpgradePrebuiltRulesTableContextProviderProps {
  children: React.ReactNode;
}

/**
 * Provides necessary data and actions for Rules Upgrade table.
 *
 * It periodically re-fetches prebuilt rules upgrade review data to detect possible cases of:
 *  - editing prebuilt rules (revision change)
 *  - releasing a new prebuilt rules package (version change)
 */
export const UpgradePrebuiltRulesTableContextProvider = ({
  children,
}: UpgradePrebuiltRulesTableContextProviderProps) => {
  // Use the data from the prebuilt rules status API to determine if there are
  // rules to upgrade because it returns information about all rules without filters
  const { data: prebuiltRulesStatusResponse } = usePrebuiltRulesStatus();
  const hasRulesToUpgrade =
    (prebuiltRulesStatusResponse?.stats.num_prebuilt_rules_to_upgrade ?? 0) > 0;
  const tags = prebuiltRulesStatusResponse?.aggregated_fields?.upgradeable_rules.tags;

  const [filterOptions, setFilterOptions] = useState<PrebuiltRulesFilter>({});
  const [pagination, setPagination] = useState({
    page: 1,
    perPage: RULES_TABLE_INITIAL_PAGE_SIZE,
  });
  const [sortingOptions, setSortingOptions] = useState<UpgradePrebuiltRulesSortingOptions>({
    field: 'current_rule.last_updated',
    order: 'asc',
  });

  const findRulesSortField = useMemo<FindRulesSortField>(
    () =>
      ((
        {
          'current_rule.name': 'name',
          'current_rule.risk_score': 'risk_score',
          'current_rule.severity': 'severity',
          'current_rule.last_updated': 'updated_at',
        } as const
      )[sortingOptions.field]),
    [sortingOptions.field]
  );

  const {
    ruleUpgradeStates,
    upgradeReviewResponse,
    isFetched,
    isLoading,
    isFetching,
    isRefetching,
    isInitializingPrebuiltRulesPackage,
    loadingRules,
    lastUpdated,
    rulePreviewFlyout,
    confirmLegacyMlJobsUpgradeModal,
    upgradeConflictsModal,
    openRulePreview,
    reFetchRules,
    upgradeRules,
    upgradeAllRules,
    upgradeRulesToTarget,
    upgradeAllRulesToTarget,
    getSelectedRulesCustomizationCounts,
    allRulesCustomizationCounts,
  } = usePrebuiltRulesUpgrade({
    pagination,
    sort: {
      field: findRulesSortField,
      order: sortingOptions.order,
    },
    filterOptions: {
      tags: filterOptions.tags,
      customizationStatus: filterOptions.customization_status,
    },
    searchTerm: filterOptions.name,
  });

  const actions = useMemo<UpgradePrebuiltRulesTableActions>(
    () => ({
      reFetchRules,
      upgradeRules,
      upgradeAllRules,
      upgradeRulesToTarget,
      upgradeAllRulesToTarget,
      getSelectedRulesCustomizationCounts,
      setFilterOptions,
      openRulePreview,
      setPagination,
      setSortingOptions,
    }),
    [
      reFetchRules,
      upgradeRules,
      upgradeAllRules,
      upgradeRulesToTarget,
      upgradeAllRulesToTarget,
      getSelectedRulesCustomizationCounts,
      openRulePreview,
    ]
  );

  const providerValue = useMemo<UpgradePrebuiltRulesContextType>(
    () => ({
      state: {
        ruleUpgradeStates,
        hasRulesToUpgrade,
        filterOptions,
        tags: tags ?? [],
        isFetched,
        isLoading,
        isFetching,
        isRefetching,
        isInitializingPrebuiltRulesPackage,
        loadingRules,
        lastUpdated,
        pagination: {
          ...pagination,
          total: upgradeReviewResponse?.total ?? 0,
        },
        sortingOptions,
        allRulesCustomizationCounts,
      },
      actions,
    }),
    [
      ruleUpgradeStates,
      hasRulesToUpgrade,
      filterOptions,
      tags,
      isFetched,
      isLoading,
      isFetching,
      isRefetching,
      isInitializingPrebuiltRulesPackage,
      loadingRules,
      lastUpdated,
      pagination,
      upgradeReviewResponse?.total,
      sortingOptions,
      allRulesCustomizationCounts,
      actions,
    ]
  );

  return (
    <UpgradePrebuiltRulesTableContext.Provider value={providerValue}>
      <>
        {confirmLegacyMlJobsUpgradeModal}
        {upgradeConflictsModal}
        {children}
        {rulePreviewFlyout}
      </>
    </UpgradePrebuiltRulesTableContext.Provider>
  );
};

export const useUpgradePrebuiltRulesTableContext = (): UpgradePrebuiltRulesContextType => {
  const rulesTableContext = useContext(UpgradePrebuiltRulesTableContext);
  invariant(
    rulesTableContext,
    'useUpgradePrebuiltRulesTableContext should be used inside UpgradePrebuiltRulesTableContextProvider'
  );

  return rulesTableContext;
};
