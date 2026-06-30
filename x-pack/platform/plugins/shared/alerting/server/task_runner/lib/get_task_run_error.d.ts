import type { Logger } from '@kbn/core/server';
import { type Result } from '../../lib/result_type';
import type { RunRuleResult } from '../types';
import type { RuleResultService } from '../../monitoring/rule_result_service';
export declare function getTaskRunError({ runRuleResult, logger, ruleResult, ruleTypeId, ruleId, }: {
    runRuleResult: Result<RunRuleResult, Error>;
    logger: Logger;
    ruleResult: RuleResultService;
    ruleTypeId: string;
    ruleId: string;
}): {
    taskRunError: import("@kbn/task-manager-plugin/server/task_running").DecoratedError;
} | {
    taskRunError?: undefined;
};
