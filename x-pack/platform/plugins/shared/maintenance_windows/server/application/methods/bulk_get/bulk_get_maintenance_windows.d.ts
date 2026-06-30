import type { BulkGetMaintenanceWindowsParams, BulkGetMaintenanceWindowsResult } from './types';
import type { MaintenanceWindowClientContext } from '../../../../common';
export declare function bulkGetMaintenanceWindows(context: MaintenanceWindowClientContext, params: BulkGetMaintenanceWindowsParams): Promise<BulkGetMaintenanceWindowsResult>;
