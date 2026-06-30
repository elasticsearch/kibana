import type { AggregationsTermsAggregateBase, AggregationsStringTermsBucketKeys } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
interface Opts {
    esClient: ElasticsearchClient;
    taskManagerIndex: string;
    logger: Logger;
}
interface GetFailedAndUnrecognizedTasksAggregationBucket extends AggregationsStringTermsBucketKeys {
    by_task_type: AggregationsTermsAggregateBase<AggregationsStringTermsBucketKeys>;
}
interface GetFailedAndUnrecognizedTasksResults {
    hasErrors: boolean;
    errorMessage?: string;
    countFailedAndUnrecognizedTasks: number;
    countFailedAndUnrecognizedTasksByStatus: Record<string, number>;
    countFailedAndUnrecognizedTasksByStatusByType: Record<string, Record<string, number>>;
}
export declare function getFailedAndUnrecognizedTasksPerDay({ esClient, taskManagerIndex, logger, }: Opts): Promise<GetFailedAndUnrecognizedTasksResults>;
/**
 * Bucket format:
 * {
 *   "key": "idle",                   // task status
 *   "doc_count": 28,                 // number of tasks with this status
 *   "by_task_type": {
 *     "doc_count_error_upper_bound": 0,
 *     "sum_other_doc_count": 0,
 *     "buckets": [
 *       {
 *         "key": "alerting:.es-query", // breakdown of task type for status
 *         "doc_count": 1
 *       },
 *       {
 *         "key": "alerting:.index-threshold",
 *         "doc_count": 1
 *       }
 *     ]
 *   }
 * }
 */
export declare function parseBucket(buckets: GetFailedAndUnrecognizedTasksAggregationBucket[]): Pick<GetFailedAndUnrecognizedTasksResults, 'countFailedAndUnrecognizedTasksByStatus' | 'countFailedAndUnrecognizedTasksByStatusByType'>;
export {};
