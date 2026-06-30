import { ML_ANOMALY_SEVERITY } from './anomaly_severity';
/**
 * Returns a severity type (indicating a critical, major, minor, warning or low severity anomaly)
 * for the supplied normalized anomaly score (a value between 0 and 100).
 * @param normalizedScore - A normalized score between 0-100, which is based on the probability of the anomalousness of this record
 */
export declare function getSeverityType(normalizedScore: number): ML_ANOMALY_SEVERITY;
