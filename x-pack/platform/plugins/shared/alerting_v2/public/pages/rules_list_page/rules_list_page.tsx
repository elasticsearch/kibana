/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiCallOut,
  EuiContextMenu,
  EuiFieldSearch,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPageHeader,
  EuiSpacer,
  EuiSplitButton,
  useGeneratedHtmlId,
  type Criteria,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useBoolean, useDebouncedValue } from '@kbn/react-hooks';
import type { FindRulesSortField } from '@kbn/alerting-v2-schemas';
import type { RuleApiResponse } from '../../services/rules_api';
import { ExperimentalBadge } from '../../components/experimental_badge';
import { useFetchRules } from '../../hooks/use_fetch_rules';
import { useFetchRuleTags } from '../../hooks/use_fetch_rule_tags';
import { useBreadcrumbs } from '../../hooks/use_breadcrumbs';
import { useComposeDiscoverFlyout } from '../../hooks/use_compose_discover_flyout';
import { useIsRuleManagementABSkillAvailable } from '../../hooks/use_is_rule_management_ab_skill_available';
import { useNavigateToAgentBuilder } from '../../hooks/use_navigate_to_agent_builder';

import { RulesListTableContainer } from './rules_list_table_container';
import type { RulesListTableSortField } from './rules_list_table';
import { ModeFilterPopover } from '../../components/rule/popovers/mode_filter_popover';
import { StatusFilterPopover } from '../../components/rule/popovers/status_filter_popover';
import { TagsFilterPopover } from '../../components/rule/popovers/tag_filter_popover';
import { buildRulesListFilter } from './utils';
import { RuleCreateOptionsPanel } from '../../components/rule_create_options/rule_create_options_panel';
import { RuleCreateOptionsFlyout } from '../../components/rule_create_options/rule_create_options_flyout';

const DEFAULT_PER_PAGE = 20;
export const SEARCH_DEBOUNCE_MS = 300;

const SORT_FIELD_TO_TABLE_FIELD: Record<FindRulesSortField, RulesListTableSortField> = {
  kind: 'kind',
  enabled: 'enabled',
  name: 'metadata',
};

const TABLE_FIELD_TO_API_SORT_FIELD = Object.fromEntries(
  Object.entries(SORT_FIELD_TO_TABLE_FIELD).map(([api, table]) => [table, api])
) as Partial<Record<string, FindRulesSortField>>;

export const RulesListPage = () => {
  useBreadcrumbs('rules_list');

  const [
    isCreateOptionsFlyoutOpen,
    { on: openCreateOptionsFlyout, off: closeCreateOptionsFlyout },
  ] = useBoolean(false);
  const [isCreateMenuOpen, { off: closeCreateMenu, toggle: toggleCreateMenu }] = useBoolean(false);
  const createMenuId = useGeneratedHtmlId({ prefix: 'createRuleMenu' });
  const { flyout, openCreateFlyout, openCreateBuilderFlyout, openEditFlyout, openCloneFlyout } =
    useComposeDiscoverFlyout();
  const navigateToAgentBuilder = useNavigateToAgentBuilder();
  const isRuleManagementABSkillAvailable = useIsRuleManagementABSkillAvailable();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [modeFilter, setModeFilter] = useState('');
  const [sortField, setSortField] = useState<FindRulesSortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);

  const filter = useMemo(
    () =>
      buildRulesListFilter({
        enabled: statusFilter,
        tags: tagsFilter,
        kind: modeFilter,
      }),
    [statusFilter, tagsFilter, modeFilter]
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filter]);

  const {
    data: rulesData,
    isLoading,
    isError,
    error,
  } = useFetchRules({
    page,
    perPage,
    filter,
    search: debouncedSearch || undefined,
    sortField,
    sortOrder: sortDirection,
  });

  const { data: allTags } = useFetchRuleTags();

  const onTableChange = ({ page: tablePage, sort }: Criteria<RuleApiResponse>) => {
    if (tablePage) {
      setPage(tablePage.index + 1);
      setPerPage(tablePage.size);
    }

    if (sort) {
      const nextSortField = TABLE_FIELD_TO_API_SORT_FIELD[sort.field as string];
      if (nextSortField) {
        const sortChanged = nextSortField !== sortField || sort.direction !== sortDirection;
        setSortField(nextSortField);
        setSortDirection(sort.direction);
        if (sortChanged) {
          setPage(1);
        }
      }
    }
  };

  const availableTagOptions = allTags ?? [];
  const hasActiveFilters = Boolean(filter) || Boolean(searchInput.trim());
  const isInitialLoad = isLoading && rulesData === undefined;
  const hasRules = (rulesData?.total ?? 0) > 0;
  const showEmptyState = !isInitialLoad && !isError && !hasRules && !hasActiveFilters;
  const onCreateEsqlRuleFromOptionsFlyout = () => {
    closeCreateOptionsFlyout();
    openCreateFlyout();
  };
  const onCreateWithAgentFromOptionsFlyout = () => {
    closeCreateOptionsFlyout();
    navigateToAgentBuilder();
  };
  const onCreateThresholdAlertFromOptionsFlyout = () => {
    closeCreateOptionsFlyout();
    openCreateBuilderFlyout('threshold');
  };

  return (
    <div>
      <EuiPageHeader
        pageTitle={
          <EuiFlexGroup component="span" alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false} component="span">
              <FormattedMessage id="xpack.alertingV2.rulesList.pageTitle" defaultMessage="Rules" />
            </EuiFlexItem>
            <EuiFlexItem grow={false} component="span">
              <ExperimentalBadge />
            </EuiFlexItem>
          </EuiFlexGroup>
        }
        rightSideItems={
          hasRules || hasActiveFilters
            ? [
                <EuiSplitButton
                  key="create-rule-split"
                  color="text"
                  fill={false}
                  data-test-subj="createRuleSplitButton"
                >
                  <EuiSplitButton.ActionPrimary
                    onClick={openCreateOptionsFlyout}
                    data-test-subj="createRuleButton"
                    iconType="plusInCircle"
                  >
                    <FormattedMessage
                      id="xpack.alertingV2.rulesList.createRuleButton"
                      defaultMessage="Create rule"
                    />
                  </EuiSplitButton.ActionPrimary>
                  <EuiSplitButton.ActionSecondary
                    iconType="arrowDown"
                    aria-label={i18n.translate('xpack.alertingV2.rulesList.createRuleMoreOptions', {
                      defaultMessage: 'More create options',
                    })}
                    onClick={toggleCreateMenu}
                    data-test-subj="createRulePopoverButton"
                    popoverProps={{
                      id: createMenuId,
                      isOpen: isCreateMenuOpen,
                      closePopover: closeCreateMenu,
                      anchorPosition: 'downRight',
                      panelPaddingSize: 'none',
                      children: (
                        <EuiContextMenu
                          initialPanelId={0}
                          panels={[
                            {
                              id: 0,
                              items: [
                                {
                                  name: i18n.translate(
                                    'xpack.alertingV2.rulesList.createEsqlRuleButton',
                                    { defaultMessage: 'Create ES|QL rule' }
                                  ),
                                  icon: 'productDiscover',
                                  onClick: () => {
                                    closeCreateMenu();
                                    openCreateFlyout();
                                  },
                                  'data-test-subj': 'createEsqlRuleButton',
                                },
                                ...(isRuleManagementABSkillAvailable
                                  ? [
                                      {
                                        name: i18n.translate(
                                          'xpack.alertingV2.rulesList.createWithAgentButton',
                                          { defaultMessage: 'Create with agent' }
                                        ),
                                        icon: 'sparkles' as const,
                                        onClick: () => {
                                          closeCreateMenu();
                                          navigateToAgentBuilder();
                                        },
                                        'data-test-subj': 'createWithAgentButton',
                                      },
                                    ]
                                  : []),
                              ],
                            },
                          ]}
                        />
                      ),
                    }}
                  />
                </EuiSplitButton>,
              ]
            : []
        }
      />
      <EuiSpacer size="m" />
      {isInitialLoad ? (
        <EuiFlexGroup justifyContent="center" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" data-test-subj="rulesListLoading" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}
      {isError ? (
        <>
          <EuiCallOut
            announceOnMount
            title={
              <FormattedMessage
                id="xpack.alertingV2.rulesList.loadErrorTitle"
                defaultMessage="Failed to load rules"
              />
            }
            color="danger"
            iconType="error"
          >
            {error instanceof Error ? error.message : String(error)}
          </EuiCallOut>
          <EuiSpacer />
        </>
      ) : null}
      {showEmptyState ? (
        <RuleCreateOptionsPanel
          onCreateEsqlRule={openCreateFlyout}
          onCreateWithAgent={isRuleManagementABSkillAvailable ? navigateToAgentBuilder : undefined}
          onCreateThresholdAlert={onCreateThresholdAlertFromOptionsFlyout}
        />
      ) : null}
      {hasRules || hasActiveFilters ? (
        <>
          <EuiFlexGroup gutterSize="s">
            <EuiFlexItem>
              <EuiFieldSearch
                fullWidth
                isClearable
                value={searchInput}
                placeholder={i18n.translate('xpack.alertingV2.rulesList.searchPlaceholder', {
                  defaultMessage: 'Search rules',
                })}
                onChange={(event) => setSearchInput(event.target.value)}
                data-test-subj="rulesListSearchBar"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFilterGroup>
                <StatusFilterPopover value={statusFilter} onChange={setStatusFilter} />
                <TagsFilterPopover
                  options={availableTagOptions}
                  value={tagsFilter}
                  onChange={setTagsFilter}
                />
                <ModeFilterPopover value={modeFilter} onChange={setModeFilter} />
              </EuiFilterGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
          <RulesListTableContainer
            items={rulesData?.items ?? []}
            totalItemCount={rulesData?.total ?? 0}
            page={page}
            perPage={perPage}
            search={debouncedSearch}
            filter={filter}
            hasActiveFilters={hasActiveFilters}
            sortField={SORT_FIELD_TO_TABLE_FIELD[sortField]}
            sortDirection={sortDirection}
            isLoading={isLoading}
            onTableChange={onTableChange}
            onEditInFlyout={openEditFlyout}
            onCloneInFlyout={openCloneFlyout}
          />
        </>
      ) : null}
      {isCreateOptionsFlyoutOpen ? (
        <RuleCreateOptionsFlyout
          onClose={closeCreateOptionsFlyout}
          onCreateEsqlRule={onCreateEsqlRuleFromOptionsFlyout}
          onCreateWithAgent={
            isRuleManagementABSkillAvailable ? onCreateWithAgentFromOptionsFlyout : undefined
          }
          onCreateThresholdAlert={onCreateThresholdAlertFromOptionsFlyout}
        />
      ) : null}
      {flyout}
    </div>
  );
};
