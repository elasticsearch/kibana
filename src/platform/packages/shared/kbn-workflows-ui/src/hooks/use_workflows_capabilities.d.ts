import type { Capabilities } from '@kbn/core/public';
import { WorkflowsManagementUiActions } from '@kbn/workflows/common/privileges';
declare const CapabilitiesMap: {
    readonly canCreateWorkflow: WorkflowsManagementUiActions.create;
    readonly canReadWorkflow: WorkflowsManagementUiActions.read;
    readonly canReadManagedWorkflow: WorkflowsManagementUiActions.readManaged;
    readonly canUpdateWorkflow: WorkflowsManagementUiActions.update;
    readonly canDeleteWorkflow: WorkflowsManagementUiActions.delete;
    readonly canExecuteWorkflow: WorkflowsManagementUiActions.execute;
    readonly canReadWorkflowExecution: WorkflowsManagementUiActions.readExecution;
    readonly canReadManagedWorkflowExecution: WorkflowsManagementUiActions.readManagedExecution;
    readonly canCancelWorkflowExecution: WorkflowsManagementUiActions.cancelExecution;
};
export type CapabilitiesKey = keyof typeof CapabilitiesMap;
export type WorkflowsManagementCapabilities = Record<CapabilitiesKey, boolean>;
export declare const useWorkflowsCapabilities: () => WorkflowsManagementCapabilities;
export declare const getWorkflowsCapabilities: (capabilities: Capabilities) => WorkflowsManagementCapabilities;
export {};
