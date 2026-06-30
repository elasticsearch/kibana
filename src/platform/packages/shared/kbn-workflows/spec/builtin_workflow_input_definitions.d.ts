import { z } from '@kbn/zod/v4';
import type { JsonSchema } from './schema/common/json_model_shape_schema';
/**
 * Prefix for built-in workflow input JSON Schemas resolved by {@link resolveRef}
 * in `field_conversion.ts`. Workflow YAML may use:
 * `$ref: '#/kibana/definitions/<id>'` where `<id>` is a key in
 * {@link builtinWorkflowInputDefinitions}.
 *
 * The same subtree is merged into the workflow root JSON Schema used by Monaco YAML
 * so `#/kibana/definitions/<id>` resolves for validation and completion.
 */
export declare const KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX: "#/kibana/definitions/";
/**
 * Central registry of reusable input shapes. Keys are the `<id>` segment only
 * (e.g. `alertingV2NotificationGroup` for `#/kibana/definitions/alertingV2NotificationGroup`).
 *
 * Domain plugins may register additional entries at startup (assign into this object).
 * Note: YAML editor `z.enum` completion for `$ref` only includes keys present at bundle time;
 * runtime-only keys still resolve at execution via {@link resolveRef} if added before validate.
 */
export declare const builtinWorkflowInputDefinitions: Record<string, JsonSchema>;
/**
 * Literal values suggested for `$ref` under workflow `inputs` JSON Schema (Monaco YAML).
 * Kept in sync with {@link builtinWorkflowInputDefinitions} keys.
 */
export declare const builtinWorkflowInputDefinitionRefValuesForZod: [string, ...string[]];
/**
 * Zod schema for `$ref` under workflow inputs: suggests known built-in refs
 */
export declare const builtinWorkflowInputDefinitionRefSchema: z.ZodString | z.ZodUnion<readonly [z.ZodEnum<{
    [x: string]: string;
}>, z.ZodString]>;
/**
 * Merges {@link builtinWorkflowInputDefinitions} under `kibana.definitions` on the workflow
 * root JSON Schema document so `#/kibana/definitions/<id>` resolves for Monaco YAML and other
 * schema consumers that walk the document root.
 */
export declare function mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema<T extends object>(root: T | null): T | null;
