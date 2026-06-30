import type { RuleFormProps } from '../src/rule_form';
type RequiredRuleFormPlugins = Omit<RuleFormProps['plugins'], 'actionTypeRegistry' | 'ruleTypeRegistry'>;
export declare const isValidRuleFormPlugins: (input: unknown) => input is RequiredRuleFormPlugins;
export {};
