/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiLoadingSpinner,
  EuiPageHeader,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  type CriteriaWithPagination,
  type EuiBasicTableColumn,
  type EuiTableSelectionType,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type {
  ActionPolicyBulkAction,
  ActionPolicyResponse,
  CreateActionPolicyData,
} from '@kbn/alerting-v2-schemas';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import moment from 'moment';
import React, { useCallback, useMemo, useState } from 'react';
import { ExperimentalBadge } from '../../components/experimental_badge';
import { ActionPolicyDestinationsSummary } from '../../components/action_policy/action_policy_destinations_summary';
import { PopoverItems } from '../../components/popover_items';
import { ActionPolicySnoozePopover } from '../../components/action_policy/action_policy_snooze_popover';
import { ActionPolicyStateBadge } from '../../components/action_policy/action_policy_state_badge';
import { DeleteActionPolicyConfirmModal } from '../../components/action_policy/delete_confirmation_modal';
import { ActionPolicyDetailsFlyout } from '../../components/action_policy/details_flyout/action_policy_details_flyout';
import { paths } from '../../constants';
import { useBreadcrumbs } from '../../hooks/use_breadcrumbs';
import { useBulkActionActionPolicies } from '../../hooks/use_bulk_action_action_policies';
import { useBulkGetUserProfiles } from '../../hooks/use_bulk_get_user_profiles';
import { useCreateActionPolicy } from '../../hooks/use_create_action_policy';
import { useDeleteActionPolicy } from '../../hooks/use_delete_action_policy';
import { useDisableActionPolicy } from '../../hooks/use_disable_action_policy';
import { useEnableActionPolicy } from '../../hooks/use_enable_action_policy';
import { useFetchActionPolicies } from '../../hooks/use_fetch_action_policies';
import { useSnoozeActionPolicy } from '../../hooks/use_snooze_action_policy';
import { useUnsnoozeActionPolicy } from '../../hooks/use_unsnooze_action_policy';
import { useUpdateActionPolicyApiKey } from '../../hooks/use_update_action_policy_api_key';
import { resolveDisplayName } from '../../utils/resolve_display_name';
import { ActionPoliciesBulkActions } from './components/action_policies_bulk_actions';
import { ActionPoliciesSearchBar } from './components/action_policies_search_bar';
import { ActionPolicyActionsCell } from './components/action_policy_actions_cell';
import { UpdateApiKeyConfirmationModal } from './components/update_api_key_confirmation_modal';

const DEFAULT_PER_PAGE = 20;

const descriptionTextStyle = css`
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
`;

export const ListActionPoliciesPage = () => {
  useBreadcrumbs('action_policies_list');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [search, setSearch] = useState('');
  const [enabled, setEnabled] = useState('');
  const [sortField, setSortField] = useState<'name' | 'updatedAt'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [policyToDelete, setPolicyToDelete] = useState<ActionPolicyResponse | null>(null);
  const [policyToUpdateApiKey, setPolicyToUpdateApiKey] = useState<string | null>(null);
  const [policyToViewId, setPolicyToViewId] = useState<string | null>(null);
  const [selectedPolicies, setSelectedPolicies] = useState<ActionPolicyResponse[]>([]);

  const { navigateToUrl } = useService(CoreStart('application'));
  const { basePath } = useService(CoreStart('http'));
  const settings = useService(CoreStart('settings'));
  const dateTimeFormat = settings.client.get<string>('dateFormat');

  const { mutate: createActionPolicy } = useCreateActionPolicy();
  const { mutate: deleteActionPolicy, isLoading: isDeleting } = useDeleteActionPolicy();
  const {
    mutate: enablePolicy,
    isLoading: isEnabling,
    variables: enableVariables,
  } = useEnableActionPolicy();
  const {
    mutate: disablePolicy,
    isLoading: isDisabling,
    variables: disableVariables,
  } = useDisableActionPolicy();
  const {
    mutate: snoozePolicy,
    isLoading: isSnoozing,
    variables: snoozeVariables,
  } = useSnoozeActionPolicy();
  const {
    mutate: unsnoozePolicy,
    isLoading: isUnsnoozing,
    variables: unsnoozeVariables,
  } = useUnsnoozeActionPolicy();

  const { mutate: updateApiKey, isLoading: isUpdatingApiKey } = useUpdateActionPolicyApiKey();

  const { mutate: bulkAction, isLoading: isBulkActionInProgress } = useBulkActionActionPolicies();

  const clearSelection = useCallback(() => {
    setSelectedPolicies([]);
  }, []);

  const navigateToCreate = () => {
    navigateToUrl(basePath.prepend(paths.actionPolicyCreate));
  };

  const navigateToEdit = (id: string) => {
    navigateToUrl(basePath.prepend(paths.actionPolicyEdit(id)));
  };

  const clonePolicy = (policy: ActionPolicyResponse) => {
    const { name, description, destinations, matcher, groupBy, throttle, tags, groupingMode } =
      policy;
    const data: CreateActionPolicyData = {
      name: `${name} [clone]`,
      description,
      destinations,
      groupingMode: groupingMode ?? 'per_episode',
      ...(tags != null && { tags }),
      ...(matcher != null && { matcher }),
      ...(groupBy != null && { groupBy }),
      ...(throttle != null && { throttle }),
    };
    createActionPolicy(data);
  };

  const { data, isError, error, isFetching } = useFetchActionPolicies({
    page: page + 1,
    perPage,
    search: search || undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
    sortField,
    sortOrder: sortDirection,
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);

  const handleEnabledChange = useCallback((value: string) => {
    setEnabled(value);
    setPage(0);
  }, []);

  const handleTagsChange = useCallback((tags: string[]) => {
    setSelectedTags(tags);
    setPage(0);
  }, []);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const policyToView = policyToViewId ? items.find((p) => p.id === policyToViewId) ?? null : null;

  const updatedByUids = useMemo(
    () => items.map((policy) => policy.updatedBy).filter((uid): uid is string => Boolean(uid)),
    [items]
  );

  const { data: updatedByProfileByUid, isLoading: isLoadingUpdatedByProfiles } =
    useBulkGetUserProfiles({ uids: updatedByUids });

  const onTableChange = ({
    page: tablePage,
    sort,
  }: CriteriaWithPagination<ActionPolicyResponse>) => {
    if (tablePage) {
      setPage(tablePage.index);
      setPerPage(tablePage.size);
    }

    if (sort) {
      setSortField(sort.field as 'name' | 'updatedAt');
      setSortDirection(sort.direction);
    }
  };

  const pagination = {
    pageIndex: page,
    pageSize: perPage,
    totalItemCount: total,
    pageSizeOptions: [10, 20, 50],
  };

  const hasSelection = selectedPolicies.length > 0;

  const handleBulkAction = (
    action: 'enable' | 'disable' | 'delete' | 'snooze' | 'unsnooze' | 'update_api_key',
    snoozedUntil?: string
  ) => {
    const ids = selectedPolicies.map((policy) => policy.id);
    let actions: ActionPolicyBulkAction[];
    if (action === 'snooze' && snoozedUntil) {
      actions = ids.map((id) => ({ id, action: 'snooze', snoozedUntil }));
    } else if (action === 'enable') {
      actions = ids.map((id) => ({ id, action: 'enable' }));
    } else if (action === 'disable') {
      actions = ids.map((id) => ({ id, action: 'disable' }));
    } else if (action === 'unsnooze') {
      actions = ids.map((id) => ({ id, action: 'unsnooze' }));
    } else if (action === 'delete') {
      actions = ids.map((id) => ({ id, action: 'delete' }));
    } else if (action === 'update_api_key') {
      actions = ids.map((id) => ({ id, action: 'update_api_key' }));
    } else {
      throw new Error(`Invalid action: ${action}`);
    }

    bulkAction({ actions }, { onSuccess: clearSelection });
  };

  const onSelectionChange = (newSelectedItems: ActionPolicyResponse[]) => {
    setSelectedPolicies(newSelectedItems);
  };

  const selection: EuiTableSelectionType<ActionPolicyResponse> = {
    onSelectionChange,
    selectable: () => {
      return !isBulkActionInProgress;
    },
    selected: selectedPolicies,
  };

  const columns: Array<EuiBasicTableColumn<ActionPolicyResponse>> = [
    {
      field: 'name',
      minWidth: '100px',
      name: (
        <FormattedMessage
          id="xpack.alertingV2.actionPoliciesList.column.name"
          defaultMessage="Name"
        />
      ),
      sortable: true,
      render: (name: string, policy: ActionPolicyResponse) => (
        <EuiFlexGroup direction="column" gutterSize="none">
          <EuiFlexItem>
            <EuiLink
              onClick={() => setPolicyToViewId(policy.id)}
              data-test-subj={`actionPolicyDetailsLink-${policy.id}`}
            >
              {name}
            </EuiLink>
          </EuiFlexItem>
          {policy.description && (
            <EuiText size="xs" color="subdued" css={descriptionTextStyle}>
              {policy.description}
            </EuiText>
          )}
        </EuiFlexGroup>
      ),
    },
    {
      field: 'destinations',
      name: (
        <FormattedMessage
          id="xpack.alertingV2.actionPoliciesList.column.destinations"
          defaultMessage="Destinations"
        />
      ),
      render: (destinations: ActionPolicyResponse['destinations']) => (
        <ActionPolicyDestinationsSummary destinations={destinations} />
      ),
    },
    {
      field: 'tags',
      width: '180px',
      name: (
        <FormattedMessage
          id="xpack.alertingV2.actionPoliciesList.column.tags"
          defaultMessage="Tags"
        />
      ),
      render: (tags: string[] | null) => {
        if (!tags || tags.length === 0) return null;
        const visibleCount = 1;
        const overflowCount = tags.length - visibleCount;
        return (
          <PopoverItems
            items={tags}
            numberOfItemsToDisplay={visibleCount}
            popoverTitle={i18n.translate(
              'xpack.alertingV2.actionPoliciesList.column.tags.popoverTitle',
              { defaultMessage: 'Tags' }
            )}
            popoverButtonTitle={`+${overflowCount}`}
            dataTestPrefix="actionPolicyTags"
            renderItem={(tag) => (
              <EuiToolTip key={tag} content={tag} position="top">
                <EuiBadge
                  color="hollow"
                  title=""
                  css={{
                    maxWidth: 150,
                    minWidth: 0,
                    '.euiBadge__text': { minWidth: 0 },
                  }}
                >
                  {tag}
                </EuiBadge>
              </EuiToolTip>
            )}
          />
        );
      },
    },
    {
      field: 'updatedAt',
      name: (
        <FormattedMessage
          id="xpack.alertingV2.actionPoliciesList.column.updatedAt"
          defaultMessage="Last update"
        />
      ),
      sortable: true,
      render: (updatedAt: string) => moment(updatedAt).format(dateTimeFormat),
    },
    {
      field: 'updatedBy',
      width: '200px',
      name: (
        <FormattedMessage
          id="xpack.alertingV2.actionPoliciesList.column.updatedByUsername"
          defaultMessage="Updated by"
        />
      ),
      render: (updatedBy: string | null) => {
        if (!updatedBy) {
          return null;
        }
        if (isLoadingUpdatedByProfiles) {
          return <EuiLoadingSpinner size="s" />;
        }
        return resolveDisplayName(updatedBy, updatedByProfileByUid, updatedBy);
      },
    },
    {
      field: 'enabled',
      name: (
        <FormattedMessage
          id="xpack.alertingV2.actionPoliciesList.column.state"
          defaultMessage="State"
        />
      ),
      width: '120px',
      render: (_enabled: boolean, policy: ActionPolicyResponse) => (
        <ActionPolicyStateBadge
          policy={policy}
          isLoading={
            (isEnabling && enableVariables === policy.id) ||
            (isDisabling && disableVariables === policy.id)
          }
        />
      ),
    },
    {
      field: 'snoozedUntil',
      name: (
        <FormattedMessage
          id="xpack.alertingV2.actionPoliciesList.column.notify"
          defaultMessage="Notify"
        />
      ),
      width: '50px',
      render: (_snoozedUntil: string | undefined, policy: ActionPolicyResponse) => {
        if (!policy.enabled) {
          return null;
        }
        return (
          <ActionPolicySnoozePopover
            policy={policy}
            onSnooze={(id, until) => snoozePolicy({ id, snoozedUntil: until })}
            onCancelSnooze={(id) => unsnoozePolicy(id)}
            isLoading={
              (isSnoozing && snoozeVariables?.id === policy.id) ||
              (isUnsnoozing && unsnoozeVariables === policy.id)
            }
            isDisabled={hasSelection}
          />
        );
      },
    },
    {
      name: i18n.translate('xpack.alertingV2.actionPoliciesList.column.actions', {
        defaultMessage: 'Actions',
      }),
      width: '120px',
      render: (policy: ActionPolicyResponse) => (
        <ActionPolicyActionsCell
          policy={policy}
          onViewDetails={(p) => setPolicyToViewId(p.id)}
          onEdit={navigateToEdit}
          onClone={clonePolicy}
          onDelete={setPolicyToDelete}
          onEnable={(id) => enablePolicy(id)}
          onDisable={(id) => disablePolicy(id)}
          onSnooze={(id, until) => snoozePolicy({ id, snoozedUntil: until })}
          onCancelSnooze={(id) => unsnoozePolicy(id)}
          onUpdateApiKey={(id) => setPolicyToUpdateApiKey(id)}
          isStateLoading={
            (isEnabling && enableVariables === policy.id) ||
            (isDisabling && disableVariables === policy.id)
          }
          isDisabled={hasSelection}
        />
      ),
    },
  ];

  const errorMessage = isError && error ? error.message : null;

  return (
    <>
      <EuiPageHeader
        pageTitle={
          <EuiFlexGroup component="span" alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false} component="span">
              <FormattedMessage
                id="xpack.alertingV2.actionPoliciesList.pageTitle"
                defaultMessage="Action Policies"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false} component="span">
              <ExperimentalBadge />
            </EuiFlexItem>
          </EuiFlexGroup>
        }
        rightSideItems={[
          <EuiButton key="create-policy" onClick={navigateToCreate} fill>
            <FormattedMessage
              id="xpack.alertingV2.actionPoliciesList.createPolicyButton"
              defaultMessage="Create policy"
            />
          </EuiButton>,
        ]}
      />
      <EuiFlexGroup direction="column" gutterSize="m" responsive={false}>
        <EuiSpacer size="m" />
        <EuiFlexItem grow={false}>
          <ActionPoliciesSearchBar
            onSearchChange={handleSearchChange}
            enabled={enabled}
            onEnabledChange={handleEnabledChange}
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
          />
        </EuiFlexItem>
        {errorMessage ? (
          <>
            <EuiCallOut
              announceOnMount
              title={
                <FormattedMessage
                  id="xpack.alertingV2.actionPoliciesList.loadErrorTitle"
                  defaultMessage="Failed to load action policies"
                />
              }
              color="danger"
              iconType="error"
            >
              {errorMessage}
            </EuiCallOut>
            <EuiSpacer />
          </>
        ) : null}
        <EuiFlexGroup direction="column" gutterSize="none" responsive={false}>
          {total > 0 && (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs">
                    <FormattedMessage
                      id="xpack.alertingV2.actionPoliciesList.showingLabel"
                      defaultMessage="Showing {rangeBold} of {totalBold}"
                      values={{
                        rangeBold: (
                          <strong>
                            {Math.min(page * perPage + 1, total)}-
                            {Math.min((page + 1) * perPage, total)}
                          </strong>
                        ),
                        totalBold: (
                          <strong>
                            <FormattedMessage
                              id="xpack.alertingV2.actionPoliciesList.showingLabelTotal"
                              defaultMessage="{total} {total, plural, one {action policy} other {action policies}}"
                              values={{ total }}
                            />
                          </strong>
                        ),
                      }}
                    />
                  </EuiText>
                </EuiFlexItem>
                {hasSelection && (
                  <EuiFlexItem grow={false}>
                    <ActionPoliciesBulkActions
                      selectedPolicies={selectedPolicies}
                      onClearSelection={clearSelection}
                      onBulkAction={handleBulkAction}
                      isLoading={isBulkActionInProgress}
                    />
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
          )}
          <EuiBasicTable
            items={items}
            columns={columns}
            itemId="id"
            selection={selection}
            loading={isFetching}
            pagination={pagination}
            responsiveBreakpoint={false}
            scrollableInline={true}
            css={css`
              .euiTableHeaderMobile .euiCheckbox {
                display: none;
              }
              .euiTableRowCellCheckbox {
                vertical-align: middle;
              }
            `}
            sorting={{
              sort: {
                field: sortField,
                direction: sortDirection,
              },
            }}
            onChange={onTableChange}
            tableCaption={i18n.translate('xpack.alertingV2.actionPoliciesList.tableCaption', {
              defaultMessage: 'Action Policies',
            })}
          />
        </EuiFlexGroup>
      </EuiFlexGroup>

      {policyToDelete && (
        <DeleteActionPolicyConfirmModal
          policyName={policyToDelete.name}
          onCancel={() => setPolicyToDelete(null)}
          onConfirm={() => {
            deleteActionPolicy(policyToDelete.id, {
              onSuccess: () => setPolicyToDelete(null),
            });
          }}
          isLoading={isDeleting}
        />
      )}

      {policyToUpdateApiKey && (
        <UpdateApiKeyConfirmationModal
          count={1}
          onCancel={() => setPolicyToUpdateApiKey(null)}
          onConfirm={() => {
            updateApiKey(policyToUpdateApiKey, {
              onSuccess: () => setPolicyToUpdateApiKey(null),
            });
          }}
          isLoading={isUpdatingApiKey}
        />
      )}

      {policyToView && (
        <ActionPolicyDetailsFlyout
          policy={policyToView}
          onClose={() => setPolicyToViewId(null)}
          onEdit={(id) => {
            setPolicyToViewId(null);
            navigateToEdit(id);
          }}
          onClone={(p) => {
            setPolicyToViewId(null);
            clonePolicy(p);
          }}
          onDelete={(p) => {
            setPolicyToViewId(null);
            setPolicyToDelete(p);
          }}
          onEnable={(id) => enablePolicy(id)}
          onDisable={(id) => disablePolicy(id)}
          onSnooze={(id, until) => snoozePolicy({ id, snoozedUntil: until })}
          onCancelSnooze={(id) => unsnoozePolicy(id)}
          onUpdateApiKey={(id) => {
            setPolicyToViewId(null);
            setPolicyToUpdateApiKey(id);
          }}
          isStateLoading={
            (isEnabling && enableVariables === policyToView.id) ||
            (isDisabling && disableVariables === policyToView.id)
          }
        />
      )}
    </>
  );
};
