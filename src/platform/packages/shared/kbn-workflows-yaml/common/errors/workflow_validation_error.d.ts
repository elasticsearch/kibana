export declare class WorkflowValidationError extends Error {
    readonly validationErrors?: string[] | undefined;
    readonly statusCode = 400;
    constructor(message: string, validationErrors?: string[] | undefined);
    toJSON(): {
        error: string;
        message: string;
        statusCode: number;
        validationErrors: string[] | undefined;
    };
}
export declare function isWorkflowValidationError(error: Error): error is WorkflowValidationError;
