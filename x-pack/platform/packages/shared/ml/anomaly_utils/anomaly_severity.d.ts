/**
 * Labels displayed in the ML UI to indicate the severity of the anomaly according
 * to the normalized anomaly score.
 */
export declare enum ML_ANOMALY_SEVERITY {
    /**
     * Anomalies are displayed as critical severity when the score is greater than or equal to 75.
     */
    CRITICAL = "critical",
    /**
     * Anomalies are displayed as major severity when the score is greater than or equal to 50 and less than 75.
     */
    MAJOR = "major",
    /**
     * Anomalies are displayed as minor severity when the score is greater than or equal to 25 and less than 50.
     */
    MINOR = "minor",
    /**
     * Anomalies are displayed as warning severity when the score is greater than or equal to 3 and less than 25.
     * Note in some parts of the UI, warning severity is used when the score is greater than or equal to 0.
     */
    WARNING = "warning",
    /**
     * Anomalies are displayed as low severity in some parts of the ML UI when the score is greater than or equal to 0 and less than 3.
     */
    LOW = "low",
    /**
     * Anomalies are displayed as unknown severity if the anomaly score is not known.
     */
    UNKNOWN = "unknown"
}
/**
 * Interface for severity types to be used in ML_ANOMALY_SEVERITY_TYPES.
 */
export interface MlSeverityType {
    /**
     * One of ML_ANOMALY_SEVERITY
     */
    id: ML_ANOMALY_SEVERITY;
    /**
     * Translated ML_ANOMALY_SEVERITY
     */
    label: string;
}
