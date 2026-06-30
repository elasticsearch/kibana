export declare class WorkflowConflictError extends Error {
    readonly workflowId: string;
    readonly statusCode = 409;
    constructor(message: string, workflowId: string);
    toJSON(): {
        error: string;
        message: string;
        statusCode: number;
        workflowId: string;
    };
}
export declare function isWorkflowConflictError(error: Error): error is WorkflowConflictError;
