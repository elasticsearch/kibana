import type { Interval, StringInterval } from '../../../application/gaps/types/intervals';
/**
 * Finds the overlapping portion of two intervals, if any.
 *
 * @param interval1 - The first interval.
 * @param interval2 - The second interval.
 * @returns The overlapping interval if it exists, otherwise null.
 *
 * @example
 * const i1: Interval = { gte: new Date('2023-10-19T12:00:00Z'), lte: new Date('2023-10-19T12:30:00Z') };
 * const i2: Interval = { gte: new Date('2023-10-19T12:15:00Z'), lte: new Date('2023-10-19T12:45:00Z') };
 * Overlap: 12:15 - 12:30
 * const overlap = getOverlap(i1, i2);
 * overlap = { gte: 2023-10-19T12:15:00Z, lte: 2023-10-19T12:30:00Z }
 */
export declare const getOverlap: (interval1: Interval, interval2: Interval) => Interval | null;
/**
 * Merges a list of possibly overlapping intervals into a minimal set of non-overlapping intervals.
 *
 * @param intervals - An array of intervals to merge.
 * @returns A new array of merged intervals with no overlaps.
 *
 * @example
 * const intervals: Interval[] = [
 *   { gte: new Date('2023-10-19T12:00:00Z'), lte: new Date('2023-10-19T12:10:00Z') },
 *   { gte: new Date('2023-10-19T12:05:00Z'), lte: new Date('2023-10-19T12:15:00Z') }
 * ];
 * // Merge into one interval: 12:00 - 12:15
 * const merged = mergeIntervals(intervals);
 * // merged = [{ gte: 2023-10-19T12:00:00Z, lte: 2023-10-19T12:15:00Z }]
 */
export declare const mergeIntervals: (intervals: Interval[]) => Interval[];
/**
 * Subtracts a list of intervals from a single base interval, returning any remaining parts that do not overlap.
 *
 * @param base - The base interval.
 * @param intervalsToSubtract - Intervals to remove from the base.
 * @returns An array of intervals representing the remainder of the base interval.
 *
 * @example
 * const base: Interval = { gte: new Date('2023-10-19T12:00:00Z'), lte: new Date('2023-10-19T13:00:00Z') };
 * const toSubtract: Interval[] = [{ gte: new Date('2023-10-19T12:20:00Z'), lte: new Date('2023-10-19T12:30:00Z') }];
 * // Result splits the base into two: 12:00-12:20 and 12:30-13:00
 * const result = subtractIntervals(base, toSubtract);
 * // result = [
 * //   { gte: 2023-10-19T12:00:00Z, lte: 2023-10-19T12:20:00Z },
 * //   { gte: 2023-10-19T12:30:00Z, lte: 2023-10-19T13:00:00Z }
 * // ]
 */
export declare const subtractIntervals: (base: Interval, intervalsToSubtract: Interval[]) => Interval[];
/**
 * Applies subtractIntervals to each interval in an array and merges the result,
 * effectively removing intervalsToSubtract from all given intervals.
 *
 * @param intervals - The original intervals from which to subtract.
 * @param intervalsToSubtract - The intervals to remove.
 * @returns An array of intervals representing what remains after all subtractions.
 *
 * @example
 * const intervals: Interval[] = [
 *   { gte: new Date('2023-10-19T12:00:00Z'), lte: new Date('2023-10-19T12:30:00Z') },
 *   { gte: new Date('2023-10-19T12:40:00Z'), lte: new Date('2023-10-19T13:00:00Z') }
 * ];
 * const toSubtract: Interval[] = [{ gte: new Date('2023-10-19T12:20:00Z'), lte: new Date('2023-10-19T12:45:00Z') }];
 * // For the first interval: removing 12:20-12:30 leaves 12:00-12:20
 * // For the second interval: removing 12:20-12:45 overlaps partially, leaving 12:45-13:00
 * // After merging, result:
 * // [
 * //   { gte: 2023-10-19T12:00:00Z, lte: 2023-10-19T12:20:00Z },
 * //   { gte: 2023-10-19T12:45:00Z, lte: 2023-10-19T13:00:00Z }
 * // ]
 * const result = subtractAllIntervals(intervals, toSubtract);
 */
export declare const subtractAllIntervals: (intervals: Interval[], intervalsToSubtract: Interval[]) => Interval[];
/**
 * Calculates the duration of a single interval in milliseconds.
 *
 * @param interval - The interval.
 * @returns The duration in milliseconds.
 *
 * @example
 * const i: Interval = { gte: new Date('2023-10-19T12:00:00Z'), lte: new Date('2023-10-19T12:10:00Z') };
 * const duration = intervalDuration(i);
 * // duration = 600000 ms (10 minutes)
 */
export declare const intervalDuration: (interval: Interval) => number;
/**
 * Sums the durations of multiple intervals in milliseconds.
 *
 * @param intervals - An array of intervals.
 * @returns The total combined duration in milliseconds.
 *
 * @example
 * const intervals: Interval[] = [
 *   { gte: new Date('2023-10-19T12:00:00Z'), lte: new Date('2023-10-19T12:10:00Z') },
 *   { gte: new Date('2023-10-19T12:15:00Z'), lte: new Date('2023-10-19T12:20:00Z') }
 * ];
 * // First interval: 10 min, Second interval: 5 min
 * // Total: 15 min = 900000 ms
 * const totalDuration = sumIntervalsDuration(intervals);
 */
export declare const sumIntervalsDuration: (intervals: Interval[]) => number;
/**
 * Converts a String-based interval into a date-based interval
 * @param interval
 * @returns
 */
export declare const normalizeInterval: (interval: StringInterval) => Interval;
/**
 * Converts a Date-based interval into a string-based interval.
 *
 * @param interval - An Interval with gte and lte as Date objects.
 * @returns A ConstructorInterval with gte and lte as ISO strings.
 */
export declare const denormalizeInterval: (interval: Interval) => StringInterval;
/**
 * Conveninence function that clips an `Interval` given an `Interval` boundary
 */
export declare const clipInterval: (interval: Interval, boundary: Interval) => Interval | null;
/**
 * Clips an date interval to ensure it falls within the given boundary range.
 * If there's no overlap, returns null.
 */
export declare const clipDateInterval: (start: Date, end: Date, boundaryStart: Date, boundaryEnd: Date) => {
    start: Date;
    end: Date;
} | null;
/**
 * Clamps the list `intervals` (in ascending order) to the dates provided in the `range`
 * @param intervals
 * @param boundary
 * @returns
 */
export declare const clampIntervals: (intervals: Interval[], boundary: Interval) => {
    gte: Date;
    lte: Date;
}[];
