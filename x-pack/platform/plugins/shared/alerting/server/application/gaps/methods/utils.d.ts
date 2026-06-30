import type { AggregationsSumAggregate } from '@elastic/elasticsearch/lib/api/types';
import type { GapFillStatus } from '../../../../common';
export interface SchedulerContext {
    enabled: boolean;
    numRetries: number;
}
export interface GapDurationSums {
    totalUnfilledDurationMs: number;
    totalInProgressDurationMs: number;
    totalFilledDurationMs: number;
    totalDurationMs: number;
}
/**
 * Extracts and normalizes gap duration sums from an aggregation bucket
 */
export declare function extractGapDurationSums(bucket: GapDurationBucket): GapDurationSums;
/**
 * Calculates aggregated gap fill status based on duration sums
 * Precedence: error > unfilled > in_progress > filled
 *
 * @param hasExhaustedRetryGaps - true when at least one gap for this rule is
 *   both unfilled AND has exhausted all auto-fill retry attempts. This is
 *   determined by a filtered ES aggregation built at query time.
 */
export declare function calculateHighestPriorityGapFillStatus(sums: GapDurationSums, hasExhaustedRetryGaps?: boolean): GapFillStatus | null;
/**
 * Common aggregation fields for gap duration tracking
 */
export declare const RULE_GAP_AGGREGATIONS: {
    readonly totalUnfilledDurationMs: {
        readonly sum: {
            readonly field: "kibana.alert.rule.gap.unfilled_duration_ms";
        };
    };
    readonly totalInProgressDurationMs: {
        readonly sum: {
            readonly field: "kibana.alert.rule.gap.in_progress_duration_ms";
        };
    };
    readonly totalFilledDurationMs: {
        readonly sum: {
            readonly field: "kibana.alert.rule.gap.filled_duration_ms";
        };
    };
    readonly totalDurationMs: {
        readonly sum: {
            readonly field: "kibana.alert.rule.gap.total_gap_duration_ms";
        };
    };
};
export type GapDurationBucket = {
    key: string;
} & Partial<Record<keyof typeof RULE_GAP_AGGREGATIONS, AggregationsSumAggregate>>;
/**
 * Builds a dynamic sub-aggregation that counts gaps which are both unfilled
 * AND have exhausted all auto-fill retry attempts. Only added when scheduler
 * context is available.
 */
export declare function buildExhaustedRetryGapsAgg(schedulerContext: SchedulerContext): {
    exhaustedRetryGaps: {
        filter: {
            bool: {
                must: ({
                    range: {
                        'kibana.alert.rule.gap.unfilled_duration_ms': {
                            gt: number;
                        };
                        'kibana.alert.rule.gap.failed_auto_fill_attempts'?: undefined;
                    };
                } | {
                    range: {
                        'kibana.alert.rule.gap.failed_auto_fill_attempts': {
                            gte: number;
                        };
                        'kibana.alert.rule.gap.unfilled_duration_ms'?: undefined;
                    };
                })[];
            };
        };
        aggs: {
            totalUnfilledDurationMs: {
                sum: {
                    field: string;
                };
            };
        };
    };
};
export interface ExhaustedRetryGapsInfo {
    hasExhaustedRetryGaps: boolean;
    exhaustedRetryUnfilledDurationMs: number;
}
/**
 * Extracts exhausted retry gaps info from a rule bucket:
 * whether any such gaps exist and their total unfilled duration.
 */
export declare function getExhaustedRetryGapsInfo(bucket: Record<string, unknown>): ExhaustedRetryGapsInfo;
/**
 * Checks if the gap fill status of the bucket matches the given gap fill statuses
 */
export declare const hasMatchedGapFillStatus: (bucket: GapDurationBucket, gapFillStatuses: GapFillStatus[], exhaustedRetryGaps?: boolean) => boolean;
