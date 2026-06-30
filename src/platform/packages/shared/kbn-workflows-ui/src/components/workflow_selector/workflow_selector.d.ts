import React from 'react';
import type { WorkflowSelectorConfig } from './workflow_utils';
interface WorkflowSelectorProps {
    selectedWorkflowId?: string;
    onWorkflowChange: (workflowId: string) => void;
    config?: WorkflowSelectorConfig;
    error?: string;
}
declare const WorkflowSelector: React.FC<WorkflowSelectorProps>;
export { WorkflowSelector };
