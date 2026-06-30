import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { MaintenanceWindowClient } from '@kbn/maintenance-windows-plugin/server';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import type { AlertingEventLogger } from '../../lib/alerting_event_logger/alerting_event_logger';
export declare const DEFAULT_CACHE_INTERVAL_MS = 60000;
interface MaintenanceWindowServiceOpts {
    cacheInterval?: number;
    getMaintenanceWindowClient: (request: KibanaRequest) => MaintenanceWindowClient | undefined;
    logger: Logger;
}
interface MaintenanceWindowData {
    maintenanceWindows: MaintenanceWindow[];
    maintenanceWindowsWithoutScopedQueryIds: string[];
}
interface LoadMaintenanceWindowsOpts {
    request: KibanaRequest;
    spaceId: string;
}
type GetMaintenanceWindowsOpts = LoadMaintenanceWindowsOpts & {
    eventLogger: AlertingEventLogger;
    ruleTypeCategory: string;
};
export declare class MaintenanceWindowsService {
    private readonly options;
    private cacheIntervalMs;
    private windows;
    constructor(options: MaintenanceWindowServiceOpts);
    getMaintenanceWindows(opts: GetMaintenanceWindowsOpts): Promise<MaintenanceWindowData>;
    private loadMaintenanceWindows;
    private fetchMaintenanceWindows;
}
export {};
