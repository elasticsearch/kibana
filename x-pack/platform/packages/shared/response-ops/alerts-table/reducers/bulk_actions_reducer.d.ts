import type { BulkActionsReducerAction, BulkActionsState } from '../types';
export declare const bulkActionsReducer: (currentState: BulkActionsState, { action, rowIndex, rowCount, isLoading }: BulkActionsReducerAction) => BulkActionsState;
