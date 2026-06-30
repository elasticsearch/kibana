import type { SavedObjectsClientContract, SavedObject } from '@kbn/core/server';
import type { SavedObjectsGetOptions } from '@kbn/core-saved-objects-api-server';
import type { RawRuleTemplate } from '../../../types';
export interface GetRuleTemplateSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    id: string;
    savedObjectsGetOptions?: SavedObjectsGetOptions;
}
export declare const getRuleTemplateSo: (params: GetRuleTemplateSoParams) => Promise<SavedObject<RawRuleTemplate>>;
