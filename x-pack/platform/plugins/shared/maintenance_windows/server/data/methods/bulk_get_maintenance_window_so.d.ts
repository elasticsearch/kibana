import type { SavedObjectsClientContract, SavedObjectsBulkResponse } from '@kbn/core/server';
import type { MaintenanceWindowAttributes } from '../types/maintenance_window_attributes';
export interface BulkGetMaintenanceWindowObject {
    id: string;
}
export interface BulkGetMaintenanceWindowSoParams {
    objects: BulkGetMaintenanceWindowObject[];
    savedObjectsClient: SavedObjectsClientContract;
}
export declare const bulkGetMaintenanceWindowSo: (params: BulkGetMaintenanceWindowSoParams) => Promise<SavedObjectsBulkResponse<MaintenanceWindowAttributes>>;
