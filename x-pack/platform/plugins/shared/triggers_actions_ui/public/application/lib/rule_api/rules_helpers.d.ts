import type { HttpSetup } from '@kbn/core/public';
import type { AsApiContract } from '@kbn/actions-plugin/common';
import type { KueryNode } from '@kbn/es-query';
import type { Rule, Pagination, Sorting, RuleStatus } from '../../../types';
export interface LoadRulesProps {
    http: HttpSetup;
    page: Pagination;
    searchText?: string;
    typesFilter?: string[];
    actionTypesFilter?: string[];
    tagsFilter?: string[];
    ruleExecutionStatusesFilter?: string[];
    ruleLastRunOutcomesFilter?: string[];
    ruleParamsFilter?: Record<string, string | number | object>;
    ruleStatusesFilter?: RuleStatus[];
    sort?: Sorting;
    kueryNode?: KueryNode;
    ruleTypeIds?: string[];
    consumers?: string[];
    hasReference?: {
        type: string;
        id: string;
    };
}
export declare const rewriteRulesResponseRes: (results: Array<AsApiContract<Rule>>) => Rule[];
