import type { RuleTypeParams, RuleTypeParamsValidator } from '../types';
export declare function validateMutatedRuleTypeParams<Params extends RuleTypeParams>(mutatedParams: Params, origParams?: Params, validator?: RuleTypeParamsValidator<Params>): Params;
