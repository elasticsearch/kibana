import type { RuleAlertData } from '../../types';
/**
 * Remove framework fields from the alert payload reported by
 * the rule type. Fields are considered framework fields if they are
 * defined in the "alertFieldMap". Framework fields should only be
 * set by the alerting framework during rule execution.
 */
export declare const stripFrameworkFields: <AlertData extends RuleAlertData>(payload?: AlertData) => AlertData;
