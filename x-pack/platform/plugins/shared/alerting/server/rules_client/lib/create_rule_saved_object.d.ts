import type { SavedObjectReference, SavedObject } from '@kbn/core/server';
import type { Rule, RuleWithLegacyId, RawRule, RuleTypeParams } from '../../types';
import type { SavedObjectOptions } from '../types';
import type { RulesClientContext } from '../types';
interface CreateRuleSavedObjectParams {
    intervalInMs: number;
    rawRule: RawRule;
    references: SavedObjectReference[];
    ruleId: string;
    options?: SavedObjectOptions;
    returnRuleAttributes?: false;
}
interface CreateRuleSavedObjectAttributeParams {
    intervalInMs: number;
    rawRule: RawRule;
    references: SavedObjectReference[];
    ruleId: string;
    options?: SavedObjectOptions;
    returnRuleAttributes: true;
}
export declare function createRuleSavedObject<Params extends RuleTypeParams = never>(context: RulesClientContext, params: CreateRuleSavedObjectParams): Promise<Rule<Params> | RuleWithLegacyId<Params>>;
export declare function createRuleSavedObject<Params extends RuleTypeParams = never>(context: RulesClientContext, params: CreateRuleSavedObjectAttributeParams): Promise<SavedObject<RawRule>>;
export {};
