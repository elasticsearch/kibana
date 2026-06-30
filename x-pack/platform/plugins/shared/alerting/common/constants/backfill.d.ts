export declare const MAX_SCHEDULE_BACKFILL_BULK_SIZE = 100;
export declare const MAX_SCHEDULE_BACKFILL_LOOKBACK_WINDOW_DAYS = 90;
export declare const MAX_SCHEDULE_BACKFILL_LOOKBACK_WINDOW_MS: number;
export declare const backfillInitiator: {
    readonly USER: "user";
    readonly SYSTEM: "system";
};
export type BackfillInitiator = (typeof backfillInitiator)[keyof typeof backfillInitiator];
