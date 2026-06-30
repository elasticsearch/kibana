export type RuleStatusValues = 'OK' | 'Active' | 'Error';
export type AlertStatusValues = 'OK' | 'Active';
export interface ExecutionDuration {
    average: number;
    valuesWithTimestamp: Record<string, number>;
}
export interface AlertSummary {
    id: string;
    name: string;
    tags: string[];
    ruleTypeId: string;
    consumer: string;
    muteAll: boolean;
    throttle?: string | null;
    enabled: boolean;
    statusStartDate: string;
    statusEndDate: string;
    status: RuleStatusValues;
    lastRun?: string;
    errorMessages: Array<{
        date: string;
        message: string;
    }>;
    alerts: Record<string, AlertStatus>;
    executionDuration: ExecutionDuration;
    revision: number;
}
export interface AlertStatus {
    uuid?: string;
    status: AlertStatusValues;
    muted: boolean;
    actionGroupId?: string;
    activeStartDate?: string;
    flapping: boolean;
    maintenanceWindowIds?: string[];
    tracked: boolean;
}
