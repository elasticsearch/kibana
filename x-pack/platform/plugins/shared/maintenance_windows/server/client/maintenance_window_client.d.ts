import type { IUiSettingsClient, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { CreateMaintenanceWindowParams } from '../application/methods/create/types';
import type { GetMaintenanceWindowParams } from '../application/methods/get/types';
import type { UpdateMaintenanceWindowParams } from '../application/methods/update/types';
import type { FindMaintenanceWindowsResult, FindMaintenanceWindowsParams } from '../application/methods/find/types';
import type { DeleteMaintenanceWindowParams } from '../application/methods/delete/types';
import type { ArchiveMaintenanceWindowParams } from '../application/methods/archive/types';
import type { FinishMaintenanceWindowParams } from '../application/methods/finish/types';
import type { BulkGetMaintenanceWindowsParams, BulkGetMaintenanceWindowsResult } from '../application/methods/bulk_get/types';
import type { MaintenanceWindow } from '../application/types';
export interface MaintenanceWindowClientConstructorOptions {
    readonly uiSettings: IUiSettingsClient;
    readonly logger: Logger;
    readonly savedObjectsClient: SavedObjectsClientContract;
    readonly getUserName: () => Promise<string | null>;
}
export declare class MaintenanceWindowClient {
    private readonly logger;
    private readonly savedObjectsClient;
    private readonly getUserName;
    private readonly context;
    constructor(options: MaintenanceWindowClientConstructorOptions);
    private getModificationMetadata;
    create: (params: CreateMaintenanceWindowParams) => Promise<MaintenanceWindow>;
    get: (params: GetMaintenanceWindowParams) => Promise<MaintenanceWindow>;
    update: (params: UpdateMaintenanceWindowParams) => Promise<MaintenanceWindow>;
    find: (params?: FindMaintenanceWindowsParams) => Promise<FindMaintenanceWindowsResult>;
    delete: (params: DeleteMaintenanceWindowParams) => Promise<{}>;
    archive: (params: ArchiveMaintenanceWindowParams) => Promise<MaintenanceWindow>;
    finish: (params: FinishMaintenanceWindowParams) => Promise<MaintenanceWindow>;
    bulkGet: (params: BulkGetMaintenanceWindowsParams) => Promise<BulkGetMaintenanceWindowsResult>;
    getActiveMaintenanceWindows: (cacheIntervalMs?: number) => Promise<MaintenanceWindow[]>;
}
