import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import type { AlertDeletionContext } from '../alert_deletion_client';
export declare const runTask: (context: AlertDeletionContext, taskInstance: ConcreteTaskInstance, abortController: AbortController) => Promise<void>;
