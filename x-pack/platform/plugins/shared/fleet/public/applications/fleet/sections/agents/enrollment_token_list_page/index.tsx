/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React, { useState } from 'react';
import {
  EuiSpacer,
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiLink,
  EuiFilterGroup,
  EuiFilterButton,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';

import {
  ENROLLMENT_API_KEYS_INDEX,
  SO_SEARCH_LIMIT,
  FLEET_ENROLLMENT_API_PREFIX,
} from '../../../constants';
import { NewEnrollmentTokenModal } from '../../../components';
import {
  useBreadcrumbs,
  usePagination,
  useGetEnrollmentAPIKeysQuery,
  useGetAgentPolicies,
} from '../../../hooks';
import type { EnrollmentAPIKey, GetAgentPoliciesResponseItem } from '../../../types';
import { SearchBar } from '../../../components/search_bar';
import { DefaultLayout } from '../../../layouts';
import { AgentPolicyFilter } from '../agent_list_page/components/filter_bar/agent_policy_filter';
import { HierarchicalActionsMenu } from '../components';

import { ConfirmRevokeModal, ConfirmDeleteModal } from './components/confirm_action_modal';
import { Divider, getTokenActionItems } from './components/token_actions';
import { getColumns } from './components/columns';
import { useBulkActions } from './hooks/use_bulk_actions';
import { buildKuery } from './utils/build_kuery';

import type { ActiveFilter } from './utils/build_kuery';

type SelectionMode = 'manual' | 'query';

export const EnrollmentTokenListPage: React.FunctionComponent<{}> = () => {
  useBreadcrumbs('enrollment_tokens');
  const { euiTheme } = useEuiTheme();
  const [isModalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const { pagination, setPagination, pageSizeOptions } = usePagination();

  const [selectedTokens, setSelectedTokens] = useState<EnrollmentAPIKey[]>([]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('manual');

  const hasNonDefaultFilters =
    search !== '' || selectedPolicyIds.length > 0 || activeFilter !== 'active';

  const clearSelection = () => {
    setSelectedTokens([]);
    setSelectionMode('manual');
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedPolicyIds([]);
    setActiveFilter('active');
    setPagination({ ...pagination, currentPage: 1 });
    clearSelection();
  };

  const agentPoliciesRequest = useGetAgentPolicies({
    page: 1,
    perPage: SO_SEARCH_LIMIT,
  });

  const agentPolicies = agentPoliciesRequest.data ? agentPoliciesRequest.data.items : [];
  const agentPoliciesById = agentPolicies.reduce(
    (acc: { [key: string]: GetAgentPoliciesResponseItem }, policy) => {
      acc[policy.id] = policy;
      return acc;
    },
    {}
  );

  const visibleAgentPolicies = agentPolicies.filter((p) => !p.is_managed && !p.supports_agentless);
  const excludedPolicyIds = agentPolicies
    .filter((p) => p.is_managed || p.supports_agentless)
    .map((p) => p.id);

  const kuery = buildKuery(search, selectedPolicyIds, activeFilter, excludedPolicyIds);

  const enrollmentAPIKeysRequest = useGetEnrollmentAPIKeysQuery({
    page: pagination.currentPage,
    perPage: pagination.pageSize,
    kuery,
  });

  const agentPoliciesLoaded = !agentPoliciesRequest.isLoading;
  const total = agentPoliciesLoaded ? enrollmentAPIKeysRequest?.data?.total ?? 0 : 0;
  const rowItems = agentPoliciesLoaded ? enrollmentAPIKeysRequest?.data?.items ?? [] : [];

  const refresh = () => {
    clearSelection();
    enrollmentAPIKeysRequest.refetch();
  };

  const { bulkActionPending, setBulkActionPending, isBulkActionInProgress, onBulkActionConfirm } =
    useBulkActions({
      kuery,
      selectedTokens,
      selectionMode,
      refresh,
    });

  const selectedCount = selectionMode === 'query' ? total : selectedTokens.length;
  const showSelectionInfo =
    isBulkActionInProgress ||
    (selectionMode === 'manual' && selectedTokens.length > 0) ||
    (selectionMode === 'query' && total > 0);
  const showSelectEverything =
    selectionMode === 'manual' &&
    selectedTokens.length === rowItems.length &&
    rowItems.length < total;

  const columns = getColumns({
    agentPoliciesById,
    agentPolicies,
    refresh: () => enrollmentAPIKeysRequest.refetch(),
  });

  const isInitialLoading =
    enrollmentAPIKeysRequest.isInitialLoading ||
    (agentPoliciesRequest.isLoading && agentPoliciesRequest.isInitialRequest);
  const isLoading = isInitialLoading || enrollmentAPIKeysRequest.isFetching;

  return (
    <DefaultLayout section="enrollment_tokens">
      {isModalOpen && (
        <NewEnrollmentTokenModal
          agentPolicies={agentPolicies}
          onClose={() => {
            setModalOpen(false);
            enrollmentAPIKeysRequest.refetch();
          }}
        />
      )}
      {bulkActionPending === 'revoke' && (
        <ConfirmRevokeModal
          count={selectedCount}
          onCancel={() => setBulkActionPending(null)}
          onConfirm={onBulkActionConfirm}
        />
      )}
      {bulkActionPending === 'delete' && (
        <ConfirmDeleteModal
          count={selectedCount}
          onCancel={() => setBulkActionPending(null)}
          onConfirm={onBulkActionConfirm}
        />
      )}
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s">
            <EuiFlexItem>
              <SearchBar
                value={search}
                indexPattern={ENROLLMENT_API_KEYS_INDEX}
                fieldPrefix={FLEET_ENROLLMENT_API_PREFIX}
                onChange={(newSearch) => {
                  setPagination({ ...pagination, currentPage: 1 });
                  clearSelection();
                  setSearch(newSearch);
                }}
                dataTestSubj="enrollmentKeysList.queryInput"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFilterGroup>
                <AgentPolicyFilter
                  selectedAgentPolicies={selectedPolicyIds}
                  onSelectedAgentPoliciesChange={(ids) => {
                    setPagination({ ...pagination, currentPage: 1 });
                    clearSelection();
                    setSelectedPolicyIds(ids);
                  }}
                  agentPolicies={visibleAgentPolicies}
                />
                <EuiFilterButton
                  isToggle
                  isSelected={activeFilter === 'active'}
                  withNext
                  onClick={() => {
                    setPagination({ ...pagination, currentPage: 1 });
                    clearSelection();
                    setActiveFilter(activeFilter === 'active' ? 'all' : 'active');
                  }}
                  data-test-subj="enrollmentTokensList.filterActive"
                >
                  <FormattedMessage
                    id="xpack.fleet.enrollmentTokensList.filterActive"
                    defaultMessage="Active"
                  />
                </EuiFilterButton>
                <EuiFilterButton
                  isToggle
                  isSelected={activeFilter === 'inactive'}
                  onClick={() => {
                    setPagination({ ...pagination, currentPage: 1 });
                    clearSelection();
                    setActiveFilter(activeFilter === 'inactive' ? 'all' : 'inactive');
                  }}
                  data-test-subj="enrollmentTokensList.filterInactive"
                >
                  <FormattedMessage
                    id="xpack.fleet.enrollmentTokensList.filterInactive"
                    defaultMessage="Inactive"
                  />
                </EuiFilterButton>
              </EuiFilterGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        {showSelectionInfo && (
          <EuiFlexItem grow={false}>
            <HierarchicalActionsMenu
              items={getTokenActionItems({
                onRevoke: () => setBulkActionPending('revoke'),
                onDelete: () => setBulkActionPending('delete'),
                plural: true,
              })}
              button={{
                props: {
                  iconType: 'arrowDown',
                  iconSide: 'right',
                  color: 'primary',
                  isLoading: isBulkActionInProgress,
                },
                children: i18n.translate('xpack.fleet.enrollmentTokensList.bulkActionsButton', {
                  defaultMessage: '{count, plural, one {# token} other {# tokens}} selected',
                  values: { count: selectedCount },
                }),
              }}
              data-test-subj="enrollmentTokensList.bulkActionsMenu"
            />
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiButton
            data-test-subj="createEnrollmentTokenButton"
            fill
            iconType="plusCircle"
            onClick={() => setModalOpen(true)}
          >
            <FormattedMessage
              id="xpack.fleet.enrollmentTokensList.newKeyButton"
              defaultMessage="Create enrollment token"
            />
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="s" alignItems="center" style={{ minHeight: euiTheme.size.xl }}>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="xpack.fleet.enrollmentTokensList.totalTokens"
              defaultMessage="Showing {count, plural, one {# token} other {# tokens}}"
              values={{ count: total }}
            />
          </EuiText>
        </EuiFlexItem>
        {showSelectionInfo && (
          <>
            <EuiFlexItem grow={false}>
              <Divider />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued" data-test-subj="selectedTokenCountLabel">
                <FormattedMessage
                  id="xpack.fleet.enrollmentTokensList.tokensSelected"
                  defaultMessage="{selectionMode, select,
                    manual {{count, plural, one {# token} other {# tokens}}}
                    other {All tokens}
                  } selected"
                  values={{ selectionMode, count: selectedTokens.length }}
                />
              </EuiText>
            </EuiFlexItem>
          </>
        )}
        {showSelectEverything && (
          <>
            <EuiFlexItem grow={false}>
              <Divider />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="xs"
                flush="both"
                onClick={() => setSelectionMode('query')}
                data-test-subj="enrollmentTokensList.selectAllButton"
              >
                <FormattedMessage
                  id="xpack.fleet.enrollmentTokensList.selectAllButton"
                  defaultMessage="Select everything on all pages"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
          </>
        )}
        {showSelectionInfo && (
          <>
            <EuiFlexItem grow={false}>
              <Divider />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="xs"
                flush="both"
                onClick={clearSelection}
                data-test-subj="enrollmentTokensList.clearSelectionButton"
              >
                <FormattedMessage
                  id="xpack.fleet.enrollmentTokensList.clearSelectionButton"
                  defaultMessage="Clear selection"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
          </>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiBasicTable<EnrollmentAPIKey>
        compressed
        data-test-subj="enrollmentTokenListTable"
        tableCaption={i18n.translate(
          'xpack.fleet.enrollmentTokensList.enrollmentTokens.tableCaption',
          {
            defaultMessage: 'List of enrollment tokens',
          }
        )}
        loading={isLoading}
        noItemsMessage={
          <>
            <EuiSpacer size="s" />
            {isInitialLoading ? (
              <FormattedMessage
                id="xpack.fleet.enrollemntAPIKeyList.loadingTokensMessage"
                defaultMessage="Loading enrollment tokens..."
              />
            ) : (
              <>
                <FormattedMessage
                  id="xpack.fleet.enrollemntAPIKeyList.emptyMessage"
                  defaultMessage="No enrollment tokens found."
                />
                {hasNonDefaultFilters && (
                  <>
                    {' '}
                    <EuiLink
                      onClick={resetFilters}
                      data-test-subj="enrollmentTokensList.clearFiltersButton"
                    >
                      <FormattedMessage
                        id="xpack.fleet.enrollmentTokensList.clearFiltersLink"
                        defaultMessage="Clear filters"
                      />
                    </EuiLink>
                  </>
                )}
              </>
            )}
            <EuiSpacer size="s" />
          </>
        }
        items={total ? rowItems : []}
        itemId="id"
        columns={columns}
        rowProps={(item: EnrollmentAPIKey) => ({
          css: !item.active
            ? css`
                & td {
                  color: ${euiTheme.colors.subduedText};
                }
              `
            : undefined,
        })}
        selection={{
          selected: selectionMode === 'query' ? rowItems : selectedTokens,
          onSelectionChange: (items: EnrollmentAPIKey[]) => {
            setSelectionMode('manual');
            setSelectedTokens(items);
          },
        }}
        pagination={{
          pageIndex: pagination.currentPage - 1,
          pageSize: pagination.pageSize,
          totalItemCount: total,
          pageSizeOptions,
        }}
        onChange={({ page }: { page: { index: number; size: number } }) => {
          setPagination({
            ...pagination,
            currentPage: page.index + 1,
            pageSize: page.size,
          });
        }}
      />
    </DefaultLayout>
  );
};
