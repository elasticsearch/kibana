import type { WorkflowGraph } from '../../../graph';
/**
 * Recursively scans any value tree for Liquid template variables.
 * Strings are parsed via `extractTemplateVariables`; arrays and objects
 * are traversed recursively.
 */
export declare function scanForTemplateVariables(value: unknown): string[];
export declare function findInputsInGraph(workflowGraph: WorkflowGraph): Record<string, string[]>;
