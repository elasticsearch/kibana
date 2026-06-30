import type { AnalyticsServiceSetup, Logger, CoreSetup, CoreStart } from '@kbn/core/server';
import type { TaskManagerSetupContract, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { AlertingPluginsStart } from '../plugin';
export declare class UiamApiKeyProvisioningTask {
    private readonly logger;
    private readonly isServerless;
    private readonly analytics;
    private featureFlagSubscription;
    private appliedFlagValue;
    constructor({ logger, isServerless, analytics, }: {
        logger: Logger;
        isServerless: boolean;
        analytics: AnalyticsServiceSetup;
    });
    register({ core, taskManager, }: {
        core: CoreSetup<AlertingPluginsStart>;
        taskManager: TaskManagerSetupContract;
    }): void;
    start: ({ core, taskManager, }: {
        core: CoreStart;
        taskManager: TaskManagerStartContract;
    }) => Promise<void>;
    stop: () => void;
    private scheduleProvisioningTask;
    private unscheduleProvisioningTask;
    private applyProvisioningFlag;
    private runTask;
    private getApiKeysToConvert;
    private convertApiKeys;
    private updateRules;
    private updateProvisioningStatus;
    private reportProvisioningRunEvent;
}
