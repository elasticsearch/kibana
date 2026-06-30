import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { MaintenanceWindowClient } from '@kbn/maintenance-windows-plugin/server';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
interface GetMaintenanceWindowsOpts {
    fakeRequest: KibanaRequest;
    getMaintenanceWindowClientWithRequest(request: KibanaRequest): MaintenanceWindowClient;
    logger: Logger;
    ruleId: string;
    ruleTypeId: string;
    ruleTypeCategory: string;
}
interface FilterMaintenanceWindowsOpts {
    maintenanceWindows: MaintenanceWindow[];
    withScopedQuery: boolean;
}
export declare const filterMaintenanceWindows: ({ maintenanceWindows, withScopedQuery, }: FilterMaintenanceWindowsOpts) => MaintenanceWindow[];
export declare const filterMaintenanceWindowsIds: ({ maintenanceWindows, withScopedQuery, }: FilterMaintenanceWindowsOpts) => string[];
export declare const getMaintenanceWindows: (opts: GetMaintenanceWindowsOpts) => Promise<MaintenanceWindow[]>;
export {};
