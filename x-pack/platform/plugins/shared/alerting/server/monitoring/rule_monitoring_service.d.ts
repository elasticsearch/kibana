import type { RuleMonitoring, PublicRuleMonitoringService, ConsumerExecutionMetrics } from '../types';
interface FrameworkMetrics {
    total_search_duration_ms: number;
}
export declare class RuleMonitoringService {
    private monitoring;
    private frameworkMetrics;
    private metrics;
    setLastRunMetricsDuration(duration: number): void;
    setMonitoring(monitoringFromSO: RuleMonitoring | undefined): void;
    getMonitoring(): RuleMonitoring;
    getExecutorMetrics(): Partial<ConsumerExecutionMetrics> | undefined;
    addFrameworkMetrics(fwkMetrics: Partial<FrameworkMetrics>): void;
    addHistory({ duration, hasError, runDate, }: {
        duration: number | undefined;
        hasError: boolean;
        runDate: Date;
    }): void;
    getSetters(): PublicRuleMonitoringService;
    private clearGap;
    private buildExecutionSuccessRatio;
    private buildExecutionDurationPercentiles;
    private setMetric;
    private setMetrics;
}
export {};
