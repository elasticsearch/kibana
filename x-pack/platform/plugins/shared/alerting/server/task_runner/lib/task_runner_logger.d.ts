import type { Logger } from '@kbn/core/server';
interface TaskRunnerLoggerOpts {
    logger: Logger;
    tags: string[];
}
export declare function createTaskRunnerLogger(opts: TaskRunnerLoggerOpts): Logger;
export {};
