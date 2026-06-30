import type { AggregationsAggregationContainer } from '@elastic/elasticsearch/lib/api/types';
import type { TypeOf } from '@kbn/config-schema';
import type { KueryNode } from '@kbn/es-query';
import type { aggregateOptionsSchema } from '../schemas';
export type AggregateOptions = TypeOf<typeof aggregateOptionsSchema> & {
    filter?: string | KueryNode;
};
export interface AggregateParams<AggregationResult> {
    options?: AggregateOptions;
    aggs: Record<keyof AggregationResult, AggregationsAggregationContainer>;
}
export interface DefaultRuleAggregationParams {
    maxTags?: number;
}
export interface RuleAggregationFormattedResult {
    ruleExecutionStatus: Record<string, number>;
    ruleLastRunOutcome: Record<string, number>;
    ruleEnabledStatus: {
        enabled: number;
        disabled: number;
    };
    ruleMutedStatus: {
        muted: number;
        unmuted: number;
    };
    ruleSnoozedStatus: {
        snoozed: number;
    };
    ruleTags: string[];
}
