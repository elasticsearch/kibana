import type { RuleParamsV1, RuleResponseV1 } from '../../../response';
export interface ResolveRuleResponse<Params extends RuleParamsV1 = never> {
    body: RuleResponseV1<Params>;
}
