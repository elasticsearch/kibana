import type { MaintenanceWindowClientContext } from '../../../../common';
import type { MaintenanceWindow } from '../../types';
export interface MaintenanceWindowAggregationResult {
    maintenanceWindow: {
        buckets: Array<{
            key_as_string: string;
            key: string;
            doc_count: number;
        }>;
    };
}
export declare function getActiveMaintenanceWindows(context: MaintenanceWindowClientContext, cacheIntervalMs?: number, perPage?: number): Promise<MaintenanceWindow[]>;
