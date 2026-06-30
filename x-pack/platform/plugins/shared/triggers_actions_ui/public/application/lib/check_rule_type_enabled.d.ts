import type { RuleType } from '../../types';
export interface IsEnabledResult {
    isEnabled: true;
}
export interface IsDisabledResult {
    isEnabled: false;
    message: string;
}
export declare function checkRuleTypeEnabled(ruleType?: RuleType): IsEnabledResult | IsDisabledResult;
