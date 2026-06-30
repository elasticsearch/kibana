import type { Logger } from '@kbn/core/server';
type RetryableForConflicts<T> = () => Promise<T>;
export declare const RetryForConflictsAttempts = 2;
export declare function retryIfConflicts<T>(logger: Logger, name: string, operation: RetryableForConflicts<T>, retries?: number): Promise<T>;
export {};
