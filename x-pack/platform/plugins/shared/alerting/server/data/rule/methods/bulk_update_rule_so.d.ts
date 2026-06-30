import type { SavedObjectsClientContract, SavedObjectsBulkUpdateOptions, SavedObjectsBulkUpdateResponse } from '@kbn/core/server';
import type { RawRule } from '../../../types';
export interface BulkUpdateRuleSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    rules: Array<{
        id: string;
        attributes: Partial<RawRule>;
    }>;
    options?: SavedObjectsBulkUpdateOptions;
}
export declare const bulkUpdateRuleSo: (params: BulkUpdateRuleSoParams) => Promise<SavedObjectsBulkUpdateResponse<RawRule>>;
