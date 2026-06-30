import type { EuiDataGridColumn } from '@elastic/eui';
export declare const toggleColumn: ({ columnId, columns, defaultColumns, }: {
    /**
     * The id of the column to be removed/inserted
     */
    columnId: string;
    /**
     * The current columns configuration
     */
    columns: EuiDataGridColumn[];
    /**
     * The default columns configuration, used to determine the position of the column
     * when inserting it back in
     */
    defaultColumns: EuiDataGridColumn[];
}) => EuiDataGridColumn[];
export declare const toggleVisibleColumn: ({ columnId, visibleColumns, defaultVisibleColumns, columns, }: {
    columnId: string;
    visibleColumns: string[];
    defaultVisibleColumns: string[];
    columns: EuiDataGridColumn[];
}) => string[];
