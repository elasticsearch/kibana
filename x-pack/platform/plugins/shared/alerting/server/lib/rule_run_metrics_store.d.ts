import { ActionsCompletion } from '@kbn/alerting-state-types';
import type { ActionsConfigMap } from './get_actions_config_map';
import type { SearchMetrics } from './types';
interface State {
    numSearches: number;
    totalSearchDurationMs: number;
    esSearchDurationMs: number;
    numberOfTriggeredActions: number;
    numberOfGeneratedActions: number;
    numberOfActiveAlerts: number;
    numberOfRecoveredAlerts: number;
    numberOfNewAlerts: number;
    numberOfDelayedAlerts: number;
    hasReachedAlertLimit: boolean;
    connectorTypes: {
        [key: string]: {
            triggeredActionsStatus: ActionsCompletion;
            numberOfTriggeredActions: number;
            numberOfGeneratedActions: number;
        };
    };
    hasReachedQueuedActionsLimit: boolean;
}
export type RuleRunMetrics = Omit<State, 'connectorTypes'> & {
    triggeredActionsStatus: ActionsCompletion;
};
export declare class RuleRunMetricsStore {
    private state;
    getTriggeredActionsStatus: () => ActionsCompletion;
    getNumSearches: () => number;
    getTotalSearchDurationMs: () => number;
    getEsSearchDurationMs: () => number;
    getNumberOfTriggeredActions: () => number;
    getNumberOfGeneratedActions: () => number;
    getNumberOfActiveAlerts: () => number;
    getNumberOfRecoveredAlerts: () => number;
    getNumberOfNewAlerts: () => number;
    getNumberOfDelayedAlerts: () => number;
    getStatusByConnectorType: (actionTypeId: string) => {
        triggeredActionsStatus: ActionsCompletion;
        numberOfTriggeredActions: number;
        numberOfGeneratedActions: number;
    };
    getMetrics: () => RuleRunMetrics;
    getHasReachedAlertLimit: () => boolean;
    getHasReachedQueuedActionsLimit: () => boolean;
    setSearchMetrics: (searchMetrics: SearchMetrics[]) => void;
    setNumSearches: (numSearches: number) => void;
    setTotalSearchDurationMs: (totalSearchDurationMs: number) => void;
    setEsSearchDurationMs: (esSearchDurationMs: number) => void;
    setNumberOfTriggeredActions: (numberOfTriggeredActions: number) => void;
    setNumberOfGeneratedActions: (numberOfGeneratedActions: number) => void;
    setNumberOfActiveAlerts: (numberOfActiveAlerts: number) => void;
    setNumberOfRecoveredAlerts: (numberOfRecoveredAlerts: number) => void;
    setNumberOfNewAlerts: (numberOfNewAlerts: number) => void;
    setNumberOfDelayedAlerts: (numberOfDelayedAlerts: number) => void;
    setTriggeredActionsStatusByConnectorType: ({ actionTypeId, status, }: {
        actionTypeId: string;
        status: ActionsCompletion;
    }) => void;
    setHasReachedAlertLimit: (hasReachedAlertLimit: boolean) => void;
    setHasReachedQueuedActionsLimit: (hasReachedQueuedActionsLimit: boolean) => void;
    hasReachedTheExecutableActionsLimit: (actionsConfigMap: ActionsConfigMap) => boolean;
    hasReachedTheExecutableActionsLimitByConnectorType: ({ actionsConfigMap, actionTypeId, }: {
        actionsConfigMap: ActionsConfigMap;
        actionTypeId: string;
    }) => boolean;
    hasConnectorTypeReachedTheLimit: (actionTypeId: string) => boolean;
    incrementNumSearches: (incrementBy: number) => void;
    incrementTotalSearchDurationMs: (incrementBy: number) => void;
    incrementEsSearchDurationMs: (incrementBy: number) => void;
    incrementNumberOfTriggeredActions: () => void;
    incrementNumberOfGeneratedActions: (incrementBy: number) => void;
    incrementNumberOfTriggeredActionsByConnectorType: (actionTypeId: string) => void;
    incrementNumberOfGeneratedActionsByConnectorType: (actionTypeId: string) => void;
    decrementNumberOfTriggeredActions: () => void;
    decrementNumberOfTriggeredActionsByConnectorType: (actionTypeId: string) => void;
}
export {};
