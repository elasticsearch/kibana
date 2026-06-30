import type { RawRuleLastRun, RuleLastRun } from '../types';
import type { RuleRunMetrics } from './rule_run_metrics_store';
import type { RuleResultService } from '../monitoring/rule_result_service';
export interface ILastRun {
    lastRun: RuleLastRun;
    metrics: RuleRunMetrics | null;
}
export declare const lastRunFromState: (metrics: RuleRunMetrics, ruleResultService: RuleResultService) => ILastRun;
export declare const lastRunFromError: (error: Error) => ILastRun;
export declare const lastRunToRaw: (lastRun: ILastRun["lastRun"]) => RawRuleLastRun;
