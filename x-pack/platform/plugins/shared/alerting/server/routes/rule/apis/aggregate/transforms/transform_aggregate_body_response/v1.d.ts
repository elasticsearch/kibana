import type { RuleAggregationFormattedResult } from '../../../../../../application/rule/methods/aggregate/types';
import type { AggregateRulesResponseBodyV1 } from '../../../../../../../common/routes/rule/apis/aggregate';
export declare const transformAggregateBodyResponse: ({ ruleExecutionStatus, ruleEnabledStatus, ruleLastRunOutcome, ruleMutedStatus, ruleSnoozedStatus, ruleTags, }: RuleAggregationFormattedResult) => AggregateRulesResponseBodyV1;
