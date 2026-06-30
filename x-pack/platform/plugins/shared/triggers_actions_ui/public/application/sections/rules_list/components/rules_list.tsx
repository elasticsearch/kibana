/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable react-hooks/exhaustive-deps */

import type { EuiSelectableOption, EuiTableSortingType } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiDescriptionList,
  EuiPageTemplate,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import type { EuiSelectableOptionCheckedType } from '@elastic/eui/src/components/selectable/selectable_option';
import { parseRuleCircuitBreakerErrorMessage } from '@kbn/alerting-plugin/common';
import type { KueryNode } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { RuleTypeModal } from '@kbn/response-ops-rule-form';
import { capitalize, isEmpty, isEqual, sortBy } from 'lodash';
import type { ReactNode } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';

import type { RuleExecutionStatus } from '@kbn/alerting-plugin/common';
import {
  RuleExecutionStatusErrorReasons,
  RuleLastRunOutcomeValues,
} from '@kbn/alerting-plugin/common';
import { MaintenanceWindowCallout, useGetRuleTypesPermissions } from '@kbn/alerts-ui-shared';
import { usePageReady } from '@kbn/ebt-tools';
import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import {
  ruleDetailsRoute as commonRuleDetailsRoute,
  getCreateRuleRoute,
  getCreateRuleFromTemplateRoute,
  getEditRuleRoute,
} from '@kbn/rule-data-utils';
import { ProjectRoutingAccess, useRouteBasedCpsPickerAccess } from '@kbn/cps-utils';
import type {
  BulkEditActions,
  Pagination,
  Rule,
  RuleStatus,
  RuleTableItem,
  RuleType,
  SnoozeSchedule,
  UpdateFiltersProps,
  UpdateRulesToBulkEditProps,
} from '../../../../types';
import { Percentiles } from '../../../../types';
import { BulkOperationPopover } from '../../common/components/bulk_operation_popover';
import { RuleQuickEditButtonsWithApi as RuleQuickEditButtons } from '../../common/components/rule_quick_edit_buttons';
import { CollapsedItemActionsWithApi as CollapsedItemActions } from './collapsed_item_actions';
import { RulesListFiltersBar } from './rules_list_filters_bar';

import { bulkDeleteRules } from '../../../lib/rule_api/bulk_delete';
import { bulkDisableRules } from '../../../lib/rule_api/bulk_disable';
import { bulkEnableRules } from '../../../lib/rule_api/bulk_enable';
import { cloneRule } from '../../../lib/rule_api/clone';
import { snoozeRule } from '../../../lib/rule_api/snooze';
import { unsnoozeRule } from '../../../lib/rule_api/unsnooze';
import { bulkUpdateAPIKey } from '../../../lib/rule_api/update_api_key';

import { getIsExperimentalFeatureEnabled } from '../../../../common/get_experimental_features';
import { useKibana } from '../../../../common/lib/kibana';
import { RulesDeleteModalConfirmation } from '../../../components/rules_delete_modal_confirmation';
import { UpdateApiKeyModalConfirmation } from '../../../components/update_api_key_modal_confirmation';
import { DEFAULT_SEARCH_PAGE_SIZE } from '../../../constants';
import { useBulkEditSelect } from '../../../hooks/use_bulk_edit_select';
import { hasAllPrivilege, hasExecuteActionsCapability } from '../../../lib/capabilities';
import { runRule } from '../../../lib/run_rule';
import { ALERT_STATUS_LICENSE_ERROR, getConfirmDeletionModalWarningText } from '../translations';
import { BulkSnoozeModalWithApi as BulkSnoozeModal } from './bulk_snooze_modal';
import { BulkSnoozeScheduleModalWithApi as BulkSnoozeScheduleModal } from './bulk_snooze_schedule_modal';
import { ManageLicenseModal } from './manage_license_modal';
import { RulesListClearRuleFilterBanner } from './rules_list_clear_rule_filter_banner';
import { RulesListUiamApiKeyBanner } from './rules_list_uiam_api_key_banner';
import { RulesListPrompts } from './rules_list_prompts';
import { RulesListTable, convertRulesToTableItems } from './rules_list_table';

import { ToastWithCircuitBreakerContent } from '../../../components/toast_with_circuit_breaker_content';
import { useLoadActionTypesQuery } from '../../../hooks/use_load_action_types_query';
import { useLoadConfigQuery } from '../../../hooks/use_load_config_query';
import { useLoadRuleAggregationsQuery } from '../../../hooks/use_load_rule_aggregations_query';
import { useLoadRulesQuery } from '../../../hooks/use_load_rules_query';

import { useBulkOperationToast } from '../../../hooks/use_bulk_operation_toast';
import { useRulesListUiState as useUiState } from '../../../hooks/use_rules_list_ui_state';
import {
  MULTIPLE_RULE_TITLE,
  SINGLE_RULE_TITLE,
  getConfirmDeletionButtonText,
  getConfirmDeletionModalText,
} from '../translations';
import { useRulesListFilterStore } from './hooks/use_rules_list_filter_store';

export interface RulesListProps {
  ruleTypeIds?: string[];
  consumers?: string[];
  filteredRuleTypes?: string[];
  lastResponseFilter?: string[];
  lastRunOutcomeFilter?: string[];
  refresh?: Date;
  ruleDetailsRoute?: string;
  ruleParamFilter?: Record<string, string | number | object>;
  rulesListKey?: string;
  searchFilter?: string;
  showActionFilter?: boolean;
  showCreateRuleButtonInPrompt?: boolean;
  showSearchBar?: boolean;
  statusFilter?: RuleStatus[];
  typeFilter?: string[];
  visibleColumns?: string[];
  onLastResponseFilterChange?: (lastResponse: string[]) => void;
  onLastRunOutcomeFilterChange?: (lastRunOutcome: string[]) => void;
  onRuleParamFilterChange?: (ruleParams: Record<string, string | number | object>) => void;
  onSearchFilterChange?: (search: string) => void;
  onStatusFilterChange?: (status: RuleStatus[]) => void;
  onTypeFilterChange?: (type: string[]) => void;
  onRefresh?: (refresh: Date) => void;
  initialSelectedConsumer?: RuleCreationValidConsumer | null;
  navigateToEditRuleForm?: (ruleId: string) => void;
  navigateToCreateRuleForm?: (ruleTypeId: string) => void;
}

export const percentileFields = {
  [Percentiles.P50]: 'monitoring.run.calculated_metrics.p50',
  [Percentiles.P95]: 'monitoring.run.calculated_metrics.p95',
  [Percentiles.P99]: 'monitoring.run.calculated_metrics.p99',
};

const initialPercentileOptions = Object.values(Percentiles).map((percentile) => ({
  checked: percentile === Percentiles.P50 ? 'on' : (undefined as EuiSelectableOptionCheckedType),
  label: percentile,
  key: percentile,
}));

const EMPTY_ARRAY: string[] = [];

export const RulesList = ({
  ruleTypeIds,
  consumers,
  filteredRuleTypes = EMPTY_ARRAY,
  lastResponseFilter,
  lastRunOutcomeFilter,
  refresh,
  ruleDetailsRoute,
  ruleParamFilter,
  rulesListKey,
  searchFilter = '',
  showActionFilter = true,
  showCreateRuleButtonInPrompt = false,
  showSearchBar = true,
  statusFilter,
  typeFilter,
  visibleColumns,
  onLastResponseFilterChange,
  onLastRunOutcomeFilterChange,
  onRuleParamFilterChange,
  onSearchFilterChange,
  onStatusFilterChange,
  onTypeFilterChange,
  onRefresh,
  navigateToEditRuleForm,
  navigateToCreateRuleForm,
}: RulesListProps) => {
  const history = useHistory();
  const kibanaServices = useKibana().services;
  const {
    actionTypeRegistry,
    application,
    http,
    cps,
    kibanaFeatures,
    notifications: { toasts },
    ruleTypeRegistry,
    ...startServices
  } = kibanaServices;

  const { capabilities, navigateToApp } = application;

  useRouteBasedCpsPickerAccess(ProjectRoutingAccess.DISABLED, { application, cps });
  const canExecuteActions = hasExecuteActionsCapability(capabilities);
  const [isPerformingAction, setIsPerformingAction] = useState<boolean>(false);
  const [page, setPage] = useState<Pagination>({ index: 0, size: DEFAULT_SEARCH_PAGE_SIZE });

  const [ruleTypeModalVisible, setRuleTypeModalVisibility] = useState<boolean>(false);
  const [itemIdToExpandedRowMap, setItemIdToExpandedRowMap] = useState<Record<string, ReactNode>>(
    {}
  );
  const [showErrors, setShowErrors] = useState(false);
  const cloneRuleId = useRef<null | string>(null);

  const isRuleStatusFilterEnabled = getIsExperimentalFeatureEnabled('ruleStatusFilter');

  const [percentileOptions, setPercentileOptions] =
    useState<EuiSelectableOption[]>(initialPercentileOptions);

  const [sort, setSort] = useState<EuiTableSortingType<RuleTableItem>['sort']>({
    field: 'name',
    direction: 'asc',
  });
  const [manageLicenseModalOpts, setManageLicenseModalOpts] = useState<{
    licenseType: string;
    ruleTypeId: string;
  } | null>(null);

  const [isEnablingRules, setIsEnablingRules] = useState<boolean>(false);
  const [isDisablingRules, setIsDisablingRules] = useState<boolean>(false);

  const [rulesToBulkEdit, setRulesToBulkEdit] = useState<RuleTableItem[]>([]);
  const [rulesToBulkEditFilter, setRulesToBulkEditFilter] = useState<
    KueryNode | undefined | null
  >();
  const [bulkEditAction, setBulkEditAction] = useState<BulkEditActions | undefined>();
  const [isBulkEditing, setIsBulkEditing] = useState<boolean>(false);

  const [isCloningRule, setIsCloningRule] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [localRefresh, setLocalRefresh] = useState<Date>(new Date());

  // Fetch config
  const { config } = useLoadConfigQuery();
  // Fetch rule types
  const {
    ruleTypesState,
    hasAnyAuthorizedRuleType,
    authorizedRuleTypes,
    authorizedToReadAnyRules,
    authorizedToCreateAnyRules,
    isSuccess: isLoadRuleTypesSuccess,
  } = useGetRuleTypesPermissions({
    http,
    toasts,
    filteredRuleTypes,
  });
  // Fetch action types
  const { actionTypes } = useLoadActionTypesQuery();

  const { filters, setFiltersStore, numberOfFiltersStore, resetFiltersStore } =
    useRulesListFilterStore({
      lastResponseFilter,
      lastRunOutcomeFilter,
      rulesListKey,
      ruleParamFilter,
      statusFilter,
      searchFilter,
      typeFilter,
    });

  const [inputText, setInputText] = useState<string>(filters.searchText ?? searchFilter ?? '');

  const rulesTypesFilter = isEmpty(filters.types)
    ? authorizedRuleTypes.map((art) => art.id)
    : filters.types;

  const hasDefaultRuleTypesFiltersOn = isEmpty(filters.types);

  const computedFilter = useMemo(() => {
    return {
      ...filters,
      types: rulesTypesFilter,
    };
  }, [filters, rulesTypesFilter]);

  const canLoadRules = isLoadRuleTypesSuccess && hasAnyAuthorizedRuleType;

  // Fetch rules
  const { rulesState, loadRules, hasData, lastUpdate } = useLoadRulesQuery({
    ruleTypeIds,
    consumers,
    filters: computedFilter,
    hasDefaultRuleTypesFiltersOn,
    page,
    sort,
    onPage: setPage,
    enabled: canLoadRules,
    refresh,
  });

  // Fetch status aggregation
  const { loadRuleAggregations, rulesStatusesTotal, rulesLastRunOutcomesTotal } =
    useLoadRuleAggregationsQuery({
      ruleTypeIds,
      consumers,
      filters: computedFilter,
      enabled: canLoadRules,
      refresh,
    });

  const { showSpinner, showRulesList, showNoAuthPrompt, showCreateFirstRulePrompt } = useUiState({
    authorizedToReadAnyRules,
    authorizedToCreateAnyRules,
    filters,
    hasDefaultRuleTypesFiltersOn,
    isLoadingRuleTypes: ruleTypesState.isLoading,
    isLoadingRules: rulesState.isLoading,
    hasData,
    isInitialLoadingRuleTypes: ruleTypesState.isInitialLoad,
    isInitialLoadingRules: rulesState.initialLoad,
  });

  const onRuleEdit = (ruleItem: RuleTableItem) => {
    if (navigateToEditRuleForm) {
      navigateToEditRuleForm(ruleItem.id);
      return;
    }

    navigateToApp('management', {
      path: `insightsAndAlerting/triggersActions/${getEditRuleRoute(ruleItem.id)}`,
      state: {
        returnApp: 'management',
        returnPath: `insightsAndAlerting/triggersActions/rules`,
      },
    });
  };

  const onRunRule = async (id: string) => {
    await runRule(http, toasts, id);
  };

  const isRuleTypeEditableInContext = (ruleTypeId: string) =>
    ruleTypeRegistry.has(ruleTypeId) ? !ruleTypeRegistry.get(ruleTypeId).requiresAppContext : false;

  const refreshRules = useCallback(async () => {
    if (!ruleTypesState || !hasAnyAuthorizedRuleType) {
      return;
    }
    const now = new Date();
    setLocalRefresh(now);
    onRefresh?.(now);
    await loadRules();
    await loadRuleAggregations();
  }, [
    loadRules,
    loadRuleAggregations,
    setLocalRefresh,
    onRefresh,
    isRuleStatusFilterEnabled,
    hasAnyAuthorizedRuleType,
    ruleTypesState,
  ]);

  const tableItems = useMemo(() => {
    if (ruleTypesState.isInitialLoad) {
      return [];
    }
    return convertRulesToTableItems({
      rules: rulesState.data,
      ruleTypeIndex: ruleTypesState.data,
      canExecuteActions,
      config,
    });
  }, [ruleTypesState, rulesState.data, canExecuteActions, config]);

  const {
    isAllSelected,
    selectedIds,
    isPageSelected,
    numberOfSelectedItems,
    isRowSelected,
    getFilter,
    onSelectRow,
    onSelectAll,
    onSelectPage,
    onClearSelection,
  } = useBulkEditSelect({
    totalItemCount: rulesState.totalItemCount,
    items: tableItems,
    filters: { ...filters, types: rulesTypesFilter },
  });

  const handleUpdateFiltersEffect = useCallback(
    (updateFilterProps: UpdateFiltersProps) => {
      const { filter, value } = updateFilterProps;
      onClearSelection();
      switch (filter) {
        case 'ruleStatuses':
          onStatusFilterChange?.(value as RuleStatus[]);
          break;
        case 'ruleExecutionStatuses':
          onLastResponseFilterChange?.(value as string[]);
          break;
        case 'ruleLastRunOutcomes':
          onLastRunOutcomeFilterChange?.(value as string[]);
          break;
        case 'ruleParams':
          onRuleParamFilterChange?.(value as Record<string, string | number | object>);
          break;
        case 'searchText':
          onSearchFilterChange?.(value as string);
          break;
        case 'types':
          onTypeFilterChange?.(value as string[]);
          break;
        default:
          break;
      }
    },
    [
      onStatusFilterChange,
      onLastResponseFilterChange,
      onLastRunOutcomeFilterChange,
      onSearchFilterChange,
      onTypeFilterChange,
      onClearSelection,
    ]
  );

  const updateFilters = useCallback(
    (updateFiltersProps: UpdateFiltersProps) => {
      setFiltersStore(updateFiltersProps);
      handleUpdateFiltersEffect(updateFiltersProps);
    },
    [setFiltersStore, handleUpdateFiltersEffect]
  );

  const handleClearRuleParamFilter = () => updateFilters({ filter: 'ruleParams', value: {} });

  usePageReady({
    isReady: !rulesState?.initialLoad,
    isRefreshing: rulesState?.isLoading,
    meta: {
      description: '[ttfmp_rules_list] The Rules List overview page has loaded successfully.',
    },
  });

  useEffect(() => {
    if (statusFilter) {
      updateFilters({ filter: 'ruleStatuses', value: statusFilter });
    }
  }, [statusFilter]);

  useEffect(() => {
    if (lastResponseFilter) {
      updateFilters({ filter: 'ruleExecutionStatuses', value: lastResponseFilter });
    }
  }, [lastResponseFilter]);

  useEffect(() => {
    if (lastRunOutcomeFilter) {
      updateFilters({ filter: 'ruleLastRunOutcomes', value: lastRunOutcomeFilter });
    }
  }, [lastRunOutcomeFilter]);

  useEffect(() => {
    if (ruleParamFilter && !isEqual(ruleParamFilter, filters.ruleParams)) {
      updateFilters({ filter: 'ruleParams', value: ruleParamFilter });
    }
  }, [ruleParamFilter]);

  useEffect(() => {
    if (
      typeof searchFilter === 'string' &&
      searchFilter !== filters.searchText &&
      searchFilter.trim() !== ''
    ) {
      updateFilters({ filter: 'searchText', value: searchFilter });
    }
  }, [searchFilter]);

  useEffect(() => {
    if (typeFilter) {
      updateFilters({ filter: 'types', value: typeFilter });
    }
  }, [typeFilter]);

  useEffect(() => {
    if (cloneRuleId.current) {
      const ruleItem = tableItems.find((ti) => ti.id === cloneRuleId.current);
      cloneRuleId.current = null;
      setIsCloningRule(false);
      if (ruleItem) {
        onRuleEdit(ruleItem);
      }
    }
  }, [tableItems]);

  const buildErrorListItems = (_executionStatus: RuleExecutionStatus) => {
    const hasErrorMessage = _executionStatus.status === 'error';
    const errorMessage = _executionStatus?.error?.message;
    const isLicenseError =
      _executionStatus.error?.reason === RuleExecutionStatusErrorReasons.License;
    const statusMessage = isLicenseError ? ALERT_STATUS_LICENSE_ERROR : null;

    return [
      {
        title: (
          <FormattedMessage
            id="xpack.triggersActionsUI.sections.rulesList.expandRow.title"
            defaultMessage="Error from last run"
          />
        ),
        description: (
          <>
            {errorMessage}
            {hasErrorMessage && statusMessage && <EuiSpacer size="xs" />}
            {statusMessage}
          </>
        ),
      },
    ];
  };

  const toggleErrorMessage = (_executionStatus: RuleExecutionStatus, ruleItem: RuleTableItem) => {
    setItemIdToExpandedRowMap((itemToExpand) => {
      const _itemToExpand = { ...itemToExpand };
      if (_itemToExpand[ruleItem.id]) {
        delete _itemToExpand[ruleItem.id];
      } else {
        _itemToExpand[ruleItem.id] = (
          <EuiDescriptionList listItems={buildErrorListItems(_executionStatus)} />
        );
      }
      return _itemToExpand;
    });
  };

  const toggleRuleErrors = useCallback(() => {
    setShowErrors((prevValue) => {
      if (!prevValue) {
        const rulesToExpand = rulesState.data.reduce((acc, ruleItem) => {
          // Check both outcome and executionStatus for now until we deprecate executionStatus
          if (
            ruleItem.lastRun?.outcome === RuleLastRunOutcomeValues[2] ||
            ruleItem.executionStatus.status === 'error'
          ) {
            return {
              ...acc,
              [ruleItem.id]: (
                <EuiDescriptionList listItems={buildErrorListItems(ruleItem.executionStatus)} />
              ),
            };
          }
          return acc;
        }, {});
        setItemIdToExpandedRowMap(rulesToExpand);
      } else {
        setItemIdToExpandedRowMap({});
      }
      return !prevValue;
    });
  }, [showErrors, rulesState]);

  const getProducerFeatureName = (producer: string) => {
    return kibanaFeatures?.find((featureItem) => featureItem.id === producer)?.name;
  };

  const groupRuleTypesByProducer = () => {
    return authorizedRuleTypes.reduce(
      (
        result: Record<
          string,
          Array<{
            value: string;
            name: string;
          }>
        >,
        ruleType
      ) => {
        const producer = ruleType.producer;
        (result[producer] = result[producer] || []).push({
          value: ruleType.id,
          name: ruleType.name,
        });
        return result;
      },
      {}
    );
  };

  const onDisableRule = useCallback(
    (rule: RuleTableItem, untrack: boolean) => {
      return bulkDisableRules({ http, ids: [rule.id], untrack });
    },
    [bulkDisableRules]
  );

  const onEnableRule = useCallback(
    (rule: RuleTableItem) => {
      return bulkEnableRules({ http, ids: [rule.id] });
    },
    [bulkEnableRules]
  );

  const onSnoozeRule = (rule: RuleTableItem, snoozeSchedule: SnoozeSchedule) => {
    return snoozeRule({ http, id: rule.id, snoozeSchedule });
  };

  const onUnsnoozeRule = (rule: RuleTableItem, scheduleIds?: string[]) => {
    return unsnoozeRule({ http, id: rule.id, scheduleIds });
  };

  const onSearchPopulate = (value: string) => {
    setInputText(value);
    updateFilters({ filter: 'searchText', value });
  };

  const filterOptions = sortBy(Object.entries(groupRuleTypesByProducer())).map(
    ([groupName, ruleTypesOptions]) => ({
      groupName: getProducerFeatureName(groupName) ?? capitalize(groupName),
      subOptions: ruleTypesOptions.sort((a, b) => a.name.localeCompare(b.name)),
    })
  );

  const authorizedToModifySelectedRules = useMemo(() => {
    if (isAllSelected) {
      return true;
    }

    return selectedIds.length
      ? filterRulesById(rulesState.data, selectedIds).every((selectedRule) =>
          hasAllPrivilege(selectedRule.consumer, ruleTypesState.data.get(selectedRule.ruleTypeId))
        )
      : false;
  }, [selectedIds, rulesState.data, ruleTypesState.data, isAllSelected]);

  const updateRulesToBulkEdit = useCallback(
    ({ action, rules, filter }: UpdateRulesToBulkEditProps) => {
      setBulkEditAction(action);
      if (rules) {
        setRulesToBulkEdit(rules);
      }
      if (filter) {
        setRulesToBulkEditFilter(filter);
      }
      if (action === 'delete') {
        setIsDeleteModalVisibility((rules && rules.length > 0) || Boolean(filter));
      }
    },
    []
  );

  const clearRulesToBulkEdit = useCallback(() => {
    if (bulkEditAction === 'delete') {
      setIsDeleteModalVisibility(false);
    }
    setRulesToBulkEdit([]);
    setRulesToBulkEditFilter(undefined);
    setBulkEditAction(undefined);
  }, []);

  const isRulesTableLoading =
    isLoading ||
    rulesState.isLoading ||
    ruleTypesState.isLoading ||
    isBulkEditing ||
    isPerformingAction ||
    isEnablingRules ||
    isDisablingRules ||
    isCloningRule;

  const onCloneRule = async (ruleId: string) => {
    setIsCloningRule(true);
    try {
      const RuleCloned = await cloneRule({ http, ruleId });
      cloneRuleId.current = RuleCloned.id;
      await loadRules();
    } catch {
      cloneRuleId.current = null;
      setIsCloningRule(false);
      toasts.addDanger(
        i18n.translate('xpack.triggersActionsUI.sections.rulesList.cloneFailed', {
          defaultMessage: 'Unable to clone rule',
        })
      );
    }
  };

  const openRuleTypeModal = useCallback(() => {
    setRuleTypeModalVisibility(true);
  }, []);

  const [isDeleteModalFlyoutVisible, setIsDeleteModalVisibility] = useState<boolean>(false);

  const { showToast } = useBulkOperationToast({ onSearchPopulate });

  const onEnable = async () => {
    setIsEnablingRules(true);

    const { errors, total } = isAllSelected
      ? await bulkEnableRules({ http, filter: getFilter() })
      : await bulkEnableRules({ http, ids: selectedIds });

    setIsEnablingRules(false);

    const circuitBreakerError = errors.find(
      (error) => !!parseRuleCircuitBreakerErrorMessage(error.message).details
    );

    if (circuitBreakerError) {
      const parsedError = parseRuleCircuitBreakerErrorMessage(circuitBreakerError.message);
      toasts.addDanger({
        title: parsedError.summary,
        text: toMountPoint(
          <ToastWithCircuitBreakerContent>{parsedError.details}</ToastWithCircuitBreakerContent>,
          startServices
        ),
      });
    } else {
      showToast({ action: 'ENABLE', errors, total });
    }

    await refreshRules();
    onClearSelection();
  };

  const onDisable = async (untrack: boolean) => {
    setIsDisablingRules(true);

    const { errors, total } = isAllSelected
      ? await bulkDisableRules({ http, filter: getFilter(), untrack })
      : await bulkDisableRules({ http, ids: selectedIds, untrack });

    setIsDisablingRules(false);
    showToast({ action: 'DISABLE', errors, total });
    await refreshRules();
    onClearSelection();
  };

  const onDeleteCancel = () => {
    setIsDeleteModalVisibility(false);
    clearRulesToBulkEdit();
  };
  const onDeleteConfirm = async () => {
    if (bulkEditAction !== 'delete') {
      return;
    }
    setIsDeleteModalVisibility(false);
    setIsBulkEditing(true);

    const bulkDeleteRulesArguments =
      isAllSelected && rulesToBulkEditFilter
        ? {
            filter: rulesToBulkEditFilter,
            http,
          }
        : {
            ids: rulesToBulkEdit.map((rule) => rule.id),
            http,
          };
    const { errors, total } = await bulkDeleteRules(bulkDeleteRulesArguments);

    setIsBulkEditing(false);
    showToast({ action: 'DELETE', errors, total });
    clearRulesToBulkEdit();
    onClearSelection();
    refreshRules();
  };

  const numberRulesToDelete = rulesToBulkEdit.length || numberOfSelectedItems;

  const allRuleCategories = getAllUniqueRuleTypeCategories(
    Array.from(ruleTypesState.data.values())
  );

  return (
    <>
      {kibanaServices.isServerless && config.apiKeyType === 'uiam' ? (
        <RulesListUiamApiKeyBanner />
      ) : null}
      {showSearchBar && !isEmpty(filters.ruleParams) ? (
        <RulesListClearRuleFilterBanner onClickClearFilter={handleClearRuleParamFilter} />
      ) : null}
      <MaintenanceWindowCallout kibanaServices={kibanaServices} categories={allRuleCategories} />
      <EuiSpacer size="s" />
      <RulesListPrompts
        showNoAuthPrompt={showNoAuthPrompt}
        showCreateFirstRulePrompt={showCreateFirstRulePrompt}
        showCreateRuleButtonInPrompt={showCreateRuleButtonInPrompt}
        showSpinner={showSpinner}
        onCreateRulesClick={openRuleTypeModal}
      />
      <EuiPageTemplate.Section data-test-subj="rulesListSection" grow={false} paddingSize="none">
        {isDeleteModalFlyoutVisible && (
          <RulesDeleteModalConfirmation
            onConfirm={onDeleteConfirm}
            onCancel={onDeleteCancel}
            confirmButtonText={getConfirmDeletionButtonText(
              numberRulesToDelete,
              SINGLE_RULE_TITLE,
              MULTIPLE_RULE_TITLE
            )}
            confirmModalText={getConfirmDeletionModalText(
              numberRulesToDelete,
              SINGLE_RULE_TITLE,
              MULTIPLE_RULE_TITLE
            )}
            showWarningText={isAllSelected}
            warningText={getConfirmDeletionModalWarningText()}
          />
        )}
        <BulkSnoozeModal
          rules={rulesToBulkEdit}
          filter={rulesToBulkEditFilter}
          bulkEditAction={bulkEditAction}
          numberOfSelectedRules={numberOfSelectedItems}
          setIsBulkEditing={setIsBulkEditing}
          onClose={() => {
            // Don't clear the bulk edit action yet since we need it for loading indicator
            setRulesToBulkEdit([]);
            setRulesToBulkEditFilter(undefined);
          }}
          onSave={async () => {
            clearRulesToBulkEdit();
            onClearSelection();
            await refreshRules();
          }}
          onSearchPopulate={onSearchPopulate}
        />
        <BulkSnoozeScheduleModal
          rules={rulesToBulkEdit}
          filter={rulesToBulkEditFilter}
          bulkEditAction={bulkEditAction}
          numberOfSelectedRules={numberOfSelectedItems}
          setIsBulkEditing={setIsBulkEditing}
          onClose={() => {
            // Don't clear the bulk edit action yet since we need it for loading indicator
            setRulesToBulkEdit([]);
            setRulesToBulkEditFilter(undefined);
          }}
          onSave={async () => {
            clearRulesToBulkEdit();
            onClearSelection();
            await refreshRules();
          }}
          onSearchPopulate={onSearchPopulate}
        />
        {bulkEditAction === 'updateApiKey' && (
          <UpdateApiKeyModalConfirmation
            onCancel={() => {
              clearRulesToBulkEdit();
            }}
            rulesToUpdate={rulesToBulkEdit}
            idsToUpdateFilter={rulesToBulkEditFilter}
            numberOfSelectedRules={numberOfSelectedItems}
            apiUpdateApiKeyCall={bulkUpdateAPIKey}
            setIsLoadingState={(newIsLoading: boolean) => {
              setIsBulkEditing(newIsLoading);
              setIsLoading(newIsLoading);
            }}
            onUpdated={async () => {
              clearRulesToBulkEdit();
              onClearSelection();
              await refreshRules();
            }}
            onSearchPopulate={onSearchPopulate}
          />
        )}

        {showRulesList && (
          <>
            {showSearchBar ? (
              <>
                <RulesListFiltersBar
                  actionTypes={actionTypes}
                  filterOptions={filterOptions}
                  filters={filters}
                  inputText={inputText}
                  lastUpdate={lastUpdate}
                  rulesLastRunOutcomesTotal={rulesLastRunOutcomesTotal}
                  rulesStatusesTotal={rulesStatusesTotal}
                  setInputText={setInputText}
                  showActionFilter={showActionFilter}
                  showErrors={showErrors}
                  canLoadRules={canLoadRules}
                  refresh={refresh || localRefresh}
                  updateFilters={updateFilters}
                  onClearSelection={onClearSelection}
                  onRefreshRules={refreshRules}
                  onToggleRuleErrors={toggleRuleErrors}
                />
                <EuiSpacer size="s" />
              </>
            ) : null}

            <RulesListTable
              items={tableItems}
              isLoading={isRulesTableLoading}
              rulesState={rulesState}
              ruleTypesState={ruleTypesState}
              ruleTypeRegistry={ruleTypeRegistry}
              isPageSelected={isPageSelected}
              isAllSelected={isAllSelected}
              numberOfSelectedRules={numberOfSelectedItems}
              sort={sort}
              page={page}
              percentileOptions={percentileOptions}
              itemIdToExpandedRowMap={itemIdToExpandedRowMap}
              onSort={setSort}
              onPage={setPage}
              onRuleChanged={refreshRules}
              onRuleClick={(rule) => {
                const detailsRoute = ruleDetailsRoute ? ruleDetailsRoute : commonRuleDetailsRoute;
                history.push(detailsRoute.replace(`:ruleId`, rule.id));
              }}
              onRuleEditClick={(rule) => {
                if (rule.isEditable && isRuleTypeEditableInContext(rule.ruleTypeId)) {
                  onRuleEdit(rule);
                }
              }}
              onRuleDeleteClick={(rule) =>
                updateRulesToBulkEdit({
                  action: 'delete',
                  rules: [rule],
                })
              }
              onManageLicenseClick={(rule) =>
                setManageLicenseModalOpts({
                  licenseType: ruleTypesState.data.get(rule.ruleTypeId)?.minimumLicenseRequired!,
                  ruleTypeId: rule.ruleTypeId,
                })
              }
              onPercentileOptionsChange={setPercentileOptions}
              onDisableRule={onDisableRule}
              onEnableRule={onEnableRule}
              onSnoozeRule={onSnoozeRule}
              onUnsnoozeRule={onUnsnoozeRule}
              onSelectAll={onSelectAll}
              onSelectPage={onSelectPage}
              onSelectRow={onSelectRow}
              isRowSelected={isRowSelected}
              renderCollapsedItemActions={(rule, onLoading) => (
                <CollapsedItemActions
                  key={rule.id}
                  item={rule}
                  onLoading={onLoading}
                  onRuleChanged={refreshRules}
                  onDeleteRule={() =>
                    updateRulesToBulkEdit({
                      action: 'delete',
                      rules: [rule],
                    })
                  }
                  onEditRule={() => onRuleEdit(rule)}
                  onUpdateAPIKey={() =>
                    updateRulesToBulkEdit({
                      action: 'updateApiKey',
                      rules: [rule],
                    })
                  }
                  onRunRule={() => onRunRule(rule.id)}
                  onCloneRule={onCloneRule}
                />
              )}
              renderRuleError={(rule) => {
                const _executionStatus = rule.executionStatus;
                const hasErrorMessage = _executionStatus.status === 'error';
                const isLicenseError =
                  _executionStatus.error?.reason === RuleExecutionStatusErrorReasons.License;

                return isLicenseError || hasErrorMessage ? (
                  <EuiToolTip
                    content={itemIdToExpandedRowMap[rule.id] ? 'Collapse' : 'Expand'}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      onClick={() => toggleErrorMessage(_executionStatus, rule)}
                      aria-label={itemIdToExpandedRowMap[rule.id] ? 'Collapse' : 'Expand'}
                      iconType={
                        itemIdToExpandedRowMap[rule.id] ? 'chevronSingleUp' : 'chevronSingleDown'
                      }
                    />
                  </EuiToolTip>
                ) : null;
              }}
              renderSelectAllDropdown={() => {
                return (
                  <BulkOperationPopover
                    numberOfSelectedRules={numberOfSelectedItems}
                    canModifySelectedRules={authorizedToModifySelectedRules}
                  >
                    <RuleQuickEditButtons
                      selectedItems={convertRulesToTableItems({
                        rules: filterRulesById(rulesState.data, selectedIds),
                        ruleTypeIndex: ruleTypesState.data,
                        canExecuteActions,
                        config,
                      })}
                      isBulkEditing={isBulkEditing}
                      bulkEditAction={bulkEditAction}
                      updateRulesToBulkEdit={updateRulesToBulkEdit}
                      isAllSelected={isAllSelected}
                      getFilter={getFilter}
                      onPerformingAction={() => setIsPerformingAction(true)}
                      onActionPerformed={() => {
                        refreshRules();
                        setIsPerformingAction(false);
                      }}
                      isEnablingRules={isEnablingRules}
                      isDisablingRules={isDisablingRules}
                      onEnable={onEnable}
                      onDisable={onDisable}
                    />
                  </BulkOperationPopover>
                );
              }}
              rulesListKey={rulesListKey}
              config={config}
              visibleColumns={visibleColumns}
              numberOfFilters={numberOfFiltersStore}
              resetFilters={resetFiltersStore}
            />
            {manageLicenseModalOpts && (
              <ManageLicenseModal
                licenseType={manageLicenseModalOpts.licenseType}
                ruleTypeId={manageLicenseModalOpts.ruleTypeId}
                onConfirm={() => {
                  window.open(
                    `${http.basePath.get()}/app/management/stack/license_management`,
                    '_blank'
                  );
                  setManageLicenseModalOpts(null);
                }}
                onCancel={() => setManageLicenseModalOpts(null)}
              />
            )}
          </>
        )}
        {ruleTypeModalVisible && (
          <RuleTypeModal
            onClose={() => setRuleTypeModalVisibility(false)}
            onSelectRuleType={(ruleTypeId) => {
              if (navigateToCreateRuleForm) {
                navigateToCreateRuleForm(ruleTypeId);
              } else {
                navigateToApp('management', {
                  path: `insightsAndAlerting/triggersActions/${getCreateRuleRoute(ruleTypeId)}`,
                });
              }
            }}
            onSelectTemplate={(templateId) => {
              // For templates, we need to extract the ruleTypeId or handle it differently
              // For now, fall back to default behavior
              navigateToApp('management', {
                path: `insightsAndAlerting/triggersActions/${getCreateRuleFromTemplateRoute(
                  encodeURIComponent(templateId)
                )}`,
              });
            }}
            http={http}
            toasts={toasts}
            registeredRuleTypes={ruleTypeRegistry.list()}
            filteredRuleTypes={filteredRuleTypes}
            cps={cps}
          />
        )}
      </EuiPageTemplate.Section>
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export { RulesList as default };

function filterRulesById(rules: Rule[], ids: string[]): Rule[] {
  return rules.filter((rule) => ids.includes(rule.id));
}

const getAllUniqueRuleTypeCategories = (ruleTypes: RuleType[]) => {
  const categories = new Set(ruleTypes.map((ruleType) => ruleType.category));

  return Array.from(categories).filter(Boolean);
};
