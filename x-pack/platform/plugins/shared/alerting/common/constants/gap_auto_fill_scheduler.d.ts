export declare const gapAutoFillSchedulerLimits: {
    /**
     * Maximum number of backfills gap fill scheduler can schedule
     * default value is 1000, which is big enough for most use cases
     */
    readonly maxBackfills: {
        readonly min: 1;
        readonly max: 5000;
        readonly defaultValue: 1000;
    };
    /**
     * How many times to retry to automatically fill a gap
     * if the gap is not filled after the retries, the gap will be skipped
     * default value is 3, which is a should work if error was caused by a temporary issue
     * if the error is caused by a permanent issue, the gap will be skipped
     */
    readonly numRetries: {
        readonly min: 1;
        readonly max: 10;
        readonly defaultValue: 3;
    };
    readonly minScheduleIntervalInMs: number;
};
export declare const GAP_AUTO_FILL_STATUS: {
    readonly SUCCESS: "success";
    readonly ERROR: "error";
    readonly SKIPPED: "skipped";
    readonly NO_GAPS: "no_gaps";
};
export type GapAutoFillStatus = (typeof GAP_AUTO_FILL_STATUS)[keyof typeof GAP_AUTO_FILL_STATUS];
