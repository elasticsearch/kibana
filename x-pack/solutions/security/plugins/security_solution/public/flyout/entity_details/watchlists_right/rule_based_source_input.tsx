/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, type FC } from 'react';
import {
  EuiButton,
  EuiButtonGroup,
  EuiCallOut,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiSuperDatePicker,
  EuiSuperSelect,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useDebounceFn } from '@kbn/react-hooks';
import { useMutation, useQueryClient } from '@kbn/react-query';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { Filter, Query } from '@kbn/es-query';
import type { FilterManager, SavedQuery } from '@kbn/data-plugin/public';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import type { CreateWatchlistRequestBodyInput } from '../../../../common/api/entity_analytics/watchlists/management/create.gen';
import type { MonitoringEntitySource } from '../../../../common/api/entity_analytics/watchlists/data_source/common.gen';
import { QueryBar } from '../../../common/components/query_bar';
import { useFetchWatchlistIndices } from './hooks/use_fetch_watchlist_indices';
import { getApiErrorMessage } from './utils';
import { ENTITY_FIELD_OPTIONS, useRuleBasedSourceState } from './hooks/use_rule_based_source_state';
import { useDataViewSetup } from './hooks/use_data_view_setup';
import { useEntityAnalyticsRoutes } from '../../../entity_analytics/api/api';
import { useKibana } from '../../../common/lib/kibana';
import {
  WATCHLIST_ENTITY_FIELD_ARIA_LABEL,
  WATCHLIST_ENTITY_FIELD_PLACEHOLDER,
  WATCHLIST_FILTER_QUERY_LABEL,
  WATCHLIST_IDENTIFY_ENTITIES_BY_LABEL,
  WATCHLIST_INDEX_PATTERN_LABEL,
  WATCHLIST_INDEX_PATTERN_PLACEHOLDER,
  WATCHLIST_LOOKBACK_PERIOD_LABEL,
} from './translations';
import { PageScope } from '../../../data_view_manager/constants';

const DEBOUNCE_OPTIONS = { wait: 300 };

interface FilterQueryRowProps {
  dataView: DataView | undefined;
  filterQuery: Query;
  filterManager: FilterManager;
  filters: Filter[];
  onSubmitQuery: (query: Query) => void;
  onChangedQuery: (query: Query) => void;
  savedQuery: SavedQuery | undefined;
  onSavedQuery: (savedQuery: SavedQuery | undefined) => void;
  isInvalid?: boolean;
}

const FilterQueryRow: FC<FilterQueryRowProps> = ({
  dataView,
  filterQuery,
  filterManager,
  filters,
  onSubmitQuery,
  onChangedQuery,
  savedQuery,
  onSavedQuery,
  isInvalid,
}) => (
  <EuiFormRow label={WATCHLIST_FILTER_QUERY_LABEL} isInvalid={isInvalid}>
    <EuiFlexGroup direction="column" gutterSize="m">
      <EuiFlexItem>
        {dataView ? (
          <QueryBar
            indexPattern={dataView}
            isRefreshPaused={true}
            filterQuery={filterQuery}
            filterManager={filterManager}
            filters={filters}
            onSubmitQuery={onSubmitQuery}
            onChangedQuery={onChangedQuery}
            savedQuery={savedQuery}
            onSavedQuery={onSavedQuery}
            hideSavedQuery={true}
            displayStyle="inPage"
            dataTestSubj="watchlistFilterQuery"
          />
        ) : (
          <EuiText size="s" color="subdued">
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.watchlists.flyout.filterQueryLoading"
              defaultMessage="Loading data view..."
            />
          </EuiText>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiFormRow>
);

export interface RuleBasedSourceInputProps {
  watchlistName: string;
  watchlistId?: string;
  indexSourceWithMissingApiKey?: MonitoringEntitySource;
  isEditMode: boolean;
  isManaged?: boolean;
  onFieldChange: <K extends keyof CreateWatchlistRequestBodyInput>(
    key: K,
    value: CreateWatchlistRequestBodyInput[K]
  ) => void;
  initialEntitySources?: CreateWatchlistRequestBodyInput['entitySources'];
  onSourceValidationChange: (valid: boolean) => void;
}

export const RuleBasedSourceInput: React.FC<RuleBasedSourceInputProps> = ({
  watchlistName,
  watchlistId,
  indexSourceWithMissingApiKey,
  isEditMode,
  isManaged = false,
  onFieldChange,
  initialEntitySources,
  onSourceValidationChange,
}) => {
  const { dataView, status } = useDataView(PageScope.default);
  const { filters, filterManager } = useDataViewSetup();

  const queryClient = useQueryClient();
  const { updateWatchlistEntitySource } = useEntityAnalyticsRoutes();
  const {
    notifications: { toasts },
  } = useKibana().services;

  const refreshApiKeyMutation = useMutation({
    mutationFn: () => {
      if (!watchlistId || !indexSourceWithMissingApiKey) {
        throw new Error('Missing watchlist id or index source');
      }
      return updateWatchlistEntitySource({
        watchlistId,
        entitySourceId: indexSourceWithMissingApiKey.id,
        body: { type: indexSourceWithMissingApiKey.type },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['watchlist-entity-sources', watchlistId]);
    },
    onError: (error: Error) => {
      toasts.addError(error, {
        title: i18n.translate(
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.reauthorizeErrorTitle',
          { defaultMessage: 'Failed to re-authorize' }
        ),
        toastMessage: getApiErrorMessage(error),
      });
    },
  });

  const {
    filterQuery,
    selectedIndexPatterns,
    entityField,
    range,
    isNone,
    isEntityStore,
    validation,
    savedQuery,
    toggleButtons,
    activeToggle,
    onToggleChange,
    onQueryChange,
    onSavedQueryChange,
    onIndexPatternsChange,
    onEntityFieldChange,
    onRangeChange,
  } = useRuleBasedSourceState({
    watchlistName,
    isEditMode,
    isManaged,
    initialEntitySources,
    onFieldChange,
  });

  useEffect(() => {
    onSourceValidationChange(validation.isValid);
  }, [validation.isValid, onSourceValidationChange]);

  const [indexSearchQuery, setIndexSearchQuery] = React.useState<string | undefined>(undefined);
  const {
    data: indices,
    isFetching: isLoadingIndices,
    error: indicesError,
  } = useFetchWatchlistIndices(indexSearchQuery);
  const debouncedSetIndexSearchQuery = useDebounceFn(setIndexSearchQuery, DEBOUNCE_OPTIONS);
  const indexOptions = useMemo(() => indices?.map((index) => ({ label: index })) ?? [], [indices]);

  return (
    <>
      <EuiSpacer size="l" />
      <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.watchlists.flyout.ruleBasedDataSourcesTitle"
                defaultMessage="Rule Based Data Sources"
              />
            </strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <p>
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.watchlists.flyout.ruleBasedDataSourcesDescription"
                defaultMessage="Define Watchlist data by filtering on existing entities in the store or filtering on entities from an indexPattern"
              />
            </p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />

      <EuiFormRow>
        <EuiButtonGroup
          legend="Rule based data source type"
          options={toggleButtons}
          idSelected={activeToggle}
          onChange={onToggleChange}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />

      {!isNone && !isEntityStore && !!indexSourceWithMissingApiKey && !!watchlistId && (
        <>
          <EuiCallOut
            announceOnMount
            title={
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.watchlists.flyout.missingApiKeyTitle"
                defaultMessage="Sync paused — re-authorization required"
              />
            }
            color="warning"
            iconType="warning"
          >
            <p>
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.watchlists.flyout.missingApiKeyDescription"
                defaultMessage="This data source is not authorized to read from the configured index. Re-authorize to resume sync."
              />
            </p>
            <EuiButton
              size="s"
              color="warning"
              isLoading={refreshApiKeyMutation.isLoading}
              onClick={() => refreshApiKeyMutation.mutate()}
            >
              <FormattedMessage
                id="xpack.securitySolution.entityAnalytics.watchlists.flyout.refreshApiKeyButton"
                defaultMessage="Re-authorize"
              />
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {!isNone && !isEntityStore && (
        <EuiFormRow
          label={WATCHLIST_INDEX_PATTERN_LABEL}
          fullWidth
          isInvalid={validation.errors.indexPattern}
        >
          <EuiComboBox
            isInvalid={validation.errors.indexPattern}
            isLoading={isLoadingIndices && !indicesError}
            fullWidth
            aria-label={WATCHLIST_INDEX_PATTERN_PLACEHOLDER}
            placeholder={WATCHLIST_INDEX_PATTERN_PLACEHOLDER}
            options={indexOptions}
            selectedOptions={selectedIndexPatterns}
            onChange={onIndexPatternsChange}
            onCreateOption={(value) => {
              onIndexPatternsChange([...selectedIndexPatterns, { label: value }]);
            }}
            customOptionText="Add {searchValue} as an index pattern"
            isClearable={true}
            onSearchChange={(query) => debouncedSetIndexSearchQuery.run(query)}
            async
            optionMatcher={() => false}
            data-test-subj="watchlistIndexPatternComboBox"
          />
        </EuiFormRow>
      )}

      {!isNone && (
        <FilterQueryRow
          dataView={status === 'ready' ? dataView : undefined}
          filterQuery={filterQuery}
          filterManager={filterManager}
          filters={filters}
          onSubmitQuery={onQueryChange}
          onChangedQuery={onQueryChange}
          savedQuery={savedQuery}
          onSavedQuery={onSavedQueryChange}
          isInvalid={validation.errors.filterQuery}
        />
      )}

      {!isNone && !isEntityStore && (
        <EuiFormRow label={WATCHLIST_LOOKBACK_PERIOD_LABEL} isInvalid={validation.errors.range}>
          <EuiSuperDatePicker
            start={range.start}
            end={range.end}
            onTimeChange={({ start, end }) => onRangeChange({ start, end })}
            width="auto"
            compressed={true}
            showUpdateButton={false}
          />
        </EuiFormRow>
      )}

      {!isNone && !isEntityStore && (
        <EuiFormRow
          label={WATCHLIST_IDENTIFY_ENTITIES_BY_LABEL}
          isInvalid={validation.errors.entityField}
        >
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiSuperSelect
                valueOfSelected={entityField}
                placeholder={WATCHLIST_ENTITY_FIELD_PLACEHOLDER}
                options={ENTITY_FIELD_OPTIONS}
                onChange={onEntityFieldChange}
                aria-label={WATCHLIST_ENTITY_FIELD_ARIA_LABEL}
                style={{ width: 240 }}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
      )}
    </>
  );
};
