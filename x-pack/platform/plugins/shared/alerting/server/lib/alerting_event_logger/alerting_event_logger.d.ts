import type { IEvent, IEventLogger, InternalFields } from '@kbn/event-log-plugin/server';
import type { BulkResponse } from '@elastic/elasticsearch/lib/api/types';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
import type { TaskRunnerTimings } from '../../task_runner/task_runner_timer';
import type { AlertInstanceState, ConsumerExecutionMetrics, RuleExecutionStatus } from '../../types';
import { type Event } from '../create_alert_event_log_record_object';
import type { RuleRunMetrics } from '../rule_run_metrics_store';
import type { GapBase } from '../../application/gaps/types';
import type { GapReason } from '../../../common/constants';
export interface RuleContext {
    id: string;
    uuid?: string;
    type: UntypedNormalizedRuleType;
    consumer?: string;
    name?: string;
    revision?: number;
}
export interface ContextOpts {
    savedObjectId: string;
    savedObjectType: string;
    namespace?: string;
    spaceId: string;
    executionId: string;
    taskScheduledAt: Date;
}
export type Context = ContextOpts & {
    taskScheduleDelay: number;
};
export declare const executionType: {
    readonly STANDARD: "standard";
    readonly BACKFILL: "backfill";
};
export type ExecutionType = (typeof executionType)[keyof typeof executionType];
interface BackfillOpts {
    id: string;
    start?: string;
    interval?: string;
}
interface DoneOpts {
    timings?: TaskRunnerTimings;
    status?: RuleExecutionStatus;
    metrics?: RuleRunMetrics | null;
    consumerMetrics?: Partial<ConsumerExecutionMetrics> | null;
    backfill?: BackfillOpts;
}
interface LogTimeoutOpts {
    backfill?: BackfillOpts;
}
interface AlertOpts {
    action: string;
    id: string;
    uuid: string;
    message: string;
    group?: string;
    state?: AlertInstanceState;
    flapping: boolean;
    maintenanceWindowIds?: string[];
}
export interface ActionOpts {
    id: string;
    uuid?: string;
    typeId: string;
    alertId?: string;
    alertGroup?: string;
    alertSummary?: {
        new: number;
        ongoing: number;
        recovered: number;
    };
}
export interface SavedObjects {
    id: string;
    type: string;
    namespace?: string;
    relation?: string;
    typeId?: string;
}
export declare class AlertingEventLogger {
    private eventLogger;
    private isInitialized;
    private startTime?;
    private context?;
    private ruleData?;
    private relatedSavedObjects;
    private executionType;
    private event;
    constructor(eventLogger: IEventLogger);
    getEvent(): IEvent;
    initialize({ context, runDate, ruleData, type, }: {
        context: ContextOpts;
        runDate: Date;
        type?: ExecutionType;
        ruleData?: RuleContext;
    }): void;
    private initializeBackfill;
    private initializeStandard;
    getStartAndDuration(): {
        start?: Date;
        duration?: string | number;
    };
    addOrUpdateRuleData({ name, id, uuid: ruleUuid, consumer, type, revision, }: {
        name?: string;
        id?: string;
        uuid?: string;
        consumer?: string;
        revision?: number;
        type?: UntypedNormalizedRuleType;
    }): void;
    setExecutionSucceeded(message: string): void;
    setMaintenanceWindowIds(maintenanceWindowIds: string[]): void;
    setExecutionFailed(message: string, errorMessage: string): void;
    logTimeout({ backfill }?: LogTimeoutOpts): void;
    logAlert(alert: AlertOpts): void;
    logAction(action: ActionOpts): void;
    done({ status, metrics, consumerMetrics, timings, backfill }: DoneOpts): void;
    reportGap({ gap, reason, }: {
        gap: {
            lte: string;
            gte: string;
        };
        reason?: GapReason;
    }): void;
    updateGaps(docs: Array<{
        gap: GapBase;
        internalFields: InternalFields;
    }>): Promise<BulkResponse>;
    private logEventWithFixedUuid;
}
export declare function createAlertRecord(context: ContextOpts, ruleData: RuleContext, savedObjects: SavedObjects[], alert: AlertOpts): Event;
export declare function createActionExecuteRecord(context: ContextOpts, ruleData: RuleContext, savedObjects: SavedObjects[], action: ActionOpts): Event;
export declare function createExecuteTimeoutRecord(context: ContextOpts, savedObjects: SavedObjects[], type: ExecutionType, ruleData?: RuleContext): Event;
export declare function createGapRecord(context: ContextOpts, ruleData: RuleContext, savedObjects: SavedObjects[], gap: {
    status: string;
    range: {
        gte: string;
        lte: string;
    };
    reason?: GapReason;
}): Event;
export declare function initializeExecuteRecord(context: Context, ruleData: RuleContext, so: SavedObjects[]): Event;
export declare function initializeExecuteBackfillRecord(context: Context, so: SavedObjects[]): Event;
interface UpdateEventOpts {
    message?: string;
    outcome?: string;
    alertingOutcome?: string;
    error?: string;
    status?: string;
    reason?: string;
    metrics?: RuleRunMetrics;
    consumerMetrics?: Partial<ConsumerExecutionMetrics>;
    timings?: TaskRunnerTimings;
    backfill?: BackfillOpts;
    maintenanceWindowIds?: string[];
}
interface UpdateRuleOpts {
    ruleName?: string;
    ruleId?: string;
    ruleUuid?: string;
    consumer?: string;
    ruleType?: UntypedNormalizedRuleType;
    revision?: number;
    savedObjects?: SavedObjects[];
}
export declare function updateEventWithRuleData(event: IEvent, opts: UpdateRuleOpts): void;
export declare function updateEvent(event: IEvent, opts: UpdateEventOpts): void;
export {};
