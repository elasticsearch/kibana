/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import { compareFilters } from '@kbn/es-query';
import type { SuggestionsAbstraction } from '@kbn/kql/public/components/typeahead/suggestions_component';
import { isSiemRuleType } from '@kbn/rule-data-utils';
import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
} from '@elastic/eui';
import { useAlertsDataView } from '@kbn/alerts-ui-shared/src/common/hooks/use_alerts_data_view';
import type { QuickFiltersMenuItem } from './quick_filters';
import { isQuickFiltersGroup } from './quick_filters';
import { NO_INDEX_PATTERNS } from './constants';
import { SEARCH_BAR_PLACEHOLDER } from './translations';
import type { AlertsSearchBarProps, QueryLanguageType } from './types';
import { useKibana } from '../../../common/lib/kibana';

const SA_ALERTS = { type: 'alerts', fields: {} } as SuggestionsAbstraction;

// TODO Share buildEsQuery to be used between AlertsSearchBar and AlertsStateTable component https://github.com/elastic/kibana/issues/144615
// Also TODO: Replace all references to this component with the one from alerts-ui-shared
export function AlertsSearchBar({
  appName,
  disableQueryLanguageSwitcher = false,
  ruleTypeIds,
  query,
  filters,
  quickFilters = [],
  onQueryChange,
  onQuerySubmit,
  onFiltersUpdated,
  rangeFrom,
  rangeTo,
  showFilterBar = false,
  showDatePicker = true,
  showSubmitButton = true,
  placeholder = SEARCH_BAR_PLACEHOLDER,
  submitOnBlur = false,
  filtersForSuggestions,
  ...props
}: AlertsSearchBarProps) {
  const {
    http,
    dataViews: dataViewsService,
    notifications: { toasts },
    unifiedSearch: {
      ui: { SearchBar },
    },
    data: dataService,
  } = useKibana().services;

  const [queryLanguage, setQueryLanguage] = useState<QueryLanguageType>('kuery');
  const { dataView } = useAlertsDataView({
    ruleTypeIds: ruleTypeIds ?? [],
    http,
    dataViewsService,
    toasts,
  });

  const indexPatterns = useMemo(() => {
    if (ruleTypeIds && dataView?.fields?.length) {
      return [{ title: ruleTypeIds.join(','), fields: dataView.fields }];
    }

    if (dataView) {
      return [dataView];
    }

    return null;
  }, [dataView, ruleTypeIds]);

  const isSecurity = ruleTypeIds?.some(isSiemRuleType) ?? false;

  const onSearchQuerySubmit = useCallback(
    (
      { dateRange, query: nextQuery }: { dateRange: TimeRange; query?: Query },
      isUpdate?: boolean
    ) => {
      onQuerySubmit(
        {
          dateRange,
          query: typeof nextQuery?.query === 'string' ? nextQuery.query : undefined,
        },
        isUpdate
      );
      setQueryLanguage((nextQuery?.language ?? 'kuery') as QueryLanguageType);
    },
    [onQuerySubmit, setQueryLanguage]
  );

  const onSearchQueryChange = useCallback(
    ({ dateRange, query: nextQuery }: { dateRange: TimeRange; query?: Query }) => {
      onQueryChange?.({
        dateRange,
        query: typeof nextQuery?.query === 'string' ? nextQuery.query : undefined,
      });
      setQueryLanguage((nextQuery?.language ?? 'kuery') as QueryLanguageType);
    },
    [onQueryChange, setQueryLanguage]
  );
  const onRefresh = ({ dateRange }: { dateRange: TimeRange }) => {
    onQuerySubmit({
      dateRange,
    });
  };

  const additionalQueryBarMenuItems = useMemo(() => {
    if (showFilterBar && quickFilters.length > 0) {
      // EuiContextMenu expects a flattened panels structure so here we collect all
      // the nested panels in a linear list
      const panels = [] as EuiContextMenuPanelDescriptor[];
      const quickFiltersItemToContextMenuItem = (qf: QuickFiltersMenuItem) => {
        if (isQuickFiltersGroup(qf)) {
          const panelId = `quick-filters-panel-${panels.length}`;
          panels.push({
            id: panelId,
            title: qf.title,
            items: qf.items.map(
              quickFiltersItemToContextMenuItem
            ) as EuiContextMenuPanelItemDescriptor[],
            'data-test-subj': panelId,
          } as EuiContextMenuPanelDescriptor);
          return {
            name: qf.title,
            icon: qf.icon ?? 'filter',
            panel: panelId,
            'data-test-subj': `quick-filters-item-${qf.title}`,
          };
        } else {
          const { filter, ...menuItem } = qf;
          return {
            ...menuItem,
            icon: qf.icon ?? 'filter',
            onClick: () => {
              if (!filters?.some((f) => compareFilters(f, filter))) {
                onFiltersUpdated?.([...(filters ?? []), filter]);
              }
            },
            'data-test-subj': `quick-filters-item-${qf.name}`,
          };
        }
      };
      return {
        items: quickFilters.map(
          quickFiltersItemToContextMenuItem
        ) as EuiContextMenuPanelItemDescriptor[],
        panels,
      };
    } else {
      return {
        items: [],
        panels: [],
      };
    }
  }, [filters, onFiltersUpdated, quickFilters, showFilterBar]);

  return (
    <SearchBar
      appName={appName}
      disableQueryLanguageSwitcher={disableQueryLanguageSwitcher}
      // @ts-expect-error - DataView fields prop and SearchBar indexPatterns props are overly broad
      indexPatterns={!indexPatterns ? NO_INDEX_PATTERNS : indexPatterns}
      placeholder={placeholder}
      query={{ query: query ?? '', language: queryLanguage }}
      filters={filters}
      additionalQueryBarMenuItems={additionalQueryBarMenuItems}
      dateRangeFrom={rangeFrom}
      dateRangeTo={rangeTo}
      displayStyle="inPage"
      showFilterBar={showFilterBar}
      onQuerySubmit={onSearchQuerySubmit}
      onFiltersUpdated={(newFilters: Filter[]) => {
        const mappedFilters = structuredClone(newFilters);
        dataService.query.filterManager.setFilters(mappedFilters);
        onFiltersUpdated?.(mappedFilters);
      }}
      onRefresh={onRefresh}
      showDatePicker={showDatePicker}
      showQueryInput={true}
      allowSavingQueries
      showSubmitButton={showSubmitButton}
      submitOnBlur={submitOnBlur}
      onQueryChange={onSearchQueryChange}
      suggestionsAbstraction={isSecurity ? undefined : SA_ALERTS}
      filtersForSuggestions={filtersForSuggestions}
      {...props}
    />
  );
}

// eslint-disable-next-line import/no-default-export
export { AlertsSearchBar as default };
