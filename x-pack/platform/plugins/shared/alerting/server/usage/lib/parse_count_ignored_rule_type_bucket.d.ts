import type { AggregationsBuckets, AggregationsStringTermsBucketKeys } from '@elastic/elasticsearch/lib/api/types';
export declare function parseCountIgnoreRuleTypeBucket(ruleTypeBuckets: AggregationsBuckets<AggregationsStringTermsBucketKeys>): Record<string, number>;
