import React from 'react';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
interface TooltipContentProps {
    maintenanceWindow: MaintenanceWindow;
    timestamp?: string;
}
export declare const TooltipContent: React.MemoExoticComponent<(props: TooltipContentProps) => React.JSX.Element>;
export {};
