import type { z } from '@kbn/zod/v4';
export interface TriggerDocumentation {
    details?: string;
    examples: string[];
}
export interface BaseTriggerDefinition {
    id: string;
    label: string;
    description: string;
    schema: z.ZodType;
    documentation: TriggerDocumentation;
}
export declare const builtInTriggerDefinitions: BaseTriggerDefinition[];
export declare function getBuiltInTriggerDefinition(id: string): BaseTriggerDefinition | undefined;
