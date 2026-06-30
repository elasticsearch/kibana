/**
 * Describes the detected reason for a rule execution gap.
 * - rule_disabled: the gap was caused by a disable/enable cycle
 * - rule_did_not_run: the gap cause is unknown or the rule failed to run for other reasons
 */
export declare const gapReasonType: {
    readonly RULE_DISABLED: "rule_disabled";
    readonly RULE_DID_NOT_RUN: "rule_did_not_run";
};
export type GapReasonType = (typeof gapReasonType)[keyof typeof gapReasonType];
export interface GapReason {
    type: GapReasonType;
}
/** Default gap reasons to exclude from gap monitoring and auto-fill when no explicit setting is provided */
export declare const DEFAULT_EXCLUDED_GAP_REASONS: "rule_disabled"[];
