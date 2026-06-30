import type { LicenseType } from '@kbn/licensing-types';
export declare enum MaintenanceWindowStatus {
    Running = "running",
    Upcoming = "upcoming",
    Finished = "finished",
    Archived = "archived",
    Disabled = "disabled"
}
export declare const MAINTENANCE_WINDOW_SAVED_OBJECT_TYPE = "maintenance-window";
export declare const MAINTENANCE_WINDOW_FEATURE_ID = "maintenanceWindow";
export declare const MAINTENANCE_WINDOW_API_PRIVILEGES: {
    READ_MAINTENANCE_WINDOW: string;
    WRITE_MAINTENANCE_WINDOW: string;
};
export declare const MAINTENANCE_WINDOWS_APP_ID = "maintenanceWindows";
export declare const MANAGEMENT_APP_ID = "management";
export declare const MAINTENANCE_WINDOW_PATHS: {
    maintenanceWindows: string;
    maintenanceWindowsCreate: string;
    maintenanceWindowsEdit: string;
};
export declare const MAINTENANCE_WINDOW_DEEP_LINK_IDS: {
    maintenanceWindows: string;
    maintenanceWindowsCreate: string;
    maintenanceWindowsEdit: string;
};
export declare const MAINTENANCE_WINDOW_DATE_FORMAT = "MM/DD/YY hh:mm A";
export declare const MAINTENANCE_WINDOW_DEFAULT_PER_PAGE: 10;
export declare const MAINTENANCE_WINDOW_DEFAULT_TABLE_ACTIVE_PAGE: 1;
export declare const PLUGIN: {
    ID: string;
    MINIMUM_LICENSE_REQUIRED: LicenseType;
    getI18nName: (i18n: any) => string;
};
