import type { SavedObjectsClientContract, SavedObjectsBulkDeleteOptions, SavedObjectsBulkDeleteResponse } from '@kbn/core/server';
export interface BulkDeleteRulesSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    ids: string[];
    savedObjectsBulkDeleteOptions?: SavedObjectsBulkDeleteOptions;
}
export declare const bulkDeleteRulesSo: (params: BulkDeleteRulesSoParams) => Promise<SavedObjectsBulkDeleteResponse>;
