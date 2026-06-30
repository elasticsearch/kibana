import type { RuleStatus } from '../../../types';
export declare const mapFiltersToKql: ({ typesFilter, actionTypesFilter, ruleExecutionStatusesFilter, ruleStatusesFilter, tagsFilter, }: {
    typesFilter?: string[];
    actionTypesFilter?: string[];
    tagsFilter?: string[];
    ruleExecutionStatusesFilter?: string[];
    ruleStatusesFilter?: RuleStatus[];
}) => string[];
