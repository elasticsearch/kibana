import type { KibanaRequest } from '@kbn/core/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import type { RulesClientApi } from '../../../types';
import type { RulesClientContext } from '../../../rules_client/types';
import type { GapAutoFillSchedulerLogConfig } from '../../../application/gaps/types/scheduler';
import { type GapAutoFillStatus } from '../../../../common/constants';
import type { GapAutoFillSchedulerEventLogger } from './gap_auto_fill_scheduler_event_log';
import type { Gap } from '../gap';
import { GapFillSchedulePerRuleStatus } from '../../../application/gaps/methods/bulk_fill_gaps_by_rule_ids/types';
export type LogMessageFunction = (message: string) => void;
export interface AggregatedByRuleEntry {
    ruleId: string;
    processedGaps: number;
    status: GapFillSchedulePerRuleStatus;
    error?: string;
}
export declare function resultsFromMap(aggregatedByRule: Map<string, AggregatedByRuleEntry>): AggregatedByRuleEntry[];
export declare function formatConsolidatedSummary(consolidated: AggregatedByRuleEntry[]): string;
export declare function getGapAutoFillRunOutcome(consolidated: AggregatedByRuleEntry[]): {
    status: GapAutoFillStatus;
    message: string;
};
export declare function isCancelled(abortController: AbortController): boolean;
export declare function filterGapsWithOverlappingBackfills(gaps: Gap[], rulesClientContext: RulesClientContext, logMessage: LogMessageFunction): Promise<Gap[]>;
export declare function initRun({ fakeRequest, getRulesClientWithRequest, eventLogger, taskInstance, startTime, }: {
    fakeRequest: KibanaRequest | undefined;
    getRulesClientWithRequest?: (request: KibanaRequest) => Promise<RulesClientApi> | undefined;
    eventLogger: IEventLogger;
    taskInstance: {
        id: string;
        scheduledAt: Date;
        state?: Record<string, unknown>;
        params?: {
            configId?: string;
        };
    };
    startTime: Date;
}): Promise<{
    rulesClient: RulesClientApi;
    rulesClientContext: RulesClientContext;
    config: GapAutoFillSchedulerLogConfig;
    logEvent: GapAutoFillSchedulerEventLogger;
}>;
export declare function checkBackfillCapacity({ rulesClient, maxBackfills, logMessage, initiatorId, }: {
    rulesClient: RulesClientApi;
    maxBackfills: number;
    logMessage: (message: string) => void;
    initiatorId: string;
}): Promise<{
    canSchedule: boolean;
    currentCount: number;
    maxBackfills: number;
    remainingCapacity: number;
}>;
