import type { SavedObjectsClientContract, SavedObjectsFindOptions, SavedObjectsFindResponse } from '@kbn/core/server';
import type { RawRuleTemplate } from '../../../types';
export interface FindRuleTemplatesSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    savedObjectsFindOptions: Omit<SavedObjectsFindOptions, 'type'>;
}
export declare const findRuleTemplatesSo: (params: FindRuleTemplatesSoParams) => Promise<SavedObjectsFindResponse<RawRuleTemplate>>;
