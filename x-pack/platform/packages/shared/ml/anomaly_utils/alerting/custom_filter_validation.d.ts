import type { MlAnomalyResultType } from '../types';
/**
 * Validates that fields in a KQL filter are not in the disallowlist for the given result type.
 */
export declare function validateCustomFilterFields(kqlQueryString: string, resultType: MlAnomalyResultType): string | undefined;
