import type { AADAlert } from '@kbn/alerts-as-data-utils';
import type { AlertStatus } from '@kbn/rule-data-utils';
import type { CombinedSummarizedAlerts } from '../types';
import type { AlertInstanceState, RawAlertInstance, AlertInstanceContext, DefaultActionGroupId } from '../../common';
interface ScheduledExecutionOptions<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string = DefaultActionGroupId> {
    actionGroup: ActionGroupIds;
    context: Context;
    state: State;
}
export type PublicAlert<State extends AlertInstanceState = AlertInstanceState, Context extends AlertInstanceContext = AlertInstanceContext, ActionGroupIds extends string = DefaultActionGroupId> = Pick<Alert<State, Context, ActionGroupIds, AADAlert>, 'getContext' | 'getState' | 'getUuid' | 'getStart' | 'hasContext' | 'replaceState' | 'scheduleActions' | 'setContext'>;
export declare class Alert<State extends AlertInstanceState = AlertInstanceState, Context extends AlertInstanceContext = AlertInstanceContext, ActionGroupIds extends string = never, AlertAsData extends AADAlert = AADAlert> {
    private scheduledExecutionOptions?;
    private meta;
    private state;
    private context;
    private readonly id;
    private alertAsData;
    private status;
    constructor(id: string, { state, meta }?: RawAlertInstance);
    getId(): string;
    getUuid(): string;
    matchesUuid(uuid: string): boolean;
    isAlertAsData(): boolean;
    setAlertAsData(alertAsData: AlertAsData): void;
    getAlertAsData(): AlertAsData | undefined;
    getStart(): string | null;
    hasScheduledActions(): boolean;
    isThrottled({ throttle, actionHash, uuid, }: {
        throttle: string | null;
        actionHash?: string;
        uuid?: string;
    }): boolean;
    scheduledActionGroupHasChanged(): boolean;
    private scheduledActionGroupIsUnchanged;
    getLastScheduledActions(): {
        subgroup?: string | undefined;
        actions?: {
            [x: string]: {
                date: string;
            };
        } | undefined;
        date: string;
        group: string;
    } | undefined;
    getScheduledActionOptions(): ScheduledExecutionOptions<State, Context, ActionGroupIds> | undefined;
    unscheduleActions(): this;
    getState(): State;
    getContext(): Context;
    hasContext(): boolean;
    scheduleActions(actionGroup: ActionGroupIds, context?: Context): this;
    setContext(context: Context): this;
    private ensureHasNoScheduledActions;
    replaceState(state: State): this;
    clearThrottlingLastScheduledActions(allActionUuids: string[]): void;
    updateLastScheduledActions(group: ActionGroupIds, actionHash?: string | null, uuid?: string): void;
    /**
     * Used to serialize alert instance state
     */
    toJSON(): Readonly<{
        meta?: Readonly<{
            lastScheduledActions?: Readonly<{
                subgroup?: string | undefined;
                actions?: Record<string, Readonly<{} & {
                    date: string;
                }>> | undefined;
            } & {
                date: string;
                group: string;
            }> | undefined;
            flappingHistory?: boolean[] | undefined;
            flapping?: boolean | undefined;
            maintenanceWindowIds?: string[] | undefined;
            maintenanceWindowNames?: string[] | undefined;
            pendingRecoveredCount?: number | undefined;
            uuid?: string | undefined;
            activeCount?: number | undefined;
        }> | undefined;
        state?: Record<string, any> | undefined;
    } & {}>;
    toRaw(recovered?: boolean): RawAlertInstance;
    setFlappingHistory(fh?: boolean[]): void;
    getFlappingHistory(): boolean[] | undefined;
    setFlapping(f: boolean): void;
    getFlapping(): boolean;
    incrementPendingRecoveredCount(): void;
    getPendingRecoveredCount(): number;
    resetPendingRecoveredCount(): void;
    /**
     * Checks whether this alert exists in the given alert summary
     */
    isFilteredOut(summarizedAlerts: CombinedSummarizedAlerts | null): boolean;
    setMaintenanceWindowIds(maintenanceWindowIds?: string[]): void;
    getMaintenanceWindowIds(): string[];
    setMaintenanceWindowNames(maintenanceWindowNames?: string[]): void;
    getMaintenanceWindowNames(): string[];
    incrementActiveCount(): void;
    getActiveCount(): number;
    resetActiveCount(): void;
    setStatus(status: AlertStatus): void;
    isDelayed(): boolean;
}
export {};
