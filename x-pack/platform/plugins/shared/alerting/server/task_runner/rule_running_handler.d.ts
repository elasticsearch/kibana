import type { ISavedObjectsRepository, Logger } from '@kbn/core/server';
export declare class RuleRunningHandler {
    private client;
    private logger;
    private ruleTypeId;
    private runningTimeoutId?;
    private isUpdating;
    private runningPromise?;
    constructor(client: ISavedObjectsRepository, logger: Logger, ruleTypeId: string);
    start(ruleId: string, namespace?: string): void;
    stop(): void;
    waitFor(): Promise<void>;
    private setRunning;
}
