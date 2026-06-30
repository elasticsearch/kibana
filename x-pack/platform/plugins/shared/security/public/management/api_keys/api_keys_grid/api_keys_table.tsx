/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { estypes } from '@elastic/elasticsearch';
import type {
  Criteria,
  EuiBasicTableColumn,
  EuiSearchBarOnChangeArgs,
  Query,
  SearchFilterConfig,
} from '@elastic/eui';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiFilterButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiLink,
  EuiSearchBar,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import type { CustomComponentProps } from '@elastic/eui/src/components/search_bar/filters/custom_component_filter';
import type { FunctionComponent } from 'react';
import React, { createContext, useContext, useState } from 'react';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { CreateAPIKeyResult, QueryApiKeySortOptions } from '@kbn/security-api-key-management';
import { ApiKeyBadge, ApiKeyStatus, TimeToolTip } from '@kbn/security-api-key-management';
import type { ApiKeyAggregations, CategorizedApiKey } from '@kbn/security-plugin-types-common';
import { UserAvatar, UserProfilesPopover } from '@kbn/user-profile-components';

import { ApiKeysEmptyPrompt, doesErrorIndicateBadQuery } from './api_keys_empty_prompt';
import type { AuthenticatedUser } from '../../../../common';

export interface ApiKeysTableProps {
  apiKeys: CategorizedApiKey[];
  queryFilters: QueryFilters;
  currentUser: AuthenticatedUser;
  createdApiKey?: CreateAPIKeyResult;
  query: Query;
  readOnly?: boolean;
  loading?: boolean;
  canManageCrossClusterApiKeys: boolean;
  canManageApiKeys: boolean;
  canManageOwnApiKeys: boolean;
  onClick(apiKey: CategorizedApiKey): void;
  onDelete(apiKeys: CategorizedApiKey[]): void;
  totalItemCount?: number;
  onTableChange: ({ sort }: Criteria<CategorizedApiKey>) => void;
  onSearchChange: (args: EuiSearchBarOnChangeArgs) => boolean | void;
  aggregations?: ApiKeyAggregations;
  sortingOptions: QueryApiKeySortOptions;
  queryErrors?: Error;
  resetQuery: () => void;
  onFilterChange: (filters: QueryFilters) => void;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onRefresh: () => void;
}

export interface QueryFilters {
  usernames?: string[];
  type?: 'rest' | 'managed' | 'cross_cluster';
  expired?: boolean;
}
const FiltersContext = createContext<{
  types: string[];
  usernames: string[];
  filters: QueryFilters;
  onFilterChange: (filters: QueryFilters) => void;
}>({ types: [], usernames: [], filters: {}, onFilterChange: () => {} });

export const ApiKeysTable: FunctionComponent<ApiKeysTableProps> = ({
  apiKeys,
  createdApiKey,
  currentUser,
  onClick,
  onDelete,
  canManageApiKeys = false,
  canManageOwnApiKeys = false,
  readOnly = false,
  loading = false,
  totalItemCount = 0,
  onTableChange,
  onSearchChange,
  aggregations,
  sortingOptions,
  queryErrors,
  resetQuery,
  query,
  queryFilters,
  onFilterChange,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  onRefresh,
}) => {
  const columns: Array<EuiBasicTableColumn<CategorizedApiKey>> = [];
  const [selectedItems, setSelectedItems] = useState<CategorizedApiKey[]>([]);

  const { typeFilters, usernameFilters, expired } = categorizeAggregations(aggregations);

  const deletable = (item: CategorizedApiKey) =>
    canManageApiKeys || (canManageOwnApiKeys && item.username === currentUser.username);

  const isBadRequest = queryErrors && doesErrorIndicateBadQuery(queryErrors);

  const itemsToDisplay = isBadRequest ? [] : apiKeys;

  columns.push(
    {
      field: 'name',
      name: (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.nameColumnName"
          defaultMessage="Name"
        />
      ),
      sortable: true,
      render: (name: string, item: CategorizedApiKey) => {
        return (
          <EuiLink onClick={() => onClick(item)} data-test-subj={`apiKeyRowName-${item.name}`}>
            {name}
          </EuiLink>
        );
      },
    },
    {
      field: 'type',
      name: (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.typeColumnName"
          defaultMessage="Type"
        />
      ),
      sortable: true,
      render: (type: CategorizedApiKey['type'], apiKeyRecord) => {
        let keyType = type;
        if (
          apiKeyRecord.name.indexOf('Alerting: ') === 0 ||
          apiKeyRecord.metadata?.managed === true
        ) {
          keyType = 'managed';
        }
        const hasCertificateIdentity =
          apiKeyRecord.type === 'cross_cluster' && !!apiKeyRecord.certificate_identity;
        return (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <ApiKeyBadge type={keyType} />
            </EuiFlexItem>
            {hasCertificateIdentity ? (
              <EuiFlexItem grow={false}>
                <EuiIconTip
                  type="key"
                  data-test-subj="apiKeyCertificateIdentityIcon"
                  aria-label={i18n.translate(
                    'xpack.security.management.apiKeys.table.certificateIdentityIconLabel',
                    { defaultMessage: 'Strong identity verification enabled' }
                  )}
                  content={i18n.translate(
                    'xpack.security.management.apiKeys.table.certificateIdentityTooltip',
                    {
                      defaultMessage: 'Strong identity verification is active',
                    }
                  )}
                />
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        );
      },
    }
  );

  if (canManageApiKeys || usernameFilters.length > 1) {
    columns.push({
      field: 'username',
      name: (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.ownerColumnName"
          defaultMessage="Owner"
        />
      ),
      sortable: true,
      render: (username: CategorizedApiKey['username']) => <UsernameWithIcon username={username} />,
    });
  }

  columns.push(
    {
      field: 'creation',
      name: (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.createdColumnName"
          defaultMessage="Created"
        />
      ),
      sortable: true,
      mobileOptions: {
        show: false,
      },
      render: (creation: number, item: CategorizedApiKey) => (
        <TimeToolTip timestamp={creation}>
          {item.id === createdApiKey?.id ? (
            <EuiBadge color="success">
              <FormattedMessage
                id="xpack.security.management.apiKeys.table.createdBadge"
                defaultMessage="Just now"
              />
            </EuiBadge>
          ) : null}
        </TimeToolTip>
      ),
    },
    {
      field: 'expiration',
      name: (
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.statusColumnName"
          defaultMessage="Status"
        />
      ),
      sortable: true,
      render: (expiration: number) => <ApiKeyStatus expiration={expiration} />,
    }
  );

  if (!readOnly) {
    columns.push({
      width: `${24 + 2 * 8}px`,
      actions: [
        {
          name: (
            <FormattedMessage
              id="xpack.security.management.apiKeys.table.deleteAction"
              defaultMessage="Delete"
            />
          ),
          description: i18n.translate('xpack.security.management.apiKeys.table.deleteDescription', {
            defaultMessage: 'Delete this API key',
          }),
          icon: 'trash',
          type: 'icon',
          color: 'danger',
          onClick: (item) => onDelete([item]),
          available: deletable,
          'data-test-subj': (item) => `apiKeysTableDeleteAction-${item.name}`,
        },
      ],
    });
  }

  const filters: SearchFilterConfig[] = [];

  if (typeFilters.length > 1) {
    filters.push({
      type: 'custom_component',
      component: TypesFilterButton,
    });
  }

  if (expired > 0) {
    filters.push({
      type: 'custom_component',
      component: ExpiredFilterButton,
    });
  }

  if (usernameFilters.length > 1) {
    filters.push({
      type: 'custom_component',
      component: UsersFilterButton,
    });
  }

  return (
    <>
      <FiltersContext.Provider
        value={{
          types: [...typeFilters],
          usernames: [...usernameFilters],
          filters: queryFilters,
          onFilterChange,
        }}
      >
        <EuiSearchBar
          query={query}
          box={{
            'data-test-subj': 'apiKeysSearchBar',
            incremental: true,
            schema: {
              strict: true,
              fields: {
                name: {
                  type: 'string',
                },
                type: {
                  type: 'string',
                },
                username: {
                  type: 'string',
                },
                owner: {
                  type: 'string',
                },
                expired: {
                  type: 'boolean',
                },
              },
            },
          }}
          filters={filters}
          onChange={onSearchChange}
          toolsLeft={
            selectedItems.length ? (
              <EuiButton
                onClick={() => onDelete(selectedItems)}
                color="danger"
                iconType="trash"
                data-test-subj="bulkInvalidateActionButton"
              >
                <FormattedMessage
                  id="xpack.security.management.apiKeys.table.invalidateApiKeyButton"
                  defaultMessage="Delete {count, plural, one {API key} other {# API keys}}"
                  values={{
                    count: selectedItems.length,
                  }}
                />
              </EuiButton>
            ) : undefined
          }
        />
      </FiltersContext.Provider>
      <EuiSpacer size="s" />
      {isBadRequest ? (
        <ApiKeysEmptyPrompt error={queryErrors}>
          <EuiButton
            iconType="refresh"
            onClick={() => {
              resetQuery();
            }}
          >
            <FormattedMessage
              id="xpack.security.accountManagement.apiKeys.resetQueryButton"
              defaultMessage="Reset query"
            />
          </EuiButton>
        </ApiKeysEmptyPrompt>
      ) : (
        <>
          <EuiBasicTable
            tableCaption={i18n.translate('xpack.security.management.apiKeys.table.caption', {
              defaultMessage: 'API keys list',
            })}
            items={itemsToDisplay}
            itemId="id"
            columns={columns}
            loading={loading}
            onChange={onTableChange}
            selection={
              readOnly
                ? undefined
                : {
                    selectable: deletable,
                    onSelectionChange: setSelectedItems,
                  }
            }
            sorting={{
              sort: {
                field: sortingOptions.field,
                direction: sortingOptions.direction,
              },
            }}
          />
          <EuiSpacer size="m" />
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiText color="subdued" size="s">
                    <FormattedMessage
                      id="xpack.security.management.apiKeys.table.totalCountLabel"
                      defaultMessage="{totalItemCount, plural, one {# api key} other {# api keys}}"
                      values={{ totalItemCount }}
                    />
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    data-test-subj="apiKeysTableRefreshButton"
                    size="xs"
                    iconType="refresh"
                    onClick={onRefresh}
                    isLoading={loading}
                    aria-label={i18n.translate(
                      'xpack.security.management.apiKeys.table.refreshButtonAriaLabel',
                      { defaultMessage: 'Refresh API keys' }
                    )}
                  >
                    <FormattedMessage
                      id="xpack.security.management.apiKeys.table.refreshButtonLabel"
                      defaultMessage="Refresh"
                    />
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    data-test-subj="apiKeysTablePreviousPageButton"
                    disabled={!hasPreviousPage || loading}
                    onClick={onPreviousPage}
                    iconType="chevronSingleLeft"
                    iconSide="left"
                  >
                    <FormattedMessage
                      id="xpack.security.management.apiKeys.table.previousPageButtonLabel"
                      defaultMessage="Previous"
                    />
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    data-test-subj="apiKeysTableNextPageButton"
                    disabled={!hasNextPage || loading}
                    onClick={onNextPage}
                    iconType="chevronSingleRight"
                    iconSide="right"
                  >
                    <FormattedMessage
                      id="xpack.security.management.apiKeys.table.nextPageButtonLabel"
                      defaultMessage="Next"
                    />
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}
    </>
  );
};

export const TypesFilterButton: FunctionComponent<CustomComponentProps> = ({ query, onChange }) => {
  const { types, filters, onFilterChange } = useContext(FiltersContext);

  if (!onChange) {
    return null;
  }

  return (
    <>
      {types.includes('rest') ? (
        <EuiFilterButton
          iconType="user"
          iconSide="left"
          isToggle
          isSelected={filters.type === 'rest'}
          hasActiveFilters={filters.type === 'rest'}
          onClick={() => {
            onFilterChange({ ...filters, type: filters.type === 'rest' ? undefined : 'rest' });
          }}
          withNext={types.includes('cross_cluster') || types.includes('managed')}
          data-test-subj="personalFilterButton"
          aria-label={i18n.translate(
            'xpack.security.accountManagement.apiKeyBadge.personalAriaLabel',
            {
              defaultMessage: 'Filter personal API keys',
            }
          )}
        >
          <FormattedMessage
            id="xpack.security.accountManagement.apiKeyBadge.restTitle"
            defaultMessage="Personal"
          />
        </EuiFilterButton>
      ) : null}
      {types.includes('cross_cluster') ? (
        <EuiFilterButton
          iconType="cluster"
          iconSide="left"
          isToggle
          isSelected={filters.type === 'cross_cluster'}
          hasActiveFilters={filters.type === 'cross_cluster'}
          onClick={() => {
            onFilterChange({
              ...filters,
              type: filters.type === 'cross_cluster' ? undefined : 'cross_cluster',
            });
          }}
          withNext={types.includes('managed')}
          data-test-subj="crossClusterFilterButton"
          aria-label={i18n.translate(
            'xpack.security.accountManagement.apiKeyBadge.crossClusterAriaLabel',
            {
              defaultMessage: 'Filter cross-cluster API keys',
            }
          )}
        >
          <FormattedMessage
            id="xpack.security.accountManagement.apiKeyBadge.crossClusterLabel"
            defaultMessage="Cross-Cluster"
          />
        </EuiFilterButton>
      ) : null}
      {types.includes('managed') ? (
        <EuiFilterButton
          iconType="gear"
          iconSide="left"
          isToggle
          isSelected={filters.type === 'managed'}
          hasActiveFilters={filters.type === 'managed'}
          onClick={() => {
            onFilterChange({
              ...filters,
              type: filters.type === 'managed' ? undefined : 'managed',
            });
          }}
          data-test-subj="managedFilterButton"
          aria-label={i18n.translate(
            'xpack.security.accountManagement.apiKeyBadge.managedAriaLabel',
            {
              defaultMessage: 'Filter managed API keys',
            }
          )}
        >
          <FormattedMessage
            id="xpack.security.accountManagement.apiKeyBadge.managedTitle"
            defaultMessage="Managed"
          />
        </EuiFilterButton>
      ) : null}
    </>
  );
};

export const ExpiredFilterButton: FunctionComponent<CustomComponentProps> = ({
  query,
  onChange,
}) => {
  const { filters, onFilterChange } = useContext(FiltersContext);

  if (!onChange) {
    return null;
  }

  return (
    <>
      <EuiFilterButton
        isToggle
        isSelected={filters.expired === false}
        hasActiveFilters={filters.expired === false}
        onClick={() => {
          if (filters.expired === false) {
            onFilterChange({ ...filters, expired: undefined });
          } else {
            onFilterChange({ ...filters, expired: false });
          }
        }}
        withNext={true}
        data-test-subj="activeFilterButton"
      >
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.activeFilter"
          defaultMessage="Active"
        />
      </EuiFilterButton>
      <EuiFilterButton
        isToggle
        isSelected={filters.expired === true}
        hasActiveFilters={filters.expired === true}
        onClick={() => {
          if (filters.expired === true) {
            onFilterChange({ ...filters, expired: undefined });
          } else {
            onFilterChange({ ...filters, expired: true });
          }
        }}
        data-test-subj="expiredFilterButton"
      >
        <FormattedMessage
          id="xpack.security.management.apiKeys.table.expiredFilter"
          defaultMessage="Expired"
        />
      </EuiFilterButton>
    </>
  );
};

export const UsersFilterButton: FunctionComponent<CustomComponentProps> = ({ query, onChange }) => {
  const { usernames, filters, onFilterChange } = useContext(FiltersContext);

  const filteredUsernames = filters.usernames || [];

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  if (!onChange) {
    return null;
  }

  let numActiveFilters = 0;
  const clause = filters.usernames || [];
  if (clause.length) {
    numActiveFilters = clause.length;
  }

  const usernamesMatchingSearchTerm = searchTerm
    ? usernames.filter((username) => username.includes(searchTerm))
    : usernames;

  return (
    <UserProfilesPopover
      button={
        <EuiFilterButton
          iconType="chevronSingleDown"
          onClick={() => setIsOpen((toggle) => !toggle)}
          isSelected={isOpen}
          numFilters={usernames.length}
          hasActiveFilters={numActiveFilters ? true : false}
          numActiveFilters={numActiveFilters}
          data-test-subj="ownerFilterButton"
        >
          <FormattedMessage
            id="xpack.security.management.apiKeys.table.ownerFilter"
            defaultMessage="Owner"
          />
        </EuiFilterButton>
      }
      isOpen={isOpen}
      panelPaddingSize="none"
      anchorPosition="downCenter"
      panelClassName="euiFilterGroup__popoverPanel"
      closePopover={() => setIsOpen(false)}
      selectableProps={{
        options: usernamesMatchingSearchTerm.map((username) => ({
          uid: username,
          user: { username },
          enabled: false,
          data: {},
        })),
        onSearchChange: setSearchTerm,
        selectedOptions: usernames
          .filter((username) => filteredUsernames.includes(username))
          .map((username) => ({
            uid: username,
            user: { username },
            enabled: false,
            data: {},
          })),
        onChange: (nextSelectedOptions) => {
          const nextFilters = nextSelectedOptions.map((option) => option.user.username);
          onFilterChange({ ...filters, usernames: nextFilters });
        },
      }}
    />
  );
};

export type UsernameWithIconProps = Pick<CategorizedApiKey, 'username'>;

export const UsernameWithIcon: FunctionComponent<UsernameWithIconProps> = ({ username }) => (
  <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
    <EuiFlexItem grow={false}>
      <UserAvatar user={{ username }} size="s" />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiText size="s" data-test-subj="apiKeyUsername">
        {username}
      </EuiText>
    </EuiFlexItem>
  </EuiFlexGroup>
);

export const categorizeAggregations = (aggregationResponse?: ApiKeyAggregations) => {
  const typeFilters: Array<CategorizedApiKey['type']> = [];
  const usernameFilters: Array<CategorizedApiKey['username']> = [];
  let expiredCount = 0;

  if (aggregationResponse && Object.keys(aggregationResponse).length > 0) {
    const { usernames, types, expired, managed } = aggregationResponse;
    const typeBuckets = types?.buckets.length
      ? (types.buckets as estypes.AggregationsStringTermsBucket[])
      : [];

    const usernameBuckets = usernames?.buckets.length
      ? (usernames.buckets as estypes.AggregationsStringTermsBucket[])
      : [];

    typeBuckets.forEach((type) => {
      typeFilters.push(type.key as CategorizedApiKey['type']);
    });
    usernameBuckets.forEach((username) => {
      usernameFilters.push(`${username.key}`);
    });
    const { namePrefixBased, metadataBased } = managed?.buckets || {};
    if (
      (namePrefixBased?.doc_count && namePrefixBased.doc_count > 0) ||
      (metadataBased?.doc_count && metadataBased.doc_count > 0)
    ) {
      typeFilters.push('managed');
    }
    expiredCount = expired?.doc_count ?? 0;
  }

  return {
    typeFilters,
    usernameFilters,
    expired: expiredCount,
  };
};
