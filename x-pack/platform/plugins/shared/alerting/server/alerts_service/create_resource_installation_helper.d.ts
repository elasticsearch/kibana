import type { Logger } from '@kbn/core/server';
import type { IRuleTypeAlerts } from '../types';
export interface InitializationPromise {
    result: boolean;
    error?: string;
}
interface Retry {
    time: string;
    attempts: number;
}
export interface ResourceInstallationHelper {
    add: (context: IRuleTypeAlerts, namespace?: string, timeoutMs?: number) => void;
    retry: (context: IRuleTypeAlerts, namespace?: string, initPromise?: Promise<InitializationPromise>, timeoutMs?: number) => void;
    getInitializedContext: (context: string, namespace: string) => Promise<InitializationPromise>;
}
/**
 * Helper function that queues up resources to initialize until we are
 * ready to begin initialization. Once we're ready, we start taking from
 * the queue and kicking off initialization.
 *
 * If a resource is added after we begin initialization, we push it onto
 * the queue and the running loop will handle it
 *
 * If a resource is added to the queue when the processing loop is not
 * running, kick off the processing loop
 */
export declare function createResourceInstallationHelper(logger: Logger, commonResourcesInitPromise: Promise<InitializationPromise>, installFn: (context: IRuleTypeAlerts, namespace: string, timeoutMs?: number) => Promise<void>): ResourceInstallationHelper;
export declare const successResult: () => {
    result: boolean;
};
export declare const errorResult: (error?: string) => {
    result: boolean;
    error: string | undefined;
};
export declare const getShouldRetry: ({ time, attempts }: Retry) => boolean;
export declare const calculateDelay: (attempts: number) => number;
export {};
