import React from 'react';
import type { Pagination, EuiDataGridSorting, EuiDataGridColumn } from '@elastic/eui';
import type { IExecutionLog } from '@kbn/alerting-plugin/common';
import type { IExecutionLog as IConnectorsExecutionLog } from '@kbn/actions-plugin/common';
export declare const getIsColumnSortable: (columnId: string) => boolean;
type ExecutionLog = IExecutionLog | IConnectorsExecutionLog;
export interface EventLogDataGrid {
    columns: EuiDataGridColumn[];
    logs: ExecutionLog[];
    pagination: Pagination & {
        pageSize: number;
    };
    sortingColumns: EuiDataGridSorting['columns'];
    visibleColumns: string[];
    dateFormat: string;
    pageSizeOptions?: number[];
    selectedRunLog?: ExecutionLog;
    onChangeItemsPerPage: (pageSize: number) => void;
    onChangePage: (pageIndex: number) => void;
    onFlyoutOpen?: (runLog: IExecutionLog) => void;
    setVisibleColumns: (visibleColumns: string[]) => void;
    setSortingColumns: (sortingColumns: EuiDataGridSorting['columns']) => void;
    getRuleDetailsRoute?: (ruleId: string) => string;
}
export declare const numTriggeredActionsDisplay: string;
export declare const numGeneratedActionsDisplay: string;
export declare const numSucceededActionsDisplay: string;
export declare const numErroredActionsDisplay: string;
export declare const ColumnHeaderWithToolTip: ({ id }: {
    id: string;
}) => React.JSX.Element;
export declare const EventLogDataGrid: (props: EventLogDataGrid) => React.JSX.Element;
export {};
