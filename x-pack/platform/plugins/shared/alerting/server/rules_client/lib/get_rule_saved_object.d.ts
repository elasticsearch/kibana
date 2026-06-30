import type { SavedObject } from '@kbn/core/server';
import type { RulesClientContext } from '../types';
import type { RawRule } from '../../types';
interface GetRuleSavedObjectParams {
    ruleId: string;
}
export declare function getRuleSavedObject(context: RulesClientContext, params: GetRuleSavedObjectParams): Promise<SavedObject<RawRule>>;
export {};
