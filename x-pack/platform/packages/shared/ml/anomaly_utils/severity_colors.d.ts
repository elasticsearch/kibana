/**
 * RGB hex codes used to indicate the severity of an anomaly according to its anomaly score.
 * @deprecated Prefer using theme-aware colors via `useSeverityColor` hook or `getThemeResolvedSeverityColor` utility.
 * This constant provides a fixed set of legacy colors.
 */
export declare const ML_SEVERITY_COLORS: {
    /**
     * Color used in the UI to indicate a critical anomaly, with a score greater than or equal to 75.
     */
    CRITICAL: string;
    /**
     * Color used in the UI to indicate a major anomaly, with a score greater than or equal to 50 and less than 75 .
     */
    MAJOR: string;
    /**
     * Color used in the UI to indicate a minor anomaly, with a score greater than or equal to 25 and less than 50.
     */
    MINOR: string;
    /**
     * Color used in the UI to indicate a warning anomaly, with a score greater than or equal to 3 and less than 25.
     * Note in some parts of the UI, warning severity is used when the score is greater than or equal to 0.
     */
    WARNING: string;
    /**
     * Color used in some parts of the UI to indicate a low severity anomaly, with a score greater than or equal to 0 and less than 3.
     */
    LOW: string;
    /**
     * Color used in the UI to indicate an anomaly for which the score is unknown.
     */
    UNKNOWN: string;
};
