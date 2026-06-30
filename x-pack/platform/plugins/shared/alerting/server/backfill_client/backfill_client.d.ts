import type { ISavedObjectsRepository, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { AuditLogger } from '@kbn/security-plugin/server';
import type { TaskManagerSetupContract, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { IEventLogger, IEventLogClient } from '@kbn/event-log-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { ScheduleBackfillParams, ScheduleBackfillResult, ScheduleBackfillResults } from '../application/backfill/methods/schedule/types';
import type { RuleDomain } from '../application/rule/types';
import type { TaskRunnerFactory } from '../task_runner';
import type { RuleTypeRegistry } from '../types';
import type { Gap } from '../lib/rule_gaps/gap';
export declare const BACKFILL_TASK_TYPE = "ad_hoc_run-backfill";
interface ConstructorOpts {
    logger: Logger;
    taskManagerSetup: TaskManagerSetupContract;
    taskManagerStartPromise: Promise<TaskManagerStartContract>;
    taskRunnerFactory: TaskRunnerFactory;
}
interface BulkQueueOpts {
    actionsClient: ActionsClient;
    auditLogger?: AuditLogger;
    params: ScheduleBackfillParams;
    rules: RuleDomain[];
    ruleTypeRegistry: RuleTypeRegistry;
    spaceId: string;
    unsecuredSavedObjectsClient: SavedObjectsClientContract;
    eventLogClient: IEventLogClient;
    internalSavedObjectsRepository: ISavedObjectsRepository;
    eventLogger: IEventLogger | undefined;
    gaps?: Gap[];
}
interface DeleteBackfillForRulesOpts {
    ruleIds: string[];
    namespace?: string;
    unsecuredSavedObjectsClient: SavedObjectsClientContract;
    shouldUpdateGaps?: boolean;
    internalSavedObjectsRepository?: ISavedObjectsRepository;
    eventLogClient?: IEventLogClient;
    eventLogger?: IEventLogger;
    actionsClient?: ActionsClient;
}
interface DeleteBackfillsByInitiatorIdOpts {
    initiatorId: string;
    unsecuredSavedObjectsClient: SavedObjectsClientContract;
    shouldUpdateGaps?: boolean;
    internalSavedObjectsRepository?: ISavedObjectsRepository;
    eventLogClient?: IEventLogClient;
    eventLogger?: IEventLogger;
    actionsClient?: ActionsClient;
}
export declare class BackfillClient {
    private logger;
    private readonly taskManagerStartPromise;
    constructor(opts: ConstructorOpts);
    private deleteAdHocRunsAndTasks;
    bulkQueue({ actionsClient, auditLogger, params, rules, ruleTypeRegistry, spaceId, unsecuredSavedObjectsClient, eventLogClient, internalSavedObjectsRepository, eventLogger, gaps, }: BulkQueueOpts): Promise<ScheduleBackfillResults>;
    deleteBackfillForRules({ ruleIds, namespace, unsecuredSavedObjectsClient, }: DeleteBackfillForRulesOpts): Promise<void>;
    deleteBackfillsByInitiatorId({ initiatorId, unsecuredSavedObjectsClient, shouldUpdateGaps, internalSavedObjectsRepository, eventLogClient, eventLogger, actionsClient, }: DeleteBackfillsByInitiatorIdOpts): Promise<void>;
    findOverlappingBackfills({ ruleId, ranges, savedObjectsRepository, actionsClient, }: {
        ruleId: string;
        ranges: {
            start: Date;
            end: Date;
        }[];
        savedObjectsRepository: ISavedObjectsRepository;
        actionsClient: ActionsClient;
    }): Promise<ScheduleBackfillResult[]>;
}
export {};
