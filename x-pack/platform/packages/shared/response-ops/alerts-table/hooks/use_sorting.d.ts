import type { EuiDataGridSorting } from '@elastic/eui';
import type { EuiDataGridColumnSortingConfig } from '@elastic/eui/src/components/datagrid/data_grid_types';
import type { AlertsTableSortCombinations } from '../types';
export declare function useSorting(onSortChange: (sort: EuiDataGridSorting['columns']) => void, visibleColumns: string[], sortCombinations?: AlertsTableSortCombinations[]): {
    sortingColumns: EuiDataGridColumnSortingConfig[];
    onSort: (columns: EuiDataGridColumnSortingConfig[]) => void;
};
