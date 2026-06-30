import type { QueryEventsBySavedObjectResult } from '@kbn/event-log-plugin/server';
import type { IExecutionErrorsResult } from '../../common';
export declare const EMPTY_EXECUTION_ERRORS_RESULT: {
    totalErrors: number;
    errors: never[];
};
export declare function formatExecutionErrorsResult(results: QueryEventsBySavedObjectResult): IExecutionErrorsResult;
