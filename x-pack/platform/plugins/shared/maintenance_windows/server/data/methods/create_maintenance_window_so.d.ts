import type { SavedObjectsClientContract, SavedObjectsCreateOptions, SavedObject } from '@kbn/core/server';
import type { MaintenanceWindowAttributes } from '../types/maintenance_window_attributes';
export interface CreateMaintenanceWindowSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    maintenanceWindowAttributes: MaintenanceWindowAttributes;
    savedObjectsCreateOptions?: SavedObjectsCreateOptions;
}
export declare const createMaintenanceWindowSo: (params: CreateMaintenanceWindowSoParams) => Promise<SavedObject<MaintenanceWindowAttributes>>;
