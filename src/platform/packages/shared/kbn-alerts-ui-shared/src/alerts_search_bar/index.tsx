/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useMemo, useState } from 'react';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import type { SuggestionsAbstraction } from '@kbn/kql/public/components/typeahead/suggestions_component';
import { isSiemRuleType } from '@kbn/rule-data-utils';
import { NO_INDEX_PATTERNS } from './constants';
import { SEARCH_BAR_PLACEHOLDER } from './translations';
import type { AlertsSearchBarProps, QueryLanguageType } from './types';
import { useAlertsDataView, useFetchUnifiedAlertsFields } from '../common/hooks';

export type { AlertsSearchBarProps } from './types';

const SA_ALERTS = { type: 'alerts', fields: {} } as SuggestionsAbstraction;
const DEFAULT_INDEX_PATTERN_TITLE = 'all-rule-types';

export const AlertsSearchBar = ({
  appName,
  disableQueryLanguageSwitcher = false,
  ruleTypeIds = [],
  query,
  filters,
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
  http,
  toasts,
  unifiedSearchBar,
  dataService,
  fetchUnifiedAlertsFields = false,
}: AlertsSearchBarProps) => {
  const [queryLanguage, setQueryLanguage] = useState<QueryLanguageType>('kuery');
  const { dataView } = useAlertsDataView({
    ruleTypeIds,
    http,
    toasts,
    dataViewsService: dataService.dataViews,
    fetchUnifiedAlertsFields,
  });

  const { data: { fields: alertFields } = {} } = useFetchUnifiedAlertsFields(
    { http, ruleTypeIds, toasts },
    {
      enabled: fetchUnifiedAlertsFields,
    }
  );

  const indexPatterns = useMemo(() => {
    if (ruleTypeIds.length > 0 && dataView?.fields?.length) {
      return [{ title: ruleTypeIds.join(','), fields: dataView.fields }];
    }

    if (dataView) {
      return [dataView];
    }

    if (alertFields?.length) {
      return [
        {
          title: ruleTypeIds.length ? ruleTypeIds.join(',') : DEFAULT_INDEX_PATTERN_TITLE,
          fields: alertFields,
        },
      ];
    }

    return null;
  }, [dataView, ruleTypeIds, alertFields]);

  const isSecurity = ruleTypeIds?.some(isSiemRuleType) ?? false;

  const onSearchQuerySubmit = useCallback(
    ({ dateRange, query: nextQuery }: { dateRange: TimeRange; query?: Query }) => {
      onQuerySubmit({
        dateRange,
        query: typeof nextQuery?.query === 'string' ? nextQuery.query : undefined,
      });
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

  return unifiedSearchBar({
    appName,
    disableQueryLanguageSwitcher,
    // @ts-expect-error - DataView fields prop and SearchBar indexPatterns props are overly broad
    indexPatterns: !indexPatterns ? NO_INDEX_PATTERNS : indexPatterns,
    placeholder,
    query: { query: query ?? '', language: queryLanguage },
    filters,
    dateRangeFrom: rangeFrom,
    dateRangeTo: rangeTo,
    displayStyle: 'inPage',
    showFilterBar,
    onQuerySubmit: onSearchQuerySubmit,
    onFiltersUpdated: (newFilters: Filter[]) => {
      dataService.query.filterManager.setFilters(newFilters);
      onFiltersUpdated?.(newFilters);
    },
    onRefresh,
    showDatePicker,
    showQueryInput: true,
    allowSavingQueries: true,
    showSubmitButton,
    submitOnBlur,
    onQueryChange: onSearchQueryChange,
    suggestionsAbstraction: isSecurity && !fetchUnifiedAlertsFields ? undefined : SA_ALERTS,
  });
};

// eslint-disable-next-line import/no-default-export
export { AlertsSearchBar as default };
