import type { RuleTypeRegistry } from '../rule_type_registry';
export type GetAlertIndicesAlias = (rulesTypes: string[], spaceId?: string) => string[];
export declare function createGetAlertIndicesAliasFn(ruleTypeRegistry: RuleTypeRegistry): (rulesTypes: string[], spaceId?: string) => string[];
