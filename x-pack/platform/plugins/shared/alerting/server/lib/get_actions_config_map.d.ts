import type { ActionsConfig, ActionTypeConfig } from '../config';
export interface ActionsConfigMap {
    default: ActionTypeConfig;
    [key: string]: ActionTypeConfig;
}
export declare const getActionsConfigMap: (actionsConfig: ActionsConfig) => ActionsConfigMap;
