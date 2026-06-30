import type { Logger } from '@kbn/core/server';
import type { RuleResultService } from '../monitoring/rule_result_service';
import type { RuleExecutionStatus, RawRuleExecutionStatus, RawRule, Rule } from '../types';
import type { RunRuleResult } from '../task_runner/types';
import type { RuleRunMetrics } from './rule_run_metrics_store';
export interface IExecutionStatusAndMetrics {
    status: RuleExecutionStatus;
    metrics: RuleRunMetrics | null;
}
export declare function executionStatusFromState({ runRuleResult, ruleResultService, lastExecutionDate, }: {
    runRuleResult: RunRuleResult;
    ruleResultService: RuleResultService;
    lastExecutionDate?: Date;
}): IExecutionStatusAndMetrics;
export declare function executionStatusFromError(error: Error, lastExecutionDate?: Date): IExecutionStatusAndMetrics;
export declare function ruleExecutionStatusToRaw({ lastExecutionDate, lastDuration, status, error, warning, }: RuleExecutionStatus): RawRuleExecutionStatus;
export declare function ruleExecutionStatusFromRaw(logger: Logger, ruleId: string, rawRuleExecutionStatus?: Partial<RawRuleExecutionStatus> | null | undefined): RuleExecutionStatus | undefined;
export declare const getRuleExecutionStatusPendingAttributes: (lastExecutionDate: string) => RawRule["executionStatus"];
export declare const getRuleExecutionStatusPending: (lastExecutionDate: string) => Rule["executionStatus"];
