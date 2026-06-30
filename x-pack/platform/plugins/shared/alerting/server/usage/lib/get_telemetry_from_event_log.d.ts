import type { AggregationsKeyedPercentiles, AggregationsSingleBucketAggregateBase, AggregationsPercentilesAggregateBase, AggregationsSingleMetricAggregateBase, AggregationsTermsAggregateBase, AggregationsStringTermsBucketKeys } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
interface Opts {
    esClient: ElasticsearchClient;
    eventLogIndex: string;
    logger: Logger;
}
interface GetExecutionsPerDayCountResults {
    hasErrors: boolean;
    errorMessage?: string;
    countTotalRuleExecutions: number;
    countRuleExecutionsByType: Record<string, number>;
    countTotalFailedExecutions: number;
    countFailedExecutionsByReason: Record<string, number>;
    countFailedExecutionsByReasonByType: Record<string, Record<string, number>>;
    avgExecutionTime: number;
    avgExecutionTimeByType: Record<string, number>;
    avgEsSearchDuration: number;
    avgEsSearchDurationByType: Record<string, number>;
    avgTotalSearchDuration: number;
    avgTotalSearchDurationByType: Record<string, number>;
    generatedActionsPercentiles: Record<string, number>;
    generatedActionsPercentilesByType: Record<string, Record<string, number>>;
    alertsPercentiles: Record<string, number>;
    alertsPercentilesByType: Record<string, Record<string, number>>;
    countRulesByExecutionStatus: Record<string, number>;
}
interface GetExecutionTimeoutsPerDayCountResults {
    hasErrors: boolean;
    errorMessage?: string;
    countExecutionTimeouts: number;
    countExecutionTimeoutsByType: Record<string, number>;
}
interface GetExecutionCountsExecutionFailures extends AggregationsSingleBucketAggregateBase {
    by_reason: AggregationsTermsAggregateBase<AggregationsStringTermsBucketKeys>;
}
interface GetExecutionCountsAggregationBucket extends AggregationsStringTermsBucketKeys {
    avg_execution_time: AggregationsSingleMetricAggregateBase;
    avg_es_search_duration: AggregationsSingleMetricAggregateBase;
    avg_total_search_duration: AggregationsSingleMetricAggregateBase;
    execution_failures: GetExecutionCountsExecutionFailures;
    percentile_scheduled_actions: AggregationsPercentilesAggregateBase;
    percentile_alerts: AggregationsPercentilesAggregateBase;
}
interface IGetExecutionFailures extends AggregationsSingleBucketAggregateBase {
    by_reason: AggregationsTermsAggregateBase<AggregationsStringTermsBucketKeys>;
}
export declare function getExecutionsPerDayCount({ esClient, eventLogIndex, logger, }: Opts): Promise<GetExecutionsPerDayCountResults>;
export declare function getExecutionTimeoutsPerDayCount({ esClient, eventLogIndex, logger, }: Opts): Promise<GetExecutionTimeoutsPerDayCountResults>;
/**
 * Bucket format:
 * {
 *   key: '.index-threshold',             // rule type id
 *   doc_count: 78,                       // count of number of executions
 *   avg_es_search_duration: {            // average es search duration across executions
 *     value: 40.76056338028169,
 *   },
 *   percentile_alerts: {                 // stats for number of alerts created across executions
 *     values: {
 *       '50.0': 1,
 *       '95.0': 1,
 *       '99.0': 1,
 *     },
 *   },
 *   execution_failures: {
 *     doc_count: 7,                      // count of number of failed executions
 *     by_reason: {
 *       doc_count_error_upper_bound: 0,
 *       sum_other_doc_count: 0,
 *       buckets: [
 *         {
 *           key: 'execute',              // breakdown of reason for execution failures
 *           doc_count: 4,
 *         },
 *         {
 *           key: 'decrypt',
 *           doc_count: 3,
 *         },
 *       ],
 *     },
 *   },
 *   percentile_scheduled_actions: {      // stats for number of actions generated across executions
 *     values: {
 *       '50.0': 0,
 *       '95.0': 0,
 *       '99.0': 0,
 *     },
 *   },
 *   avg_execution_time: {                // average execution time in nanoseconds across executions
 *     value: 100576923.07692307,
 *   },
 *   avg_total_search_duration: {         // average total search duration across executions
 *     value: 43.74647887323944,
 *   },
 *   by_execution_status: {
 *      "doc_count_error_upper_bound":0,
 *      "sum_other_doc_count":0,
 *      "buckets":[
 *        {"key":"success","doc_count":48},
 *        {"key":"failure","doc_count":1}
 *      ]
 *   }
 * }
 */
export declare function parseRuleTypeBucket(buckets: GetExecutionCountsAggregationBucket[]): Pick<GetExecutionsPerDayCountResults, 'countRuleExecutionsByType' | 'avgExecutionTimeByType' | 'avgEsSearchDurationByType' | 'avgTotalSearchDurationByType' | 'generatedActionsPercentilesByType' | 'alertsPercentilesByType'>;
export declare function parseExecutionFailureByRuleType(buckets: GetExecutionCountsAggregationBucket[]): Pick<GetExecutionsPerDayCountResults, 'countFailedExecutionsByReasonByType'>;
export declare function parsePercentileAggs(percentiles: AggregationsKeyedPercentiles, ruleTypeId?: string): {};
/**
 * Aggregation Result Format (minus rule type id agg buckets)
 * {
 *   avg_es_search_duration: {
 *     value: 26.246376811594203,
 *   },
 *   percentile_alerts: {
 *     values: {
 *       '50.0': 1,
 *       '90.0': 5,
 *       '99.0': 5,
 *     },
 *   },
 *   execution_failures: {
 *     doc_count: 10,
 *     by_reason: {
 *       doc_count_error_upper_bound: 0,
 *       sum_other_doc_count: 0,
 *       buckets: [
 *         {
 *           key: 'decrypt',
 *           doc_count: 6,
 *         },
 *         {
 *           key: 'execute',
 *           doc_count: 4,
 *         },
 *       ],
 *     },
 *   },
 *   percentile_scheduled_actions: {
 *     values: {
 *       '50.0': 0,
 *       '95.0': 5,
 *       '99.0': 5,
 *     },
 *   },
 *   avg_execution_time: {
 *     value: 288250000,
 *   },
 *   avg_total_search_duration: {
 *     value: 28.630434782608695,
 *   },
 */
export declare function parseExecutionCountAggregationResults(results: {
    execution_failures: IGetExecutionFailures;
    percentile_scheduled_actions: AggregationsPercentilesAggregateBase;
    percentile_alerts: AggregationsPercentilesAggregateBase;
    avg_execution_time: AggregationsSingleMetricAggregateBase;
    avg_es_search_duration: AggregationsSingleMetricAggregateBase;
    avg_total_search_duration: AggregationsSingleMetricAggregateBase;
}): Pick<GetExecutionsPerDayCountResults, 'countTotalFailedExecutions' | 'countFailedExecutionsByReason' | 'avgExecutionTime' | 'avgEsSearchDuration' | 'avgTotalSearchDuration' | 'generatedActionsPercentiles' | 'alertsPercentiles'>;
export declare function getProviderAndActionFilterForTimeRange(action: string, provider?: string, range?: string): {
    bool: {
        filter: {
            bool: {
                must: ({
                    term: {
                        'event.action': string;
                        "event.provider"?: undefined;
                    };
                    range?: undefined;
                } | {
                    term: {
                        'event.provider': string;
                        "event.action"?: undefined;
                    };
                    range?: undefined;
                } | {
                    range: {
                        '@timestamp': {
                            gte: string;
                        };
                    };
                    term?: undefined;
                })[];
            };
        };
    };
};
export {};
