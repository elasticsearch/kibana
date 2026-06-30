import type { SavedObjectsResolveResponse } from '@kbn/core/server';
import type { RulesClientContext } from '../types';
import type { RawRule } from '../../types';
interface ResolveRuleSavedObjectParams {
    ruleId: string;
}
export declare function resolveRuleSavedObject(context: RulesClientContext, params: ResolveRuleSavedObjectParams): Promise<SavedObjectsResolveResponse<RawRule>>;
export {};
