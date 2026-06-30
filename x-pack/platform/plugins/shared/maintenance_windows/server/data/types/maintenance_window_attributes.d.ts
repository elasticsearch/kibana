import type { RRuleAttributes } from './r_rule_attributes';
import type { AlertsFilterQueryAttributes } from './alerts_filter_query_attributes';
import type { Schedule } from '../../application/types';
export declare const maintenanceWindowCategoryIdTypes: {
    readonly OBSERVABILITY: "observability";
    readonly SECURITY_SOLUTION: "securitySolution";
    readonly MANAGEMENT: "management";
};
export type MaintenanceWindowCategoryIdTypes = (typeof maintenanceWindowCategoryIdTypes)[keyof typeof maintenanceWindowCategoryIdTypes];
export interface MaintenanceWindowEventAttributes {
    gte: string;
    lte: string;
}
export interface MaintenanceWindowAttributes {
    title: string;
    enabled: boolean;
    duration: number;
    expirationDate: string;
    events: MaintenanceWindowEventAttributes[];
    rRule: RRuleAttributes;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
    categoryIds?: MaintenanceWindowCategoryIdTypes[] | null;
    scopedQuery?: AlertsFilterQueryAttributes | null;
    schedule: {
        custom: Schedule;
    };
    scope?: {
        alerting: AlertsFilterQueryAttributes | null;
    };
}
