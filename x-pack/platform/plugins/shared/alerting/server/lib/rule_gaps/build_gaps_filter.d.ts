import type { GapReasonType } from '../../../common/constants/gap_reason';
export declare const buildGapsFilter: ({ start, end, statuses, hasUnfilledIntervals, hasInProgressIntervals, hasFilledIntervals, updatedBefore, failedAutoFillAttemptsLessThan, excludedReasons, }: {
    start?: string;
    end?: string;
    statuses?: string[];
    hasUnfilledIntervals?: boolean;
    hasInProgressIntervals?: boolean;
    hasFilledIntervals?: boolean;
    updatedBefore?: string;
    failedAutoFillAttemptsLessThan?: number;
    excludedReasons?: GapReasonType[];
}) => string;
