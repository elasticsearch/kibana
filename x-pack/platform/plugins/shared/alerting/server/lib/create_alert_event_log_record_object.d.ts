import type { IEvent } from '@kbn/event-log-plugin/server';
import type { AlertInstanceState } from '../types';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import type { GapReason } from '../../common/constants';
export type Event = Exclude<IEvent, undefined>;
interface CreateAlertEventLogRecordParams {
    executionId?: string;
    ruleId?: string;
    ruleType?: UntypedNormalizedRuleType;
    action: string;
    spaceId?: string;
    consumer?: string;
    ruleName?: string;
    instanceId?: string;
    message?: string;
    state?: AlertInstanceState;
    group?: string;
    namespace?: string;
    timestamp?: string;
    alertUuid?: string;
    task?: {
        scheduled?: string;
        scheduleDelay?: number;
    };
    savedObjects: Array<{
        type?: string;
        id?: string;
        typeId?: string;
        relation?: string;
    }>;
    flapping?: boolean;
    alertSummary?: {
        new: number;
        ongoing: number;
        recovered: number;
    };
    maintenanceWindowIds?: string[];
    ruleRevision?: number;
    gap?: {
        status: string;
        range: {
            gte: string;
            lte: string;
        };
        reason?: GapReason;
    };
}
export declare function createAlertEventLogRecordObject(params: CreateAlertEventLogRecordParams): Event;
export {};
