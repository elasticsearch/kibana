/**
 * Anomaly score numeric thresholds to indicate the severity of the anomaly.
 */
export declare enum ML_ANOMALY_THRESHOLD {
    /**
     * Threshold at which anomalies are labelled in the UI as critical.
     */
    CRITICAL = 75,
    /**
     * Threshold at which anomalies are labelled in the UI as major.
     */
    MAJOR = 50,
    /**
     * Threshold at which anomalies are labelled in the UI as minor.
     */
    MINOR = 25,
    /**
     * Threshold at which anomalies are labelled in the UI as warning.
     */
    WARNING = 3,
    /**
     * Threshold at which anomalies are labelled in the UI as low.
     */
    LOW = 0
}
