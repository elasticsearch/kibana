export declare const MAX_INTERVALS = 1000;
export interface DateRange {
    from: string;
    to: string;
}
export interface DateRangeInfo {
    dateStart: string;
    dateEnd: string;
    dateRanges: DateRange[];
}
export interface GetDateRangeInfoParams {
    dateStart?: string;
    dateEnd?: string;
    interval?: string;
    window: string;
}
export declare function getDateRangeInfo(params: GetDateRangeInfoParams): DateRangeInfo;
export declare function getTooManyIntervalsErrorMessage(intervals: number, maxIntervals: number): string;
export declare function getDateStartAfterDateEndErrorMessage(): string;
