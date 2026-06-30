/**
 * Describes the raw status of individual gap documents regarding to the gap fill process.
 */
export declare const gapStatus: {
    readonly UNFILLED: "unfilled";
    readonly FILLED: "filled";
    readonly PARTIALLY_FILLED: "partially_filled";
};
export type GapStatus = (typeof gapStatus)[keyof typeof gapStatus];
/**
 * Represents the status of a gap fill process for a rule.
 * This is a derived, per-rule aggregation that summarizes how well
 * the set of gaps for a rule has been filled. It is calculated from the gap
 * duration sums with precedence: unfilled > in_progress > filled.
 */
export declare const gapFillStatus: {
    readonly UNFILLED: "unfilled";
    readonly IN_PROGRESS: "in_progress";
    readonly FILLED: "filled";
    readonly ERROR: "error";
};
export type GapFillStatus = (typeof gapFillStatus)[keyof typeof gapFillStatus];
