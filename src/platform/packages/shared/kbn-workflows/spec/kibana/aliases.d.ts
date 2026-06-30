export interface OperationTypeOverride {
    /** The cleaner type name to use instead of the auto-generated operation ID */
    type: string;
    /** Whether to create a backward-compatible alias schema for the old type name */
    backward: boolean;
}
/**
 * Operation ID overrides - maps OpenAPI operation IDs to cleaner type names.
 * This is the single source of truth for all type renaming.
 *
 * - `backward: true` entries also generate alias schemas in the workflow Zod/JSON schema
 *   so that workflows using the old type name continue to validate.
 * - `backward: false` entries only rename the type during code generation without
 *   adding extra schemas (use for new connectors with no existing users).
 */
export declare const OPERATION_TYPE_OVERRIDES: Record<string, OperationTypeOverride>;
/**
 * Derives full Kibana type aliases from operation overrides that have backward compatibility enabled.
 * Maps 'kibana.{oldOperationId}' to 'kibana.{newTypeName}'
 */
export declare const KIBANA_TYPE_ALIASES: Record<string, string>;
export declare function resolveKibanaStepTypeAlias(stepType: string): string;
