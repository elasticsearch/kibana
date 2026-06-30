import type { Logger } from '@kbn/core/server';
import type { Outcome } from 'elastic-apm-node';
import type { RuleExecutionStatus, RuleLastRun } from '../../../common';
import type { Result } from '../../lib/result_type';
import type { RuleRunMetrics } from '../../lib/rule_run_metrics_store';
import type { RuleResultService } from '../../monitoring/rule_result_service';
import type { RunRuleResult } from '../types';
interface ProcessRuleRunOpts {
    logger?: Logger;
    logPrefix?: string;
    result: RuleResultService;
    runDate: Date;
    runRuleResult: Result<RunRuleResult, Error>;
}
interface ProcessRuleRunResult {
    executionStatus: RuleExecutionStatus;
    executionMetrics: RuleRunMetrics | null;
    lastRun: RuleLastRun;
    outcome: Outcome;
}
export declare function processRunResults({ logger, logPrefix, result, runDate, runRuleResult, }: ProcessRuleRunOpts): ProcessRuleRunResult;
export {};
