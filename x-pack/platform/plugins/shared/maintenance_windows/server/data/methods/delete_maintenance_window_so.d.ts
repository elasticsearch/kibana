import type { SavedObjectsClientContract, SavedObjectsDeleteOptions } from '@kbn/core/server';
export interface DeleteMaintenanceWindowSoParams {
    id: string;
    savedObjectsClient: SavedObjectsClientContract;
    savedObjectsDeleteOptions?: SavedObjectsDeleteOptions;
}
export declare const deleteMaintenanceWindowSo: (params: DeleteMaintenanceWindowSoParams) => Promise<{}>;
