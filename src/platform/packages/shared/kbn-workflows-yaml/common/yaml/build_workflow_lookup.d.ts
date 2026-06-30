import type { LineCounter } from 'yaml';
import YAML from 'yaml';
export interface StepInfo {
    stepId: string;
    stepType: string;
    stepYamlNode: YAML.YAMLMap<unknown, unknown>;
    lineStart: number;
    lineEnd: number;
    propInfos: Record<string, StepPropInfo>;
    parentStepId?: string;
}
export interface StepPropInfo {
    path: string[];
    keyNode: YAML.Scalar<unknown>;
    valueNode: YAML.Scalar<unknown>;
}
export declare function getValueFromValueNode(valueNode: YAML.Scalar<unknown> | YAML.YAMLSeq<unknown>): unknown;
export interface WorkflowLookup {
    steps: Record<string, StepInfo>;
    triggersLineStart?: number;
}
export declare function buildWorkflowLookup(yamlDocument: YAML.Document, lineCounter: LineCounter): WorkflowLookup;
export declare const NESTED_STEP_KEYS: readonly ["steps", "else", "on-failure", "iteration-on-failure", "fallback"];
export type NestedStepKey = (typeof NESTED_STEP_KEYS)[number];
export declare function isNestedStepKey(value: unknown): value is NestedStepKey;
export declare function inspectStep(node: any, lineCounter: LineCounter, parentStepId?: string): Record<string, StepInfo>;
