import type { MlAnomalyResultType } from '@kbn/ml-anomaly-utils';
/**
 * Validates the kqlQueryString for anomaly detection rules.
 * Validates both KQL syntax and checks against disallowed fields.
 */
export declare function validateAnomalyDetectionCustomFilter(kqlQueryString: string | null, resultType: MlAnomalyResultType): string | undefined;
