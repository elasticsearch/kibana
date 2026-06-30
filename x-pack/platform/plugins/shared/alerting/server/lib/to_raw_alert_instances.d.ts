import type { Logger } from '@kbn/logging';
import type { Alert } from '../alert';
import type { AlertInstanceState, AlertInstanceContext, RawAlertInstance } from '../types';
export declare function toRawAlertInstances<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>(logger: Logger, maxAlerts: number, activeAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>, recoveredAlerts?: Record<string, Alert<State, Context, RecoveryActionGroupId>>, shouldOptimizeTaskState?: boolean): {
    rawActiveAlerts: Record<string, RawAlertInstance>;
    rawRecoveredAlerts: Record<string, RawAlertInstance>;
};
