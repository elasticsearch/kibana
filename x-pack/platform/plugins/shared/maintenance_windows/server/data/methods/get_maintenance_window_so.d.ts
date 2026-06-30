import type { SavedObjectsClientContract, SavedObject } from '@kbn/core/server';
import type { MaintenanceWindowAttributes } from '../types/maintenance_window_attributes';
export interface GetMaintenanceWindowSoParams {
    id: string;
    savedObjectsClient: SavedObjectsClientContract;
}
export declare const getMaintenanceWindowSo: (params: GetMaintenanceWindowSoParams) => Promise<SavedObject<MaintenanceWindowAttributes>>;
