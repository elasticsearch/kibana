import type { KueryNode } from '@kbn/es-query';
import type { Logger, SavedObjectsBulkUpdateObject } from '@kbn/core/server';
import type { BulkOperationError } from '../types';
import type { RawRule } from '../../types';
interface BulkOperationResult {
    errors: BulkOperationError[];
    rules: Array<SavedObjectsBulkUpdateObject<RawRule>>;
    accListSpecificForBulkOperation: string[][];
}
export declare const retryIfBulkOperationConflicts: ({ action, logger, bulkOperation, filter, retries, }: {
    action: "DELETE" | "ENABLE" | "DISABLE";
    logger: Logger;
    bulkOperation: (filter: KueryNode | null) => Promise<BulkOperationResult>;
    filter: KueryNode | null;
    retries?: number;
}) => Promise<BulkOperationResult>;
export {};
