export declare const maintenanceWindowStatus: {
    readonly RUNNING: "running";
    readonly UPCOMING: "upcoming";
    readonly FINISHED: "finished";
    readonly ARCHIVED: "archived";
    readonly DISABLED: "disabled";
};
export type MaintenanceWindowStatus = (typeof maintenanceWindowStatus)[keyof typeof maintenanceWindowStatus];
