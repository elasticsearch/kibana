import type { SavedObjectsClientContract, SavedObjectsCreateOptions, SavedObjectsBulkCreateObject, SavedObjectsBulkResponse } from '@kbn/core/server';
import type { RawRule } from '../../../types';
export interface BulkDisableRulesSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    bulkDisableRuleAttributes: Array<SavedObjectsBulkCreateObject<RawRule>>;
    savedObjectsBulkCreateOptions?: SavedObjectsCreateOptions;
}
export declare const bulkDisableRulesSo: (params: BulkDisableRulesSoParams) => Promise<SavedObjectsBulkResponse<RawRule>>;
