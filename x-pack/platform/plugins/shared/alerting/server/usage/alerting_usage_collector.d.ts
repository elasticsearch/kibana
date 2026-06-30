import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { AlertingUsage } from './types';
export declare const NUM_ALERTING_RULE_TYPES: number;
export declare const NUM_ALERTING_EXECUTION_FAILURE_REASON_TYPES: number;
export declare function createAlertingUsageCollector(usageCollection: UsageCollectionSetup, taskManager: Promise<TaskManagerStartContract>): import("@kbn/usage-collection-plugin/server").Collector<AlertingUsage, {}>;
export declare function registerAlertingUsageCollector(usageCollection: UsageCollectionSetup, taskManager: Promise<TaskManagerStartContract>): void;
