import React from 'react';
import type { AlertsSearchBarProps } from './types';
export declare function AlertsSearchBar({ appName, disableQueryLanguageSwitcher, ruleTypeIds, query, filters, quickFilters, onQueryChange, onQuerySubmit, onFiltersUpdated, rangeFrom, rangeTo, showFilterBar, showDatePicker, showSubmitButton, placeholder, submitOnBlur, filtersForSuggestions, ...props }: AlertsSearchBarProps): React.JSX.Element;
export { AlertsSearchBar as default };
