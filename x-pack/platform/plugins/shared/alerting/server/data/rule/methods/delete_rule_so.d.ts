import type { SavedObjectsClientContract, SavedObjectsDeleteOptions } from '@kbn/core/server';
export interface DeleteRuleSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    id: string;
    savedObjectsDeleteOptions?: SavedObjectsDeleteOptions;
}
export declare const deleteRuleSo: (params: DeleteRuleSoParams) => Promise<{}>;
