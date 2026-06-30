import { type BaseStepDefinition } from './step_definition_types';
export type BuiltInStepDefinition = BaseStepDefinition;
/**
 * Built-in step definitions derived from the Zod schemas in schema.ts.
 * Each definition decomposes into inputSchema (the `with` block),
 * configSchema (step-level props like condition/steps/else/foreach),
 * and outputSchema.
 */
export declare const builtInStepDefinitions: BaseStepDefinition[];
export declare function getBuiltInStepDefinition(id: string): BaseStepDefinition | undefined;
