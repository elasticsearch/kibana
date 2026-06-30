import type { Logger } from '@kbn/logging';
export interface GetTimeRangeResult {
    dateStart: string;
    dateEnd: string;
}
interface GetTimeRangeOpts {
    forceNow?: Date;
    logger: Logger;
    queryDelay?: number;
    window?: string;
}
export declare function getTimeRange({ forceNow, logger, queryDelay, window }: GetTimeRangeOpts): {
    dateStart: string;
    dateEnd: string;
};
export {};
