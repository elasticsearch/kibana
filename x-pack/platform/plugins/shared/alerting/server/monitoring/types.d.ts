import type { MetricResult } from '@kbn/monitoring-collection-plugin/server';
export declare const EMPTY_CLUSTER_RULES_METRICS: ClusterRulesMetric;
export type ClusterRulesMetric = MetricResult<{
    overdue: {
        count: number;
        delay: {
            p50: number;
            p99: number;
        };
    };
}>;
export type NodeRulesMetric = MetricResult<{
    failures: number | null;
    executions: number | null;
    timeouts: number | null;
}>;
