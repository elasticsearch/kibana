import type { RuleTableItem, RulesListFilters } from '../../types';
interface UseBulkEditSelectProps {
    totalItemCount: number;
    items: RuleTableItem[];
    filters?: RulesListFilters;
}
export declare function useBulkEditSelect(props: UseBulkEditSelectProps): {
    selectedIds: string[];
    isAllSelected: boolean;
    isPageSelected: boolean;
    numberOfSelectedItems: number;
    isRowSelected: (rule: RuleTableItem) => boolean;
    getFilter: () => import("@kbn/es-query").KueryNode | null;
    onSelectRow: (rule: RuleTableItem) => void;
    onSelectAll: () => void;
    onSelectPage: () => void;
    onClearSelection: () => void;
};
export {};
