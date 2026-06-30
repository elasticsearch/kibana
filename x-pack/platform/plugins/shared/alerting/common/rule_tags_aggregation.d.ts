import type { AggregationsAggregationContainer, AggregationsCompositeAggregation } from '@elastic/elasticsearch/lib/api/types';
import type { AggregateOptions } from '../server/application/rule/methods/aggregate/types';
export type RuleTagsAggregationOptions = Pick<AggregateOptions, 'filter' | 'search'> & {
    after?: AggregationsCompositeAggregation['after'];
    maxTags?: number;
};
export interface RuleTagsAggregationFormattedResult {
    ruleTags: string[];
}
export interface RuleTagsAggregationResult {
    tags: {
        buckets: Array<{
            key: {
                tags: string;
            };
            doc_count: number;
        }>;
    };
}
interface GetRuleTagsAggregationParams {
    maxTags?: number;
    after?: AggregationsCompositeAggregation['after'];
}
export declare const getRuleTagsAggregation: (params?: GetRuleTagsAggregationParams) => Record<string, AggregationsAggregationContainer>;
export declare const formatRuleTagsAggregationResult: (aggregations: RuleTagsAggregationResult) => RuleTagsAggregationFormattedResult;
export {};
