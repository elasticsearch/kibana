import type { AggregationsBuckets, AggregationsStringTermsBucketKeys } from '@elastic/elasticsearch/lib/api/types';
export declare function parseSimpleRuleTypeBucket(ruleTypeBuckets: AggregationsBuckets<AggregationsStringTermsBucketKeys>): Record<string, number>;
