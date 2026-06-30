import type { AggregationsAggregationContainer } from '@elastic/elasticsearch/lib/api/types';
export interface BuildAggregationOpts {
    timeSeries?: {
        timeField: string;
        dateStart?: string;
        dateEnd?: string;
        interval?: string;
        timeWindowSize: number;
        timeWindowUnit: string;
    };
    aggType: string;
    aggField?: string;
    termSize?: number;
    termField?: string | string[];
    topHitsSize?: number;
    condition?: {
        resultLimit?: number;
        conditionScript: string;
    };
    loggerCb?: (message: string) => void;
}
export declare const BUCKET_SELECTOR_FIELD = "params.compareValue";
export declare const DEFAULT_GROUPS = 100;
export declare const isCountAggregation: (aggType: string) => aggType is "count";
export declare const isGroupAggregation: (termField?: string | string[]) => boolean;
export declare const isPerRowAggregation: (groupBy?: string) => groupBy is "row";
export declare const buildAggregation: ({ timeSeries, aggType, aggField, termField, termSize, condition, topHitsSize, loggerCb, }: BuildAggregationOpts) => Record<string, AggregationsAggregationContainer>;
