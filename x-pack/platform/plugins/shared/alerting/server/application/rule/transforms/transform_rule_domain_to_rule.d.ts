import type { RuleDomain, Rule, RuleParams } from '../types';
export declare const transformRuleDomainToRule: <Params extends RuleParams = never>(ruleDomain: RuleDomain<Params>) => Rule<Params>;
