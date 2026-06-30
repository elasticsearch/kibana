import type { Rule } from '../../../types';
import type { LoadRulesProps } from './rules_helpers';
export declare function loadRulesWithKueryFilter({ http, page, searchText, typesFilter, actionTypesFilter, ruleExecutionStatusesFilter, ruleLastRunOutcomesFilter, ruleParamsFilter, ruleStatusesFilter, tagsFilter, sort, kueryNode, ruleTypeIds, hasReference, consumers, }: LoadRulesProps): Promise<{
    page: number;
    perPage: number;
    total: number;
    data: Rule[];
}>;
