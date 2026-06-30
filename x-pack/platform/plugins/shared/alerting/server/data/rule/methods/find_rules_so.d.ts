import type { SavedObjectsClientContract, SavedObjectsFindOptions, SavedObjectsFindResponse } from '@kbn/core/server';
import type { RawRule } from '../../../types';
export interface FindRulesSoParams {
    savedObjectsClient: SavedObjectsClientContract;
    savedObjectsFindOptions: Omit<SavedObjectsFindOptions, 'type'>;
}
export declare const findRulesSo: <RuleAggregation = Record<string, unknown>>(params: FindRulesSoParams) => Promise<SavedObjectsFindResponse<RawRule, RuleAggregation>>;
