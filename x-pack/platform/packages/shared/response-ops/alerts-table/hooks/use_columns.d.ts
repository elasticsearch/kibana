import type { Dispatch, SetStateAction } from 'react';
import type { EuiDataGridColumn, EuiDataGridOnColumnResizeData } from '@elastic/eui';
import type { BrowserFields } from '@kbn/alerting-types';
export interface UseColumnsArgs {
    columns: EuiDataGridColumn[];
    updateColumns: Dispatch<SetStateAction<EuiDataGridColumn[]>>;
    defaultColumns: EuiDataGridColumn[];
    visibleColumns: string[];
    updateVisibleColumns: Dispatch<SetStateAction<string[]>>;
    defaultVisibleColumns: string[];
    alertsFields?: BrowserFields;
}
export interface UseColumnsResp {
    columnsWithFieldsData: EuiDataGridColumn[];
    onResetColumns: () => void;
    onToggleColumn: (columnId: string) => void;
    onColumnResize: (args: EuiDataGridOnColumnResizeData) => void;
    fields: Array<{
        field: string;
        include_unmapped: boolean;
    }>;
}
export declare const useColumns: ({ columns, updateColumns, defaultColumns, visibleColumns, updateVisibleColumns, defaultVisibleColumns, alertsFields, }: UseColumnsArgs) => UseColumnsResp;
