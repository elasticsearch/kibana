import type { Alert } from '../../alert';
import type { AlertInstanceState, AlertInstanceContext } from '../../types';
import type { RulesSettingsFlappingProperties } from '../../../common/rules_settings';
export declare function setFlapping<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupIds extends string>(flappingSettings: RulesSettingsFlappingProperties, activeAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>, recoveredAlerts?: Record<string, Alert<State, Context, RecoveryActionGroupIds>>): void;
export declare function isAlertFlapping<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>(flappingSettings: RulesSettingsFlappingProperties, alert: Alert<State, Context, ActionGroupIds | RecoveryActionGroupId>): boolean;
