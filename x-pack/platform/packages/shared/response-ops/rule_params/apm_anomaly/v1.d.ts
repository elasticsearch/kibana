import type { TypeOf } from '@kbn/config-schema';
import { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';
export declare enum AnomalyDetectorType {
    txLatency = "txLatency",
    txThroughput = "txThroughput",
    txFailureRate = "txFailureRate"
}
export declare const anomalyParamsSchema: import("@kbn/config-schema").ObjectType<{
    serviceName: import("@kbn/config-schema").Type<string | undefined>;
    transactionType: import("@kbn/config-schema").Type<string | undefined>;
    windowSize: import("@kbn/config-schema").Type<number>;
    windowUnit: import("@kbn/config-schema").Type<string>;
    environment: import("@kbn/config-schema").Type<string>;
    anomalySeverityType: import("@kbn/config-schema").Type<ML_ANOMALY_SEVERITY.CRITICAL | ML_ANOMALY_SEVERITY.MAJOR | ML_ANOMALY_SEVERITY.MINOR | ML_ANOMALY_SEVERITY.WARNING>;
    anomalyDetectorTypes: import("@kbn/config-schema").Type<AnomalyDetectorType[] | undefined>;
}>;
export type AnomalyRuleParams = TypeOf<typeof anomalyParamsSchema>;
