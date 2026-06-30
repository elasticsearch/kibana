import type { Logger } from '@kbn/core/server';
import type { RawAlertInstance, RuleAlertData } from '../../types';
import type { TrackedAADAlerts, SearchResult } from '../types';
export interface GetTrackedAlertsParams<AlertData extends RuleAlertData> {
    ruleId: string;
    lookBackWindow: number;
    maxAlertLimit: number;
    activeAlertsFromState: Record<string, RawAlertInstance>;
    recoveredAlertsFromState: Record<string, RawAlertInstance>;
    search: (queryBody: Record<string, unknown>) => Promise<SearchResult<AlertData>>;
    logger: Logger;
    ruleInfoMessage: string;
    logTags: {
        tags: string[];
    };
}
export declare function getTrackedAlerts<AlertData extends RuleAlertData>({ ruleId, lookBackWindow, maxAlertLimit, activeAlertsFromState, recoveredAlertsFromState, search, logger, ruleInfoMessage, logTags, }: GetTrackedAlertsParams<AlertData>): Promise<TrackedAADAlerts<AlertData>>;
export declare function createEmptyTrackedAlerts<AlertData extends RuleAlertData>(): TrackedAADAlerts<AlertData>;
export declare function populateTrackedAlerts<AlertData extends RuleAlertData>(trackedAlerts: TrackedAADAlerts<AlertData>, hits: SearchResult<AlertData>['hits']): void;
export declare function findMissingAlertUuids<AlertData extends RuleAlertData>(alertUuidsFromState: string[], trackedAlerts: TrackedAADAlerts<AlertData>): string[];
export declare function getAlertUuidsFromState(activeAlertsFromState: Record<string, RawAlertInstance>, recoveredAlertsFromState: Record<string, RawAlertInstance>): string[];
