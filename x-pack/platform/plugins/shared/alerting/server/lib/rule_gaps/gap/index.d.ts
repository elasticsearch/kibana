import type { InternalFields } from '@kbn/event-log-plugin/server/es/cluster_client_adapter';
import type { GapBase, Interval, StringInterval } from '../../../application/gaps/types';
import type { GapStatus, GapReason } from '../../../../common/constants';
interface GapConstructorParams {
    ruleId: string;
    timestamp?: string;
    range: StringInterval;
    filledIntervals?: StringInterval[];
    inProgressIntervals?: StringInterval[];
    internalFields?: InternalFields;
    updatedAt?: string;
    failedAutoFillAttempts?: number;
    reason?: GapReason;
}
export declare class Gap {
    private _range;
    private _filledIntervals;
    private _inProgressIntervals;
    private _internalFields?;
    private _timestamp?;
    private _updatedAt?;
    private _failedAutoFillAttempts?;
    private _reason?;
    readonly _ruleId: string;
    constructor({ ruleId, timestamp, range, filledIntervals, inProgressIntervals, internalFields, updatedAt, failedAutoFillAttempts, reason, }: GapConstructorParams);
    fillGap(interval: Interval): void;
    addInProgress(interval: Interval): void;
    get range(): Interval;
    get filledIntervals(): Interval[];
    get inProgressIntervals(): Interval[];
    get timestamp(): string | undefined;
    get updatedAt(): string | undefined;
    setUpdatedAt(updatedAt: string): void;
    /**
     * unfilled = range - (filled + inProgress)
     */
    get unfilledIntervals(): Interval[];
    get totalGapDurationMs(): number;
    get filledGapDurationMs(): number;
    get unfilledGapDurationMs(): number;
    get inProgressGapDurationMs(): number;
    get status(): GapStatus;
    incrementFailedAutoFillAttempts(): void;
    get failedAutoFillAttempts(): number;
    resetInProgressIntervals(): void;
    get internalFields(): InternalFields | undefined;
    get ruleId(): string;
    get reason(): GapReason | undefined;
    getState(): {
        reason?: GapReason | undefined;
        range: StringInterval;
        filledIntervals: StringInterval[];
        inProgressIntervals: StringInterval[];
        unfilledIntervals: StringInterval[];
        status: GapStatus;
        totalGapDurationMs: number;
        filledDurationMs: number;
        unfilledDurationMs: number;
        inProgressDurationMs: number;
    };
    /**
     * Returns the gap object for es
     */
    toObject(): GapBase;
}
export {};
