import type { Logger } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
export declare const tryToRemoveTasks: ({ taskIdsToDelete, logger, taskManager, }: {
    taskIdsToDelete: string[];
    logger: Logger;
    taskManager: TaskManagerStartContract;
}) => Promise<string[]>;
