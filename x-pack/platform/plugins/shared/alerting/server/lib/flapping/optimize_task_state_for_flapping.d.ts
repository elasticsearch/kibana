import type { Logger } from '@kbn/logging';
import type { Alert } from '../../alert';
import type { AlertInstanceState, AlertInstanceContext } from '../../types';
export declare function optimizeTaskStateForFlapping<State extends AlertInstanceState, Context extends AlertInstanceContext, RecoveryActionGroupId extends string>(logger: Logger, recoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId>> | undefined, maxAlerts: number): Record<string, Alert<State, Context, RecoveryActionGroupId>>;
export declare function getAlertIdsOverMaxLimit<State extends AlertInstanceState, Context extends AlertInstanceContext, RecoveryActionGroupId extends string>(logger: Logger, trackedRecoveredAlerts: Record<string, Alert<State, Context, RecoveryActionGroupId>>, maxAlerts: number): string[];
