import type { KueryNode } from '@kbn/es-query';
import type { Logger, SavedObjectsBulkUpdateObject, SavedObjectsUpdateResponse } from '@kbn/core/server';
import type { BulkEditActionSkipResult } from '../../../../common/bulk_action';
import type { BulkOperationError } from '../../types';
import type { RawRule } from '../../../types';
export interface BulkEditOperationResult {
    apiKeysToInvalidate: string[];
    rules: Array<SavedObjectsBulkUpdateObject<RawRule>>;
    resultSavedObjects: Array<SavedObjectsUpdateResponse<RawRule>>;
    errors: BulkOperationError[];
    skipped: BulkEditActionSkipResult[];
}
export type BulkEditOperation = (filter: KueryNode | null) => Promise<BulkEditOperationResult>;
interface ReturnRetry {
    apiKeysToInvalidate: string[];
    results: Array<SavedObjectsUpdateResponse<RawRule>>;
    errors: BulkOperationError[];
    skipped: BulkEditActionSkipResult[];
}
/**
 * Retries BulkEdit requests
 * If in response are presents conflicted savedObjects(409 statusCode), this util constructs filter with failed SO ids and retries bulkEdit operation until
 * all SO updated or number of retries exceeded
 * @param logger
 * @param name
 * @param bulkEditOperation
 * @param filter - KueryNode filter
 * @param retries - number of retries left
 * @param accApiKeysToInvalidate - accumulated apiKeys that need to be invalidated
 * @param accResults - accumulated updated savedObjects
 * @param accErrors - accumulated conflict errors
 * @returns Promise<ReturnRetry>
 */
export declare const retryIfBulkEditConflicts: (logger: Logger, name: string, bulkEditOperation: BulkEditOperation, filter?: KueryNode | null, retries?: number, accApiKeysToInvalidate?: string[], accResults?: Array<SavedObjectsUpdateResponse<RawRule>>, accErrors?: BulkOperationError[], accSkipped?: BulkEditActionSkipResult[]) => Promise<ReturnRetry>;
export {};
