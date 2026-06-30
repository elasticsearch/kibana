import type { SavedObjectsClientContract, SavedObjectsUpdateOptions, SavedObjectsUpdateResponse } from '@kbn/core/server';
import type { MaintenanceWindowAttributes } from '../types/maintenance_window_attributes';
export interface UpdateMaintenanceWindowSoParams {
    id: string;
    savedObjectsClient: SavedObjectsClientContract;
    updateMaintenanceWindowAttributes: Partial<MaintenanceWindowAttributes>;
    savedObjectsUpdateOptions?: SavedObjectsUpdateOptions<MaintenanceWindowAttributes>;
}
export declare const updateMaintenanceWindowSo: (params: UpdateMaintenanceWindowSoParams) => Promise<SavedObjectsUpdateResponse<MaintenanceWindowAttributes>>;
