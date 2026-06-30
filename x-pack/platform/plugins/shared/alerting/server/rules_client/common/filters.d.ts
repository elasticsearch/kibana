import type { KueryNode } from '@kbn/es-query';
export declare const NodeBuilderOperators: {
    readonly and: "and";
    readonly or: "or";
};
type NodeBuilderOperatorsType = keyof typeof NodeBuilderOperators;
interface FilterField {
    filters?: string | string[];
    field: string;
    operator: NodeBuilderOperatorsType;
    type?: string;
}
export declare const buildFilter: ({ filters, field, operator, type, }: FilterField) => KueryNode | undefined;
export declare const buildRuleTypeIdsFilter: (ruleTypeIds?: string[], type?: string) => KueryNode | undefined;
export declare const buildConsumersFilter: (consumers?: string[], type?: string) => KueryNode | undefined;
export declare const buildTagsFilter: (tags?: string[], type?: string) => KueryNode | undefined;
/**
 * Combines Kuery nodes and accepts an array with a mixture of undefined and KueryNodes. This will filter out the undefined
 * filters and return a KueryNode with the filters combined using the specified operator which defaults to and if not defined.
 */
export declare function combineFilters(nodes: Array<KueryNode | undefined | null>, operator?: NodeBuilderOperatorsType): KueryNode | undefined;
export declare const combineFilterWithAuthorizationFilter: (filter?: KueryNode, authorizationFilter?: KueryNode) => KueryNode | undefined;
export {};
