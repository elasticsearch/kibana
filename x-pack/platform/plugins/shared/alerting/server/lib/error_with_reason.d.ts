import { RuleExecutionStatusErrorReasons } from '../types';
export declare class ErrorWithReason extends Error {
    readonly reason: RuleExecutionStatusErrorReasons;
    readonly error: Error;
    constructor(reason: RuleExecutionStatusErrorReasons, error: Error);
}
export declare function getReasonFromError(error: Error): RuleExecutionStatusErrorReasons;
export declare function isErrorWithReason(error: Error | ErrorWithReason): error is ErrorWithReason;
