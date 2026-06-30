import type { HttpStart } from '@kbn/core-http-browser';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import type { AsApiContract } from '@kbn/actions-plugin/common';
export interface BulkGetMaintenanceWindowsParams {
    http: HttpStart;
    ids: string[];
}
export interface BulkGetMaintenanceWindowError {
    id: string;
    error: string;
    message: string;
    statusCode: number;
}
export interface BulkGetMaintenanceWindowsResponse {
    maintenance_windows: Array<AsApiContract<MaintenanceWindow>>;
    errors: Array<AsApiContract<BulkGetMaintenanceWindowError>>;
}
export interface BulkGetMaintenanceWindowsResult {
    maintenanceWindows: MaintenanceWindow[];
    errors: BulkGetMaintenanceWindowError[];
}
export declare const bulkGetMaintenanceWindows: ({ http, ids, }: BulkGetMaintenanceWindowsParams) => Promise<BulkGetMaintenanceWindowsResult>;
