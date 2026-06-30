import React from 'react';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import type { CellComponent } from '../types';
interface MaintenanceWindowBaseCellProps {
    maintenanceWindows: MaintenanceWindow[];
    maintenanceWindowIds: string[];
    timestamp?: string;
    isLoading: boolean;
}
export declare const MaintenanceWindowBaseCell: React.MemoExoticComponent<(props: MaintenanceWindowBaseCellProps) => React.JSX.Element>;
export declare const MaintenanceWindowsCell: CellComponent;
export {};
