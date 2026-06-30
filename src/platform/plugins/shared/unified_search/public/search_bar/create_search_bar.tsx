/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEqual } from 'lodash';
import React, { useEffect, useRef } from 'react';
import type { CoreStart } from '@kbn/core/public';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { QueryStart, SavedQuery, DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { KqlPluginStart } from '@kbn/kql/public';
import type { Query, AggregateQuery } from '@kbn/es-query';
import type { Filter, TimeRange } from '@kbn/es-query';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import { SearchBar } from '.';
import type { SearchBarFilterProps, SearchBarOwnProps } from '.';
import { useFilterManager } from './lib/use_filter_manager';
import { useTimefilter } from './lib/use_timefilter';
import { useSavedQuery } from './lib/use_saved_query';
import { useQueryStringManager } from './lib/use_query_string_manager';
import { canShowSavedQuery } from './lib/can_show_saved_query';
import { useAsCodeFilterConversion } from '../hooks/use_as_code_filter_conversion';

export interface StatefulSearchBarDeps {
  core: CoreStart;
  data: DataPublicPluginStart;
  storage: IStorageWrapper;
  usageCollection?: UsageCollectionSetup;
  isScreenshotMode?: boolean;
  kql: { autocomplete: KqlPluginStart['autocomplete'] };
  cps: CPSPluginStart;
}

type StatefulSearchBarCommonProps<QT extends Query | AggregateQuery = Query> = Omit<
  SearchBarOwnProps<QT>,
  'showSaveQuery' | 'asCodeFilterMode'
> & {
  appName: string;
  useDefaultBehaviors?: boolean;
  disableSubscribingToGlobalDataServices?: boolean;
  savedQueryId?: string;
  /**
   * Determines if saving queries is allowed within the saved query management popover (still requires privileges).
   * This does not impact if queries can be loaded, which is determined by the saved query management read privilege.
   * Defaults to false.
   */
  allowSavingQueries?: boolean;
  onSavedQueryIdChange?: (savedQueryId?: string) => void;
};

export type StatefulSearchBarProps<QT extends Query | AggregateQuery = Query> =
  StatefulSearchBarCommonProps<QT> & SearchBarFilterProps;

// Respond to user changing the filters
const defaultFiltersUpdated = (
  queryService: QueryStart,
  onFiltersUpdated?: (filters: Filter[]) => void
) => {
  return (filters: Filter[]) => {
    if (onFiltersUpdated) {
      onFiltersUpdated(filters);
    } else {
      queryService.filterManager.setFilters(filters);
    }
  };
};

// Respond to user changing the refresh settings
const defaultOnRefreshChange = (
  queryService: QueryStart,
  onRefreshChange?: (payload: { isPaused: boolean; refreshInterval: number }) => void
) => {
  const { timefilter } = queryService.timefilter;
  return (options: { isPaused: boolean; refreshInterval: number }) => {
    timefilter.setRefreshInterval({
      value: options.refreshInterval,
      pause: options.isPaused,
    });
    if (onRefreshChange) {
      onRefreshChange({
        refreshInterval: options.refreshInterval,
        isPaused: options.isPaused,
      });
    }
  };
};

// Respond to user changing the query string or time settings
const defaultOnQuerySubmit = <QT extends AggregateQuery | Query = Query>(
  props: StatefulSearchBarProps<QT>,
  queryService: QueryStart,
  currentQuery: QT | Query
) => {
  if (!props.useDefaultBehaviors) return props.onQuerySubmit;

  const { timefilter } = queryService.timefilter;

  return (payload: { dateRange: TimeRange; query?: QT | Query }) => {
    const currentTime = timefilter.getTime();
    const isUpdate =
      !isEqual(currentTime, payload.dateRange) || !isEqual(payload.query, currentQuery);

    let submittedTime = currentTime;
    let submittedQuery = currentQuery;

    if (isUpdate) {
      timefilter.setTime(payload.dateRange);
      if (payload.query) {
        queryService.queryString.setQuery(payload.query);
      } else {
        queryService.queryString.clearQuery();
      }
      submittedTime = timefilter.getTime();
      submittedQuery = queryService.queryString.getQuery() as QT | Query;
    }

    if ((!isUpdate || props.disableSubscribingToGlobalDataServices) && props.onQuerySubmit) {
      // Refresh button triggered for an update
      props.onQuerySubmit(
        {
          dateRange: submittedTime,
          query: submittedQuery,
        },
        isUpdate
      );
    }
  };
};

// Respond to user clearing a saved query
const defaultOnClearSavedQuery = <QT extends AggregateQuery | Query = Query>(
  props: StatefulSearchBarProps<QT>,
  clearSavedQuery: Function
) => {
  if (!props.useDefaultBehaviors) return props.onClearSavedQuery;
  return () => {
    clearSavedQuery();
    if (props.onSavedQueryIdChange) props.onSavedQueryIdChange();
  };
};

// Respond to user saving or updating a saved query
const defaultOnSavedQueryUpdated = <QT extends AggregateQuery | Query = Query>(
  props: StatefulSearchBarProps<QT>,
  setSavedQuery: Function
) => {
  if (!props.useDefaultBehaviors) return props.onSavedQueryUpdated;
  return (savedQuery: SavedQuery) => {
    setSavedQuery(savedQuery);
    if (props.onSavedQueryIdChange) props.onSavedQueryIdChange(savedQuery.id);
  };
};

const overrideDefaultBehaviors = <QT extends AggregateQuery | Query = Query>(
  props: StatefulSearchBarProps<QT>
) => {
  return props.useDefaultBehaviors ? {} : props;
};

export function createSearchBar({
  core,
  storage,
  data,
  usageCollection,
  isScreenshotMode = false,
  kql,
  cps,
}: StatefulSearchBarDeps) {
  // App name should come from the core application service.
  // Until it's available, we'll ask the user to provide it for the pre-wired component.
  return <QT extends AggregateQuery | Query = Query>(props: StatefulSearchBarProps<QT>) => {
    const {
      useDefaultBehaviors,
      allowSavingQueries,
      disableSubscribingToGlobalDataServices,
      asCodeFilterMode,
    } = props;

    if (asCodeFilterMode && useDefaultBehaviors) {
      throw new Error(
        'StatefulSearchBar does not support asCodeFilterMode with useDefaultBehaviors=true. Provide explicit filter handlers instead.'
      );
    }

    if (asCodeFilterMode && !props.onFiltersUpdated) {
      throw new Error(
        'StatefulSearchBar requires onFiltersUpdated when asCodeFilterMode is enabled.'
      );
    }

    // Handle queries
    const onQuerySubmitRef = useRef(props.onQuerySubmit);

    useEffect(() => {
      onQuerySubmitRef.current = props.onQuerySubmit;
    }, [props.onQuerySubmit]);
    // handle service state updates.
    // i.e. filters being added from a visualization directly to filterManager.
    const { filters } = useFilterManager({
      disabled: disableSubscribingToGlobalDataServices,
      filters: asCodeFilterMode ? undefined : (props.filters as Filter[] | undefined),
      filterManager: data.query.filterManager,
    });
    const { query } = useQueryStringManager({
      disabled: disableSubscribingToGlobalDataServices,
      query: props.query,
      queryStringManager: data.query.queryString,
    }) as { query: QT };
    const convertedFilters = useAsCodeFilterConversion({
      asCodeFilterMode,
      filters: asCodeFilterMode ? props.filters : filters,
      onFiltersUpdated: defaultFiltersUpdated(
        data.query,
        props.onFiltersUpdated as ((filters: Filter[]) => void) | undefined
      ),
      toasts: core.notifications.toasts,
    });
    const { timeRange, refreshInterval, minRefreshInterval } = useTimefilter({
      disabled: disableSubscribingToGlobalDataServices,
      dateRangeFrom: props.dateRangeFrom,
      dateRangeTo: props.dateRangeTo,
      refreshInterval: props.refreshInterval,
      isRefreshPaused: props.isRefreshPaused,
      timefilter: data.query.timefilter.timefilter,
    });

    // Fetch and update UI from saved query
    const { savedQuery, setSavedQuery, clearSavedQuery } = useSavedQuery({
      queryService: data.query,
      savedQueryId: props.savedQueryId,
      notifications: core.notifications,
    });

    // Fire onQuerySubmit on query or timerange change
    useEffect(() => {
      if (
        !useDefaultBehaviors ||
        disableSubscribingToGlobalDataServices ||
        !onQuerySubmitRef.current
      ) {
        return;
      }
      onQuerySubmitRef.current(
        {
          dateRange: timeRange,
          query,
        },
        true
      );
    }, [query, timeRange, useDefaultBehaviors, disableSubscribingToGlobalDataServices]);

    const showSaveQuery = canShowSavedQuery({
      allowSavingQueries,
      query,
      core,
    });

    return (
      <KibanaContextProvider
        services={{
          appName: props.appName,
          data,
          storage,
          usageCollection,
          kql,
          cps,
          ...core,
        }}
      >
        <core.i18n.Context>
          <SearchBar
            showAutoRefreshOnly={props.showAutoRefreshOnly}
            showDatePicker={props.showDatePicker}
            showFilterBar={props.showFilterBar}
            showQueryMenu={props.showQueryMenu}
            showQueryInput={props.showQueryInput}
            showSaveQuery={showSaveQuery}
            asCodeFilterMode={asCodeFilterMode}
            showSubmitButton={props.showSubmitButton}
            submitButtonStyle={props.submitButtonStyle}
            isDisabled={props.isDisabled}
            screenTitle={props.screenTitle}
            indexPatterns={props.indexPatterns}
            indicateNoData={props.indicateNoData}
            timeHistory={data.query.timefilter.history}
            dateRangeFrom={timeRange.from}
            dateRangeTo={timeRange.to}
            minRefreshInterval={minRefreshInterval}
            refreshInterval={refreshInterval.value}
            isRefreshPaused={refreshInterval.pause}
            isLoading={props.isLoading}
            onCancel={props.onCancel}
            filters={convertedFilters.filters}
            query={query}
            draft={props.draft}
            onDraftChange={props.onDraftChange}
            onFiltersUpdated={convertedFilters.onFiltersUpdated}
            onRefreshChange={
              !props.isAutoRefreshDisabled
                ? defaultOnRefreshChange(data.query, props.onRefreshChange)
                : undefined
            }
            savedQuery={savedQuery}
            onQuerySubmit={defaultOnQuerySubmit(props, data.query, query)}
            onQueryChange={props.onQueryChange}
            onRefresh={props.onRefresh}
            onClearSavedQuery={defaultOnClearSavedQuery(props, clearSavedQuery)}
            onSavedQueryUpdated={defaultOnSavedQueryUpdated(props, setSavedQuery)}
            onSaved={defaultOnSavedQueryUpdated(props, setSavedQuery)}
            iconType={props.iconType}
            nonKqlMode={props.nonKqlMode}
            customSubmitButton={props.customSubmitButton}
            dataViewPickerOverride={props.dataViewPickerOverride}
            isClearable={props.isClearable}
            placeholder={props.placeholder}
            additionalQueryBarMenuItems={props.additionalQueryBarMenuItems}
            {...overrideDefaultBehaviors(props)}
            dataViewPickerComponentProps={props.dataViewPickerComponentProps}
            textBasedLanguageModeErrors={props.textBasedLanguageModeErrors}
            textBasedLanguageModeWarning={props.textBasedLanguageModeWarning}
            displayStyle={props.displayStyle}
            isScreenshotMode={isScreenshotMode}
            dataTestSubj={props.dataTestSubj}
            filtersForSuggestions={props.filtersForSuggestions}
            prependFilterBar={props.prependFilterBar}
            onESQLDocsFlyoutVisibilityChanged={props.onESQLDocsFlyoutVisibilityChanged}
            esqlEditorInitialState={props.esqlEditorInitialState}
            onEsqlEditorInitialStateChange={props.onEsqlEditorInitialStateChange}
            hasDirtyState={props.hasDirtyState}
            esqlVariablesConfig={props.esqlVariablesConfig}
            onOpenQueryInNewTab={props.onOpenQueryInNewTab}
            useBackgroundSearchButton={props.useBackgroundSearchButton}
            esqlQueryStats={props.esqlQueryStats}
            enableResourceBrowser={props.enableResourceBrowser}
            enableDateRangePicker={props.enableDateRangePicker}
            esqlApproximation={props.esqlApproximation}
          />
        </core.i18n.Context>
      </KibanaContextProvider>
    );
  };
}
