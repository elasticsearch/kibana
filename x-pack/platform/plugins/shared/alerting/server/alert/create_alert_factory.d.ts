import type { Logger } from '@kbn/core/server';
import type { AlertInstanceContext, AlertInstanceState } from '../types';
import type { PublicAlert } from './alert';
import { Alert } from './alert';
export interface AlertFactory<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string> {
    create: (id: string) => PublicAlert<State, Context, ActionGroupIds>;
    get: (id: string) => PublicAlert<State, Context, ActionGroupIds> | null;
    alertLimit: {
        getValue: () => number;
        setLimitReached: (reached: boolean) => void;
        checkLimitUsage: () => void;
    };
    hasReachedAlertLimit: () => boolean;
    done: () => AlertFactoryDoneUtils<State, Context, ActionGroupIds>;
}
export type PublicAlertFactory<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string> = Pick<AlertFactory<State, Context, ActionGroupIds>, 'create' | 'done'> & {
    alertLimit: Pick<AlertFactory<State, Context, ActionGroupIds>['alertLimit'], 'getValue' | 'setLimitReached'>;
};
export interface AlertFactoryDoneUtils<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string> {
    getRecoveredAlerts: () => Array<Alert<State, Context, ActionGroupIds>>;
}
export interface CreateAlertFactoryOpts<State extends AlertInstanceState, Context extends AlertInstanceContext> {
    alerts: Record<string, Alert<State, Context>>;
    logger: Logger;
    configuredMaxAlerts: number;
    autoRecoverAlerts: boolean;
    canSetRecoveryContext?: boolean;
}
export declare function createAlertFactory<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string>({ alerts, logger, configuredMaxAlerts, autoRecoverAlerts, canSetRecoveryContext, }: CreateAlertFactoryOpts<State, Context>): AlertFactory<State, Context, ActionGroupIds>;
export declare function getPublicAlertFactory<State extends AlertInstanceState = AlertInstanceState, Context extends AlertInstanceContext = AlertInstanceContext, ActionGroupIds extends string = string>(alertFactory: AlertFactory<State, Context, ActionGroupIds>): PublicAlertFactory<State, Context, ActionGroupIds>;
