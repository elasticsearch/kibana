import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { SavedObjectsBulkResponse, SavedObjectsGetOptions } from '@kbn/core-saved-objects-api-server';
import type { RawRule } from '../../../types';
export interface BulkGetRulesSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    ids: string[];
    savedObjectsGetOptions?: SavedObjectsGetOptions;
}
export declare const bulkGetRulesSo: (params: BulkGetRulesSoParams) => Promise<SavedObjectsBulkResponse<RawRule>>;
