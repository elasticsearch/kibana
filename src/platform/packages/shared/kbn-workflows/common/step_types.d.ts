export declare const WORKFLOW_EXECUTE_STEP_TYPE: "workflow.execute";
export declare const WORKFLOW_EXECUTE_ASYNC_STEP_TYPE: "workflow.executeAsync";
export declare const isExecuteSyncStepType: (stepType: string | undefined) => boolean;
export declare const isExecuteAsyncStepType: (stepType: string | undefined) => boolean;
export declare const isExecuteStepType: (stepType: string | undefined) => boolean;
export type ParentWorkflowInvocation = 'sync' | 'async';
export declare const isSyncParentInvocation: (context: Record<string, unknown> | undefined) => context is Record<string, unknown> & {
    parentWorkflowInvocation: "sync";
    parentWorkflowExecutionId: string;
};
