import type { IEvent } from '@kbn/event-log-plugin/server';
import type { SanitizedRule, AlertSummary } from '../types';
export interface AlertSummaryFromEventLogParams {
    rule: SanitizedRule<{
        bar: boolean;
    }>;
    events: IEvent[];
    executionEvents: IEvent[];
    dateStart: string;
    dateEnd: string;
}
export declare function alertSummaryFromEventLog(params: AlertSummaryFromEventLogParams): AlertSummary;
