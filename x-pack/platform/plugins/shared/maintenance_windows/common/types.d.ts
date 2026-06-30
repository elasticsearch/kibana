import type { IUiSettingsClient, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { FilterStateStore } from '@kbn/es-query';
import type { WeekdayStr, Options } from '@kbn/rrule';
import type { MAINTENANCE_WINDOW_DEEP_LINK_IDS, MaintenanceWindowStatus } from './constants';
export type RRuleParams = Partial<RRuleRecord> & Pick<RRuleRecord, 'dtstart' | 'tzid'>;
export type RRuleRecord = Omit<Options, 'dtstart' | 'byweekday' | 'wkst' | 'until'> & {
    dtstart: string;
    byweekday?: Array<WeekdayStr | string | number> | null;
    wkst?: WeekdayStr;
    until?: string;
};
export interface MaintenanceWindowModificationMetadata {
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface DateRange {
    gte: string;
    lte: string;
}
export interface ScopeQueryFilter {
    query?: Record<string, unknown>;
    meta: Record<string, unknown>;
    $state?: {
        store: FilterStateStore;
    };
}
export interface ScopedQueryAttributes {
    kql: string;
    filters: ScopeQueryFilter[];
    dsl?: string;
}
/**
 * @deprecated Use the data/maintenance_window types instead
 */
export interface MaintenanceWindowSOProperties {
    title: string;
    enabled: boolean;
    duration: number;
    expirationDate: string;
    events: DateRange[];
    rRule: RRuleParams;
    categoryIds?: string[] | null;
    scopedQuery?: ScopedQueryAttributes | null;
}
/**
 * @deprecated Use the data/maintenance_window types instead
 */
export type MaintenanceWindowSOAttributes = MaintenanceWindowSOProperties & MaintenanceWindowModificationMetadata;
/**
 * @deprecated Use the application/maintenance_window types instead
 */
export type MaintenanceWindow = MaintenanceWindowSOAttributes & {
    status: MaintenanceWindowStatus;
    eventStartTime: string | null;
    eventEndTime: string | null;
    id: string;
};
export type MaintenanceWindowCreateBody = Omit<MaintenanceWindowSOProperties, 'events' | 'expirationDate' | 'enabled' | 'archived'>;
export interface MaintenanceWindowClientContext {
    readonly uiSettings: IUiSettingsClient;
    getModificationMetadata: () => Promise<MaintenanceWindowModificationMetadata>;
    savedObjectsClient: SavedObjectsClientContract;
    logger: Logger;
}
export type MaintenanceWindowDeepLinkIds = (typeof MAINTENANCE_WINDOW_DEEP_LINK_IDS)[keyof typeof MAINTENANCE_WINDOW_DEEP_LINK_IDS];
