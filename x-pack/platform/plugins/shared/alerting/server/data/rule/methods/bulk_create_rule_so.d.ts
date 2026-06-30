import type { SavedObjectsClientContract, SavedObjectsCreateOptions, SavedObjectsBulkCreateObject, SavedObjectsBulkResponse } from '@kbn/core/server';
import type { RawRule } from '../../../types';
export interface BulkCreateRulesSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    bulkCreateRuleAttributes: Array<SavedObjectsBulkCreateObject<RawRule>>;
    savedObjectsBulkCreateOptions?: SavedObjectsCreateOptions;
}
export declare const bulkCreateRulesSo: (params: BulkCreateRulesSoParams) => Promise<SavedObjectsBulkResponse<RawRule>>;
