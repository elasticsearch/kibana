import type { SavedObjectsClientContract, SavedObjectsUpdateOptions, SavedObjectsUpdateResponse } from '@kbn/core/server';
import type { RawRule } from '../../../types';
export interface UpdateRuleSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    id: string;
    updateRuleAttributes: Partial<RawRule>;
    savedObjectsUpdateOptions?: SavedObjectsUpdateOptions<RawRule>;
}
export declare const updateRuleSo: (params: UpdateRuleSoParams) => Promise<SavedObjectsUpdateResponse<RawRule>>;
