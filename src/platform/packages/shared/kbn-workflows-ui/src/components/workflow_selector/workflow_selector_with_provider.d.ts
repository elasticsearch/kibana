import React from 'react';
import type { WorkflowSelectorConfig } from './workflow_utils';
interface WorkflowSelectorWithProviderProps {
    selectedWorkflowId?: string;
    onWorkflowChange: (workflowId: string) => void;
    config?: WorkflowSelectorConfig;
    error?: string;
}
declare const WorkflowSelectorWithProvider: React.NamedExoticComponent<WorkflowSelectorWithProviderProps>;
export { WorkflowSelectorWithProvider };
