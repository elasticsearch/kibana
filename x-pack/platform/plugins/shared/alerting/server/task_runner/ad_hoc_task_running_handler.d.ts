import type { ISavedObjectsRepository, Logger } from '@kbn/core/server';
import type { AdHocRunSchedule } from '../data/ad_hoc_run/types';
export declare class AdHocTaskRunningHandler {
    private client;
    private logger;
    private runningTimeoutId?;
    private runningPromise?;
    constructor(client: ISavedObjectsRepository, logger: Logger);
    start(adHocRunParamsId: string, schedule: AdHocRunSchedule[], namespace?: string): void;
    stop(): void;
    waitFor(): Promise<void>;
    private setRunning;
}
