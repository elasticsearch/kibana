import type { Logger } from '@kbn/logging';
import type { IntervalSchedule, RuleAction, ThrottledActions } from '../../../../common';
export declare const isSummaryAction: (action?: RuleAction) => boolean;
export declare const isActionOnInterval: (action?: RuleAction) => boolean;
export declare const isSummaryActionThrottled: ({ action, throttledSummaryActions, logger, }: {
    action?: RuleAction;
    throttledSummaryActions?: ThrottledActions;
    logger: Logger;
}) => boolean;
export declare const generateActionHash: (action?: RuleAction) => string;
export declare const getSummaryActionsFromTaskState: ({ actions, summaryActions, }: {
    actions: RuleAction[];
    summaryActions?: ThrottledActions;
}) => Record<string, Readonly<{
    date: string;
}>>;
export declare const getSummaryActionTimeBounds: (action: RuleAction, ruleSchedule: IntervalSchedule, previousStartedAt: Date | null) => {
    start?: number;
    end?: number;
};
interface LogNumberOfFilteredAlertsOpts {
    logger: Logger;
    numberOfAlerts: number;
    numberOfSummarizedAlerts: number;
    action: RuleAction;
}
export declare const logNumberOfFilteredAlerts: ({ logger, numberOfAlerts, numberOfSummarizedAlerts, action, }: LogNumberOfFilteredAlertsOpts) => void;
export {};
