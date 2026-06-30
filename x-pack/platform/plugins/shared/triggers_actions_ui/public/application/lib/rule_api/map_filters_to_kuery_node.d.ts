import type { KueryNode } from '@kbn/es-query';
import type { RuleStatus } from '../../../types';
export declare const mapFiltersToKueryNode: ({ typesFilter, actionTypesFilter, ruleExecutionStatusesFilter, ruleLastRunOutcomesFilter, ruleParamsFilter, ruleStatusesFilter, tagsFilter, searchText, kueryNode, }: {
    typesFilter?: string[];
    actionTypesFilter?: string[];
    tagsFilter?: string[];
    ruleExecutionStatusesFilter?: string[];
    ruleLastRunOutcomesFilter?: string[];
    ruleParamsFilter?: Record<string, string | number | object>;
    ruleStatusesFilter?: RuleStatus[];
    searchText?: string;
    kueryNode?: KueryNode;
}) => KueryNode | null;
