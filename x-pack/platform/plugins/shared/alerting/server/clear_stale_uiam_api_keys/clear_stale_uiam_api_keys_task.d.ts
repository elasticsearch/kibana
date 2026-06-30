import type { Logger, CoreSetup } from '@kbn/core/server';
import type { TaskManagerSetupContract, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { AlertingPluginsStart } from '../plugin';
/**
 * One-off, project-gated cleanup of rules whose encrypted `uiamApiKey` was leaked by the
 * object-spread bug fixed in PR #263887. The task latches on first success
 * (`state.cleared = true`) and idles thereafter on the daily safety-net schedule.
 *
 * Gating is intentionally a two-layer hard-coded check (`isServerless` AND a single
 * project ID) — not a config or feature flag — so it is structurally impossible to enable
 * this cleanup for any other project by misconfiguration. Non-target deployments do not
 * schedule the task at all; the task type is still registered so that any leftover
 * scheduled instance from a previous deployment can be drained or removed cleanly.
 */
export declare class ClearStaleUiamApiKeysTask {
    private readonly logger;
    private readonly isServerless;
    private readonly cloud?;
    constructor({ logger, isServerless, cloud, }: {
        logger: Logger;
        isServerless: boolean;
        cloud?: CloudSetup;
    });
    register({ core, taskManager, }: {
        core: CoreSetup<AlertingPluginsStart>;
        taskManager: TaskManagerSetupContract;
    }): void;
    start: ({ taskManager, }: {
        taskManager: TaskManagerStartContract;
    }) => Promise<void>;
    stop: () => void;
    private runTask;
}
