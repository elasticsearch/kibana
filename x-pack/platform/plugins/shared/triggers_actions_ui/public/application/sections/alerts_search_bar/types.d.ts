import type { Filter } from '@kbn/es-query';
import type { SearchBarProps } from '@kbn/unified-search-plugin/public/search_bar/search_bar';
import type { QuickFiltersMenuItem } from './quick_filters';
export type QueryLanguageType = 'lucene' | 'kuery';
export interface AlertsSearchBarProps extends Omit<Partial<SearchBarProps>, 'query' | 'onQueryChange' | 'onQuerySubmit'> {
    appName: string;
    disableQueryLanguageSwitcher?: boolean;
    rangeFrom?: string;
    rangeTo?: string;
    query?: string;
    filters?: Filter[];
    quickFilters?: QuickFiltersMenuItem[];
    showFilterBar?: boolean;
    showDatePicker?: boolean;
    showSubmitButton?: boolean;
    placeholder?: string;
    submitOnBlur?: boolean;
    ruleTypeIds?: string[];
    onQueryChange?: (query: {
        dateRange: {
            from: string;
            to: string;
            mode?: 'absolute' | 'relative';
        };
        query?: string;
    }) => void;
    onQuerySubmit: (query: {
        dateRange: {
            from: string;
            to: string;
            mode?: 'absolute' | 'relative';
        };
        query?: string;
    }, isUpdate?: boolean) => void;
    onFiltersUpdated?: (filters: Filter[]) => void;
    filtersForSuggestions?: Filter[];
}
