import type { AlertRule, AlertRuleData } from '../types';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
interface FormatRuleOpts {
    rule: AlertRuleData;
    ruleType: UntypedNormalizedRuleType;
}
export declare const formatRule: ({ rule, ruleType }: FormatRuleOpts) => AlertRule;
export {};
