import type { SavedObjectsClientContract, SavedObjectsCreateOptions, SavedObject } from '@kbn/core/server';
import type { RawRule } from '../../../types';
export interface CreateRuleSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    ruleAttributes: RawRule;
    savedObjectsCreateOptions?: SavedObjectsCreateOptions;
}
export declare const createRuleSo: (params: CreateRuleSoParams) => Promise<SavedObject<RawRule>>;
