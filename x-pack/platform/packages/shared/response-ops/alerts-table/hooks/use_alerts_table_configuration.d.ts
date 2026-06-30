import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import { type AlertsTableConfiguration } from '../schemas/alerts_table_configuration_schema';
export interface UseAlertsTableConfigurationParams {
    id: string;
    configurationStorage?: IStorageWrapper | null;
    notifications: NotificationsStart;
}
/**
 * Manages the alerts table configuration persistence.
 * Loads, validates, and saves table settings to storage, returning a `React.useState`-compatible tuple.
 * Handles invalid configurations by resetting and notifying the user.
 */
export declare const useAlertsTableConfiguration: ({ id, configurationStorage, notifications, }: UseAlertsTableConfigurationParams) => readonly [null, (...args: any[]) => void] | readonly [{
    columns?: {
        id: string;
        initialWidth?: number | undefined;
    }[] | undefined;
    visibleColumns?: string[] | undefined;
    sort?: Record<string, {
        order: "desc" | "asc";
    }>[] | undefined;
} | null, (configUpdates: Partial<AlertsTableConfiguration> | null) => void];
