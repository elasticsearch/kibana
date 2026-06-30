import type { Logger } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { RuleParams } from '../../types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { BulkEnableRulesParams, BulkEnableRulesResult } from './types';
export declare const bulkEnableRules: <Params extends RuleParams>(context: RulesClientContext, params: BulkEnableRulesParams) => Promise<BulkEnableRulesResult<Params>>;
export declare const tryToEnableTasks: ({ taskIdsToEnable, logger, taskManager, }: {
    taskIdsToEnable: string[];
    logger: Logger;
    taskManager: TaskManagerStartContract;
}) => Promise<string[]>;
