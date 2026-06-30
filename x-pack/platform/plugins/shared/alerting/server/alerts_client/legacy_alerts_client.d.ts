import type { KibanaRequest, Logger } from '@kbn/core/server';
import { Alert } from '../alert/alert';
import type { AlertInstanceContext, AlertInstanceState, WithoutReservedActionGroups } from '../types';
import type { IAlertsClient, InitializeExecutionOpts, LogAlertsOpts, DetermineDelayedAlertsOpts } from './types';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import type { MaintenanceWindowsService } from '../task_runner/maintenance_windows';
import type { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
export interface LegacyAlertsClientParams {
    alertingEventLogger: AlertingEventLogger;
    logger: Logger;
    maintenanceWindowsService?: MaintenanceWindowsService;
    request: KibanaRequest;
    ruleType: UntypedNormalizedRuleType;
    spaceId: string;
}
export declare class LegacyAlertsClient<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> implements IAlertsClient<{}, State, Context, ActionGroupIds, RecoveryActionGroupId> {
    private readonly options;
    private maxAlerts;
    private flappingSettings;
    private ruleLogPrefix;
    private startedAtString;
    private trackedAlerts;
    private reportedAlerts;
    private processedAlerts;
    private alertFactory?;
    constructor(options: LegacyAlertsClientParams);
    initializeExecution({ maxAlerts, ruleLabel, startedAt, flappingSettings, activeAlertsFromState, recoveredAlertsFromState, }: InitializeExecutionOpts): Promise<void>;
    getAlert(id: string): import("../alert/alert").PublicAlert<State, Context, WithoutReservedActionGroups<ActionGroupIds, RecoveryActionGroupId>> | null | undefined;
    isTrackedAlert(id: string): boolean;
    processAlerts(): Promise<void>;
    logAlerts({ ruleRunMetricsStore, shouldLogAlerts }: LogAlertsOpts): void;
    getProcessedAlerts(type: 'new' | 'active' | 'trackedActiveAlerts' | 'recovered' | 'trackedRecoveredAlerts' | 'delayed'): Record<string, Alert<State, Context, ActionGroupIds, import("@kbn/alerts-as-data-utils").AADAlert>> | Record<string, Alert<State, Context, RecoveryActionGroupId, import("@kbn/alerts-as-data-utils").AADAlert>>;
    getRawAlertInstancesForState(shouldOptimizeTaskState?: boolean): {
        rawActiveAlerts: Record<string, import("@kbn/alerting-state-types/src/task_state").LatestRawAlertInstanceSchema>;
        rawRecoveredAlerts: Record<string, import("@kbn/alerting-state-types/src/task_state").LatestRawAlertInstanceSchema>;
    };
    determineFlappingAlerts(): void;
    determineDelayedAlerts(opts: DetermineDelayedAlertsOpts): void;
    hasReachedAlertLimit(): boolean;
    getMaxAlertLimit(): number;
    checkLimitUsage(): void;
    factory(): import("../alert/create_alert_factory").PublicAlertFactory<State, Context, WithoutReservedActionGroups<ActionGroupIds, RecoveryActionGroupId>>;
    client(): null;
    persistAlerts(): Promise<void>;
    getAlertsToUpdateWithMaintenanceWindows(): Promise<{}>;
    getAlertsToUpdateWithLastScheduledActions(): {};
    updatePersistedAlerts(): Promise<void>;
    setAlertStatusToUntracked(): Promise<void>;
    private removeExpiredMaintenanceWindows;
}
