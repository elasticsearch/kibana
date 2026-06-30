import type { RuleTypeParams, RawRule } from '../../types';
import type { UpdateRuleData } from '../../application/rule/methods/update';
export declare function incrementRevision<Params extends RuleTypeParams>({ originalRule, updateRuleData, updatedParams, }: {
    originalRule: RawRule;
    updateRuleData: UpdateRuleData<Params>;
    updatedParams: RuleTypeParams;
}): number;
