interface StepDefinition {
    name: string;
    type: string;
    'connector-id'?: string;
    if?: string;
    foreach?: string;
    with?: Record<string, unknown>;
    output?: Record<string, unknown>;
    steps?: StepDefinition[];
    [key: string]: unknown;
}
interface EditResult {
    success: boolean;
    yaml: string;
    error?: string;
}
export declare const insertStep: (yaml: string, step: StepDefinition, insertAfterStep?: string) => EditResult;
export declare const modifyStep: (yaml: string, stepName: string, updatedStep: StepDefinition) => EditResult;
export declare const modifyStepProperty: (yaml: string, stepName: string, property: string, value: unknown) => EditResult;
export declare const modifyWorkflowProperty: (yaml: string, property: string, value: unknown) => EditResult;
export declare const deleteStep: (yaml: string, stepName: string) => EditResult;
export type { StepDefinition, EditResult };
