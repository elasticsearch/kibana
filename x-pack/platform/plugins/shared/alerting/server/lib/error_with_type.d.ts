export declare const CLUSTER_BLOCK_EXCEPTION = "cluster_block_exception";
export declare const OUTDATED_TASK_VERSION = "outdated_task_version";
export declare class ErrorWithType extends Error {
    readonly type: string;
    constructor({ type, message, stack, }: {
        type: string;
        message?: string;
        stack?: string;
    });
}
export declare function getErrorType(error: Error): string | undefined;
export declare function isErrorWithType(error: Error | ErrorWithType): error is ErrorWithType;
export declare function isClusterBlockError(err: Error): boolean;
export declare function isOutdatedTaskVersionError(err: Error): boolean;
