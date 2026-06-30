import type { RuleAction, RuleSystemAction } from '@kbn/alerting-types';
import type { TaskPriority } from '@kbn/task-manager-plugin/server';
interface FormatActionToEnqueueOpts {
    action: RuleAction | RuleSystemAction;
    apiKeyId?: string;
    apiKey: string | null;
    executionId: string;
    priority?: TaskPriority;
    ruleConsumer: string;
    ruleId: string;
    ruleTypeId: string;
    spaceId: string;
}
export declare const formatActionToEnqueue: (opts: FormatActionToEnqueueOpts) => {
    id: string;
    uuid: string | undefined;
    params: import("@kbn/core/server").SavedObjectAttributes;
    spaceId: string;
    apiKey: string | null;
    apiKeyId: string | undefined;
    consumer: string;
    source: import("../../../../../actions/server/lib/action_execution_source").SavedObjectExecutionSource;
    executionId: string;
    relatedSavedObjects: {
        id: string;
        type: string;
        namespace: string | undefined;
        typeId: string;
    }[];
    actionTypeId: string;
    priority: TaskPriority | undefined;
};
export {};
