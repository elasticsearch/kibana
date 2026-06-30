import type { AggregationsAggregationContainer } from '@elastic/elasticsearch/lib/api/types';
import type { DefaultRuleAggregationParams } from '../../types';
export declare const defaultRuleAggregationFactory: (params?: DefaultRuleAggregationParams) => Record<string, AggregationsAggregationContainer>;
