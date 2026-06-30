import type { CoreStart, Logger } from '@kbn/core/server';
import type { RunContext, TaskManagerSetupContract, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { AlertingConfig } from '../config';
import type { AlertingPluginsStart } from '../plugin';
export declare const HEALTH_TASK_TYPE = "alerting_health_check";
export declare const HEALTH_TASK_ID = "Alerting-alerting_health_check";
export declare function initializeAlertingHealth(logger: Logger, taskManager: TaskManagerSetupContract, coreStartServices: Promise<[CoreStart, AlertingPluginsStart, unknown]>): void;
export declare function scheduleAlertingHealthCheck(logger: Logger, config: AlertingConfig, taskManager: TaskManagerStartContract): Promise<void>;
export declare function healthCheckTaskRunner(logger: Logger, coreStartServices: Promise<[CoreStart, AlertingPluginsStart, unknown]>): ({ taskInstance }: RunContext) => {
    run(): Promise<{
        state: Readonly<{} & {
            runs: number;
            health_status: string;
        }>;
    }>;
};
