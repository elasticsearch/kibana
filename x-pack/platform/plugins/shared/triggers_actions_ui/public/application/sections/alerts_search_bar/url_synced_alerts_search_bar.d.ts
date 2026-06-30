import React from 'react';
import type { BoolQuery, Filter } from '@kbn/es-query';
import type { FilterControlConfig, FilterGroupHandler } from '@kbn/alerts-ui-shared/src/alert_filter_controls/types';
import type { AlertsSearchBarProps } from './types';
export interface UrlSyncedAlertsSearchBarProps extends Omit<AlertsSearchBarProps, 'query' | 'rangeFrom' | 'rangeTo' | 'filters' | 'onQuerySubmit'> {
    showFilterControls?: boolean;
    urlStorageKey?: string;
    filterControlsStorageKey?: string;
    /**
     * Filters emitted by the filter controls. Owned by the parent page so that
     * it can gate the alerts table on the controls being initialized.
     */
    filterControls?: Filter[];
    /**
     * Setter for the filter controls output filters.
     */
    onFilterControlsChange?: (filterControls: Filter[]) => void;
    /**
     * Fires with the control group handle once the controls have initialized.
     */
    onControlApiAvailable?: (controlGroupHandler: FilterGroupHandler | undefined) => void;
    onEsQueryChange: (esQuery: {
        bool: BoolQuery;
    }) => void;
    onFilterSelected?: (filters: Filter[]) => void;
    defaultFilterControls?: FilterControlConfig[];
}
/**
 * An abstraction over AlertsSearchBar that syncs the query state with the url
 */
export declare const UrlSyncedAlertsSearchBar: ({ ruleTypeIds, showFilterControls, urlStorageKey, filterControlsStorageKey: filterControlsStorageKeyProp, filterControls, onFilterControlsChange, onControlApiAvailable, onEsQueryChange, onFilterSelected, defaultFilterControls, ...rest }: UrlSyncedAlertsSearchBarProps) => React.JSX.Element;
