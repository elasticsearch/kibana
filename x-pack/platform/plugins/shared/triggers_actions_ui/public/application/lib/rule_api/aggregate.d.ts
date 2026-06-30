import type { LoadRuleAggregationsProps, AggregateRulesResponse } from './aggregate_helpers';
export declare function loadRuleAggregations({ http, searchText, actionTypesFilter, ruleExecutionStatusesFilter, ruleStatusesFilter, tagsFilter, ruleTypeIds, consumers, }: LoadRuleAggregationsProps): Promise<AggregateRulesResponse>;
