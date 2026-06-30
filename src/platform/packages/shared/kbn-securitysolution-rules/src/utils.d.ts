import type { RuleType, RuleTypeId } from './rule_type_mappings';
export declare const isRuleType: (ruleType: unknown) => ruleType is RuleType;
export declare const isRuleTypeId: (ruleTypeId: unknown) => ruleTypeId is RuleTypeId;
type SearchTypes = string | number | boolean | object | SearchTypes[] | undefined;
export declare const flattenWithPrefix: (prefix: string, maybeObj: unknown) => Record<string, SearchTypes>;
export {};
