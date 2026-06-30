import type { Logger, CoreStart } from '@kbn/core/server';
import type { RunContext, TaskManagerSetupContract, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { AlertingConfig } from '../config';
import type { AlertingPluginsStart } from '../plugin';
export declare const TASK_ID = "Alerts-alerts_invalidate_api_keys";
export declare function initializeApiKeyInvalidator(logger: Logger, coreStartServices: Promise<[CoreStart, AlertingPluginsStart, unknown]>, taskManager: TaskManagerSetupContract, config: AlertingConfig): void;
export declare function scheduleApiKeyInvalidatorTask(logger: Logger, config: AlertingConfig, taskManager: TaskManagerStartContract): Promise<void>;
export declare function taskRunner(logger: Logger, coreStartServices: Promise<[CoreStart, AlertingPluginsStart, unknown]>, config: AlertingConfig): ({ taskInstance }: RunContext) => {
    run(): Promise<{
        state: Readonly<{} & {
            runs: number;
            total_invalidated: number;
            missing_api_key_retries: Record<string, number>;
        }>;
        schedule: {
            interval: string;
        };
    }>;
};
