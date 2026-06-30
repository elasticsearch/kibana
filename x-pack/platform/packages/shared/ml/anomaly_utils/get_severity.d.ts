import type { MlSeverityType } from './anomaly_severity';
/**
 * Returns a severity label (one of critical, major, minor, warning or unknown)
 * for the supplied normalized anomaly score (a value between 0 and 100).
 * @param normalizedScore - A normalized score between 0-100, which is based on the probability of the anomalousness of this record
 */
export declare function getSeverity(normalizedScore: number): MlSeverityType;
