import type { SavedObjectsClientContract, SavedObjectsFindOptions, SavedObjectsFindResponse } from '@kbn/core/server';
import type { MaintenanceWindowAttributes } from '../types/maintenance_window_attributes';
export interface FindMaintenanceWindowSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    savedObjectsFindOptions?: Omit<SavedObjectsFindOptions, 'type'>;
}
export declare const findMaintenanceWindowSo: <MaintenanceWindowAggregation = Record<string, unknown>>(params: FindMaintenanceWindowSoParams) => Promise<SavedObjectsFindResponse<MaintenanceWindowAttributes, MaintenanceWindowAggregation>>;
