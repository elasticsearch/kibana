import type { SavedObjectsClientContract, SavedObjectsResolveResponse } from '@kbn/core/server';
import type { SavedObjectsResolveOptions } from '@kbn/core-saved-objects-api-server';
import type { RawRule } from '../../../types';
export interface ResolveRuleSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    id: string;
    savedObjectsResolveOptions?: SavedObjectsResolveOptions;
}
export declare const resolveRuleSo: (params: ResolveRuleSoParams) => Promise<SavedObjectsResolveResponse<RawRule>>;
