import React from 'react';
import type { WorkflowListDto } from '@kbn/workflows';
export interface WorkflowValidationResult {
    severity: 'error' | 'warning';
    message: string;
}
export interface WorkflowOption {
    id: string;
    name: string;
    description: string;
    tags: string[];
    label: string;
    disabled?: boolean;
    checked?: 'on' | 'off';
    prepend?: React.ReactNode;
    append?: React.ReactNode;
    validationResult?: WorkflowValidationResult | null;
    data?: {
        secondaryContent?: string;
    };
    [key: string]: unknown;
}
export interface WorkflowSelectorConfig {
    filterFunction?: (workflows: WorkflowListDto['results']) => WorkflowListDto['results'];
    sortFunction?: (workflows: WorkflowListDto['results']) => WorkflowListDto['results'];
    validationFunction?: (workflow: WorkflowListDto['results'][number]) => WorkflowValidationResult | null;
    label?: string;
    placeholder?: string;
    createWorkflowLinkText?: string;
    listView?: boolean;
    listViewMaxHeight?: number;
    hideTopRowHeader?: boolean;
    hideViewWorkflowLink?: boolean;
    showSelectedInSearch?: boolean;
    errorMessages?: {
        selectedWorkflowDisabled?: string;
        loadFailed?: string;
    };
}
export declare function processWorkflowsToOptions(workflows?: WorkflowListDto['results'], selectedWorkflowId?: string, config?: WorkflowSelectorConfig): WorkflowOption[];
export declare function getSelectedWorkflowDisabledError(workflows?: WorkflowListDto['results'], selectedWorkflowId?: string, errorMessage?: string): string | null;
