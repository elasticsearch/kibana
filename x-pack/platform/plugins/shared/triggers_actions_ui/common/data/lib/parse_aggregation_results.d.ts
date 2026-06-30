import type { SearchResponse, SearchHit } from '@elastic/elasticsearch/lib/api/types';
import type { Group } from '@kbn/alerting-rule-utils';
export declare const UngroupedGroupId = "all documents";
export interface ParsedAggregationGroup {
    group: string;
    count: number;
    hits: Array<SearchHit<unknown>>;
    sourceFields: string[];
    groups?: Group[];
    groupingObject?: Record<string, unknown>;
    value?: number;
}
export interface ParsedAggregationResults {
    results: ParsedAggregationGroup[];
    truncated: boolean;
}
export interface ParseAggregationResultsOpts {
    isCountAgg: boolean;
    isGroupAgg: boolean;
    esResult: SearchResponse<unknown>;
    resultLimit?: number;
    sourceFieldsParams?: Array<{
        label: string;
        searchPath: string;
    }>;
    generateSourceFieldsFromHits?: boolean;
    termField?: string | string[];
}
export declare const parseAggregationResults: ({ isCountAgg, isGroupAgg, esResult, resultLimit, sourceFieldsParams, generateSourceFieldsFromHits, termField, }: ParseAggregationResultsOpts) => ParsedAggregationResults;
