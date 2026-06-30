import type { Logger } from '@kbn/core/server';
import type { RuleMonitoring, RawRuleMonitoring, RuleMonitoringHistory } from '../types';
import type { RuleDomain } from '../application/rule/types';
export declare const getDefaultMonitoring: (timestamp: string) => RawRuleMonitoring;
export declare const getDefaultMonitoringRuleDomainProperties: (timestamp: string) => RuleDomain["monitoring"];
export declare const resetMonitoringLastRun: (monitoring: RuleMonitoring) => RawRuleMonitoring;
export declare const updateMonitoring: ({ monitoring, timestamp, duration, }: {
    monitoring: RuleMonitoring;
    timestamp: string;
    duration?: number;
}) => RawRuleMonitoring;
export declare const convertMonitoringFromRawAndVerify: (logger: Logger, ruleId: string, monitoring: RawRuleMonitoring) => RuleMonitoring | undefined;
export declare const getExecutionDurationPercentiles: (history: RuleMonitoringHistory[]) => {
    p50: number;
    p95: number;
    p99: number;
} | {
    p50?: undefined;
    p95?: undefined;
    p99?: undefined;
};
