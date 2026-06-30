import { type SavedQuery } from '@kbn/data-plugin/public';
import * as t from 'io-ts';
import type { Filter } from '@kbn/es-query';
import type { FilterControlConfig } from '@kbn/alerts-ui-shared';
interface AlertSearchBarContainerState {
    /**
     * Time range start
     */
    rangeFrom: string;
    /**
     * Time range end
     */
    rangeTo: string;
    /**
     * KQL bar query
     */
    kuery: string;
    /**
     * Filters applied from the KQL bar
     */
    filters: Filter[];
    /**
     * Saved query ID
     */
    savedQueryId?: string;
    /**
     * Filter controls bar configuration
     */
    filterControls: FilterControlConfig[];
}
interface AlertSearchBarStateTransitions {
    setRangeFrom: (state: AlertSearchBarContainerState) => (rangeFrom: string) => AlertSearchBarContainerState;
    setRangeTo: (state: AlertSearchBarContainerState) => (rangeTo: string) => AlertSearchBarContainerState;
    setKuery: (state: AlertSearchBarContainerState) => (kuery: string) => AlertSearchBarContainerState;
    setFilters: (state: AlertSearchBarContainerState) => (filters: Filter[]) => AlertSearchBarContainerState;
    setSavedQueryId: (state: AlertSearchBarContainerState) => (savedQueryId?: string) => AlertSearchBarContainerState;
    setFilterControls: (state: AlertSearchBarContainerState) => (filterControls: FilterControlConfig[]) => AlertSearchBarContainerState;
}
export declare const alertSearchBarStateContainer: import("@kbn/kibana-utils-plugin/public").ReduxLikeStateContainer<AlertSearchBarContainerState, AlertSearchBarStateTransitions, {}>;
export declare const Provider: import("react").Provider<import("@kbn/kibana-utils-plugin/public").ReduxLikeStateContainer<AlertSearchBarContainerState, AlertSearchBarStateTransitions, {}>>, useContainer: () => import("@kbn/kibana-utils-plugin/public").ReduxLikeStateContainer<AlertSearchBarContainerState, AlertSearchBarStateTransitions, {}>;
export declare function useAlertSearchBarStateContainer(urlStorageKey: string, { replace }?: {
    replace?: boolean;
}): {
    kuery: string;
    onKueryChange: (kuery: string) => AlertSearchBarContainerState;
    filters: Filter[];
    onFiltersChange: (filters: Filter[]) => AlertSearchBarContainerState;
    filterControls: FilterControlConfig[];
    onFilterControlsChange: (filterControls: FilterControlConfig[]) => AlertSearchBarContainerState;
    rangeFrom: string;
    onRangeFromChange: (rangeFrom: string) => AlertSearchBarContainerState;
    rangeTo: string;
    onRangeToChange: (rangeTo: string) => AlertSearchBarContainerState;
    savedQuery: SavedQuery | undefined;
    setSavedQuery: import("react").Dispatch<import("react").SetStateAction<SavedQuery | undefined>>;
    clearSavedQuery(): void;
};
export declare const alertSearchBarState: t.PartialC<{
    rangeFrom: t.Type<string, string, unknown>;
    rangeTo: t.Type<string, string, unknown>;
    kuery: t.StringC;
}>;
export {};
