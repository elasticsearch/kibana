import type { AggregateRulesResponse, LoadRuleAggregationsProps } from './aggregate_helpers';
export declare function loadRuleAggregationsWithKueryFilter({ http, searchText, actionTypesFilter, ruleExecutionStatusesFilter, ruleStatusesFilter, tagsFilter, ruleTypeIds, consumers, }: LoadRuleAggregationsProps): Promise<AggregateRulesResponse>;
