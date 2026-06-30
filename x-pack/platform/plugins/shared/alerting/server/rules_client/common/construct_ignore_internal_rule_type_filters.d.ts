import type { KueryNode } from '@kbn/es-query';
import type { RegistryRuleType } from '../../rule_type_registry';
export declare const constructIgnoreInternalRuleTypesFilter: ({ ruleTypes, }: {
    ruleTypes: Map<string, RegistryRuleType>;
}) => KueryNode | null;
export declare const combineFiltersWithInternalRuleTypeFilter: ({ filter, internalRuleTypeFilter, }: {
    filter: KueryNode | null;
    internalRuleTypeFilter: KueryNode | null;
}) => KueryNode | null;
