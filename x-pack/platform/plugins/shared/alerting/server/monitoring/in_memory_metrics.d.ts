import type { Logger } from '@kbn/logging';
export declare enum IN_MEMORY_METRICS {
    RULE_EXECUTIONS = "ruleExecutions",
    RULE_FAILURES = "ruleFailures",
    RULE_TIMEOUTS = "ruleTimeouts"
}
export declare class InMemoryMetrics {
    private logger;
    private inMemoryMetrics;
    constructor(logger: Logger);
    increment(metric: IN_MEMORY_METRICS): void;
    getInMemoryMetric(metric: IN_MEMORY_METRICS): number | null;
    getAllInMemoryMetrics(): Record<IN_MEMORY_METRICS, number | null>;
}
