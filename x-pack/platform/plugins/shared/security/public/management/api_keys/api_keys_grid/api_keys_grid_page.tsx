/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { Criteria, EuiSearchBarOnChangeArgs, Query } from '@elastic/eui';
import { EuiButton, EuiCallOut, EuiSearchBar, EuiSpacer } from '@elastic/eui';
import type { FunctionComponent } from 'react';
import React, { useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import useAsyncFn from 'react-use/lib/useAsyncFn';

import type { CoreStart } from '@kbn/core/public';
import { SectionLoading } from '@kbn/es-ui-shared-plugin/public';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { reactRouterNavigate, useKibana } from '@kbn/kibana-react-plugin/public';
import type { CreateAPIKeyResult, QueryApiKeySortOptions } from '@kbn/security-api-key-management';
import {
  ApiKeyCreatedCallout,
  ApiKeyFlyout,
  APIKeysAPIClient,
} from '@kbn/security-api-key-management';
import type { CategorizedApiKey } from '@kbn/security-plugin-types-common';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { Route } from '@kbn/shared-ux-router';

import { ApiKeysEmptyPrompt } from './api_keys_empty_prompt';
import { ApiKeysTable, categorizeAggregations } from './api_keys_table';
import type { QueryFilters } from './api_keys_table';
import { InvalidateProvider } from './invalidate_provider';
import { Breadcrumb } from '../../../components/breadcrumb';
import { useCapabilities } from '../../../components/use_capabilities';
import { useAuthentication } from '../../../components/use_current_user';

interface ApiKeysTableState {
  query: Query;
  size: number;
  sort: QueryApiKeySortOptions;
  filters: QueryFilters;
  searchAfter?: estypes.SortResults;
}

type KueryNode = any;

const DEFAULT_TABLE_STATE: ApiKeysTableState = {
  query: EuiSearchBar.Query.MATCH_ALL,
  sort: {
    field: 'creation' as const,
    direction: 'desc' as const,
  },
  size: 25,
  filters: {
    type: 'rest' as const,
  },
  searchAfter: undefined,
};

const PLUS_SIGN_REGEX = /[+]/g;

export const APIKeysGridPage: FunctionComponent = () => {
  const { services } = useKibana<CoreStart>();
  const history = useHistory();
  const authc = useAuthentication();

  const [createdApiKey, setCreatedApiKey] = useState<CreateAPIKeyResult>();
  const [openedApiKey, setOpenedApiKey] = useState<CategorizedApiKey>();
  const readOnly = !useCapabilities('api_keys').save;

  const [tableState, setTableState] = useState<ApiKeysTableState>(DEFAULT_TABLE_STATE);
  const [searchAfterHistory, setSearchAfterHistory] = useState<
    Array<estypes.SortResults | undefined>
  >([]);

  const [state, queryApiKeysAndAggregations] = useAsyncFn((tableStateArgs: ApiKeysTableState) => {
    const queryContainer = EuiSearchBar.Query.toESQuery(tableStateArgs.query);

    // Enhance the query to support partial matches for name and owner field
    if (queryContainer.bool?.must) {
      queryContainer.bool.must = queryContainer.bool.must.map((clause: KueryNode) => {
        if (clause.simple_query_string) {
          // Add wildcard to support partial matches
          const rawQuery = String(clause.simple_query_string.query ?? '');
          const wildCardQuery = rawQuery.replace(PLUS_SIGN_REGEX, '');
          return {
            bool: {
              should: [
                clause,
                {
                  wildcard: {
                    name: {
                      value: `*${wildCardQuery}*`,
                      case_insensitive: true,
                    },
                  },
                },
                {
                  wildcard: {
                    username: {
                      value: `*${wildCardQuery}*`,
                      case_insensitive: true,
                    },
                  },
                },
              ],
            },
          };
        }
        return clause;
      });
    }

    const requestBody = {
      ...tableStateArgs,
      query: queryContainer,
    };

    return Promise.all([
      new APIKeysAPIClient(services.http).queryApiKeys(requestBody),
      authc.getCurrentUser(),
    ]);
  }, []);

  const resetQueryOnError = () => {
    setTableState(DEFAULT_TABLE_STATE);
    setSearchAfterHistory([]);
    queryApiKeysAndAggregations(DEFAULT_TABLE_STATE);
  };

  const onTableChange = ({ sort }: Criteria<CategorizedApiKey>) => {
    // When sort changes, reset pagination cursors
    if (
      sort &&
      (sort.field !== tableState.sort.field || sort.direction !== tableState.sort.direction)
    ) {
      const newState = {
        ...tableState,
        sort,
        searchAfter: undefined,
      };
      setTableState(newState);
      setSearchAfterHistory([]);
      queryApiKeysAndAggregations(newState);
    }
  };

  const onNextPage = (nextSearchAfter: estypes.SortResults) => {
    setSearchAfterHistory((prev) => [...prev, tableState.searchAfter]);
    const newState = {
      ...tableState,
      searchAfter: nextSearchAfter,
    };
    setTableState(newState);
    queryApiKeysAndAggregations(newState);
  };

  const onPreviousPage = () => {
    const newHistory = [...searchAfterHistory];
    const previousCursor = newHistory.pop();
    setSearchAfterHistory(newHistory);
    const newState = {
      ...tableState,
      searchAfter: previousCursor,
    };
    setTableState(newState);
    queryApiKeysAndAggregations(newState);
  };

  const onSearchChange = (args: EuiSearchBarOnChangeArgs) => {
    if (!args.error && args.query) {
      const newState = {
        ...tableState,
        query: args.query,
        searchAfter: undefined, // Reset pagination when query changes
      };
      setTableState(newState);
      setSearchAfterHistory([]);
      queryApiKeysAndAggregations(newState);
    }
  };

  const onFilterChange = (filters: QueryFilters) => {
    const newState = {
      ...tableState,
      filters: {
        ...tableState.filters,
        ...filters,
      },
      searchAfter: undefined, // Reset pagination when filters change
    };
    setTableState(newState);
    setSearchAfterHistory([]);
    queryApiKeysAndAggregations(newState);
  };

  useEffect(() => {
    queryApiKeysAndAggregations(DEFAULT_TABLE_STATE);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The table defaults to the personal (`rest`) view. If the user has no personal keys but does have
  // keys of other types (e.g. only cross-cluster keys), the default view would be empty. In that
  // case, switch once to the first available type so the user's keys are visible on load.
  const hasAutoSelectedTypeRef = useRef(false);
  useEffect(() => {
    if (hasAutoSelectedTypeRef.current || !state.value) {
      return;
    }

    const [result] = state.value;
    const queryFailed = 'queryError' in result && result.queryError;
    const loadedApiKeys = 'apiKeys' in result ? result.apiKeys : undefined;

    if (queryFailed || tableState.filters.type !== 'rest' || loadedApiKeys?.length) {
      return;
    }

    const { typeFilters } = categorizeAggregations(result.aggregations);
    if (typeFilters.length === 0 || typeFilters.includes('rest')) {
      return;
    }

    hasAutoSelectedTypeRef.current = true;
    const nextType = typeFilters.includes('cross_cluster') ? 'cross_cluster' : typeFilters[0];
    onFilterChange({ type: nextType });
  }, [state.value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state.value) {
    if (state.loading) {
      return (
        <SectionLoading>
          <FormattedMessage
            id="xpack.security.management.apiKeys.table.loadingApiKeysDescription"
            defaultMessage="Loading API keys…"
          />
        </SectionLoading>
      );
    }

    return (
      <ApiKeysEmptyPrompt error={state.error}>
        <EuiButton iconType="refresh" onClick={() => queryApiKeysAndAggregations(tableState)}>
          <FormattedMessage
            id="xpack.security.accountManagement.apiKeys.retryButton"
            defaultMessage="Try again"
          />
        </EuiButton>
      </ApiKeysEmptyPrompt>
    );
  }

  const [queryResult, currentUser] = state.value;

  const {
    aggregations,
    canManageApiKeys,
    canManageOwnApiKeys,
    canManageCrossClusterApiKeys,
    aggregationTotal: totalKeys,
  } = queryResult;

  // Check if the query result is an error or success
  // Using 'in' operator for type-safe property access
  const hasQueryError = 'queryError' in queryResult && queryResult.queryError;
  const queryError = hasQueryError ? queryResult.queryError : undefined;

  // Extract success-only properties when there's no query error
  // Cast to access properties that only exist on success result
  const successResult = !hasQueryError
    ? (queryResult as {
        apiKeys: CategorizedApiKey[];
        total: number;
        searchAfter?: estypes.SortResults;
      })
    : undefined;

  const apiKeys = successResult?.apiKeys ?? [];
  const filteredItemTotal = successResult?.total ?? 0;
  const responseSearchAfter = successResult?.searchAfter;

  // Determine if there's a next page:
  // - We have a searchAfter cursor (for pagination)
  // - AND the current page returned the full page size (indicating there might be more)
  const hasMoreResults = apiKeys.length === tableState.size && !!responseSearchAfter;

  const categorizedApiKeys = apiKeys;

  return (
    <>
      <Route path="/create">
        <Breadcrumb
          text={i18n.translate('xpack.security.management.apiKeys.createBreadcrumb', {
            defaultMessage: 'Create',
          })}
          href="/create"
        >
          <ApiKeyFlyout
            onSuccess={(createApiKeyResponse, type) => {
              history.push({ pathname: '/' });
              setCreatedApiKey(createApiKeyResponse);
              // Switch the table to the view matching the created key's type (and reset pagination)
              // so the newly created key is immediately visible, regardless of the active filter.
              const nextState = {
                ...tableState,
                filters: { ...tableState.filters, type: type as QueryFilters['type'] },
                searchAfter: undefined,
              };
              setTableState(nextState);
              setSearchAfterHistory([]);
              queryApiKeysAndAggregations(nextState);
            }}
            onCancel={() => history.push({ pathname: '/' })}
            canManageCrossClusterApiKeys={canManageCrossClusterApiKeys}
            currentUser={currentUser}
            isLoadingCurrentUser={state.loading}
            readOnly={readOnly}
          />
        </Breadcrumb>
      </Route>

      {openedApiKey && (
        <ApiKeyFlyout
          onSuccess={() => {
            services.notifications.toasts.addSuccess({
              title: i18n.translate('xpack.security.management.apiKeys.updateSuccessMessage', {
                defaultMessage: "Updated API key ''{name}''",
                values: { name: openedApiKey.name },
              }),
              'data-test-subj': 'updateApiKeySuccessToast',
            });

            setOpenedApiKey(undefined);
            // Re-query using the current table state so the user's active filter (e.g.
            // cross-cluster) is preserved after an update, instead of resetting to the default view.
            queryApiKeysAndAggregations(tableState);
          }}
          onCancel={() => setOpenedApiKey(undefined)}
          apiKey={openedApiKey}
          readOnly={readOnly}
          canManageCrossClusterApiKeys={canManageCrossClusterApiKeys}
          currentUser={currentUser}
          isLoadingCurrentUser={state.loading}
        />
      )}
      {totalKeys === 0 ? (
        <ApiKeysEmptyPrompt readOnly={readOnly}>
          <EuiButton
            {...reactRouterNavigate(history, '/create')}
            fill
            iconType="plusCircle"
            data-test-subj="apiKeysCreatePromptButton"
          >
            <FormattedMessage
              id="xpack.security.management.apiKeys.table.createButton"
              defaultMessage="Create API key"
            />
          </EuiButton>
        </ApiKeysEmptyPrompt>
      ) : (
        <>
          <KibanaPageTemplate.Header
            pageTitle={
              <FormattedMessage
                id="xpack.security.management.apiKeys.table.apiKeysTitle"
                defaultMessage="API keys"
              />
            }
            description={
              <FormattedMessage
                id="xpack.security.management.apiKeys.table.apiKeysAllDescription"
                defaultMessage="Allow external services to access the Elastic Stack on behalf of a user."
              />
            }
            rightSideItems={
              !readOnly
                ? [
                    <EuiButton
                      {...reactRouterNavigate(history, '/create')}
                      fill
                      iconType="plusCircle"
                      data-test-subj="apiKeysCreateTableButton"
                    >
                      <FormattedMessage
                        id="xpack.security.management.apiKeys.table.createButton"
                        defaultMessage="Create API key"
                      />
                    </EuiButton>,
                  ]
                : undefined
            }
            paddingSize="none"
            bottomBorder
          />
          <EuiSpacer />
          <KibanaPageTemplate.Section paddingSize="none">
            {createdApiKey && (
              <>
                <ApiKeyCreatedCallout createdApiKey={createdApiKey} />
                <EuiSpacer />
              </>
            )}

            {canManageOwnApiKeys && !canManageApiKeys ? (
              <>
                <EuiCallOut
                  announceOnMount
                  title={
                    <FormattedMessage
                      id="xpack.security.management.apiKeys.table.manageOwnKeysWarning"
                      defaultMessage="You only have permission to manage your own API keys."
                    />
                  }
                />
                <EuiSpacer />
              </>
            ) : undefined}

            <InvalidateProvider
              isAdmin={canManageApiKeys}
              notifications={services.notifications}
              apiKeysAPIClient={new APIKeysAPIClient(services.http)}
            >
              {(invalidateApiKeyPrompt) => (
                <ApiKeysTable
                  apiKeys={categorizedApiKeys}
                  onClick={(apiKey) => setOpenedApiKey(apiKey)}
                  query={tableState.query}
                  queryFilters={tableState.filters}
                  onDelete={(apiKeysToDelete) =>
                    invalidateApiKeyPrompt(apiKeysToDelete, () =>
                      queryApiKeysAndAggregations(tableState)
                    )
                  }
                  currentUser={currentUser}
                  createdApiKey={createdApiKey}
                  canManageCrossClusterApiKeys={canManageCrossClusterApiKeys}
                  canManageApiKeys={canManageApiKeys}
                  canManageOwnApiKeys={canManageOwnApiKeys}
                  readOnly={readOnly}
                  loading={state.loading}
                  totalItemCount={filteredItemTotal}
                  onTableChange={onTableChange}
                  onSearchChange={onSearchChange}
                  onFilterChange={onFilterChange}
                  aggregations={aggregations}
                  sortingOptions={tableState.sort}
                  queryErrors={queryError}
                  resetQuery={resetQueryOnError}
                  hasNextPage={hasMoreResults}
                  hasPreviousPage={searchAfterHistory.length > 0}
                  onNextPage={() => responseSearchAfter && onNextPage(responseSearchAfter)}
                  onPreviousPage={onPreviousPage}
                  onRefresh={() => queryApiKeysAndAggregations(tableState)}
                />
              )}
            </InvalidateProvider>
          </KibanaPageTemplate.Section>
        </>
      )}
    </>
  );
};
