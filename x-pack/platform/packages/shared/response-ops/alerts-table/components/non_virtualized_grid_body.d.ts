import React from 'react';
import type { EuiDataGridProps, EuiDataGridStyle } from '@elastic/eui';
import type { Alert } from '@kbn/alerting-types';
export type CustomGridBodyProps = Pick<Parameters<NonNullable<EuiDataGridProps['renderCustomGridBody']>>['0'], 'Cell' | 'visibleColumns'> & {
    alerts: Alert[];
    isLoading: boolean;
    pageIndex: number;
    pageSize: number;
    actualGridStyle: EuiDataGridStyle;
    stripes?: boolean;
};
/**
 * Renders a non-virtualized grid body with the provided Cell component
 */
export declare const NonVirtualizedGridBody: React.MemoExoticComponent<({ alerts, isLoading, pageIndex, pageSize, actualGridStyle, visibleColumns, Cell, stripes, }: CustomGridBodyProps) => React.JSX.Element>;
