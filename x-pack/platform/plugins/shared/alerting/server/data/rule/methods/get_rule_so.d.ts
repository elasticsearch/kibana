import type { SavedObjectsClientContract, SavedObject } from '@kbn/core/server';
import type { SavedObjectsGetOptions } from '@kbn/core-saved-objects-api-server';
import type { RawRule } from '../../../types';
export interface GetRuleSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    id: string;
    savedObjectsGetOptions?: SavedObjectsGetOptions;
}
export declare const getRuleSo: (params: GetRuleSoParams) => Promise<SavedObject<RawRule>>;
