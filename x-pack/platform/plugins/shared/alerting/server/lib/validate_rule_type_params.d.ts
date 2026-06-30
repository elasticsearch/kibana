import type { RuleTypeParams, RuleTypeParamsValidator } from '../types';
export declare function validateRuleTypeParams<Params extends RuleTypeParams>(params: Record<string, unknown>, validator?: RuleTypeParamsValidator<Params>): Params;
