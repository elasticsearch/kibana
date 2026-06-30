import type { IEventLogger } from '@kbn/event-log-plugin/server';
import type { SchedulerSoAttributes } from '../../../application/gaps/types/scheduler';
import type { GapAutoFillStatus } from '../../../../common/constants';
export interface GapAutoFillExecutionResult {
    ruleId: string;
    processedGaps: number;
    status: Extract<GapAutoFillStatus, 'success' | 'error'>;
    error?: string;
}
export interface GapAutoFillLogEventParams {
    status: GapAutoFillStatus;
    results?: GapAutoFillExecutionResult[];
    message: string;
}
export type GapAutoFillSchedulerEventLogger = (params: GapAutoFillLogEventParams) => void;
export interface CreateGapAutoFillSchedulerEventLoggerArgs {
    eventLogger: IEventLogger;
    context: {
        spaceId: string;
    };
    taskInstance: {
        id: string;
        scheduledAt: Date;
        state?: Record<string, unknown>;
    };
    startTime: Date;
    config: SchedulerSoAttributes;
}
export declare function createGapAutoFillSchedulerEventLogger({ eventLogger, context, taskInstance, startTime, config, }: CreateGapAutoFillSchedulerEventLoggerArgs): GapAutoFillSchedulerEventLogger;
