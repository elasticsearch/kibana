export declare const adHocRunStatus: {
    readonly COMPLETE: "complete";
    readonly PENDING: "pending";
    readonly RUNNING: "running";
    readonly ERROR: "error";
    readonly TIMEOUT: "timeout";
};
export type AdHocRunStatus = (typeof adHocRunStatus)[keyof typeof adHocRunStatus];
