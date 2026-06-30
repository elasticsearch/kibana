import type { Step, WorkflowYaml } from '../spec/schema';
export declare const collectAllSteps: (steps: WorkflowYaml["steps"]) => Step[];
export declare function getStepByNameFromNestedSteps(steps: WorkflowYaml['steps'], stepName: string): Step | null;
